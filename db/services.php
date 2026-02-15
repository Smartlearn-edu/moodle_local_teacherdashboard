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
 * External services definition.
 *
 * @package     local_smartdashboard
 * @copyright   2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license     https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
defined('MOODLE_INTERNAL') || die();

$functions = [
    'local_smartdashboard_get_cross_course_progress' => [
        'classname'   => 'local_smartdashboard\external\analytics',
        'methodname'  => 'get_cross_course_progress',
        'description' => 'Get student progress data for the dashboard',
        'type'        => 'read',
        'ajax'        => true,
    ],
    'local_smartdashboard_get_system_analytics' => [
        'classname'   => 'local_smartdashboard\external\analytics',
        'methodname'  => 'get_system_analytics',
        'description' => 'Get system wide analytics for admin',
        'type'        => 'read',
        'ajax'        => true,
    ],
    'local_smartdashboard_get_student_detailed_progress' => [
        'classname'   => 'local_smartdashboard\external\analytics',
        'methodname'  => 'get_student_detailed_progress',
        'description' => 'Get detailed activity progress for a specific student',
        'type'        => 'read',
        'ajax'        => true,
    ],
    'local_smartdashboard_get_grading_overview' => [
        'classname'   => 'local_smartdashboard\external\grading',
        'methodname'  => 'get_grading_overview',
        'description' => 'Get overview of assignments needing grading',
        'type'        => 'read',
        'ajax'        => true,
    ],
    'local_smartdashboard_get_payment_analytics' => [
        'classname'   => 'local_smartdashboard\external\analytics',
        'methodname'  => 'get_payment_analytics',
        'description' => 'Get payment analytics data including revenue and student counts',
        'type'        => 'read',
        'ajax'        => true,
    ],
    'local_smartdashboard_save_dashboard_settings' => [
        'classname'   => 'local_smartdashboard\external\analytics',
        'methodname'  => 'save_dashboard_settings',
        'description' => 'Save dashboard settings such as payment calculation mode',
        'type'        => 'write',
        'ajax'        => true,
    ],
    'local_smartdashboard_get_dashboard_settings' => [
        'classname'   => 'local_smartdashboard\external\analytics',
        'methodname'  => 'get_dashboard_settings',
        'description' => 'Get dashboard settings',
        'type'        => 'read',
        'ajax'        => true,
    ],
];
