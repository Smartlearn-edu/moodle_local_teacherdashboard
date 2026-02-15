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
 * External functions for grading data.
 *
 * @package     local_smartdashboard
 * @copyright   2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license     https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_smartdashboard\external;

defined('MOODLE_INTERNAL') || die;

require_once("$CFG->libdir/externallib.php");
require_once("$CFG->dirroot/mod/assign/locallib.php");

use external_api;
use external_function_parameters;
use external_single_structure;
use external_multiple_structure;
use external_value;
use context_course;
use context_module;

class grading extends external_api
{

    /**
     * Parameters for get_grading_overview
     */
    public static function get_grading_overview_parameters()
    {
        return new external_function_parameters([
            'courseid' => new external_value(\PARAM_INT, 'Course ID', \VALUE_DEFAULT, 0)
        ]);
    }

    /**
     * Get grading overview data
     */
    public static function get_grading_overview($courseid = 0)
    {
        global $DB, $USER;

        $params = self::validate_parameters(self::get_grading_overview_parameters(), ['courseid' => $courseid]);
        $context = \context_system::instance();
        self::validate_context($context);

        // 1. Get courses
        if ($courseid) {
            $courses = $DB->get_records_select('course', 'id = :id', ['id' => $courseid], '', 'id, fullname, shortname');
            // Check access? strictly we should just check enrolments
        } else {
            $courses = \enrol_get_users_courses($USER->id, true, 'id, fullname, shortname');
        }

        $overview = [];
        $assignment_instance_ids = [];
        $assignment_map = []; // Start mapping: courseid -> [ assignment instance id -> { cmid, name, duedate } ]

        foreach ($courses as $course) {
            $c_context = \context_course::instance($course->id);
            // Check if user has capability to update (teach) in general, 
            // though we will check specific assignment perms later.
            // A quick check to skip student courses:
            if (!\has_capability('moodle/course:update', $c_context)) {
                continue;
            }

            $modinfo = \get_fast_modinfo($course);
            $assignments = [];

            foreach ($modinfo->get_instances_of('assign') as $cm) {
                if (!$cm->uservisible) continue;

                $m_context = \context_module::instance($cm->id);
                if (!\has_capability('mod/assign:grade', $m_context)) continue;

                $assignments[$cm->instance] = [
                    'cmid' => $cm->id,
                    'name' => $cm->name,
                    'instance' => $cm->instance,
                    'duedate' => 0, // Will fetch from DB or cm? cm doesn't have duedate usually, instance does.
                    'needsgrading' => 0
                ];
                $assignment_instance_ids[] = $cm->instance;
            }

            if (!empty($assignments)) {
                $assignment_map[$course->id] = [
                    'course_info' => [
                        'id' => $course->id,
                        'fullname' => $course->fullname
                    ],
                    'assignments' => $assignments
                ];
            }
        }

        if (empty($assignment_instance_ids)) {
            return ['courses' => []];
        }

        // 2. Fetch Assignment Details (DueDate) and Needs Grading Counts
        // SQL to get needs grading counts
        // Logic: Status = submitted AND (Grade is NULL OR Grade < 0)
        // Note: This is an approximation. Ideally we use assign->count_submissions_with_status
        // but that requires loading every assign class instance (heavy).
        // Let's rely on standard 'submitted' status.

        // Split into chunks if too many assignments
        $chunks = array_chunk($assignment_instance_ids, 1000);
        $counts = [];
        $details = [];

        foreach ($chunks as $chunk) {
            list($insql, $inparams) = $DB->get_in_or_equal($chunk);

            // Get Due Dates
            $sql_dates = "SELECT id, duedate FROM {assign} WHERE id $insql";
            $dates = $DB->get_records_sql($sql_dates, $inparams);
            foreach ($dates as $d) {
                $details[$d->id] = $d->duedate;
            }

            // Get Counts
            // We join on submission and make sure it is latest
            // We left join grades to check if graded
            // CRITICAL FIX: Join with user_enrolments to ensure we only count ACTIVE students
            // suspended users or unenrolled users should not count towards "Needs Grading"

            $now = time();
            $sql_count = "SELECT s.assignment, COUNT(DISTINCT s.userid) as count
                          FROM {assign_submission} s
                          JOIN {assign} a ON a.id = s.assignment
                          JOIN {user} u ON u.id = s.userid
                          JOIN {user_enrolments} ue ON ue.userid = u.id
                          JOIN {enrol} e ON e.id = ue.enrolid AND e.courseid = a.course
                          LEFT JOIN {assign_grades} g ON g.assignment = s.assignment 
                               AND g.userid = s.userid 
                               AND g.attemptnumber = s.attemptnumber
                          WHERE s.assignment $insql
                            AND s.latest = 1
                            AND s.status = 'submitted'
                            AND (g.id IS NULL OR g.grade < 0)
                            AND u.deleted = 0
                            AND ue.status = 0
                            AND e.status = 0
                            AND (ue.timeend = 0 OR ue.timeend > ?)
                          GROUP BY s.assignment";

            // Add $now to params for the time check
            $queryparams = array_merge($inparams, [$now]);

            $recs = $DB->get_records_sql($sql_count, $queryparams);
            foreach ($recs as $r) {
                $counts[$r->assignment] = $r->count;
            }
        }

        // 3. Assemble Data
        $result_courses = [];

        foreach ($assignment_map as $cid => $data) {
            $course_assignments = [];
            foreach ($data['assignments'] as $aid => $info) {
                // If needs grading count is 0, do we show it? User said "assignments thats need gradding"
                // Let's ONLY show if count > 0 for now, or maybe show all?
                // "this will show only the assignments thats need gradding" -> Filter out 0s.

                $count = isset($counts[$aid]) ? $counts[$aid] : 0;
                if ($count == 0) continue;

                $duedate = isset($details[$aid]) ? $details[$aid] : 0;

                $course_assignments[] = [
                    'id' => $info['instance'], // assignment id
                    'cmid' => $info['cmid'],
                    'name' => $info['name'],
                    'duedate' => $duedate,
                    'duedatestr' => $duedate ? \userdate($duedate) : '-', // formatted
                    'needsgrading' => $count
                ];
            }

            if (!empty($course_assignments)) {
                $result_courses[] = [
                    'id' => $data['course_info']['id'],
                    'fullname' => $data['course_info']['fullname'],
                    'assignments' => $course_assignments
                ];
            }
        }

        return ['courses' => $result_courses];
    }

    /**
     * Returns description of method result value
     */
    public static function get_grading_overview_returns()
    {
        return new external_single_structure([
            'courses' => new external_multiple_structure(
                new external_single_structure([
                    'id' => new external_value(\PARAM_INT, 'Course ID'),
                    'fullname' => new external_value(\PARAM_TEXT, 'Course Name'),
                    'assignments' => new external_multiple_structure(
                        new external_single_structure([
                            'id' => new external_value(\PARAM_INT, 'Assignment ID'),
                            'cmid' => new external_value(\PARAM_INT, 'Course Module ID'),
                            'name' => new external_value(\PARAM_TEXT, 'Assignment Name'),
                            'duedate' => new external_value(\PARAM_INT, 'Due Date Timestamp'),
                            'duedatestr' => new external_value(\PARAM_TEXT, 'Due Date Formatted'),
                            'needsgrading' => new external_value(\PARAM_INT, 'Count of submissions needing grading')
                        ])
                    )
                ])
            )
        ]);
    }
}
