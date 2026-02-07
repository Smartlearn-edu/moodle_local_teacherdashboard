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
                // Remove spinner explicitly
                self.container.find('.fa-spinner').parent().remove();

                self.allData = response;
                self.lastFilteredData = response; // Init for export
                try {
                    self.renderFilters();
                    self.render(response);
                } catch (e) {
                    console.error('Render crash:', e);
                    self.container.html('<div class="alert alert-danger">Render Error: ' + e.message + '</div>');
                }
            }).fail(function (ex) {
                console.error('Analytics fetch failed:', ex);
                self.container.html('<div class="alert alert-danger">Error loading data: ' + ex.message + '</div>');
                Notification.exception(ex);
            });
        },

        /**
         * Render filter controls
         */
        renderFilters: function () {
            var self = this;
            var courses = this.allData.courses || [];
            // Extract unique categories
            var categories = {};
            courses.forEach(function (c) {
                if (c.category && c.categoryname) {
                    categories[c.category] = c.categoryname;
                }
            });

            var html = '<div class="row mb-4 animate__animated animate__fadeIn">';

            // Course Filter
            html += '<div class="col-md-6 col-lg-4 mb-2">';
            html += '<select id="filter-course" class="form-select border-0 shadow-sm">';
            html += '<option value="">All Courses</option>';
            courses.forEach(function (c) {
                html += '<option value="' + c.id + '">' + c.name + '</option>';
            });
            html += '</select></div>';

            // Category Filter
            html += '<div class="col-md-6 col-lg-4 mb-2">';
            html += '<select id="filter-category" class="form-select border-0 shadow-sm">';
            html += '<option value="">All Categories</option>';
            for (var catId in categories) {
                html += '<option value="' + catId + '">' + categories[catId] + '</option>';
            }
            html += '</select>';

            // Sub-category options container
            html += '<div id="subcategory-options" class="mt-2 text-muted small" style="display:none;">';
            html += '<div class="form-check form-switch">';
            html += '<input class="form-check-input" type="checkbox" id="include-subcats">';
            html += '<label class="form-check-label" for="include-subcats">Include sub-categories</label>';
            html += '</div>';
            html += '<div id="subcategory-list" class="mt-2 ms-3 border-start ps-2" style="display:none;">';
            html += '<!-- Subcategories will be populated here -->';
            html += '</div>'; // End subcategory options

            html += '</div>'; // End col

            // Export Button Column
            html += '<div class="col-md-12 col-lg-4 mb-2 text-end align-self-start">';
            html += '<button id="btn-export-csv" class="btn btn-outline-secondary"><i class="fa fa-download me-1"></i> Export Data</button>';
            html += '</div>';

            html += '</div>'; // End row

            // Clear existing filters if re-rendering filters
            this.container.find('.row.mb-4.animate__animated.animate__fadeIn').remove();
            this.container.prepend(html);

            // Add event listeners
            this.container.find('#filter-course').on('change', function () {
                self.applyFilters();
            });

            this.container.find('#filter-category').on('change', function () {
                self.updateSubCategories();
                self.applyFilters();
            });

            this.container.find('#include-subcats').on('change', function () {
                self.container.find('#subcategory-list').toggle(this.checked);
                self.applyFilters();
            });

            // Event delegation for dynamic subcategory checkboxes
            this.container.on('change', '.subcat-custom-checkbox', function () {
                self.applyFilters();
            });

            // Export Button Listener
            this.container.find('#btn-export-csv').on('click', function () {
                self.exportToCSV();
            });
        },

        updateSubCategories: function () {
            var selectedCatId = this.container.find('#filter-category').val();
            var $subOpts = this.container.find('#subcategory-options');
            var $subList = this.container.find('#subcategory-list');

            if (!selectedCatId) {
                $subOpts.hide();
                $subList.empty();
                return;
            }

            // Find potential subcategories in the dataset
            var subCats = {}; // id -> name
            var hasSubCats = false;

            this.allData.courses.forEach(function (c) {
                // Check if course belongs to a subcategory of selectedCatId
                // Path format is /parent/child/grandchild
                // So search for '/selectedCatId/'
                if (c.categorypath && c.category != selectedCatId && c.categorypath.indexOf('/' + selectedCatId + '/') !== -1) {
                    subCats[c.category] = c.categoryname;
                    hasSubCats = true;
                }
            });

            if (hasSubCats) {
                $subOpts.show();
                var listHtml = '<h6 class="mb-1">Select Sub-categories:</h6>';
                for (var id in subCats) {
                    listHtml += '<div class="form-check">';
                    listHtml += '<input class="form-check-input subcat-custom-checkbox" type="checkbox" value="' + id + '" id="subcat-' + id + '" checked>';
                    listHtml += '<label class="form-check-label" for="subcat-' + id + '">' + subCats[id] + '</label>';
                    listHtml += '</div>';
                }
                $subList.html(listHtml);

                // Ensure visibility matches checkbox state
                var isChecked = this.container.find('#include-subcats').is(':checked');
                $subList.toggle(isChecked);

            } else {
                $subOpts.hide();
                $subList.empty();
            }
        },

        /**
         * Apply filters and re-render the content area
         */
        applyFilters: function () {
            var courseId = this.container.find('#filter-course').val();
            var catId = this.container.find('#filter-category').val();
            var includeSubcats = this.container.find('#include-subcats').is(':checked');

            // Get selected subcategories
            var selectedSubIds = [];
            if (includeSubcats) {
                this.container.find('.subcat-custom-checkbox:checked').each(function () {
                    selectedSubIds.push($(this).val());
                });
            }

            var filteredCourses = this.allData.courses.filter(function (c) {
                var matchCourse = courseId === "" || c.id == courseId;

                var matchCat = true;
                if (catId !== "") {
                    if (c.category == catId) {
                        matchCat = true; // Exact match to main category
                    } else if (includeSubcats) {
                        // Check if it matches one of the selected subcategories
                        // Note: We only added checkboxes for existing categories in data, so simple ID check is enough
                        matchCat = selectedSubIds.includes(String(c.category));
                    } else {
                        matchCat = false;
                    }
                }

                return matchCourse && matchCat;
            });

            // Pass filtered courses but keep all students (we render based on visible courses)
            var filteredData = {
                courses: filteredCourses,
                students: this.allData.students
            };

            this.lastFilteredData = filteredData; // Store for export
            this.render(filteredData);
        },

        exportToCSV: function () {
            var data = this.lastFilteredData;
            if (!data || !data.courses || data.courses.length === 0) {
                Notification.alert('No Data', 'There is no data to export.');
                return;
            }

            var csv = [];

            // Header
            var header = ['Student Name', 'Email'];
            data.courses.forEach(function (c) {
                // Remove commas from course name to avoid CSV breakages
                header.push('Course: ' + c.name.replace(/,/g, ''));
            });
            header.push('Completed Count');
            header.push('Enrolled Count');
            csv.push(header.join(','));

            // Helper
            var getCompletion = function (student, courseId) {
                if (!student.completions) return null;
                return student.completions.find(function (c) { return c.courseid == courseId; });
            };

            data.students.forEach(function (student) {
                var row = [];
                // Escape quotes and wrap in quotes
                row.push('"' + (student.name || '').replace(/"/g, '""') + '"');
                row.push('"' + (student.email || '').replace(/"/g, '""') + '"');

                var completedCount = 0;
                var enrolledCount = 0;

                data.courses.forEach(function (course) {
                    var comp = getCompletion(student, course.id);
                    if (comp) {
                        if (comp.enrolled) {
                            enrolledCount++;
                            row.push(comp.completed ? 'Completed' : 'Enrolled');
                            if (comp.completed) completedCount++;
                        } else {
                            row.push('Not Enrolled');
                        }
                    } else {
                        row.push('N/A');
                    }
                });

                row.push(completedCount);
                row.push(enrolledCount);
                csv.push(row.join(','));
            });

            var csvString = csv.join('\n');
            var blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", "student_progress_export.csv");
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

        render: function (data) {
            try {
                // If no students, display message and return
                if (!data || !data.students || data.students.length === 0) {
                    // Ensure content wrapper exists before trying to update it
                    if (this.container.find('#dashboard-content-wrapper').length === 0) {
                        this.container.append('<div id="dashboard-content-wrapper"></div>');
                    }
                    this.container.find('#dashboard-content-wrapper').html('<div class="alert alert-info">No progress data available.</div>');
                    return;
                }

                var html = '<div id="dashboard-content" class="animate__animated animate__fadeIn">';
                var self = this;

                // Helper to find completion for a specific course ID
                var getCompletion = function (student, courseId) {
                    if (!student.completions) return null;
                    return student.completions.find(function (c) { return c.courseid == courseId; });
                };

                // Calculate stats based on visible courses
                var totalStudents = data.students.length;
                var visibleCourses = data.courses; // These are the courses after filtering
                var allCompletedCount = 0;

                // Calculate completion counts per visible course
                var courseStats = {}; // Map courseId -> stats
                visibleCourses.forEach(function (c) { courseStats[c.id] = { completed: 0, enrolled: 0 }; });

                data.students.forEach(function (student) {
                    var studentEnrolledCount = 0;
                    var studentCompletedCount = 0;

                    visibleCourses.forEach(function (course) {
                        var comp = getCompletion(student, course.id);
                        if (comp && comp.enrolled) {
                            studentEnrolledCount++;
                            if (courseStats[course.id]) courseStats[course.id].enrolled++;

                            if (comp.completed) {
                                if (courseStats[course.id]) courseStats[course.id].completed++;
                                studentCompletedCount++;
                            }
                        }
                    });

                    // Consider "Program Complete" if they completed all *visible* courses they are enrolled in
                    if (studentEnrolledCount > 0 && studentEnrolledCount === studentCompletedCount) {
                        allCompletedCount++;
                    }
                });

                // 1. Stats Cards
                html += '<div class="row mb-4">';
                html += this.renderStatCard('Total Students', totalStudents, 'users', 'bg-dark text-white');

                visibleCourses.forEach(function (course) {
                    var stats = courseStats[course.id];
                    html += self.renderStatCard(
                        course.name,
                        stats.completed + ' / ' + stats.enrolled + ' completed',
                        'check-circle',
                        'bg-primary text-white'
                    );
                });

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
                visibleCourses.forEach(function (course) {
                    html += '<th class="text-center border-0 px-4 py-3" title="' + course.name + '">' +
                        (course.name ? course.name.substring(0, 20) + (course.name.length > 20 ? '...' : '') : 'Course') +
                        '</th>';
                });
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

                    visibleCourses.forEach(function (course) {
                        var comp = getCompletion(student, course.id);
                        if (comp) {
                            if (!comp.enrolled) {
                                // Not Enrolled
                                rowHtml += '<td class="text-center"><i class="fa fa-circle-thin text-muted opacity-25" title="Not Enrolled"></i></td>';
                            } else {
                                enrolledCount++;
                                if (comp.completed) {
                                    completedCount++;
                                    rowHtml += '<td class="text-center"><i class="fa fa-check-circle text-success fa-lg" title="Completed"></i></td>';
                                } else {
                                    // Enrolled, Pending
                                    rowHtml += '<td class="text-center"><i class="fa fa-circle text-muted opacity-50" title="Enrolled, Not Completed"></i></td>';
                                }
                            }
                        } else {
                            // Should not happen if data integrity is good, but fallback for courses not in student's completions
                            rowHtml += '<td class="text-center"><i class="fa fa-minus text-muted opacity-25" title="No data for this course"></i></td>';
                        }
                    });

                    // Progress Bar
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

                html += '</div>'; // End dashboard content

                // Create a content wrapper if it doesn't exist, then update its HTML
                if (this.container.find('#dashboard-content-wrapper').length === 0) {
                    this.container.append('<div id="dashboard-content-wrapper"></div>');
                }
                this.container.find('#dashboard-content-wrapper').html(html);
            } catch (e) {
                console.error('Render error:', e);
                // If an error occurs during rendering, clear the content wrapper and show error
                if (this.container.find('#dashboard-content-wrapper').length === 0) {
                    this.container.append('<div id="dashboard-content-wrapper"></div>');
                }
                this.container.find('#dashboard-content-wrapper').html('<div class="alert alert-danger">Error rendering student progress: ' + e.message + '</div>');
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
