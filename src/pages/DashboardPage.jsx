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
} from "lucide-react";

export function DashboardPage() {
  const {
    totalLocations,
    totalCrowdCount,
    totalCapacity,
    activeAlertsCount,
    highRiskLocationsCount,
    simulationActive,
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

        <div className="flex items-center gap-3 self-end sm:self-auto text-xs">
          <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-slate-300 flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-blue-400" />
            <span>Live Updates: {simulationActive ? "ON" : "PAUSED"}</span>
          </div>
        </div>
      </div>

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
