<?php

namespace local_teacherdashboard\external;

defined('MOODLE_INTERNAL') || die;

require_once("$CFG->libdir/externallib.php");

use external_api;
use external_function_parameters;
use external_single_structure;
use external_multiple_structure;
use external_value;
use context_system;

class analytics extends external_api
{

    /**
     * Returns description of method parameters
     * @return external_function_parameters
     */
    public static function get_student_progress_parameters()
    {
        return new external_function_parameters([
            // No parameters needed for now, getting all teacher courses
        ]);
    }

    /**
     * Get student progress data for the teacher
     * @return array
     */
    public static function get_student_progress()
    {
        global $DB, $USER;

        $params = self::validate_parameters(self::get_student_progress_parameters(), []);
        $context = context_system::instance();
        self::validate_context($context);

        // Get teacher's courses
        // This is a simplified fetch - reusing the logic from dashboard.php roughly
        $courses = \enrol_get_users_courses($USER->id, true, 'id, fullname');

        $data = [];
        foreach ($courses as $course) {
            $coursecontext = \context_course::instance($course->id);
            if (!\has_capability('moodle/course:update', $coursecontext)) {
                continue;
            }

            // Mock Data for now - to be replaced with real queries
            // In a real scenario, we'd query completion_agg table or assignments
            $data[] = [
                'courseid' => $course->id,
                'coursename' => $course->fullname,
                'completion_rate' => rand(40, 95),
                'active_students' => rand(5, 50),
                'total_students' => 50
            ];
        }

        return $data;
    }

    /**
     * Returns description of method result value
     * @return external_multiple_structure
     */
    public static function get_student_progress_returns()
    {
        return new external_multiple_structure(
            new external_single_structure([
                'courseid' => new external_value(PARAM_INT, 'Course ID'),
                'coursename' => new external_value(PARAM_TEXT, 'Course Name'),
                'completion_rate' => new external_value(PARAM_INT, 'Average Completion Rate (%)'),
                'active_students' => new external_value(PARAM_INT, 'Active Students last 7 days'),
                'total_students' => new external_value(PARAM_INT, 'Total Students')
            ])
        );
    }
}
