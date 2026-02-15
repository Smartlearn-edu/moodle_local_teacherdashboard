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
 * Main entry point for the Smart Dashboard.
 *
 * @package     local_smartdashboard
 * @copyright   2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license     https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

// Robust config loading for symlinked plugins.
if (file_exists(__DIR__ . '/../../config.php')) {
    require_once(__DIR__ . '/../../config.php');
} else if (isset($_SERVER['SCRIPT_FILENAME']) && file_exists(dirname($_SERVER['SCRIPT_FILENAME']) . '/../../config.php')) {
    require_once(dirname($_SERVER['SCRIPT_FILENAME']) . '/../../config.php');
} else {
    die('Error: config.php not found. If this is a symlinked plugin, check file permissions or paths.');
}

require_once($CFG->dirroot . '/lib/enrollib.php');

// Define the page context and properties.
$context = context_system::instance();
$PAGE->set_context($context);
$PAGE->set_url(new moodle_url('/local/smartdashboard/index.php'));
$PAGE->set_title(get_string('pluginname', 'local_smartdashboard'));
$PAGE->set_heading(get_string('pluginname', 'local_smartdashboard'));
$PAGE->set_pagelayout('report');

require_login();

echo $OUTPUT->header();

// Fetch courses based on role & filter
$courses = [];
$categories_options = [];
$selected_category = optional_param('categoryid', 0, PARAM_INT);
$show_clicked = optional_param('show', false, PARAM_BOOL);

// Check for Admin/Manager privileges (System level)
$isPrivileged = has_capability('moodle/site:config', $context) || has_capability('moodle/course:create', $context) || is_siteadmin();

