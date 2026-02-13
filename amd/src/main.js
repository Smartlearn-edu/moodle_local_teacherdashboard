define(['jquery', 'core/ajax', 'core/str', 'core/notification', 'core/modal_factory', 'core/modal_events', 'core/templates'], function ($, Ajax, Str, Notification, ModalFactory, ModalEvents, Templates) {

    var ProgressTracker = {
        init: function () {
            this.container = $('#section-progress');
            this.selectedStudents = new Set();
            this.loadData();
        },

        loadData: function () {
            var self = this;

            // Show loading
            this.container.html('<div class="text-center p-5"><i class="fa fa-spinner fa-spin fa-3x"></i></div>');

            console.log('Fetching analytics data...');
            return Ajax.call([{
                methodname: 'local_teacherdashboard_get_cross_course_progress',
                args: {}
            }])[0].done(function (response) {
                console.log('Analytics data received:', response);
                // Remove spinner explicitly
                self.container.find('.fa-spinner').parent().remove();

                self.allData = response;
                self.allData = response;
                self.lastFilteredData = response; // Init for export
                self.selectedStudents.clear(); // Clear selection on reload
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
            html += '</select></div>';

            // Status Filter
            html += '<div class="col-md-6 col-lg-4 mb-2">';
            html += '<select id="filter-status" class="form-select border-0 shadow-sm">';
            html += '<option value="">All Statuses</option>';
            html += '<option value="not_completed">Not Completed</option>';
            html += '<option value="completed">Completed</option>';
            html += '<option value="enrolled">Enrolled</option>';
            html += '</select></div>';

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

            this.container.find('#filter-status').on('change', function () {
                self.applyFilters();
            });

            // Event delegation for dynamic subcategory checkboxes
            this.container.on('change', '.subcat-custom-checkbox', function () {
                self.applyFilters();
            });

            // Export Button Listener (Delegated because button is now re-rendered in render())
            this.container.off('click', '#btn-export-csv').on('click', '#btn-export-csv', function () {
                self.exportToCSV();
            });

            // --- Bulk Action Listeners ---

            // Textarea auto-resize for the modal
            $('body').on('input', '#bulk-message-body', function () {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight) + 'px';
            });

            // 1. Select All Checkbox
            this.container.on('change', '#select-all-students', function () {
                var isChecked = $(this).is(':checked');
                var visibleStudentCheckboxes = self.container.find('.student-select-checkbox');

                visibleStudentCheckboxes.prop('checked', isChecked);

                if (isChecked) {
                    visibleStudentCheckboxes.each(function () {
                        self.selectedStudents.add($(this).val());
                    });
                } else {
                    visibleStudentCheckboxes.each(function () {
                        self.selectedStudents.delete($(this).val());
                    });
                }
                self.updateActionBar();
            });

            // 2. Individual Student Checkbox
            this.container.on('change', '.student-select-checkbox', function () {
                var studentId = $(this).val();
                if ($(this).is(':checked')) {
                    self.selectedStudents.add(studentId);
                } else {
                    self.selectedStudents.delete(studentId);
                    // Uncheck "select all" if one is unchecked
                    $('#select-all-students').prop('checked', false);
                }
                self.updateActionBar();
            });

            // 3. Send Message Button
            this.container.on('click', '#btn-bulk-message', function () {
                self.openMessageModal();
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
            var status = this.container.find('#filter-status').val();
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

            // Helper for status filtering
            var getCompletion = function (student, courseId) {
                if (!student.completions) return null;
                return student.completions.find(function (c) { return c.courseid == courseId; });
            };

            // Filter Students based on Status in Visible Courses
            var filteredStudents = this.allData.students;
            if (status !== "") {
                filteredStudents = filteredStudents.filter(function (student) {
                    var hasMatch = false;
                    // Check if student matches status in ANY of the filtered courses
                    // If multiple courses are visible, we include the student if they match the criteria for AT LEAST ONE visible course.
                    filteredCourses.forEach(function (course) {
                        var comp = getCompletion(student, course.id);
                        if (comp && comp.enrolled) {
                            if (status === 'completed' && comp.completed) hasMatch = true;
                            // "Not Completed": Enrolled but NOT completed
                            if (status === 'not_completed' && !comp.completed) hasMatch = true;
                            if (status === 'enrolled') hasMatch = true;
                        }
                    });
                    return hasMatch;
                });
            }

            // Pass filtered courses AND filtered students
            var filteredData = {
                courses: filteredCourses,
                students: filteredStudents
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
                // Checkbox Column Header
                html += '<th class="border-0 px-4 py-3" style="width: 40px;">';
                html += '<div class="form-check">';
                html += '<input class="form-check-input" type="checkbox" id="select-all-students">';
                html += '</div></th>';

                html += '<th class="border-0 px-4 py-3">Student Name</th>';
                html += '<th class="text-center border-0 px-4 py-3">Engagement</th>';

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
                    // Checkbox Column
                    var isSelected = self.selectedStudents.has(String(student.id)) ? 'checked' : '';
                    rowHtml += '<td class="px-4 py-3">';
                    rowHtml += '<div class="form-check">';
                    rowHtml += '<input class="form-check-input student-select-checkbox" type="checkbox" value="' + student.id + '" ' + isSelected + '>';
                    rowHtml += '</div></td>';

                    rowHtml += '<td class="px-4 py-3">';
                    rowHtml += '<div class="fw-bold text-dark">' + (student.name || 'Unknown') + '</div>';
                    rowHtml += '<div class="small text-muted">' + (student.email || '') + '</div>';
                    rowHtml += '</td>';

                    // Engagement Score Column
                    var score = student.engagement_score !== undefined ? student.engagement_score : 0;
                    var badgeClass = 'bg-danger';
                    if (score >= 70) badgeClass = 'bg-success';
                    else if (score >= 40) badgeClass = 'bg-warning text-dark';

                    rowHtml += '<td class="text-center px-4 py-3">';
                    rowHtml += '<span class="badge rounded-pill ' + badgeClass + '">' + score + '</span>';
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

                // Export Button
                html += '<div class="d-flex justify-content-end mt-3 mb-4">';
                html += '<button id="btn-export-csv" class="btn btn-outline-secondary"><i class="fa fa-download me-1"></i> Export Data to CSV</button>';
                html += '</div>';

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
        },

        updateActionBar: function () {
            var count = this.selectedStudents.size;
            var $bar = $('#bulk-action-bar');
            var $countSpan = $('#selected-count');

            $countSpan.text(count);

            if (count > 0) {
                $bar.removeClass('d-none');
            } else {
                $bar.addClass('d-none');
            }
        },

        openMessageModal: function () {
            var self = this;
            var count = this.selectedStudents.size;

            if (count === 0) return;

            ModalFactory.create({
                type: ModalFactory.types.SAVE_CANCEL,
                title: 'Message ' + count + ' Students',
                body: '<div class="mb-3">' +
                    '<label for="bulk-message-body" class="form-label">Message</label>' +
                    '<textarea class="form-control" id="bulk-message-body" rows="4" placeholder="Type your message here..."></textarea>' +
                    '</div>' +
                    '<div class="alert alert-info small"><i class="fa fa-info-circle me-1"></i> Messages will be sent individually to each student via Moodle Messaging.</div>'
            }).then(function (modal) {
                modal.setSaveButtonText('Send');
                modal.getRoot().on(ModalEvents.save, function () {
                    var messageText = modal.getRoot().find('#bulk-message-body').val();
                    if (!messageText.trim()) {
                        Notification.alert('Error', 'Please enter a message.', 'OK');
                        return; // Don't close
                    }
                    self.sendBulkMessage(messageText, modal);
                });
                modal.show();
            });
        },

        sendBulkMessage: function (text, modal) {
            var self = this;
            var recipientIds = Array.from(this.selectedStudents);
            var messages = recipientIds.map(function (id) {
                return {
                    touserid: id,
                    text: text,
                    textformat: 1 // HTML
                };
            });

            // Moodle Web Service: core_message_send_instant_messages
            Ajax.call([{
                methodname: 'core_message_send_instant_messages',
                args: { messages: messages }
            }])[0].done(function (response) {
                // Response is a list of message IDs or errors
                // We generally assume success if no error thrown, but let's check
                modal.hide();
                Notification.addNotification({
                    message: 'Successfully sent messages to ' + recipientIds.length + ' students.',
                    type: 'success'
                });

                // Optional: Clear selection after send
                self.selectedStudents.clear();
                self.render(self.lastFilteredData); // Re-render to clear checkboxes

            }).fail(function (ex) {
                modal.hide();
                Notification.exception(ex);
            });
        },

        /**
         * DETAILED PROGRESS SECTION
         */
        initDetailed: function () {
            var self = this;
            this.detailedContainer = $('#section-progress-detailed');
            this.detailedContent = $('#detailed-progress-content');

            // Populate Student Select if data exists
            if (this.allData && this.allData.students) {
                this.populateStudentSelect(this.allData.students);
            } else {
                // If accessed directly without loading main data first 
                this.loadData().then(function () {
                    self.populateStudentSelect(self.allData.students);
                });
            }

            // Event Listeners
            this.detailedContainer.find('#detailed-student-select').off('change').on('change', function () {
                var studentId = $(this).val();
                if (studentId) {
                    self.loadDetailedData(studentId);
                } else {
                    self.detailedContent.html('<p class="text-muted text-center py-5">Select a student to view details.</p>');
                }
            });

            this.detailedContainer.find('#detailed-activity-filter').off('change').on('change', function () {
                self.renderDetailed(); // Re-render with existing detailedData
            });
        },

        populateStudentSelect: function (students) {
            var $select = this.detailedContainer.find('#detailed-student-select');
            $select.empty();
            $select.append('<option value="">Choose a student...</option>');

            // Sort by name
            var sorted = students.slice().sort(function (a, b) {
                return (a.name || '').localeCompare(b.name || '');
            });

            sorted.forEach(function (s) {
                $select.append('<option value="' + s.id + '">' + s.name + '</option>');
            });
        },

        loadDetailedData: function (studentId) {
            var self = this;
            this.detailedContent.html('<div class="text-center p-5"><i class="fa fa-spinner fa-spin fa-3x"></i></div>');

            Ajax.call([{
                methodname: 'local_teacherdashboard_get_student_detailed_progress',
                args: { studentid: studentId }
            }])[0].done(function (response) {
                self.detailedData = response;
                self.renderDetailed();
            }).fail(function (ex) {
                self.detailedContent.html('<div class="alert alert-danger">Error: ' + ex.message + '</div>');
            });
        },

        renderDetailed: function () {
            if (!this.detailedData) return;
            var data = this.detailedData;
            var filterType = this.detailedContainer.find('#detailed-activity-filter').val();

            var html = '';

            if (data.courses.length === 0) {
                html = '<div class="alert alert-warning">No shared courses found for this student.</div>';
                this.detailedContent.html(html);
                return;
            }

            var hasActivities = false;

            data.courses.forEach(function (course) {
                // Filter activities
                var activities = course.activities;
                if (filterType) {
                    activities = activities.filter(function (a) { return a.type === filterType; });
                }

                if (activities.length === 0) return; // Skip empty courses if filtered
                hasActivities = true;

                html += '<div class="card mb-4 shadow-sm animate__animated animate__fadeIn">';
                html += '<div class="card-header bg-light fw-bold">' + course.fullname + '</div>';
                html += '<div class="card-body p-0 table-responsive">';
                html += '<table class="table table-hover mb-0">';
                html += '<thead><tr><th>Activity</th><th>Type</th><th>Status</th><th>Grade</th></tr></thead>';
                html += '<tbody>';

                activities.forEach(function (act) {
                    var statusBadge = '';
                    if (act.status === 'Completed') statusBadge = '<span class="badge bg-success">Completed</span>';
                    else if (act.status === 'Passed') statusBadge = '<span class="badge bg-success">Passed</span>';
                    else if (act.status === 'Failed') statusBadge = '<span class="badge bg-danger">Failed</span>';
                    else if (act.status === 'Pending') statusBadge = '<span class="badge bg-warning text-dark">Pending</span>';
                    else statusBadge = '<span class="badge bg-secondary">' + act.status + '</span>';

                    html += '<tr>';
                    html += '<td>' + act.name + '</td>';
                    html += '<td><small class="text-muted">' + act.type + '</small></td>';
                    html += '<td>' + statusBadge + '</td>';
                    html += '<td>' + (act.grade ? act.grade : '-') + '</td>';
                    html += '</tr>';
                });

                html += '</tbody></table></div></div>';
            });

            if (!hasActivities) {
                html = '<div class="alert alert-info">No activities found matching the filter.</div>';
            }

            this.detailedContent.html(html);
        }

    };

    var GradingTracker = {
        init: function () {
            this.container = $('#section-grading');
            this.content = $('#grading-content');
            this.loadData();
        },

        loadData: function () {
            var self = this;
            this.content.html('<div class="text-center p-5"><i class="fa fa-spinner fa-spin fa-3x"></i></div>');

            Ajax.call([{
                methodname: 'local_teacherdashboard_get_grading_overview',
                args: {}
            }])[0].done(function (response) {
                self.allData = response;
                self.courses = response.courses || [];
                self.renderFilters();
                self.render(self.courses);
            }).fail(function (ex) {
                self.content.html('<div class="alert alert-danger">Error loading grading data: ' + ex.message + '</div>');
                Notification.exception(ex);
            });
        },

        renderFilters: function () {
            var self = this;
            // Remove existing filters if any
            this.container.find('.grading-filters').remove();

            var html = '<div class="row mb-4 grading-filters animate__animated animate__fadeIn">';
            html += '<div class="col-md-4">';
            html += '<select id="grading-filter-course" class="form-select border-0 shadow-sm">';
            html += '<option value="">All Courses</option>';

            // Collect unique courses from the data
            this.courses.forEach(function (c) {
                html += '<option value="' + c.id + '">' + c.fullname + '</option>';
            });

            html += '</select></div></div>';

            this.container.find('.card-body').prepend(html);

            this.container.find('#grading-filter-course').off('change').on('change', function () {
                self.applyFilters();
            });
        },

        applyFilters: function () {
            var courseId = this.container.find('#grading-filter-course').val();
            var filtered = this.courses;

            if (courseId) {
                filtered = this.courses.filter(function (c) {
                    return c.id == courseId;
                });
            }
            this.render(filtered);
        },

        render: function (courses) {
            if (!courses || courses.length === 0) {
                if (this.courses && this.courses.length > 0) {
                    this.content.html('<div class="alert alert-info">No assignments found for this filter.</div>');
                } else {
                    this.content.html('<div class="alert alert-success">No assignments need grading!</div>');
                }
                return;
            }

            var html = '';

            courses.forEach(function (course) {
                html += '<div class="card mb-3 border-0 shadow-sm animate__animated animate__fadeIn">';
                html += '<div class="card-header bg-white fw-bold border-bottom-0"><i class="fa fa-graduation-cap me-2 text-primary"></i>' + course.fullname + '</div>';
                html += '<div class="card-body p-0">';
                html += '<div class="list-group list-group-flush">';

                var assignments = course.assignments;
                if (assignments && assignments.length > 0) {
                    assignments.forEach(function (assign) {
                        var gradeUrl = M.cfg.wwwroot + '/mod/assign/view.php?id=' + assign.cmid + '&action=grading';

                        html += '<div class="list-group-item d-flex justify-content-between align-items-center p-3">';
                        html += '<div>';
                        html += '<h6 class="mb-1"><a href="' + gradeUrl + '" class="text-decoration-none fw-bold">' + assign.name + '</a></h6>';
                        html += '<small class="text-muted"><i class="fa fa-clock-o me-1"></i> Due: ' + assign.duedatestr + '</small>';
                        html += '</div>';
                        html += '<div class="text-end">';
                        html += '<span class="badge bg-danger rounded-pill fs-6 mb-1">' + assign.needsgrading + ' to grade</span><br>';
                        html += '<a href="' + gradeUrl + '" class="btn btn-sm btn-outline-primary mt-1">Grade Now <i class="fa fa-arrow-right ms-1"></i></a>';
                        html += '</div>';
                        html += '</div>';
                    });
                } else {
                    html += '<div class="p-3 text-muted small">No assignments to grade.</div>';
                }

                html += '</div></div></div>';
            });

            this.content.html(html);
        }
    };

    var AdminAnalytics = {
        init: function () {
            this.container = $('#section-analytics');
            if (this.container.find('#chart-enrollments-category').length > 0) {
                this.loadData();
            }
        },

        loadData: function () {
            var self = this;
            console.log('Fetching System Analytics...');
            Ajax.call([{
                methodname: 'local_teacherdashboard_get_system_analytics',
                args: {}
            }])[0].done(function (response) {
                self.render(response);
            }).fail(function (ex) {
                console.error('System Analytics Error:', ex);
                self.container.find('.card-body').prepend('<div class="alert alert-danger">Error loading analytics: ' + ex.message + '</div>');
            });
        },

        render: function (data) {
            console.log('Rendering system analytics data:', data);
            this.lastData = data; // Store for export

            this.renderStats(data);
            this.renderTable(data.categories);
            this.renderCharts(data);

            // Bind export button
            var self = this;
            $('#btn-admin-export').off('click').on('click', function () {
                self.exportToCSV();
            });
        },

        renderStats: function (data) {
            $('#total-students-count').html(data.total_students);
            $('#total-teachers-count').html(data.total_teachers);
            $('#total-courses-count').html(data.total_courses);
            $('#total-categories-count').html(data.categories.length);
        },

        renderCharts: function (data) {
            var self = this;
            require(['core/chartjs'], function (ChartJS) {
                try {
                    self.renderCategoryChart(data.categories, ChartJS);
                    self.renderRatioChart(data.total_students, data.total_teachers, ChartJS);
                } catch (e) {
                    console.error('Error constructing charts:', e);
                }
            }, function (err) {
                console.error('Failed to load core/chartjs:', err);
                $('#chart-enrollments-category').parent().html('<div class="alert alert-warning small">Charts could not be loaded.</div>');
            });
        },

        renderCategoryChart: function (categories, ChartJS) {
            var ctx = document.getElementById('chart-enrollments-category');
            if (!ctx) return;

            var sorted = categories.slice().sort(function (a, b) { return b.student_count - a.student_count; });
            var top = sorted.slice(0, 10);

            var labels = top.map(function (c) { return c.name; });
            var students = top.map(function (c) { return c.student_count; });
            var teachers = top.map(function (c) { return c.teacher_count; });

            new ChartJS(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Students',
                        data: students,
                        backgroundColor: 'rgba(54, 162, 235, 0.6)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    }, {
                        label: 'Teachers',
                        data: teachers,
                        backgroundColor: 'rgba(255, 99, 132, 0.6)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        },

        renderRatioChart: function (students, teachers, ChartJS) {
            var ctx = document.getElementById('chart-user-ratio');
            if (!ctx) return;

            new ChartJS(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Students', 'Teachers'],
                    datasets: [{
                        data: [students, teachers],
                        backgroundColor: [
                            'rgba(54, 162, 235, 0.6)',
                            'rgba(255, 99, 132, 0.6)'
                        ],
                        borderColor: [
                            'rgba(54, 162, 235, 1)',
                            'rgba(255, 99, 132, 1)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        },

        renderTable: function (categories) {
            var $tbody = $('#admin-analytics-table tbody');
            $tbody.empty();

            categories.forEach(function (cat) {
                var ratio = cat.teacher_count > 0 ? (cat.student_count / cat.teacher_count).toFixed(1) : '-';
                var html = '<tr>';
                html += '<td>' + cat.name + '</td>';
                html += '<td class="text-center">' + cat.course_count + '</td>';
                html += '<td class="text-center">' + cat.student_count + '</td>';
                html += '<td class="text-center">' + cat.teacher_count + '</td>';
                html += '<td class="text-center">' + ratio + '</td>';
                html += '</tr>';
                $tbody.append(html);
            });
        },

        exportToCSV: function () {
            var data = this.lastData; // Need to store this
            if (!data || !data.categories) return;

            var csv = [];
            csv.push('Category,Courses,Students,Teachers,Ratio');

            data.categories.forEach(function (cat) {
                var ratio = cat.teacher_count > 0 ? (cat.student_count / cat.teacher_count).toFixed(1) : '-';
                var row = [
                    '"' + cat.name.replace(/"/g, '""') + '"',
                    cat.course_count,
                    cat.student_count,
                    cat.teacher_count,
                    ratio
                ];
                csv.push(row.join(','));
            });

            var csvString = csv.join('\n');
            var blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", "system_analytics.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
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
                    if (targetId === 'section-progress') {
                        if (!$('#section-progress').data('loaded')) {
                            ProgressTracker.init();
                            $('#section-progress').data('loaded', true);
                        }
                    } else if (targetId === 'section-progress-detailed') {
                        // Always init detailed view logic to refetch students if dependent data missing, OR simply check flag
                        // We can just call initDetailed which handles data checking
                        if (!$('#section-progress-detailed').data('loaded')) {
                            ProgressTracker.initDetailed();
                            $('#section-progress-detailed').data('loaded', true);
                        }
                    } else if (targetId === 'section-grading') {
                        if (!$('#section-grading').data('loaded')) {
                            GradingTracker.init();
                            $('#section-grading').data('loaded', true);
                        }
                    } else if (targetId === 'section-analytics') {
                        if (!$('#section-analytics').data('loaded')) {
                            AdminAnalytics.init();
                            $('#section-analytics').data('loaded', true);
                        }
                    }
                }
            });
        }
    };
});
