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
defined('MOODLE_INTERNAL') || die();

$functions = [
    'local_teacherdashboard_get_cross_course_progress' => [
        'classname'   => 'local_teacherdashboard\external\analytics',
        'methodname'  => 'get_cross_course_progress',
        'description' => 'Get student progress data for the teacher dashboard',
        'type'        => 'read',
        'ajax'        => true,
    ],
    'local_teacherdashboard_get_system_analytics' => [
        'classname'   => 'local_teacherdashboard\external\analytics',
        'methodname'  => 'get_system_analytics',
        'description' => 'Get system wide analytics for admin',
        'type'        => 'read',
        'ajax'        => true,
    ],
    'local_teacherdashboard_get_student_detailed_progress' => [
        'classname'   => 'local_teacherdashboard\external\analytics',
        'methodname'  => 'get_student_detailed_progress',
        'description' => 'Get detailed activity progress for a specific student',
        'type'        => 'read',
        'ajax'        => true,
    ],
    'local_teacherdashboard_get_grading_overview' => [
        'classname'   => 'local_teacherdashboard\external\grading',
        'methodname'  => 'get_grading_overview',
        'description' => 'Get overview of assignments needing grading',
        'type'        => 'read',
        'ajax'        => true,
    ],
];
