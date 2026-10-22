import React from "react";
import { useCrowd } from "../context/CrowdContext";
import { StatCard } from "../components/common/StatCard";
import { CrowdDensityChart } from "../components/dashboard/CrowdDensityChart";
import { RecentAlertsList } from "../components/dashboard/RecentAlertsList";
import { LocationStatusTable } from "../components/dashboard/LocationStatusTable";
import {
  MapPin,
  Users,
  AlertTriangle,
  ShieldAlert,
  Activity,
  Radio,
  RefreshCw,
  Server,
  Zap,
} from "lucide-react";

export function DashboardPage() {
  const {
    totalLocations,
    totalCrowdCount,
    totalCapacity,
    activeAlertsCount,
    highRiskLocationsCount,
    simulationActive,
    setSimulationActive,
    dataSourceMode,
    isLoading,
    error,
    refreshData,
  } = useCrowd();

  const overallOccupancyPct = totalCapacity
    ? Math.round((totalCrowdCount / totalCapacity) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Top Advisory Banner */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900 to-[#121c38] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-800 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-blue-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-blue-400 font-semibold">
                Main Monitoring Center
              </span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-xs text-emerald-400">ALL CAMERAS ONLINE</span>
            </div>
            <h2 className="text-sm sm:text-base font-bold text-white mt-0.5">
              Live Crowd Safety & Area Monitoring Dashboard
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto text-xs flex-wrap">
          {/* Data Source Indicator */}
          {dataSourceMode === "backend" ? (
            <div className="px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-medium">Django API Connected</span>
            </div>
          ) : dataSourceMode === "error" ? (
            <div className="px-3 py-1.5 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span className="font-medium">Backend Offline</span>
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-lg bg-amber-950/60 border border-amber-800/80 text-amber-300 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-medium">Demo Mode (Simulated)</span>
            </div>
          )}

          {/* Refresh Action */}
          <button
            onClick={refreshData}
            disabled={isLoading}
            title="Refresh backend data"
            className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-blue-400" : ""}`} />
          </button>

          <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-slate-300 flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-blue-400" />
            <span>Updates: {simulationActive ? "DEMO ACTIVE" : (dataSourceMode === "backend" ? "SYNCED" : "OFFLINE")}</span>
          </div>
        </div>
      </div>

      {/* Backend Connection Error Banner (if offline) */}
      {error && (dataSourceMode === "backend" || dataSourceMode === "error") && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-rose-900">
                Backend Connection Unavailable
              </h4>
              <p className="text-xs text-rose-700 mt-0.5">
                {error}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              onClick={refreshData}
              className="px-3 py-1.5 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors shadow-2xs"
            >
              Retry Connection
            </button>
            <button
              onClick={() => setSimulationActive(true)}
              className="px-3 py-1.5 text-xs font-semibold bg-white border border-rose-300 text-rose-800 rounded-lg hover:bg-rose-100 transition-colors"
            >
              Switch to Demo Mode
            </button>
          </div>
        </div>
      )}

      {/* 4 Primary KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Monitored Locations"
          value={totalLocations}
          subtitle="All locations actively tracked"
          icon={MapPin}
          colorScheme="blue"
          trend={{ text: "All Systems Normal", isPositive: true }}
        />

        <StatCard
          title="Total Crowd Right Now"
          value={totalCrowdCount.toLocaleString()}
          subtitle={`${overallOccupancyPct}% of total capacity used`}
          icon={Users}
          colorScheme={overallOccupancyPct > 80 ? "amber" : "emerald"}
          trend={{ text: `${(totalCapacity - totalCrowdCount).toLocaleString()} spaces remaining`, isPositive: true }}
        />

        <StatCard
          title="Active Safety Alerts"
          value={activeAlertsCount}
          subtitle={
            activeAlertsCount > 0
              ? "Warnings that need attention"
              : "No active warnings"
          }
          icon={AlertTriangle}
          colorScheme={activeAlertsCount > 0 ? "rose" : "emerald"}
          isAlert={activeAlertsCount > 0}
          trend={
            activeAlertsCount > 0
              ? { text: "Action Needed", isPositive: false }
              : { text: "All Clear", isPositive: true }
          }
        />

        <StatCard
          title="High Crowd Locations"
          value={highRiskLocationsCount}
          subtitle="Areas over 75% capacity"
          icon={ShieldAlert}
          colorScheme={highRiskLocationsCount > 0 ? "amber" : "emerald"}
          trend={
            highRiskLocationsCount > 0
              ? { text: "Heavy crowd warning", isPositive: false }
              : { text: "Crowd levels normal", isPositive: true }
          }
        />
      </div>

      {/* Density Curve & Alerts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CrowdDensityChart />
        </div>
        <div className="lg:col-span-1">
          <RecentAlertsList />
        </div>
      </div>

      {/* Location-wise Crowd Status Table */}
      <LocationStatusTable />
    </div>
  );
}
