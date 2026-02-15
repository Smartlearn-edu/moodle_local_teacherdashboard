# Smart Dashboard for Moodle

[![Moodle Plugin](https://img.shields.io/badge/Moodle-Plugin-orange?logo=moodle)](https://moodle.org/plugins)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Moodle 4.0+](https://img.shields.io/badge/Moodle-4.0%2B-brightgreen)](https://moodle.org)

A powerful, all-in-one analytics dashboard for Moodle — designed for **teachers**, **managers**, and **admins** alike.

Smart Dashboard provides real-time insights into student progress, grading workload, enrollment analytics, and payment breakdowns — all from a single, beautiful dark-mode interface.

## ✨ Features

### 📊 Overview
- **Course cards** showing enrolled students, pending submissions, and course images
- **Admin/Manager mode** with category browser and enrollment statistics
- **Hierarchical category navigation** with recursive student counts

### 👥 Student Progress
- **Cross-course progress tracking** — see all students' completion across multiple courses
- **Detailed per-student view** — drill down into individual activity completion
- **Filters** by course, category, subcategory, and completion status
- **CSV export** for reporting

### ✅ Grading
- **Pending submissions overview** across all your courses
- **Assignment-level breakdown** with due dates and counts
- Filters by course for quick prioritization

### 📈 Analytics (Admin/Manager)
- **System-wide statistics** — total students, teachers, courses, categories
- **Category breakdown charts** with enrollment data
- **Student-to-teacher ratio** visualization
- **CSV export** for institutional reporting

### 💰 Payment Analytics (Admin/Manager)
- **Revenue tracking** with actual vs. estimated payment modes
- **Per-category revenue charts** — pie chart and dual-axis bar chart
- **Enrollment cost breakdown** per course
- **Time-range filtering** with date pickers
- **Currency display toggle**
- **CSV export** for financial reporting

### ⚙️ Settings
- Configurable payment calculation mode (actual/estimated)
- Currency visibility toggle
- Settings persist per-site via Moodle config

### 🎨 Design
- **Modern dark-mode UI** with glassmorphism elements
- **Responsive sidebar navigation** with section collapsing
- **Smooth transitions** and hover effects
- **DM Sans** typography for a premium feel

## 📋 Requirements

- **Moodle** 4.0 or later (tested up to Moodle 4.5)
- **PHP** 7.4 or later
- No additional dependencies

## 🚀 Installation

### From GitHub (ZIP)
1. Download the latest release as a ZIP file
2. Rename the extracted folder to `smartdashboard`
3. Upload it to your Moodle's `/local/` directory
4. Visit **Site Administration → Notifications** to complete the installation

### Via Git
```bash
cd /path/to/moodle/local
git clone https://github.com/Smartlearn-edu/moodle_local_smartdashboard.git smartdashboard
```
Then visit **Site Administration → Notifications** to complete the installation.

### From Moodle Plugin Directory
Search for **Smart Dashboard** in the [Moodle Plugin Directory](https://moodle.org/plugins) and install directly from your Moodle site.

## 🔧 Usage

After installation, access the dashboard at:

```
https://your-moodle-site.com/local/smartdashboard/
```

### For Teachers
The dashboard automatically shows your assigned courses with student counts and pending grading. Use the sidebar to navigate between Overview, Student Progress, and Grading sections.

### For Admins & Managers
You'll see the full dashboard with category browsing, system-wide analytics, and payment analytics. Use the category dropdown to filter data.

## 📁 Plugin Structure

```
smartdashboard/
├── amd/
│   ├── src/main.js              # Frontend logic (AMD module)
│   └── build/main.min.js        # Minified build
├── classes/
│   ├── external/
│   │   ├── analytics.php        # External API: progress, analytics, payments
│   │   └── grading.php          # External API: grading overview
│   └── output/
│       └── dashboard.php        # Renderable output class
├── db/
│   └── services.php             # External service definitions
├── lang/
│   └── en/
│       └── local_smartdashboard.php  # English language strings
├── templates/
│   └── dashboard.mustache       # Mustache template
├── index.php                    # Main entry point
├── styles.css                   # Dark mode styling
└── version.php                  # Plugin metadata
```

## 🌐 External Services (API)

| Function | Description |
|---|---|
| `local_smartdashboard_get_cross_course_progress` | Get student progress across courses |
| `local_smartdashboard_get_student_detailed_progress` | Get activity-level progress for a student |
| `local_smartdashboard_get_grading_overview` | Get assignments needing grading |
| `local_smartdashboard_get_system_analytics` | Get system-wide enrollment analytics |
| `local_smartdashboard_get_payment_analytics` | Get revenue and payment data |
| `local_smartdashboard_save_dashboard_settings` | Save dashboard configuration |
| `local_smartdashboard_get_dashboard_settings` | Retrieve dashboard configuration |

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the **GNU General Public License v3.0** — see the [LICENSE](LICENSE) file for details.

## 👤 Author

**Mohammad Nabil**
- Email: mohammad@smartlearn.education
- Organization: [SmartLearn Education](https://smartlearn.education)

## 📝 Changelog

### v1.0.0 (2026-02-15)
- Initial stable release
- Overview, Student Progress, Grading, Analytics, Payment Analytics, and Settings sections
- Dark mode UI
- Admin/Manager and Teacher role support
- CSV export for all data sections
- Hierarchical category filtering with recursive subcategories
- Payment analytics with actual/estimated modes
