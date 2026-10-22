# CROWDGUARD — Public Safety & Crowd Control Dashboard (Phase 1)

Professional Crowd Safety Management frontend built with **React**, **Vite**, **Tailwind CSS**, and **Recharts**.

---

## 🚀 Quick Start Commands

To start the development server, run:

```bash
# 1. Navigate to the project directory
cd crowdsafety

# 2. Run the Vite development server
npm run dev
```

Open your browser and navigate to:
```
http://localhost:5173/
```

To build and preview for production:
```bash
npm run build
npm run preview
```

---

## 📁 Project Architecture & Key Files

| File / Folder | Role & Purpose |
| :--- | :--- |
| `src/context/CrowdContext.jsx` | **Global State & Simulation Engine**: Holds locations, active alerts, toast dispatchers, and an automated background simulation that realistically drifts crowd numbers every 4.5 seconds. |
| `src/data/mockData.js` | **Central Mock Dataset**: Contains realistic public safety venues (transit hubs, stadiums, esplanades) with capacities, detection counts, camera IDs, and incident logs labeled as `[DEMO DATA]`. |
| `src/components/layout/Sidebar.jsx` | **Dark Navy Navigation Sidebar**: High-contrast command navigation with live system status badge, live alert counter pills, and interactive simulation on/off toggle. |
| `src/components/layout/Header.jsx` | **Operational Topbar**: Real-time digital clock ticker, emergency notification bell, high-risk sector alerts, and demo indicator. |
| `src/pages/DashboardPage.jsx` | **Executive Safety Command**: 4 KPI stat cards, hourly crowd density curve, live incident triage feed, and location-wise status table. |
| `src/pages/LiveMonitoringPage.jsx` | **Vision Telemetry & Feeds**: Simulated CCTV HUD with camera switcher, resolution/FPS telemetry, AI bounding box toggles, and individual location threshold cards. |
| `src/pages/LocationsPage.jsx` | **Location Registry**: Search by keyword/sector, filter by venue type & occupancy status, grid/table view toggle, and interactive **Add Location Modal**. |
| `src/pages/AlertsPage.jsx` | **Incident Management**: Incident triage stream with working **Acknowledge** and **Resolve** protocol buttons, severity tabs, and search. |
| `src/pages/AnalyticsPage.jsx` | **Crowd Analytics**: Diurnal attendance curve, location-wise crowd vs safe capacity bar chart, and risk status distribution donut chart. |

---

## 🛡️ Public Safety Design System

- **Safe**: Emerald green (`#10b981`) — Occupancy ≤ 50%
- **Moderate**: Amber (`#f59e0b`) — Occupancy 50% – 75%
- **High Risk**: Orange (`#f97316`) — Occupancy 75% – 90%
- **Critical**: Rose/Red (`#ef4444`) — Occupancy ≥ 90% or bottleneck surge
