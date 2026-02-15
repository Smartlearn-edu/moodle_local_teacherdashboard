define(['jquery', 'core/ajax', 'core/str', 'core/notification', 'core/modal_factory', 'core/modal_events', 'core/templates'], function ($, Ajax, Str, Notification, ModalFactory, ModalEvents, Templates) {

    // Reusable "Load Data" prompt for all sections
    var LoadPrompt = {
        show: function (container, sectionName, icon, callback) {
            var html = '<div class="load-prompt text-center py-3">';
            html += '<button class="btn btn-primary px-4 load-data-btn">';
            html += '<i class="fa fa-download me-2"></i>Load ' + sectionName + '</button>';
            html += '</div>';
            container.find('.load-prompt').remove();
            container.prepend(html);
            container.find('.load-data-btn').on('click', function () {
                container.find('.load-prompt').remove();
                callback();
            });
        }
    };

    var ProgressTracker = {
        init: function () {
            this.container = $('#section-progress');
            this.selectedStudents = new Set();
            var self = this;
            LoadPrompt.show(this.container, 'Student Progress', 'users', function () {
                self.loadData();
            });
        },

        loadData: function () {
            var self = this;

            // Show loading
            this.container.html('<div class="text-center p-5"><i class="fa fa-spinner fa-spin fa-3x"></i></div>');

            console.log('Fetching analytics data...');
            return Ajax.call([{
                methodname: 'local_smartdashboard_get_cross_course_progress',
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
                methodname: 'local_smartdashboard_get_student_detailed_progress',
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
            var self = this;
            LoadPrompt.show(this.container, 'Grading Overview', 'pencil', function () {
                self.loadData();
            });
        },

        loadData: function () {
            var self = this;
            this.content.html('<div class="text-center p-5"><i class="fa fa-spinner fa-spin fa-3x"></i></div>');

            Ajax.call([{
                methodname: 'local_smartdashboard_get_grading_overview',
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
            this.currentFilters = {
                categoryid: 0,
                courseid: 0,
                includesubcategories: true
            };
            this.filtersRendered = false;
            var self = this;
            LoadPrompt.show(this.container, 'System Analytics', 'bar-chart', function () {
                self.loadData();
            });
        },

        loadData: function () {
            var self = this;
            // Show loading overlay or spinner on charts? 
            // For now just console log.
            console.log('Fetching System Analytics with filters:', this.currentFilters);

            Ajax.call([{
                methodname: 'local_smartdashboard_get_system_analytics',
                args: this.currentFilters
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

            if (!this.filtersRendered) {
                this.renderFilters(data.filter_options);
                this.filtersRendered = true;
            }

            this.renderStats(data);
            this.renderTable(data.categories);
            this.renderCharts(data);

            // Bind export button
            var self = this;
            $('#btn-admin-export').off('click').on('click', function () {
                self.exportToCSV();
            });
        },

        renderFilters: function (options) {
            var self = this;
            this.filterOptions = options; // Store for dependencies

            var html = '<div class="row mb-4 animate__animated animate__fadeIn">';

            // Course Filter
            html += '<div class="col-md-4 mb-2">';
            html += '<select id="admin-filter-course" class="form-select border-0 shadow-sm">';
            html += '<option value="0">All Courses</option>';
            options.courses.forEach(function (c) {
                html += '<option value="' + c.id + '">' + c.name + '</option>';
            });
            html += '</select></div>';

            // Category Filter
            html += '<div class="col-md-4 mb-2">';
            html += '<select id="admin-filter-category" class="form-select border-0 shadow-sm">';
            html += '<option value="0">All Categories</option>';
            options.categories.forEach(function (c) {
                // Only show top level or all? Show all for now.
                html += '<option value="' + c.id + '">' + c.name + '</option>';
            });
            html += '</select>';

            // Subcategory Option
            html += '<div id="admin-subcategory-options" class="mt-2 text-muted small" style="display:none;">';
            html += '<div class="form-check form-switch">';
            html += '<input class="form-check-input" type="checkbox" id="admin-include-subcats" checked>';
            html += '<label class="form-check-label" for="admin-include-subcats">Include sub-categories</label>';
            html += '</div>';
            html += '</div>';

            html += '</div>'; // End col

            // Filter Actions? Auto-apply on change.
            html += '</div>'; // End row

            // Prepend to container, before stats cards
            this.container.prepend(html);

            // Listeners
            this.container.find('#admin-filter-category').on('change', function () {
                self.currentFilters.categoryid = parseInt($(this).val());
                self.currentFilters.courseid = 0; // Reset course when cat changes?
                // Also reset course dropdown value
                $('#admin-filter-course').val(0);

                self.updateCourseOptions();
                self.toggleSubcatOptions();
                self.loadData();
            });

            this.container.find('#admin-filter-course').on('change', function () {
                self.currentFilters.courseid = parseInt($(this).val());
                // If course selected, maybe set category? (Optional, skipping for now)
                self.loadData();
            });

            this.container.find('#admin-include-subcats').on('change', function () {
                self.currentFilters.includesubcategories = $(this).is(':checked');
                self.loadData();
            });
        },

        toggleSubcatOptions: function () {
            var catId = this.currentFilters.categoryid;
            if (catId > 0) {
                $('#admin-subcategory-options').show();
            } else {
                $('#admin-subcategory-options').hide();
            }
        },

        updateCourseOptions: function () {
            var catId = this.currentFilters.categoryid;
            var $courseSelect = $('#admin-filter-course');
            $courseSelect.empty();
            $courseSelect.append('<option value="0">All Courses</option>');

            // Helper to check subcategory
            var isSubcategory = function (parentPath, catIdToCheck) {
                // We need path info for this. backend sends {id, name, parent}. 
                // It does NOT send path in filter_options.
                // So we can only filter by DIRECT parent client-side unless we recursively find children.
                // Or we update backend to send path.
                // For now, let's just filter by direct category to be safe, or ALL if complex.
                // Actually, let's use the list of categories to build a hierarchy map.
                return false;
            };

            // To properly filter courses by "Category + Subcategories" client side, I need the structure.
            // I'll filter by Direct Category for now. 
            // If the user wants courses from subcats, they can select subcat.
            // OR I just show ALL courses if Cat is 0. 
            // If Cat > 0, show courses where course.category == catId.

            var filteredCourses = this.filterOptions.courses;
            if (catId > 0) {
                filteredCourses = filteredCourses.filter(function (c) {
                    return c.category == catId; // Strict equality check? id is int.
                });
            }

            filteredCourses.forEach(function (c) {
                $courseSelect.append('<option value="' + c.id + '">' + c.name + '</option>');
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
                // Determine if we need to destroy old charts?
                // ChartJS usually needs canvas cleanup.

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
            // ... existing chart code ...
            // We need to handle Chart destruction to animate/update correctly.
            // Or just replace the canvas?

            var canvasId = 'chart-enrollments-category';
            var $canvasContainer = $('#' + canvasId).parent();
            // Destroy existing chart instance if saved?
            // Simple way: Clear container and re-add canvas
            // $canvasContainer.html('<canvas id="' + canvasId + '"></canvas>');
            // But verify container structure in template.
            // Usually <div style="height:300px"><canvas id="..."></canvas></div>

            // Recreating canvas is safest for ChartJS updates
            $('#' + canvasId).remove();
            $canvasContainer.append('<canvas id="' + canvasId + '"></canvas>');

            var ctx = document.getElementById(canvasId);
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
            var canvasId = 'chart-user-ratio';
            var $canvasContainer = $('#' + canvasId).parent();
            $('#' + canvasId).remove();
            $canvasContainer.append('<canvas id="' + canvasId + '"></canvas>');

            var ctx = document.getElementById(canvasId);
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

            if (categories.length === 0) {
                $tbody.append('<tr><td colspan="5" class="text-center text-muted">No data found for this filter.</td></tr>');
                return;
            }

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

    var PaymentAnalytics = {
        init: function () {
            this.container = $('#section-payments');
            this.allCategories = []; // Store all categories for hierarchy
            this.filters = {
                categoryid: 0,
                time: 'all'
            };
            var self = this;
            // Add "Load Data" button in the filter row
            var $filterRow = this.container.find('#btn-refresh-payments').closest('.row');
            var loadCol = $('<div class="col-md-2 d-flex align-items-end" id="load-payments-col">' +
                '<button id="btn-load-payments" class="btn btn-success w-100">' +
                '<i class="fa fa-download me-1"></i> Load Data</button></div>');
            $filterRow.append(loadCol);
            loadCol.find('#btn-load-payments').on('click', function () {
                $('#load-payments-col').remove();
                self.populateFilters();
                self.loadData();
                self.bindEvents();
            });
        },

        bindEvents: function () {
            var self = this;

            // Filter button
            this.container.find('#btn-refresh-payments').on('click', function () {
                self.readFilters();
                self.loadData();
            });

            // Toggle custom date fields when "Custom Range" is selected
            this.container.find('#payment-filter-time').on('change', function () {
                var val = $(this).val();
                if (val === 'custom') {
                    self.container.find('#payment-custom-dates-from').removeClass('d-none');
                    self.container.find('#payment-custom-dates-to').removeClass('d-none');
                } else {
                    self.container.find('#payment-custom-dates-from').addClass('d-none');
                    self.container.find('#payment-custom-dates-to').addClass('d-none');
                }
            });

            // Hierarchical category: Level 1 -> Level 2
            this.container.find('#payment-filter-category').on('change', function () {
                var parentId = parseInt($(this).val());
                self.populateSubcategories(parentId, '#payment-filter-subcategory', '#payment-subcat-wrapper');
                // Reset level 3
                self.container.find('#payment-subsubcat-wrapper').addClass('d-none');
                self.container.find('#payment-filter-subsubcategory').html('<option value="0">All</option>');
            });

            // Hierarchical category: Level 2 -> Level 3
            this.container.find('#payment-filter-subcategory').on('change', function () {
                var parentId = parseInt($(this).val());
                self.populateSubcategories(parentId, '#payment-filter-subsubcategory', '#payment-subsubcat-wrapper');
            });
        },

        populateSubcategories: function (parentId, selectSelector, wrapperSelector) {
            var self = this;
            var $select = this.container.find(selectSelector);
            var $wrapper = this.container.find(wrapperSelector);

            $select.html('<option value="0">All</option>');

            if (!parentId || parentId === 0) {
                $wrapper.addClass('d-none');
                return;
            }

            // Find children of this parent
            var children = this.allCategories.filter(function (c) {
                return c.parent === parentId;
            });

            if (children.length > 0) {
                children.forEach(function (c) {
                    $select.append('<option value="' + c.id + '">' + c.name + '</option>');
                });
                $wrapper.removeClass('d-none');
            } else {
                $wrapper.addClass('d-none');
            }
        },

        readFilters: function () {
            // Read the deepest selected category
            var cat3 = parseInt(this.container.find('#payment-filter-subsubcategory').val()) || 0;
            var cat2 = parseInt(this.container.find('#payment-filter-subcategory').val()) || 0;
            var cat1 = parseInt(this.container.find('#payment-filter-category').val()) || 0;

            // Use the most specific (deepest) non-zero category
            if (cat3 > 0) {
                this.filters.categoryid = cat3;
            } else if (cat2 > 0) {
                this.filters.categoryid = cat2;
            } else {
                this.filters.categoryid = cat1;
            }

            this.filters.time = this.container.find('#payment-filter-time').val();
        },

        populateFilters: function () {
            var self = this;
            // Reuse system analytics to get categories structure
            Ajax.call([{
                methodname: 'local_smartdashboard_get_system_analytics',
                args: { categoryid: 0 }
            }])[0].done(function (response) {
                if (response.filter_options && response.filter_options.categories) {
                    self.allCategories = response.filter_options.categories;

                    // Only show root (parent = 0) categories in the first dropdown
                    var $select = self.container.find('#payment-filter-category');
                    $select.find('option:not([value="0"])').remove(); // Keep "All"

                    response.filter_options.categories.forEach(function (c) {
                        if (c.parent === 0) {
                            $select.append('<option value="' + c.id + '">' + c.name + '</option>');
                        }
                    });
                }
            });
        },

        loadData: function () {
            var self = this;
            // Calculate timestamps
            var now = Math.floor(Date.now() / 1000);
            var from = 0;
            var to = now;

            switch (this.filters.time) {
                case 'today':
                    var d = new Date();
                    d.setHours(0, 0, 0, 0);
                    from = Math.floor(d.getTime() / 1000);
                    break;
                case 'week':
                    from = now - (7 * 86400);
                    break;
                case 'month':
                    from = now - (30 * 86400);
                    break;
                case 'year':
                    from = now - (365 * 86400);
                    break;
                case 'custom':
                    var fromStr = this.container.find('#payment-date-from').val();
                    var toStr = this.container.find('#payment-date-to').val();
                    if (fromStr) {
                        from = Math.floor(new Date(fromStr).getTime() / 1000);
                    }
                    if (toStr) {
                        // Set to end of day
                        var toDate = new Date(toStr);
                        toDate.setHours(23, 59, 59, 999);
                        to = Math.floor(toDate.getTime() / 1000);
                    }
                    break;
                case 'all':
                    from = 0;
                    break;
            }

            // Show loading state?
            this.container.find('#payment-total-revenue').text('Loading...');

            // Read payment mode from settings
            var paymentMode = DashboardSettings.getPaymentMode();

            Ajax.call([{
                methodname: 'local_smartdashboard_get_payment_analytics',
                args: {
                    categoryid: this.filters.categoryid,
                    fromdate: from,
                    todate: to,
                    payment_mode: paymentMode
                }
            }])[0].done(function (response) {
                self.render(response);
            }).fail(function (ex) {
                Notification.exception(ex);
                self.container.find('#payment-total-revenue').text('Error');
            });
        },

        render: function (data) {
            this.lastData = data; // Store for export
            // Metrics
            var hideCurrency = DashboardSettings.getHideCurrency();
            $('#payment-total-students').text(data.total_students);
            var revenueDisplay = hideCurrency
                ? Number(data.total_revenue).toLocaleString(undefined, { minimumFractionDigits: 2 })
                : data.currency + ' ' + Number(data.total_revenue).toLocaleString(undefined, { minimumFractionDigits: 2 });
            $('#payment-total-revenue').text(revenueDisplay);

            // Render Charts
            this.renderCharts(data);

            // Render Table
            this.renderTable(data.courses, data.currency);

            // Export button
            var self = this;
            this.container.find('#btn-export-payments').remove();
            var exportHtml = '<div class="d-flex justify-content-end mt-3 mb-4" id="btn-export-payments">';
            exportHtml += '<button class="btn btn-outline-secondary"><i class="fa fa-download me-1"></i> Export Payment Report</button>';
            exportHtml += '</div>';
            this.container.find('#payment-table-body').closest('.card').after(exportHtml);
            this.container.find('#btn-export-payments button').on('click', function () {
                self.exportToCSV();
            });
        },

        renderCharts: function (data) {
            var self = this;
            require(['core/chartjs'], function (ChartJS) {
                // Chart 1: Revenue per Category (Pie)
                self.renderRevenuePie(data.categories, ChartJS);

                // Chart 2: Students vs Revenue per Category (Multi-Axis Bar)
                self.renderCategoryDualAxis(data.categories, ChartJS);
            });
        },

        renderRevenuePie: function (categories, ChartJS) {
            var canvasId = 'chart-payment-revenue';
            var $container = $('#' + canvasId).parent();
            $('#' + canvasId).remove();
            $container.append('<canvas id="' + canvasId + '"></canvas>');
            var ctx = document.getElementById(canvasId);

            var labels = categories.map(function (c) { return c.name; });
            var data = categories.map(function (c) { return c.revenue; });

            new ChartJS(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: [
                            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right' },
                        title: { display: true, text: 'Revenue Distribution' }
                    }
                }
            });
        },

        renderCategoryDualAxis: function (categories, ChartJS) {
            var canvasId = 'chart-payment-students';
            var $container = $('#' + canvasId).parent();
            $('#' + canvasId).remove();
            $container.append('<canvas id="' + canvasId + '"></canvas>');
            var ctx = document.getElementById(canvasId);

            var labels = categories.map(function (c) { return c.name; });
            var students = categories.map(function (c) { return c.student_count; });
            var revenue = categories.map(function (c) { return c.revenue; });

            new ChartJS(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Students',
                            data: students,
                            borderColor: '#36A2EB',
                            backgroundColor: 'rgba(54, 162, 235, 0.5)',
                            order: 1,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Revenue',
                            data: revenue,
                            borderColor: '#FF6384',
                            backgroundColor: 'rgba(255, 99, 132, 0.5)',
                            type: 'line',
                            order: 0,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: { display: true, text: 'Students & Revenue per Category' }
                    },
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: { display: true, text: 'Students' }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            grid: { drawOnChartArea: false },
                            title: { display: true, text: 'Revenue' }
                        }
                    }
                }
            });
        },

        renderTable: function (courses, currency) {
            var $tbody = $('#payment-table-body');
            $tbody.empty();

            var hideCurrency = DashboardSettings.getHideCurrency();

            if (!courses || courses.length === 0) {
                $tbody.append('<tr><td colspan="5" class="text-center text-muted">No paid enrollments found.</td></tr>');
                return;
            }

            courses.forEach(function (c) {
                var html = '<tr>';
                html += '<td>' + c.name + '</td>';
                html += '<td>' + (c.shortname || '') + '</td>';
                html += '<td class="text-center">' + c.student_count + '</td>';

                // Payment breakdown column
                var breakdownHtml = '';
                if (hideCurrency) {
                    // Show the enrollment fee (cost per student), not total revenue
                    if (c.payment_breakdown && c.payment_breakdown.length > 0) {
                        c.payment_breakdown.forEach(function (pb) {
                            var amt = Number(pb.amount).toLocaleString(undefined, { minimumFractionDigits: 2 });
                            breakdownHtml += '<div>' + amt + '</div>';
                        });
                    } else if (c.student_count > 0 && c.revenue > 0) {
                        var fee = c.revenue / c.student_count;
                        breakdownHtml = Number(fee).toLocaleString(undefined, { minimumFractionDigits: 2 });
                    } else {
                        breakdownHtml = '0.00';
                    }
                } else if (c.payment_breakdown && c.payment_breakdown.length > 0) {
                    c.payment_breakdown.forEach(function (pb) {
                        var amt = Number(pb.amount).toLocaleString(undefined, { minimumFractionDigits: 2 });
                        breakdownHtml += '<div>' + pb.count + ' &times; ' + amt + ' ' + pb.currency + '</div>';
                    });
                } else if (c.student_count > 0 && c.revenue > 0) {
                    // Fallback: calculate cost per student from revenue / enrollments
                    var costPerStudent = c.revenue / c.student_count;
                    var amt = Number(costPerStudent).toLocaleString(undefined, { minimumFractionDigits: 2 });
                    breakdownHtml = '<div>' + c.student_count + ' &times; ' + amt + ' ' + currency + '</div>';
                } else {
                    breakdownHtml = hideCurrency ? Number(c.revenue).toLocaleString(undefined, { minimumFractionDigits: 2 }) : currency + ' ' + Number(c.revenue).toLocaleString(undefined, { minimumFractionDigits: 2 });
                }
                html += '<td>' + breakdownHtml + '</td>';

                // Total revenue column
                var revenueText = hideCurrency
                    ? Number(c.revenue).toLocaleString(undefined, { minimumFractionDigits: 2 })
                    : currency + ' ' + Number(c.revenue).toLocaleString(undefined, { minimumFractionDigits: 2 });
                html += '<td class="text-end fw-bold">' + revenueText + '</td>';
                html += '</tr>';
                $tbody.append(html);
            });
        },

        exportToCSV: function () {
            var data = this.lastData;
            if (!data || !data.courses || data.courses.length === 0) {
                Notification.alert('No Data', 'There is no payment data to export.', 'OK');
                return;
            }

            var currency = data.currency || '';
            var csv = [];
            var hideCurrency = DashboardSettings.getHideCurrency();

            // Header
            csv.push('Course Name,Short Name,Paid Enrollments,Payment Breakdown,Total Revenue' + (hideCurrency ? '' : ',Currency'));

            data.courses.forEach(function (c) {
                var courseName = '"' + (c.name || '').replace(/"/g, '""') + '"';
                var shortName = '"' + (c.shortname || '').replace(/"/g, '""') + '"';

                // Build breakdown text
                var breakdownText = '';
                if (hideCurrency) {
                    // Show enrollment fee, not total revenue
                    if (c.payment_breakdown && c.payment_breakdown.length > 0) {
                        var fees = [];
                        c.payment_breakdown.forEach(function (pb) {
                            fees.push(Number(pb.amount).toFixed(2));
                        });
                        breakdownText = fees.join(' / ');
                    } else if (c.student_count > 0 && c.revenue > 0) {
                        breakdownText = (c.revenue / c.student_count).toFixed(2);
                    } else {
                        breakdownText = '0.00';
                    }
                } else if (c.payment_breakdown && c.payment_breakdown.length > 0) {
                    var parts = [];
                    c.payment_breakdown.forEach(function (pb) {
                        parts.push(pb.count + ' x ' + Number(pb.amount).toFixed(2) + ' ' + pb.currency);
                    });
                    breakdownText = '"' + parts.join(', ') + '"';
                } else if (c.student_count > 0 && c.revenue > 0) {
                    var cost = (c.revenue / c.student_count).toFixed(2);
                    breakdownText = '"' + c.student_count + ' x ' + cost + ' ' + currency + '"';
                } else {
                    breakdownText = '""';
                }

                var row = [
                    courseName,
                    shortName,
                    c.student_count,
                    breakdownText,
                    Number(c.revenue).toFixed(2)
                ];
                if (!hideCurrency) {
                    row.push(currency);
                }
                csv.push(row.join(','));
            });

            // Summary row
            csv.push('');
            csv.push('"TOTAL",,' + data.total_students + ',,' + Number(data.total_revenue).toFixed(2) + (hideCurrency ? '' : ',' + currency));

            var csvString = csv.join('\n');
            var BOM = '\uFEFF'; // UTF-8 BOM for Arabic/special characters in Excel
            var blob = new Blob([BOM + csvString], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', 'payment_report.csv');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    var DashboardSettings = {
        paymentMode: 'actual', // default
        hideCurrency: false, // default

        init: function () {
            var self = this;
            this.container = $('#section-settings');

            // Show/hide estimated options based on radio selection
            this.container.find('input[name="payment_mode"]').on('change', function () {
                if ($(this).val() === 'estimated') {
                    self.container.find('#estimated-options').show();
                } else {
                    self.container.find('#estimated-options').hide();
                }
            });

            // Load saved settings from server
            Ajax.call([{
                methodname: 'local_smartdashboard_get_dashboard_settings',
                args: {}
            }])[0].done(function (response) {
                self.paymentMode = response.payment_mode || 'actual';
                self.hideCurrency = !!response.hide_currency;
                // Set the radio button
                self.container.find('input[name="payment_mode"][value="' + self.paymentMode + '"]').prop('checked', true);
                // Set the checkbox
                self.container.find('#setting-hide-currency').prop('checked', self.hideCurrency);
                // Show/hide estimated options
                if (self.paymentMode === 'estimated') {
                    self.container.find('#estimated-options').show();
                } else {
                    self.container.find('#estimated-options').hide();
                }
            }).fail(function () {
                // Use defaults if loading fails
                self.paymentMode = 'actual';
                self.hideCurrency = false;
                self.container.find('#estimated-options').hide();
            });

            // Save button
            this.container.find('#btn-save-settings').on('click', function () {
                self.save();
            });
        },

        save: function () {
            var self = this;
            var mode = this.container.find('input[name="payment_mode"]:checked').val() || 'actual';
            var hideCurr = this.container.find('#setting-hide-currency').is(':checked');
            var $status = this.container.find('#settings-save-status');
            var $btn = this.container.find('#btn-save-settings');

            $btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin me-1"></i> Saving...');
            $status.text('');

            Ajax.call([{
                methodname: 'local_smartdashboard_save_dashboard_settings',
                args: {
                    payment_mode: mode,
                    hide_currency: hideCurr
                }
            }])[0].done(function (response) {
                self.paymentMode = response.payment_mode;
                self.hideCurrency = !!response.hide_currency;
                $btn.prop('disabled', false).html('<i class="fa fa-save me-1"></i> Save Settings');
                $status.html('<i class="fa fa-check text-success me-1"></i> Settings saved!').removeClass('text-danger').addClass('text-success');

                // Reset PaymentAnalytics loaded state so it re-fetches with new mode
                $('#section-payments').data('loaded', false);

                setTimeout(function () {
                    $status.text('');
                }, 3000);
            }).fail(function (ex) {
                $btn.prop('disabled', false).html('<i class="fa fa-save me-1"></i> Save Settings');
                $status.html('<i class="fa fa-times text-danger me-1"></i> Failed to save.').removeClass('text-success').addClass('text-danger');
                Notification.exception(ex);
            });
        },

        getPaymentMode: function () {
            return this.paymentMode;
        },

        getHideCurrency: function () {
            return this.paymentMode === 'estimated' && this.hideCurrency;
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
                    } else if (targetId === 'section-payments') {
                        if (!$('#section-payments').data('loaded')) {
                            PaymentAnalytics.init();
                            $('#section-payments').data('loaded', true);
                        }
                    } else if (targetId === 'section-settings') {
                        if (!$('#section-settings').data('loaded')) {
                            DashboardSettings.init();
                            $('#section-settings').data('loaded', true);
                        }
                    }
                }
            });
        }
    };
});
