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
 * @package     local_teacherdashboard
 * @copyright   2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license     https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

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
     * Parameters for detailed student progress
     */
    public static function get_student_detailed_progress_parameters()
    {
        return new external_function_parameters([
            'studentid' => new external_value(\PARAM_INT, 'Student ID')
        ]);
    }

    /**
     * Parameters for system analytics
     */
    public static function get_payment_analytics_parameters()
    {
        return new external_function_parameters([
            'categoryid' => new external_value(\PARAM_INT, 'Filter by Category ID', \VALUE_DEFAULT, 0),
            'fromdate' => new external_value(\PARAM_INT, 'From Date Timestamp', \VALUE_DEFAULT, 0),
            'todate' => new external_value(\PARAM_INT, 'To Date Timestamp', \VALUE_DEFAULT, 0)
        ]);
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
        $courses = \enrol_get_users_courses($USER->id, true, 'id, fullname, shortname, category');
        $mycourses = [];
        $courseids = [];
        $categoryids = [];

        foreach ($courses as $course) {
            $coursecontext = \context_course::instance($course->id);
            if (\has_capability('moodle/course:update', $coursecontext)) {
                $categoryid = isset($course->category) ? $course->category : 0;
                $mycourses[] = [
                    'id' => $course->id,
                    'name' => $course->fullname,
                    'category' => $categoryid
                ];
                $courseids[] = $course->id;
                if ($categoryid) {
                    $categoryids[$categoryid] = $categoryid;
                }
            }
        }

        if (empty($courseids)) {
            return ['courses' => [], 'students' => []];
        }

        // Fetch category names and paths
        list($catsql, $catparams) = $DB->get_in_or_equal($categoryids);
        $categories = $DB->get_records_select('course_categories', "id $catsql", $catparams, '', 'id, name, path');

        // Enrich courses with category names and paths
        foreach ($mycourses as &$course) {
            $catid = $course['category'];
            if (isset($categories[$catid])) {
                $course['categoryname'] = $categories[$catid]->name;
                $course['categorypath'] = $categories[$catid]->path;
            } else {
                $course['categoryname'] = 'Unknown';
                $course['categorypath'] = '';
            }
        }

        // 2. Get students and their completion status across these courses
        // We fetch users who are enrolled in ANY of verify course ids.
        // We use a simplified query to get user details + course completion record.

        list($insql, $inparams) = $DB->get_in_or_equal($courseids, SQL_PARAMS_NAMED);

        // Fetch unique students enrolled in these courses
        // Note: keeping it simple - checking enrollment via standard API is safer but this is a dashboard analytics query
        // so we define "Student" as someone with a completion record or valid enrollment.
        // Let's rely on course_completions table which exists for enrolled users if completion is enabled.

        // Fetch unique students enrolled in these courses
        // Exclude the current user (teacher/admin) from the list
        $sql = "SELECT DISTINCT u.id, u.firstname, u.lastname, u.email, u.lastaccess
                  FROM {user} u
                  JOIN {user_enrolments} ue ON ue.userid = u.id
                  JOIN {enrol} e ON e.id = ue.enrolid
                 WHERE e.courseid $insql
                   AND u.deleted = 0
                   AND u.id != :currentuserid";

        $studentparams = array_merge($inparams, ['currentuserid' => $USER->id]);
        $students = $DB->get_records_sql($sql, $studentparams);

        // 3. Fetch specific enrollments for these students in these courses
        // We use CONCAT to ensure unique keys so get_records_sql doesn't overwrite enrollments for the same user
        $enrollments = [];
        if (!empty($students)) {
            $sql_concat = $DB->sql_concat('ue.userid', "'-'", 'e.courseid');
            $enrolsql = "SELECT $sql_concat AS uniqueid, ue.userid, e.courseid
                           FROM {user_enrolments} ue
                           JOIN {enrol} e ON e.id = ue.enrolid
                          WHERE ue.userid IN (" . implode(',', array_keys($students)) . ")
                            AND e.courseid $insql";
            $enrollments = $DB->get_records_sql($enrolsql, $inparams);
        }

        $enrollmentMap = [];
        foreach ($enrollments as $e) {
            $enrollmentMap[$e->userid][$e->courseid] = true;
        }

        // Fetch completion states
        $sql_concat_comp = $DB->sql_concat('userid', "'-'", 'course');
        $completesql = "SELECT $sql_concat_comp AS uniqueid, userid, course, timecompleted
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

        $now = time();
        $threeDays = 3 * 24 * 3600;
        $sevenDays = 7 * 24 * 3600;
        $fourteenDays = 14 * 24 * 3600;

        foreach ($students as $student) {
            $studentContext = [
                'id' => $student->id,
                'name' => \fullname($student),
                'email' => $student->email,
                'lastaccess' => $student->lastaccess, // Add last access timestamp
                'completions' => []
            ];

            $enrolledCount = 0;
            $completedCount = 0;

            foreach ($courseids as $cid) {
                // Check if completed
                $isCompleted = isset($completionMap[$student->id][$cid]);
                // Check if enrolled (explicit enrollment OR has a completion record)
                $isEnrolled = isset($enrollmentMap[$student->id][$cid]) || $isCompleted;

                if ($isEnrolled) {
                    $enrolledCount++;
                    if ($isCompleted) {
                        $completedCount++;
                    }
                }

                $studentContext['completions'][] = [
                    'courseid' => $cid,
                    'enrolled' => $isEnrolled,
                    'completed' => $isCompleted
                ];
            }

            // Calculate Engagement Score (0-100)
            // 1. Recency Score (50%)
            $recencyScore = 0;
            if ($student->lastaccess > 0) {
                $diff = $now - $student->lastaccess;
                if ($diff < $threeDays) {
                    $recencyScore = 100;
                } else if ($diff < $sevenDays) {
                    $recencyScore = 70;
                } else if ($diff < $fourteenDays) {
                    $recencyScore = 40;
                } else {
                    $recencyScore = 10;
                }
            }

            // 2. Completion Score (50%)
            // Completion rate relative to enrolled courses
            $completionScore = 0;
            if ($enrolledCount > 0) {
                $completionScore = ($completedCount / $enrolledCount) * 100;
            }

            // Final Weighted Score
            // Adjust weights as needed. Recency is heavily weighted for "current engagement".
            // Let's do 60% recency, 40% completion (since completion takes a long time).
            $engagementScore = ($recencyScore * 0.6) + ($completionScore * 0.4);

            $studentContext['engagement_score'] = (int) round($engagementScore);

            $studentData[] = $studentContext;
        }

        return [
            'courses' => $mycourses,
            'students' => $studentData
        ];
    }

    /**
     * Get detailed progress for a specific student
     */
    public static function get_student_detailed_progress($studentid)
    {
        global $DB, $USER, $CFG;

        require_once($CFG->libdir . '/completionlib.php');
        require_once($CFG->libdir . '/gradelib.php');

        $params = self::validate_parameters(self::get_student_detailed_progress_parameters(), ['studentid' => $studentid]);
        $context = \context_system::instance();
        self::validate_context($context);

        // 1. Get Teacher's Courses
        $teacher_courses = \enrol_get_users_courses($USER->id, true, 'id, fullname, shortname');

        // 2. Filter for Shared Courses (User is enrolled)
        $shared_courses = [];
        foreach ($teacher_courses as $course) {
            $c_context = \context_course::instance($course->id);
            if (\is_enrolled($c_context, $studentid)) {
                $shared_courses[] = $course;
            }
        }

        if (empty($shared_courses)) {
            // Fetch student name anyway if possible, or return empty
            // Ideally check if user exists first
            return ['student' => ['id' => $studentid, 'fullname' => 'Unknown', 'email' => ''], 'courses' => []];
        }

        // Get Student Details
        $student = $DB->get_record('user', ['id' => $studentid], 'id, firstname, lastname, email', MUST_EXIST);
        $student_data = [
            'id' => $student->id,
            'fullname' => \fullname($student),
            'email' => $student->email
        ];

        $courses_data = [];

        foreach ($shared_courses as $course) {
            $course_info = [
                'id' => $course->id,
                'fullname' => $course->fullname,
                'activities' => []
            ];

            $modinfo = \get_fast_modinfo($course, $studentid);
            $completion = new \completion_info($course);
            $is_completion_enabled = $completion->is_enabled();

            // Get grades for all items in course for this user efficiently
            // We use key: itemmodule, iteminstance => grade
            $grades = [];
            // Querying grades (Lightweight version)
            $sql = "SELECT i.itemmodule, i.iteminstance, g.finalgrade 
                    FROM {grade_items} i
                    JOIN {grade_grades} g ON g.itemid = i.id
                    WHERE i.courseid = :courseid AND i.itemtype = 'mod' AND g.userid = :userid";
            $grade_records = $DB->get_records_sql($sql, ['courseid' => $course->id, 'userid' => $studentid]);
            foreach ($grade_records as $rec) {
                $grades[$rec->itemmodule][$rec->iteminstance] = $rec->finalgrade;
            }

            foreach ($modinfo->cms as $cm) {
                // Filter: Must have completion or be a gradeable activity
                // Only "visible" activities
                if (!$cm->uservisible) continue;

                // Exclude labels unless they have completion?
                if ($cm->modname == 'label' && $cm->completion == COMPLETION_TRACKING_NONE) continue;

                $activity = [
                    'id' => $cm->id,
                    'name' => $cm->name,
                    'type' => $cm->modname,
                    'completed' => false,
                    'status' => 'Pending',
                    'grade' => ''
                ];

                // Completion
                if ($is_completion_enabled && $cm->completion != COMPLETION_TRACKING_NONE) {
                    $completion_data = $completion->get_data($cm, true, $studentid);
                    if (
                        $completion_data->completionstate == COMPLETION_COMPLETE ||
                        $completion_data->completionstate == COMPLETION_COMPLETE_PASS ||
                        $completion_data->completionstate == COMPLETION_COMPLETE_FAIL
                    ) {
                        $activity['completed'] = true;
                        $activity['status'] = 'Completed';

                        if ($completion_data->completionstate == COMPLETION_COMPLETE_PASS) $activity['status'] = 'Passed';
                        if ($completion_data->completionstate == COMPLETION_COMPLETE_FAIL) $activity['status'] = 'Failed';
                    }
                } else {
                    $activity['status'] = 'No Tracking';
                }

                // Grade
                if (isset($grades[$cm->modname][$cm->instance])) {
                    $raw_grade = $grades[$cm->modname][$cm->instance];
                    if (!is_null($raw_grade)) {
                        $activity['grade'] = \format_float($raw_grade, 2);
                    }
                }

                $course_info['activities'][] = $activity;
            }
            $courses_data[] = $course_info;
        }

        return [
            'student' => $student_data,
            'courses' => $courses_data
        ];
    }

    /**
     * Get system wide analytics for admin/manager
     */
    public static function get_system_analytics_parameters()
    {
        return new external_function_parameters([
            'categoryid' => new external_value(\PARAM_INT, 'Filter by Category ID', \VALUE_DEFAULT, 0),
            'courseid' => new external_value(\PARAM_INT, 'Filter by Course ID', \VALUE_DEFAULT, 0),
            'includesubcategories' => new external_value(\PARAM_BOOL, 'Include sub-categories', \VALUE_DEFAULT, true)
        ]);
    }

    public static function get_system_analytics($categoryid = 0, $courseid = 0, $includesubcategories = true)
    {
        global $DB, $USER;

        $params = self::validate_parameters(self::get_system_analytics_parameters(), [
            'categoryid' => $categoryid,
            'courseid' => $courseid,
            'includesubcategories' => $includesubcategories
        ]);
        $categoryid = $params['categoryid'];
        $courseid = $params['courseid'];
        $includesubcategories = $params['includesubcategories'];

        $context = \context_system::instance();
        if (!has_capability('moodle/site:config', $context) && !has_capability('moodle/course:create', $context) && !is_siteadmin()) {
            throw new \moodle_exception('nopermissions', 'error', '', 'get system analytics');
        }

        // 1. Fetch Filter Options (All categories and courses for dropdowns)
        $all_categories = $DB->get_records('course_categories', null, 'sortorder ASC', 'id, name, parent, path');
        $all_courses = $DB->get_records('course', null, 'fullname ASC', 'id, fullname, category');
        unset($all_courses[1]); // Exclude site course

        $filter_options = [
            'categories' => [],
            'courses' => []
        ];
        foreach ($all_categories as $c) {
            $filter_options['categories'][] = ['id' => $c->id, 'name' => $c->name, 'parent' => $c->parent];
        }
        foreach ($all_courses as $c) {
            $filter_options['courses'][] = ['id' => $c->id, 'name' => $c->fullname, 'category' => $c->category];
        }

        // 2. Determine target course IDs based on filters
        $target_course_ids = [];

        if ($courseid > 0) {
            if (isset($all_courses[$courseid])) {
                $target_course_ids = [$courseid];
            }
        } elseif ($categoryid > 0) {
            if ($includesubcategories) {
                // Find subcategories by path
                $rootcat = $all_categories[$categoryid] ?? null;
                if ($rootcat) {
                    $catids = [$categoryid];
                    foreach ($all_categories as $c) {
                        if (strpos($c->path, $rootcat->path . '/') === 0) {
                            $catids[] = $c->id;
                        }
                    }
                    foreach ($all_courses as $c) {
                        if (in_array($c->category, $catids)) {
                            $target_course_ids[] = $c->id;
                        }
                    }
                }
            } else {
                foreach ($all_courses as $c) {
                    if ($c->category == $categoryid) {
                        $target_course_ids[] = $c->id;
                    }
                }
            }
        } else {
            // All courses
            $target_course_ids = array_keys($all_courses);
        }

        if (empty($target_course_ids)) {
            return [
                'total_students' => 0,
                'total_teachers' => 0,
                'total_courses' => 0,
                'categories' => [],
                'filter_options' => $filter_options
            ];
        }

        list($insql, $inparams) = $DB->get_in_or_equal($target_course_ids);

        // 3. Calculate Stats
        $sql_students = "SELECT COUNT(DISTINCT ra.userid) 
                           FROM {role_assignments} ra
                           JOIN {context} ctx ON ctx.id = ra.contextid
                           JOIN {role} r ON r.id = ra.roleid
                          WHERE ctx.contextlevel = 50 
                            AND ctx.instanceid $insql
                            AND r.shortname = 'student'";
        $total_students = $DB->count_records_sql($sql_students, $inparams);

        $sql_teachers = "SELECT COUNT(DISTINCT ra.userid)
                           FROM {role_assignments} ra
                           JOIN {context} ctx ON ctx.id = ra.contextid
                           JOIN {role} r ON r.id = ra.roleid
                          WHERE ctx.contextlevel = 50
                            AND ctx.instanceid $insql
                            AND r.shortname IN ('editingteacher', 'teacher')";
        $total_teachers = $DB->count_records_sql($sql_teachers, $inparams);
        //$unique_teachers = $total_teachers; // Consistent naming

        $total_courses = count($target_course_ids);

        // 4. Breakdown by Category (aggregated based on filtered courses)
        // Course Count per Category
        $sql = "SELECT category, COUNT(id) as cnt FROM {course} WHERE id $insql GROUP BY category";
        $course_counts = $DB->get_records_sql_menu($sql, $inparams);

        // Student Count per Category
        $sql = "SELECT c.category, COUNT(DISTINCT ra.userid) as cnt 
                  FROM {course} c 
                  JOIN {context} ctx ON ctx.instanceid = c.id AND ctx.contextlevel = 50
                  JOIN {role_assignments} ra ON ra.contextid = ctx.id
                  JOIN {role} r ON r.id = ra.roleid
                 WHERE c.id $insql 
                   AND r.shortname = 'student'
                 GROUP BY c.category";
        $student_counts = $DB->get_records_sql_menu($sql, $inparams);

        // Teacher Count per Category
        $sql = "SELECT c.category, COUNT(DISTINCT ra.userid) as cnt
                  FROM {course} c
                  JOIN {context} ctx ON ctx.instanceid = c.id AND ctx.contextlevel = 50
                  JOIN {role_assignments} ra ON ra.contextid = ctx.id
                  JOIN {role} r ON r.id = ra.roleid
                 WHERE c.id $insql
                   AND r.shortname IN ('editingteacher', 'teacher')
                 GROUP BY c.category";
        $teacher_counts = $DB->get_records_sql_menu($sql, $inparams);

        $cat_stats = [];
        foreach ($course_counts as $catid => $count) {
            $catname = isset($all_categories[$catid]) ? $all_categories[$catid]->name : 'Unknown';
            $cat_stats[] = [
                'id' => $catid,
                'name' => $catname,
                'course_count' => $count,
                'student_count' => $student_counts[$catid] ?? 0,
                'teacher_count' => $teacher_counts[$catid] ?? 0
            ];
        }

        // Sort by student count desc for chart
        usort($cat_stats, function ($a, $b) {
            return $b['student_count'] - $a['student_count'];
        });

        return [
            'total_students' => $total_students,
            'total_teachers' => $total_teachers,
            'total_courses' => $total_courses,
            'categories' => $cat_stats,
            'filter_options' => $filter_options
        ];
    }


    /**
     * Get payment analytics data
     */
    public static function get_payment_analytics($categoryid = 0, $fromdate = 0, $todate = 0)
    {
        global $DB, $USER;

        $params = self::validate_parameters(self::get_payment_analytics_parameters(), [
            'categoryid' => $categoryid,
            'fromdate' => $fromdate,
            'todate' => $todate
        ]);

        $context = \context_system::instance();
        if (!has_capability('moodle/site:config', $context) && !has_capability('moodle/course:create', $context) && !is_siteadmin()) {
            throw new \moodle_exception('nopermissions', 'error', '', 'get payment analytics');
        }

        // 1. Resolve Categories
        // Similar to system analytics, if category is selected, we get it and its children (if we want deep search)
        // For simplicity, let's treat the filter as "courses within this category tree".

        $catids = [];
        if ($categoryid > 0) {
            $catids[] = $categoryid;
            // Get children
            $category = $DB->get_record('course_categories', ['id' => $categoryid]);
            if ($category) {
                $children = $DB->get_records_select('course_categories', "path LIKE ?", [$category->path . '/%'], '', 'id');
                foreach ($children as $child) {
                    $catids[] = $child->id;
                }
            }
        }

        // 2. Find Courses with specific enrollment methods (paypal, fee, payment) or ANY method with cost > 0
        // We look for enrol instances in these categories

        $sql = "SELECT DISTINCT e.courseid, e.id as enrolid, e.enrol, e.cost, e.currency, c.category, c.fullname
                  FROM {enrol} e
                  JOIN {course} c ON c.id = e.courseid
                 WHERE (e.cost > 0 
                    OR e.enrol LIKE '%pay%' 
                    OR e.enrol LIKE '%fee%' 
                    OR e.enrol LIKE '%stripe%'
                    OR e.enrol LIKE '%mollie%'
                    OR e.enrol LIKE '%razor%')
                   AND e.status = 0"; // Enabled instances only

        $params = [];

        if (!empty($catids)) {
            list($catsql, $catparams) = $DB->get_in_or_equal($catids, SQL_PARAMS_NAMED, 'cat');
            $sql .= " AND c.category $catsql";
            $params = array_merge($params, $catparams);
        }

        $enrol_instances = $DB->get_records_sql($sql, $params);

        if (empty($enrol_instances)) {
            return [
                'total_students' => 0,
                'total_revenue' => 0,
                'currency' => 'USD', // Default
                'categories' => [],
                'courses' => []
            ];
        }

        // 3. For each instance, get ACTUAL payments from the mdl_payments table
        $course_stats = []; // courseid => stats
        $category_stats = []; // categoryid => stats

        $total_students = 0;
        $total_revenue = 0;
        $currency = ''; // Will be set from actual payment data

        foreach ($enrol_instances as $instance) {
            // Query the payments table for actual amounts paid for this enrol instance.
            // mdl_payments stores: component='enrol_fee', paymentarea='fee', itemid=enrol.id
            $psql = "SELECT p.id, p.userid, p.amount, p.currency, p.timecreated
                       FROM {payments} p
                      WHERE p.component = :component
                        AND p.itemid = :itemid";

            $pparams = [
                'component' => $instance->enrol . '_' . $instance->enrol, // Try component format
                'itemid' => $instance->enrolid
            ];

            // Actually, the component in mdl_payments is 'enrol_fee' (enrol_ + plugin name).
            // The enrol field in mdl_enrol stores just 'fee', so component = 'enrol_' . enrol
            $pparams['component'] = 'enrol_' . $instance->enrol;

            if ($fromdate > 0) {
                $psql .= " AND p.timecreated >= :fromdate";
                $pparams['fromdate'] = $fromdate;
            }
            if ($todate > 0) {
                $psql .= " AND p.timecreated <= :todate";
                $pparams['todate'] = $todate;
            }

            $payments = $DB->get_records_sql($psql, $pparams);

            if (!empty($payments)) {
                $instance_revenue = 0;
                $instance_students = 0;
                $seen_users = [];

                foreach ($payments as $payment) {
                    $instance_revenue += (float)$payment->amount;

                    // Count distinct users (a user might have multiple payments)
                    if (!isset($seen_users[$payment->userid])) {
                        $seen_users[$payment->userid] = true;
                        $instance_students++;
                    }

                    // Set currency from actual payment data (take the first one found)
                    if (empty($currency) && !empty($payment->currency)) {
                        $currency = $payment->currency;
                    }
                }

                // Aggregate Course Stats
                if (!isset($course_stats[$instance->courseid])) {
                    $course_stats[$instance->courseid] = [
                        'id' => $instance->courseid,
                        'name' => $instance->fullname,
                        'category' => $instance->category,
                        'student_count' => 0,
                        'revenue' => 0
                    ];
                }
                $course_stats[$instance->courseid]['student_count'] += $instance_students;
                $course_stats[$instance->courseid]['revenue'] += $instance_revenue;

                // Aggregate Category Stats
                if (!isset($category_stats[$instance->category])) {
                    $category_stats[$instance->category] = [
                        'id' => $instance->category,
                        'name' => 'Category ' . $instance->category, // Placeholder, enriched later
                        'student_count' => 0,
                        'revenue' => 0
                    ];
                }
                $category_stats[$instance->category]['student_count'] += $instance_students;
                $category_stats[$instance->category]['revenue'] += $instance_revenue;

                $total_students += $instance_students;
                $total_revenue += $instance_revenue;
            }
        }

        if (empty($currency)) {
            $currency = 'USD'; // Fallback default
        }

        // Enrich Category Names
        if (!empty($category_stats)) {
            $cat_ids = array_keys($category_stats);
            list($csql, $cparams) = $DB->get_in_or_equal($cat_ids);
            $cats = $DB->get_records_select('course_categories', "id $csql", $cparams, '', 'id, name');
            foreach ($cats as $c) {
                if (isset($category_stats[$c->id])) {
                    $category_stats[$c->id]['name'] = $c->name;
                }
            }
        }

        return [
            'total_students' => $total_students,
            'total_revenue' => (float)$total_revenue,
            'currency' => $currency,
            'categories' => array_values($category_stats),
            'courses' => array_values($course_stats)
        ];
    }

    /**
     * Returns description of method result value
     * @return \external_single_structure
     */
    public static function get_system_analytics_returns()
    {
        return new external_single_structure([
            'total_students' => new external_value(\PARAM_INT, 'Total Students'),
            'total_teachers' => new external_value(\PARAM_INT, 'Total Teachers'),
            'total_courses' => new external_value(\PARAM_INT, 'Total Courses'),
            'categories' => new external_multiple_structure(
                new external_single_structure([
                    'id' => new external_value(\PARAM_INT, 'Cat ID'),
                    'name' => new external_value(\PARAM_TEXT, 'Name'),
                    'course_count' => new external_value(\PARAM_INT, 'Course count'),
                    'student_count' => new external_value(\PARAM_INT, 'Student count'),
                    'teacher_count' => new external_value(\PARAM_INT, 'Teacher count')
                ])
            ),
            'filter_options' => new external_single_structure([
                'categories' => new external_multiple_structure(
                    new external_single_structure([
                        'id' => new external_value(\PARAM_INT, 'ID'),
                        'name' => new external_value(\PARAM_TEXT, 'Name'),
                        'parent' => new external_value(\PARAM_INT, 'Parent ID')
                    ])
                ),
                'courses' => new external_multiple_structure(
                    new external_single_structure([
                        'id' => new external_value(\PARAM_INT, 'ID'),
                        'name' => new external_value(\PARAM_TEXT, 'Name'),
                        'category' => new external_value(\PARAM_INT, 'Category ID')
                    ])
                )
            ])
        ]);
    }

    /**
     * Returns description of method result value
     * @return \external_single_structure
     */
    public static function get_cross_course_progress_returns()
    {
        return new external_single_structure([
            'courses' => new external_multiple_structure(
                new external_single_structure([
                    'id' => new external_value(PARAM_INT, 'Course ID'),
                    'name' => new external_value(PARAM_TEXT, 'Course Name'),
                    'category' => new external_value(PARAM_INT, 'Category ID'),
                    'categoryname' => new external_value(PARAM_TEXT, 'Category Name'),
                    'categorypath' => new external_value(PARAM_TEXT, 'Category Path')
                ])
            ),
            'students' => new external_multiple_structure(
                new external_single_structure([
                    'id' => new external_value(\PARAM_INT, 'Student ID'),
                    'name' => new external_value(\PARAM_TEXT, 'Student Name'),
                    'email' => new external_value(\PARAM_TEXT, 'Student Email'),
                    'engagement_score' => new external_value(\PARAM_INT, 'Engagement Score (0-100)', \VALUE_OPTIONAL),
                    'completions' => new external_multiple_structure(
                        new external_single_structure([
                            'courseid' => new external_value(PARAM_INT, 'Course ID'),
                            'enrolled' => new external_value(PARAM_BOOL, 'Is enrolled?'),
                            'completed' => new external_value(PARAM_BOOL, 'Is completed?')
                        ])
                    )
                ])
            )
        ]);
    }

    public static function get_student_detailed_progress_returns()
    {
        return new external_single_structure([
            'student' => new external_single_structure([
                'id' => new external_value(\PARAM_INT, 'ID'),
                'fullname' => new external_value(\PARAM_TEXT, 'Name'),
                'email' => new external_value(\PARAM_TEXT, 'Email'),
            ]),
            'courses' => new external_multiple_structure(
                new external_single_structure([
                    'id' => new external_value(\PARAM_INT, 'Course ID'),
                    'fullname' => new external_value(\PARAM_TEXT, 'Course Name'),
                    'activities' => new external_multiple_structure(
                        new external_single_structure([
                            'id' => new external_value(\PARAM_INT, 'CM ID'),
                            'name' => new external_value(\PARAM_TEXT, 'Activity Name'),
                            'type' => new external_value(\PARAM_TEXT, 'Module Type'),
                            'completed' => new external_value(\PARAM_BOOL, 'Completed?'),
                            'status' => new external_value(\PARAM_TEXT, 'Status Text'),
                            'grade' => new external_value(\PARAM_TEXT, 'Grade')
                        ])
                    )
                ])
            )
        ]);
    }

    public static function get_payment_analytics_returns()
    {
        return new external_single_structure([
            'total_students' => new external_value(\PARAM_INT, 'Total Students'),
            'total_revenue' => new external_value(\PARAM_FLOAT, 'Total Revenue'),
            'currency' => new external_value(\PARAM_TEXT, 'Currency'),
            'categories' => new external_multiple_structure(
                new external_single_structure([
                    'id' => new external_value(\PARAM_INT, 'Cat ID'),
                    'name' => new external_value(\PARAM_TEXT, 'Name'),
                    'student_count' => new external_value(\PARAM_INT, 'Student count'),
                    'revenue' => new external_value(\PARAM_FLOAT, 'Revenue'),
                    'teacher_count' => new external_value(\PARAM_INT, 'Teacher count', \VALUE_OPTIONAL),
                    'course_count' => new external_value(\PARAM_INT, 'Course count', \VALUE_OPTIONAL)
                ])
            ),
            'courses' => new external_multiple_structure(
                new external_single_structure([
                    'id' => new external_value(\PARAM_INT, 'Course ID'),
                    'name' => new external_value(\PARAM_TEXT, 'Course Name'),
                    'category' => new external_value(\PARAM_INT, 'Category ID'),
                    'student_count' => new external_value(\PARAM_INT, 'Student Count'),
                    'revenue' => new external_value(\PARAM_FLOAT, 'Revenue')
                ])
            )
        ]);
    }
}
