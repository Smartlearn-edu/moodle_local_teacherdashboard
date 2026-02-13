<?php

namespace local_teacherdashboard\output;

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

    /**
     * Constructor.
     * 
     * @param array $courses Raw course objects
     * @param bool $isPrivileged
     */
    public function __construct($courses, $isPrivileged = false)
    {
        $this->coursesInput = $courses;
        $this->isPrivileged = $isPrivileged;
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

        // dynamic title
        $data->dashboardtitle = $this->isPrivileged
            ? 'Admin / Manager Dashboard'
            : \get_string('pluginname', 'local_teacherdashboard');

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
            $studentcount = \count_enrolled_users($coursecontext);

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
