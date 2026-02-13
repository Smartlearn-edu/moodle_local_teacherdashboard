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
    public static function get_system_analytics_parameters()
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
        $sql_concat = $DB->sql_concat('ue.userid', "'-'", 'e.courseid');
        $enrolsql = "SELECT $sql_concat AS uniqueid, ue.userid, e.courseid
                       FROM {user_enrolments} ue
                       JOIN {enrol} e ON e.id = ue.enrolid
                      WHERE ue.userid IN (" . implode(',', array_keys($students)) . ")
                        AND e.courseid $insql";
        $enrollments = $DB->get_records_sql($enrolsql, $inparams);

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
    public static function get_system_analytics()
    {
        global $DB, $USER;

        $context = \context_system::instance();
        // Check permissions: either site config or course creator at system level
        if (!has_capability('moodle/site:config', $context) && !has_capability('moodle/course:create', $context) && !is_siteadmin()) {
            throw new \moodle_exception('nopermissions', 'error', '', 'get system analytics');
        }

        // 1. Total counts
        $total_students = $DB->count_records('user', ['deleted' => 0, 'suspended' => 0]); // Rough count, active users?
        // Better to count only those with student role? For now, all users ex deleted.

        $total_courses = $DB->count_records('course', ['visible' => 1]);
        if ($total_courses > 1) $total_courses  -= 1; // Exclude site course

        // 2. Categories Stats
        $categories = $DB->get_records('course_categories', null, 'sortorder ASC', 'id, name, coursecount, parent');

        $cat_stats = [];
        $total_teachers = 0; // We can try to count unique teachers?

        // This is heavy. Let's do a lighter query.
        // Count enrollments per category?
        // We can query {role_assignments} join {context} join {course} join {course_categories}

        // Let's get enrollment counts per course first?
        // For dashboard, we need something fast.

        // Let's loop categories and get aggregate data.
        foreach ($categories as $cat) {
            // Count courses in this category
            $course_count = $cat->coursecount;

            // Count students in this category (enrolled in at least one course in this cat)
            // SQL: SELECT COUNT(DISTINCT ue.userid) ...
            // This might be slow if many courses.

            // Simplified: User teacher/student counts from role assignments in course contexts within this category?
            // Moodle doesn't store "students in category" directly.

            // For now, let's just return course counts and maybe try to fetch total enrolments count
            // from {enrol} table linked to courses in this category.

            $sql_students = "SELECT COUNT(DISTINCT ue.userid)
                               FROM {user_enrolments} ue
                               JOIN {enrol} e ON e.id = ue.enrolid
                               JOIN {course} c ON c.id = e.courseid
                              WHERE c.category = :catid";

            $student_count = $DB->count_records_sql($sql_students, ['catid' => $cat->id]);

            // Teachers?
            // Usually context level 50 (course). Role archetypes?
            // Let's count users with 'editingteacher' or 'teacher' role in courses of this cat.
            // Too complex for simple iteration.

            // Alternative: Count distinct users with capability 'moodle/course:update' in courses of this category?
            // Also slow.

            // Let's use a rough heuristic or just 0 for now to speed up, or a specific query.
            // Query for teacher enrollments:
            // We need to know which enrol ids are for teachers. 
            // Better: use role assignments.
            /*
            $sql_teachers = "SELECT COUNT(DISTINCT ra.userid)
                               FROM {role_assignments} ra
                               JOIN {context} ctx ON ctx.id = ra.contextid
                               JOIN {course} c ON c.id = ctx.instanceid
                              WHERE ctx.contextlevel = 50
                                AND c.category = :catid
                                AND ra.roleid IN (SELECT id FROM {role} WHERE shortname IN ('editingteacher', 'teacher'))";
            */
            // Use local teacher role check if standard... let's just use a placeholder or lightweight query.
            // Let's assume teacher count is small.
            $sql_teachers = "SELECT COUNT(DISTINCT ra.userid)
                               FROM {role_assignments} ra
                               JOIN {context} ctx ON ctx.id = ra.contextid
                               JOIN {course} c ON c.id = ctx.instanceid
                               JOIN {role} r ON r.id = ra.roleid
                              WHERE ctx.contextlevel = 50
                                AND c.category = :catid
                                AND r.shortname IN ('editingteacher', 'teacher')";
            $teacher_count = $DB->count_records_sql($sql_teachers, ['catid' => $cat->id]);

            $cat_stats[] = [
                'id' => $cat->id,
                'name' => $cat->name,
                'course_count' => $course_count,
                'student_count' => $student_count,
                'teacher_count' => $teacher_count
            ];

            $total_teachers += $teacher_count; // Note: specific teachers per category, summing them might count duplicates.
        }

        // Correct total teachers (unique system wide)?
        $sql_unique_teachers = "SELECT COUNT(DISTINCT ra.userid)
                               FROM {role_assignments} ra
                               JOIN {context} ctx ON ctx.id = ra.contextid
                               JOIN {role} r ON r.id = ra.roleid
                              WHERE ctx.contextlevel = 50
                                AND r.shortname IN ('editingteacher', 'teacher')";
        $unique_teachers = $DB->count_records_sql($sql_unique_teachers);


        return [
            'total_students' => $total_students,
            'total_teachers' => $unique_teachers,
            'total_courses' => $total_courses,
            'categories' => $cat_stats
        ];
    }

    /**
     * Returns description of method result value
     * @return \external_single_structure
     */
    public static function get_system_analytics_returns()
    {
        return new external_single_structure([
            'total_students' => new external_value(PARAM_INT, 'Total Students'),
            'total_teachers' => new external_value(PARAM_INT, 'Total Teachers'),
            'total_courses' => new external_value(PARAM_INT, 'Total Courses'),
            'categories' => new external_multiple_structure(
                new external_single_structure([
                    'id' => new external_value(PARAM_INT, 'Cat ID'),
                    'name' => new external_value(PARAM_TEXT, 'Name'),
                    'course_count' => new external_value(PARAM_INT, 'Course count'),
                    'student_count' => new external_value(PARAM_INT, 'Student count'),
                    'teacher_count' => new external_value(PARAM_INT, 'Teacher count')
                ])
            )
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
}
