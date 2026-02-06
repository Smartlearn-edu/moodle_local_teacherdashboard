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

    /**
     * Constructor.
     * 
     * @param array $courses Raw course objects
     */
    public function __construct($courses)
    {
        $this->coursesInput = $courses;
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

        foreach ($this->coursesInput as $course) {
            $coursecontext = context_course::instance($course->id);

            // Double check capability just in case.
            if (!\has_capability('moodle/course:update', $coursecontext)) {
                continue;
            }

            // Get course image
            $imageurl = '';
            $coursefiles = course_summary_exporter::get_course_overview_files($course, $coursecontext);
            if ($coursefiles) {
                foreach ($coursefiles as $file) {
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

            $data->courses[] = [
                'id' => $course->id,
                'fullname' => $course->fullname,
                'viewurl' => new moodle_url('/course/view.php', ['id' => $course->id])->out(false),
                'imageurl' => $imageurl,
                'categoryname' => $categoryname,
                'studentcount' => $studentcount
            ];
        }

        return $data;
    }
}
