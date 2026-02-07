# Student Progress Dashboard - Future Improvements

These ideas act as a roadmap to increase the value and competitiveness of the Teacher Dashboard plugin.

## 1. Bulk Messaging ("The Action Gap")
**Goal:** Transform the dashboard from a passive monitoring tool into an active productivity tool.
**Concept:** Allow teachers to select students directly from the dashboard and send messages.
**Implementation Plan:**
- Add checkboxes next to student names in the table.
- Add a "Select All" checkbox in the header.
- Create a floating or fixed "Action Bar" that appears when students are selected.
- **Action:** "Send Message".
- Uses Moodle's internal messaging API (`core_message_send_instant_messages`).
- **Use Case:** Filter for "Not Completed" in a course -> Select All -> Send nudge: "Please complete your Python work."

## 2. Retention Indicators ("Ghost Busting")
**Goal:** Identify students who are at risk of dropping out before it's too late.
**Concept:** Display "Last Access" time or an "Inactive" warning.
**Implementation Plan:**
- **Backend:** Update `analytics.php` to fetch `lastaccess` from the `{user}` table or `{user_lastaccess}` for specific courses.
- **Frontend:**
    - Add a "Last Active" column.
    - Add visual indicators: Green dot (Active < 3 days), Yellow (Inactive 3-7 days), Red (Inactive > 7 days).
    - Sortable column to bring at-risk students to the top.

## 3. Progress Drill-Down
**Goal:** Explain *why* a student is marked as "Not Completed".
**Concept:** Make the status icons clickable to reveal specific missing requirements.
**Implementation Plan:**
- **Backend:** `completion_info->get_data()` already calculates specific criteria. We can return a list of "pending" activity names.
- **Frontend:**
    - Click 'Not Completed' icon -> Opens Bootstrap Modal.
    - Modal lists: "Missing: Final Quiz, Assignment 2".
- This removes the need for teachers to navigate into the Gradebook to find missing items.

## 4. Visualizations
**Goal:** Provide high-level insights for quick scanning.
**Concept:** Add charts above the data table.
**Implementation Plan:**
- Use a lightweight library like Chart.js (or Moodle's native charting if available/easy).
- **Chart 1:** Course Completion Rates (Bar Chart comparing courses).
- **Chart 2:** Activity Scatter Plot (Grade vs. Time spent).

## 5. Export Enhancements
- Add "Last Access" to the CSV export.
- Allow exporting only the selected rows (tied to Feature #1).
