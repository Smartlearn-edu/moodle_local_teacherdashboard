<?php
// This file is part of Moodle - https://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Dashboard output class.
 *
 * @package     local_smartdashboard
 * @copyright   2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license     https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_smartdashboard\output;

defined('MOODLE_INTERNAL') || die();

use renderable;
use templatable;
use renderer_base;
use stdClass;
use context_course;
use core_course\external\course_summary_exporter;
use moodle_url;
use coursecat;
use core_course_category;

class dashboard implements renderable, templatable
{

    /** @var array $courses List of courses data */
    protected $coursesInput;

    /** @var bool $isPrivileged Whether user is Admin/Manager */
    protected $isPrivileged;

    /** @var array $categories List of all categories for filter */
    protected $categories;

    /** @var int $selectedCategory Selected category ID */
    protected $selectedCategory;

    /** @var bool $showClicked Whether the show button was clicked */
    protected $showClicked;

    /** @var int $totalEnrollments Total enrollments (sum of all students in courses) */
    protected $totalEnrollments;

    /** @var int $uniqueStudents Unique students count */
    protected $uniqueStudents;

    /** @var array $subcategories List of direct subcategories with stats */
    protected $subcategories;

    /**
     * Constructor.
     * 
     * @param array $courses Raw course objects
     * @param bool $isPrivileged
     * @param array $categories List of categories (for admins)
     * @param int $selectedCategory Selected category ID
     * @param bool $showClicked Whether the show button was clicked
     * @param int $totalEnrollments
     * @param int $uniqueStudents
     * @param array $subcategories
     */
    public function __construct($courses, $isPrivileged = false, $categories = [], $selectedCategory = 0, $showClicked = false, $totalEnrollments = 0, $uniqueStudents = 0, $subcategories = [])
    {
        $this->coursesInput = $courses;
        $this->isPrivileged = $isPrivileged;
        $this->categories = $categories;
        $this->selectedCategory = $selectedCategory;
        $this->showClicked = $showClicked;
        $this->totalEnrollments = $totalEnrollments;
        $this->uniqueStudents = $uniqueStudents;
        $this->subcategories = $subcategories;
    }

    /**
     * Export data for the template.
     *
     * @param renderer_base $output
     * @return stdClass
     */
    public function export_for_template(renderer_base $output)
    {
        $data = new stdClass();
        $data->courses = [];
        $data->isprivileged = $this->isPrivileged;
        $data->categories = isset($this->categories) ? array_values($this->categories) : [];
        $data->selectedcategory = $this->selectedCategory;
        $data->showclicked = $this->showClicked;

        // Stats
        $data->totalenrollments = $this->totalEnrollments;
        $data->uniquestudents = $this->uniqueStudents;
        $data->hasstats = ($this->totalEnrollments > 0);

        // Subcategories
        $data->subcategories = array_values($this->subcategories);
        $data->hassubcategories = !empty($this->subcategories);
        // dynamic title
        $data->dashboardtitle = $this->isPrivileged
            ? 'Admin / Manager Dashboard'
            : \get_string('pluginname', 'local_smartdashboard');

        foreach ($this->coursesInput as $course) {
            $coursecontext = context_course::instance($course->id);

            // Double check capability just in case.
            if (!\has_capability('moodle/course:update', $coursecontext)) {
                continue;
            }

            // Get course image
            $imageurl = '';

            // robust way to get course image: check the file area directly
            $fs = \get_file_storage();
            $files = $fs->get_area_files(
                $coursecontext->id,
                'course',
                'overviewfiles',
                0,
                'sortorder, itemid, filepath, filename',
                false // exclude directories
            );

            if ($files) {
                foreach ($files as $file) {
                    if ($file->is_valid_image()) {
                        $imageurl = moodle_url::make_pluginfile_url(
                            $file->get_contextid(),
                            $file->get_component(),
                            $file->get_filearea(),
                            $file->get_itemid(),
                            $file->get_filepath(),
                            $file->get_filename()
                        )->out(false);
                        break;
                    }
                }
            }

            // Get category name
            $categoryname = '';
            if (class_exists('core_course_category')) {
                $category = \core_course_category::get($course->category, \IGNORE_MISSING);
                $categoryname = $category ? $category->get_formatted_name() : '';
            } else {
                // Fallback
                require_once($GLOBALS['CFG']->libdir . '/coursecatlib.php');
                $category = \coursecat::get($course->category, \IGNORE_MISSING);
                $categoryname = $category ? $category->get_formatted_name() : '';
            }

            // Count students
            // Count students (users with 'student' role)
            global $DB;
            $studentcount = $DB->count_records_sql(
                "
                SELECT COUNT(DISTINCT ra.userid)
                  FROM {role_assignments} ra
                  JOIN {context} ctx ON ctx.id = ra.contextid
                  JOIN {role} r ON r.id = ra.roleid
                 WHERE ctx.contextlevel = 50 
                   AND ctx.instanceid = :courseid
                   AND r.shortname = 'student'",
                ['courseid' => $course->id]
            );

            // Count submissions needing grading
            // We look for submissions that are submitted, latest, and do not have a grade (or grade < 0).
            $sql = "SELECT COUNT(s.id)
                      FROM {assign_submission} s
                      JOIN {assign} a ON a.id = s.assignment
                     WHERE a.course = :courseid
                       AND s.status = :status
                       AND s.latest = 1
                       AND NOT EXISTS (
                           SELECT 1 
                             FROM {assign_grades} g 
                            WHERE g.assignment = a.id 
                              AND g.userid = s.userid 
                              AND g.attemptnumber = s.attemptnumber 
                              AND g.grade >= 0
                       )";

            $gradingcount = 0;
            try {
                global $DB; // Ensure $DB is available
                $gradingcount = $DB->count_records_sql($sql, [
                    'courseid' => $course->id,
                    'status' => 'submitted'
                ]);
            } catch (\Exception $e) {
                // If tables don't exist (e.g. mod_assign disabled), ignore.
            }

            $courseurl = new moodle_url('/course/view.php', ['id' => $course->id]);

            $data->courses[] = [
                'id' => $course->id,
                'fullname' => $course->fullname,
                'viewurl' => $courseurl->out(false),
                'imageurl' => $imageurl,
                'categoryname' => $categoryname,
                'studentcount' => $studentcount,
                'gradingcount' => $gradingcount,
                'hasgrading' => ($gradingcount > 0)
            ];
        }

        return $data;
    }
}
