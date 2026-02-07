define(['jquery', 'core/ajax', 'core/str', 'core/notification'], function ($, Ajax, Str, Notification) {

    var ProgressTracker = {
        init: function () {
            this.container = $('#section-progress');
            this.loadData();
        },

        loadData: function () {
            var self = this;

            // Show loading
            this.container.html('<div class="text-center p-5"><i class="fa fa-spinner fa-spin fa-3x"></i></div>');

            console.log('Fetching analytics data...');
            Ajax.call([{
                methodname: 'local_teacherdashboard_get_cross_course_progress',
                args: {}
            }])[0].done(function (response) {
                console.log('Analytics data received:', response);
                self.render(response);
            }).fail(function (ex) {
                console.error('Analytics fetch failed:', ex);
                self.container.html('<div class="alert alert-danger">Error loading data: ' + ex.message + '</div>');
                Notification.exception(ex);
            });
        },

        render: function (data) {
            try {
                if (!data || !data.students || data.students.length === 0) {
                    this.container.html('<div class="alert alert-info">No progress data available.</div>');
                    return;
                }

                var html = '<div class="row mb-4 animate__animated animate__fadeIn">';
                var self = this;

                // Calculate stats
                var totalStudents = data.students.length;
                var courseCount = data.courses.length;
                var allCompletedCount = 0;

                // Calculate completion counts per course
                var courseStats = new Array(courseCount).fill(null).map(function () {
                    return { completed: 0, enrolled: 0 };
                });

                data.students.forEach(function (student) {
                    var studentEnrolledCount = 0;
                    var studentCompletedCount = 0;

                    if (student.completions) {
                        student.completions.forEach(function (comp, index) {
                            if (comp.enrolled) {
                                studentEnrolledCount++;
                                courseStats[index].enrolled++;
                                if (comp.completed) {
                                    courseStats[index].completed++;
                                    studentCompletedCount++;
                                }
                            }
                        });
                    }

                    // Consider "Program Complete" if they completed all courses they are enrolled in (and enrolled in at least one)
                    if (studentEnrolledCount > 0 && studentEnrolledCount === studentCompletedCount) {
                        allCompletedCount++;
                    }
                });

                // 1. Stats Cards
                html += this.renderStatCard('Total Students', totalStudents, 'users', 'bg-dark text-white');

                if (data.courses) {
                    data.courses.forEach(function (course, index) {
                        var stats = courseStats[index];
                        html += self.renderStatCard(
                            course.name,
                            stats.completed + ' / ' + stats.enrolled + ' completed',
                            'check-circle',
                            'bg-primary text-white'
                        );
                    });
                }

                html += this.renderStatCard('Program Complete', allCompletedCount + ' (' + (totalStudents > 0 ? ((allCompletedCount / totalStudents) * 100).toFixed(1) : '0.0') + '%)', 'trophy', 'bg-success text-white');

                html += '</div>'; // End stats row

                // 2. Main Table
                html += '<div class="card shadow-sm border-0 animate__animated animate__fadeInUp">';
                html += '<div class="card-body p-0">';
                html += '<div class="table-responsive">';
                html += '<table class="table table-hover align-middle mb-0">';

                // Header
                html += '<thead class="bg-light"><tr>';
                html += '<th class="border-0 px-4 py-3">Student Name</th>';
                if (data.courses) {
                    data.courses.forEach(function (course) {
                        html += '<th class="text-center border-0 px-4 py-3" title="' + course.name + '">' +
                            (course.name ? course.name.substring(0, 20) + (course.name.length > 20 ? '...' : '') : 'Course') +
                            '</th>';
                    });
                }
                html += '<th class="text-center border-0 px-4 py-3">Progress</th>';
                html += '</tr></thead>';

                // Body
                html += '<tbody>';
                data.students.forEach(function (student) {
                    var completedCount = 0;
                    var enrolledCount = 0;
                    var rowHtml = '<tr>';
                    rowHtml += '<td class="px-4 py-3">';
                    rowHtml += '<div class="fw-bold text-dark">' + (student.name || 'Unknown') + '</div>';
                    rowHtml += '<div class="small text-muted">' + (student.email || '') + '</div>';
                    rowHtml += '</td>';

                    if (student.completions) {
                        student.completions.forEach(function (comp) {
                            if (!comp.enrolled) {
                                // Not Enrolled - Greyed out
                                rowHtml += '<td class="text-center"><i class="fa fa-circle text-muted opacity-10" title="Not Enrolled"></i></td>';
                            } else {
                                enrolledCount++;
                                if (comp.completed) {
                                    completedCount++;
                                    rowHtml += '<td class="text-center"><i class="fa fa-check-circle text-success fa-lg" title="Completed"></i></td>';
                                } else {
                                    rowHtml += '<td class="text-center"><i class="fa fa-circle-thin text-muted opacity-25" title="Enrolled, Not Completed"></i></td>';
                                }
                            }
                        });
                    }

                    // Progress Bar
                    // Calculate percentage based on Enrolled courses only
                    var percentage = enrolledCount > 0 ? (completedCount / enrolledCount) * 100 : 0;
                    var colorClass = percentage === 100 ? 'bg-success' : (percentage > 50 ? 'bg-info' : 'bg-warning');

                    rowHtml += '<td class="px-4 py-3" style="min-width: 150px">';
                    rowHtml += '<div class="d-flex align-items-center">';
                    rowHtml += '<div class="progress flex-grow-1" style="height: 6px; background-color: #e9ecef;">';
                    rowHtml += '<div class="progress-bar ' + colorClass + '" role="progressbar" style="width: ' + percentage + '%"></div>';
                    rowHtml += '</div>';
                    rowHtml += '<span class="ms-2 small fw-bold text-muted">' + completedCount + '/' + enrolledCount + '</span>';
                    rowHtml += '</div></td>';

                    rowHtml += '</tr>';
                    html += rowHtml;
                });
                html += '</tbody></table></div></div></div>';

                this.container.html(html);
            } catch (e) {
                console.error('Render error:', e);
                this.container.html('<div class="alert alert-danger">Error rendering student progress: ' + e.message + '</div>');
            }
        },

        renderStatCard: function (title, value, icon, bgClass) {
            return '<div class="col-md-3 mb-3">' +
                '<div class="card border-0 shadow-sm h-100 ' + bgClass + '">' +
                '<div class="card-body">' +
                '<div class="d-flex justify-content-between align-items-center">' +
                '<div><h6 class="text-uppercase small opacity-75 mb-1">' + title + '</h6>' +
                '<h3 class="mb-0 fw-bold">' + value + '</h3></div>' +
                '<i class="fa fa-' + icon + ' fa-2x opacity-50"></i>' +
                '</div></div></div></div>';
        }
    };

    return {
        init: function () {
            var navLinks = $('#dashboard-sidebar-nav .nav-link');

            navLinks.on('click', function (e) {
                e.preventDefault();
                var targetId = $(this).data('target');

                if (targetId) {
                    $('#dashboard-sidebar-nav .nav-link').removeClass('active');
                    $(this).addClass('active');
                    $('.dashboard-section').addClass('d-none');
                    $('#' + targetId).removeClass('d-none');

                    // Init module if first time view
                    if (targetId === 'section-progress' && !$('#section-progress').data('loaded')) {
                        ProgressTracker.init();
                        $('#section-progress').data('loaded', true);
                    }
                }
            });
        }
    };
});
