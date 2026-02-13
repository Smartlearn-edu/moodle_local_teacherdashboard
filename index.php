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
$PAGE->set_url(new moodle_url('/local/teacherdashboard/index.php'));
$PAGE->set_title(get_string('pluginname', 'local_teacherdashboard'));
$PAGE->set_heading(get_string('pluginname', 'local_teacherdashboard'));
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
        $params = [];
        $sql = "SELECT c.id, c.fullname, c.shortname, c.visible, c.category, c.summary, c.summaryformat
                  FROM {course} c
                 WHERE c.id != 1"; // Exclude site course

        if ($selected_category > 0) {
            // Include subcategories
            if (class_exists('core_course_category')) {
                $category = core_course_category::get($selected_category, IGNORE_MISSING);
            } else {
                $category = coursecat::get($selected_category, IGNORE_MISSING);
            }

            if ($category) {
                // Get all children IDs efficiently
                $allcatids = array_keys($category->get_children());
                $allcatids[] = $selected_category;
                list($insql, $inparams) = $DB->get_in_or_equal($allcatids, SQL_PARAMS_NAMED);
                $sql .= " AND c.category $insql";
                $params = array_merge($params, $inparams);
            }
        }

        $sql .= " ORDER BY c.fullname ASC";
        // Enforce a limit to avoid crashing on huge sites if "All" is selected
        $courses = $DB->get_records_sql($sql, $params, 0, 500);

        if (!empty($courses)) {
            $course_ids = array_keys($courses);
            list($insql, $inparams) = $DB->get_in_or_equal($course_ids, SQL_PARAMS_NAMED);

            // Unique Students (No repeating)
            $sql_unique = "SELECT COUNT(DISTINCT ra.userid)
                             FROM {role_assignments} ra
                             JOIN {context} ctx ON ctx.id = ra.contextid
                             JOIN {role} r ON r.id = ra.roleid
                            WHERE ctx.contextlevel = 50
                              AND ctx.instanceid $insql
                              AND r.shortname = 'student'";
            $unique_students = $DB->count_records_sql($sql_unique, $inparams);

            // Total Enrollments (Direct Sum)
            $sql_enrollments = "SELECT COUNT(ra.userid)
                                  FROM {role_assignments} ra
                                  JOIN {context} ctx ON ctx.id = ra.contextid
                                  JOIN {role} r ON r.id = ra.roleid
                                 WHERE ctx.contextlevel = 50
                                   AND ctx.instanceid $insql
                                   AND r.shortname = 'student'";
            $total_enrollments = $DB->count_records_sql($sql_enrollments, $inparams);
        }
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
$dashboard = new \local_teacherdashboard\output\dashboard(
    $courses,
    $isPrivileged,
    $categories_options,
    $selected_category,
    $show_clicked,
    $total_enrollments ?? 0,
    $unique_students ?? 0
);

// Render the template.
echo $OUTPUT->render_from_template('local_teacherdashboard/dashboard', $dashboard->export_for_template($OUTPUT));

echo $OUTPUT->footer();