if ($isPrivileged) {
    // Admin Mode: Fetch Category Dropdown Data
    // We use a flat list with indentation for simplicity in select box
    if (class_exists('core_course_category')) {
        $cats = core_course_category::make_categories_list();
    } else {
        require_once($CFG->libdir . '/coursecatlib.php');
        $cats = coursecat::make_categories_list();
    }

    foreach ($cats as $id => $name) {
        $categories_options[] = [
            'id' => $id,
            'name' => $name,
            'selected' => ($id == $selected_category)
        ];
    }

    // Only fetch courses if "Show" is clicked, or if we want to show everything by default (User requested OFF by default)
    if ($show_clicked) {
        // 1. Calculate Stats (Recursive: All subcategories)
        if ($selected_category > 0) {
            $category = null;
            if (class_exists('core_course_category')) {
                $category = core_course_category::get($selected_category, IGNORE_MISSING);
            } else {
                $category = coursecat::get($selected_category, IGNORE_MISSING);
            }

            if ($category) {
                // Get all children IDs recursively using the path
                $subcatids = $DB->get_fieldset_sql("SELECT id FROM {course_categories} WHERE path LIKE ?", [$category->path . '/%']);
                $allcatids = array_merge([$selected_category], $subcatids);

                list($insql, $inparams) = $DB->get_in_or_equal($allcatids, SQL_PARAMS_NAMED);

                // Get course IDs for these categories to calculate stats
                $stat_course_ids = $DB->get_fieldset_sql("SELECT id FROM {course} WHERE category $insql", $inparams);

                if (!empty($stat_course_ids)) {
                    list($course_insql, $course_inparams) = $DB->get_in_or_equal($stat_course_ids, SQL_PARAMS_NAMED);

                    // Unique Students (Recursive)
                    $sql_unique = "SELECT COUNT(DISTINCT ra.userid)
                                     FROM {role_assignments} ra
                                     JOIN {context} ctx ON ctx.id = ra.contextid
                                     JOIN {role} r ON r.id = ra.roleid
                                    WHERE ctx.contextlevel = 50
                                      AND ctx.instanceid $course_insql
                                      AND r.shortname = 'student'";
                    $unique_students = $DB->count_records_sql($sql_unique, $course_inparams);

                    // Total Enrollments (Recursive)
                    $sql_enrollments = "SELECT COUNT(ra.userid)
                                          FROM {role_assignments} ra
                                          JOIN {context} ctx ON ctx.id = ra.contextid
                                          JOIN {role} r ON r.id = ra.roleid
                                         WHERE ctx.contextlevel = 50
                                           AND ctx.instanceid $course_insql
                                           AND r.shortname = 'student'";
                    $total_enrollments = $DB->count_records_sql($sql_enrollments, $course_inparams);
                }

                // 2. Fetch Direct Subcategories with Stats
                $direct_children = $category->get_children(); // Direct children
                foreach ($direct_children as $child) {
                    // Recalculate stats for this child (Recursive)
                    $child_subids = $DB->get_fieldset_sql("SELECT id FROM {course_categories} WHERE path LIKE ?", [$child->path . '/%']);
                    $child_allids = array_merge([$child->id], $child_subids);

                    list($c_insql, $c_inparams) = $DB->get_in_or_equal($child_allids, SQL_PARAMS_NAMED);

                    // Get course IDs for child category tree
                    $child_course_ids = $DB->get_fieldset_sql("SELECT id FROM {course} WHERE category $c_insql", $c_inparams);

                    $child_total_enrollments = 0;
                    $child_unique_students = 0;

                    if (!empty($child_course_ids)) {
                        list($courses_insql, $courses_inparams) = $DB->get_in_or_equal($child_course_ids, SQL_PARAMS_NAMED);

                        // Unique Students for Child
                        $sql_u = "SELECT COUNT(DISTINCT ra.userid)
                                     FROM {role_assignments} ra
                                     JOIN {context} ctx ON ctx.id = ra.contextid
                                     JOIN {role} r ON r.id = ra.roleid
                                    WHERE ctx.contextlevel = 50
                                      AND ctx.instanceid $courses_insql
                                      AND r.shortname = 'student'";
                        $child_unique_students = $DB->count_records_sql($sql_u, $courses_inparams);

                        // Total Enrollments for Child
                        $sql_e = "SELECT COUNT(ra.userid)
                                          FROM {role_assignments} ra
                                          JOIN {context} ctx ON ctx.id = ra.contextid
                                          JOIN {role} r ON r.id = ra.roleid
                                         WHERE ctx.contextlevel = 50
                                           AND ctx.instanceid $courses_insql
                                           AND r.shortname = 'student'";
                        $child_total_enrollments = $DB->count_records_sql($sql_e, $courses_inparams);
                    }

                    $subcategories[] = [
                        'id' => $child->id,
                        'name' => $child->get_formatted_name(),
                        'totalenrollments' => $child_total_enrollments,
                        'uniquestudents' => $child_unique_students,
                        'url' => (new moodle_url('/local/smartdashboard/index.php', ['categoryid' => $child->id, 'show' => 1]))->out(),
                    ];
                }
            }
        }

        // 3. Fetch Display Courses (Direct children only)
        $params = [];
        $sql = "SELECT c.id, c.fullname, c.shortname, c.visible, c.category, c.summary, c.summaryformat
                  FROM {course} c
                 WHERE c.id != 1"; // Exclude site course

        if ($selected_category > 0) {
            $sql .= " AND c.category = :categoryid";
            $params['categoryid'] = $selected_category;
        }

        $sql .= " ORDER BY c.fullname ASC";
        $courses = $DB->get_records_sql($sql, $params, 0, 500);
    }
} else {
    // Teacher Mode: Existing behavior
    $allcourses = enrol_get_my_courses('id, fullname, shortname, summary, visible, category', 'visible DESC, sortorder ASC');
    foreach ($allcourses as $course) {
        if (has_capability('moodle/course:update', context_course::instance($course->id))) {
            $courses[] = $course;
        }
    }
}

// Create renderable
$dashboard = new \local_smartdashboard\output\dashboard(
    $courses,
    $isPrivileged,
    $categories_options,
    $selected_category,
    $show_clicked,
    $total_enrollments ?? 0,
    $unique_students ?? 0,
    $subcategories ?? []
);

// Render the template.
echo $OUTPUT->render_from_template('local_smartdashboard/dashboard', $dashboard->export_for_template($OUTPUT));

echo $OUTPUT->footer();
