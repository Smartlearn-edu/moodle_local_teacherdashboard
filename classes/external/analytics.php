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
    public static function get_cross_course_progress_parameters()
    {
        return new external_function_parameters([]);
    }

    /**
     * Get cross-course progress data
     * @return array
     */
    public static function get_cross_course_progress()
    {
        global $DB, $USER, $CFG;

        require_once($CFG->libdir . '/completionlib.php');

        $params = self::validate_parameters(self::get_cross_course_progress_parameters(), []);
        $context = \context_system::instance();
        self::validate_context($context);

        // 1. Get teacher's courses
        $courses = \enrol_get_users_courses($USER->id, true, 'id, fullname, shortname');
        $mycourses = [];
        $courseids = [];

        foreach ($courses as $course) {
            $coursecontext = \context_course::instance($course->id);
            if (\has_capability('moodle/course:update', $coursecontext)) {
                $mycourses[] = [
                    'id' => $course->id,
                    'name' => $course->fullname
                ];
                $courseids[] = $course->id;
            }
        }

        if (empty($courseids)) {
            return ['courses' => [], 'students' => []];
        }

        // 2. Get students and their completion status across these courses
        // We fetch users who are enrolled in ANY of verify course ids.
        // We use a simplified query to get user details + course completion record.

        list($insql, $inparams) = $DB->get_in_or_equal($courseids, SQL_PARAMS_NAMED);

        // Fetch unique students enrolled in these courses
        // Note: keeping it simple - checking enrollment via standard API is safer but this is a dashboard analytics query
        // so we define "Student" as someone with a completion record or valid enrollment.
        // Let's rely on course_completions table which exists for enrolled users if completion is enabled.

        $sql = "SELECT DISTINCT u.id, u.firstname, u.lastname, u.email
                  FROM {user} u
                  JOIN {user_enrolments} ue ON ue.userid = u.id
                  JOIN {enrol} e ON e.id = ue.enrolid
                 WHERE e.courseid $insql
                   AND u.deleted = 0";

        $students = $DB->get_records_sql($sql, $inparams);

        // Fetch completion states
        $completesql = "SELECT userid, course, timecompleted
                          FROM {course_completions}
                         WHERE course $insql
                           AND timecompleted > 0";
        $completions = $DB->get_records_sql($completesql, $inparams);

        // Build the matrix
        $studentData = [];
        $completionMap = [];
        foreach ($completions as $c) {
            $completionMap[$c->userid][$c->course] = true;
        }

        foreach ($students as $student) {
            $studentContext = [
                'id' => $student->id,
                'name' => \fullname($student),
                'email' => $student->email,
                'completions' => []
            ];

            foreach ($courseids as $cid) {
                // Check if completed
                $isCompleted = isset($completionMap[$student->id][$cid]);
                $studentContext['completions'][] = [
                    'courseid' => $cid,
                    'completed' => $isCompleted
                ];
            }
            $studentData[] = $studentContext;
        }

        return [
            'courses' => $mycourses,
            'students' => $studentData
        ];
    }

    /**
     * Returns description of method result value
     * @return \external_single_structure
     */
    public static function get_cross_course_progress_returns()
    {
        return new \external_single_structure([
            'courses' => new \external_multiple_structure(
                new \external_single_structure([
                    'id' => new \external_value(\PARAM_INT, 'Course ID'),
                    'name' => new \external_value(\PARAM_TEXT, 'Course Name')
                ])
            ),
            'students' => new \external_multiple_structure(
                new \external_single_structure([
                    'id' => new \external_value(\PARAM_INT, 'Student ID'),
                    'name' => new \external_value(\PARAM_TEXT, 'Student Name'),
                    'email' => new \external_value(\PARAM_TEXT, 'Student Email'),
                    'completions' => new \external_multiple_structure(
                        new \external_single_structure([
                            'courseid' => new \external_value(\PARAM_INT, 'Course ID'),
                            'completed' => new \external_value(\PARAM_BOOL, 'Is completed?')
                        ])
                    )
                ])
            )
        ]);
    }
}
