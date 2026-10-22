import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CrowdProvider } from "./context/CrowdContext";
import { Layout } from "./components/layout/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { LiveMonitoringPage } from "./pages/LiveMonitoringPage";
import { LocationsPage } from "./pages/LocationsPage";
import { AlertsPage } from "./pages/AlertsPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";

export default function App() {
  return (
    <CrowdProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="live" element={<LiveMonitoringPage />} />
            <Route path="locations" element={<LocationsPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </CrowdProvider>
  );
}
