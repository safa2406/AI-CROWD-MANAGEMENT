import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { CrowdProvider } from "./context/CrowdContext";
import { Layout } from "./components/layout/Layout";
import { DashboardPage } from "./pages/DashboardPage";

// Lazily load secondary routes to prevent non-Dashboard dependencies (e.g. 1.18MB detection JSONs)
// from competing with or blocking the initial Dashboard render
const LiveMonitoringPage = React.lazy(() =>
  import("./pages/LiveMonitoringPage").then((m) => ({ default: m.LiveMonitoringPage }))
);
const LocationsPage = React.lazy(() =>
  import("./pages/LocationsPage").then((m) => ({ default: m.LocationsPage }))
);
const AlertsPage = React.lazy(() =>
  import("./pages/AlertsPage").then((m) => ({ default: m.AlertsPage }))
);
const AnalyticsPage = React.lazy(() =>
  import("./pages/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage }))
);

function PageLoadingFallback({ message = "Loading view..." }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[360px] py-16 px-4">
      <div className="relative flex items-center justify-center mb-4">
        <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
      <p className="text-sm font-semibold text-slate-800 tracking-tight">
        {message}
      </p>
      <p className="text-xs text-slate-500 mt-1">
        CrowdGuard Public Safety Command
      </p>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <CrowdProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route
                path="live"
                element={
                  <Suspense fallback={<PageLoadingFallback message="Loading Live Camera Feeds..." />}>
                    <LiveMonitoringPage />
                  </Suspense>
                }
              />
              <Route
                path="locations"
                element={
                  <Suspense fallback={<PageLoadingFallback message="Loading Monitored Locations..." />}>
                    <LocationsPage />
                  </Suspense>
                }
              />
              <Route
                path="alerts"
                element={
                  <Suspense fallback={<PageLoadingFallback message="Loading Safety Alerts..." />}>
                    <AlertsPage />
                  </Suspense>
                }
              />
              <Route
                path="analytics"
                element={
                  <Suspense fallback={<PageLoadingFallback message="Loading Analytics & Reports..." />}>
                    <AnalyticsPage />
                  </Suspense>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </CrowdProvider>
    </ThemeProvider>
  );
}
