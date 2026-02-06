<?php
defined('MOODLE_INTERNAL') || die();

$functions = [
    'local_teacherdashboard_get_cross_course_progress' => [
        'classname'   => 'local_teacherdashboard\external\analytics',
        'methodname'  => 'get_cross_course_progress',
        'description' => 'Get student progress data for the teacher dashboard',
        'type'        => 'read',
        'ajax'        => true,
    ],
];
