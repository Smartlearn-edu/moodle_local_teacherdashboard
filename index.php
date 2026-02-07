<?php

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

// Fetch courses the user is enrolled in.
$allcourses = enrol_get_my_courses('id, fullname, shortname, summary, visible, category', 'visible DESC, sortorder ASC');

// Filter courses where user is teacher/manager
$teachercourses = [];
foreach ($allcourses as $course) {
    if (has_capability('moodle/course:update', context_course::instance($course->id))) {
        $teachercourses[] = $course;
    }
}

// Create renderable
$dashboard = new \local_teacherdashboard\output\dashboard($teachercourses);

// Render the template.
echo $OUTPUT->render_from_template('local_teacherdashboard/dashboard', $dashboard->export_for_template($OUTPUT));

echo $OUTPUT->footer();
