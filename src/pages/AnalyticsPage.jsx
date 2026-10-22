import React, { useState } from "react";
import { useCrowd } from "../context/CrowdContext";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { DemoBadge } from "../components/common/Badge";
import { HOURLY_CROWD_TRENDS } from "../data/mockData";
import {
  TrendingUp,
  BarChart2,
  PieChart as PieIcon,
} from "lucide-react";

// Top-level tooltip components declared outside render function
const TrendTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-700 text-xs">
        <p className="font-bold text-slate-300 mb-1">{label} HRS</p>
        {payload.map((entry, idx) => (
          <div key={idx} className="flex items-center justify-between gap-4 py-0.5">
            <span style={{ color: entry.color }}>{entry.name}:</span>
            <span className="font-bold font-mono">{entry.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const BarTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-700 text-xs">
        <p className="font-bold text-slate-200 mb-1">{data.name}</p>
        <div className="flex justify-between gap-4 py-0.5 text-blue-400">
          <span>Current Crowd:</span>
          <span className="font-bold font-mono">{data.current.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-4 py-0.5 text-slate-400">
          <span>Max Safe Capacity:</span>
          <span className="font-bold font-mono">{data.capacity.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-4 py-0.5 text-amber-400 pt-1 border-t border-slate-800">
          <span>Capacity Used:</span>
          <span className="font-bold font-mono">{data.occupancyPct}%</span>
        </div>
      </div>
    );
  }
  return null;
};

export function AnalyticsPage() {
  const { locations } = useCrowd();
  const [timeRange, setTimeRange] = useState("Today");

  // Dynamic 7-day variation or Today
  const historicalData = HOURLY_CROWD_TRENDS.map((item) => ({
    ...item,
    simulatedPastWeek: Math.round(item.totalCrowd * 0.88),
  }));

  // Location comparison dataset
  const locationComparisonData = locations.map((loc) => ({
    name: loc.name.split(" ")[0] + " " + (loc.name.split(" ")[1] || ""),
    current: loc.currentCount,
    capacity: loc.capacity,
    occupancyPct: Math.round((loc.currentCount / loc.capacity) * 100),
  }));

  // Status distribution
  const statusCounts = {
    safe: locations.filter((l) => l.status === "safe").length,
    moderate: locations.filter((l) => l.status === "moderate").length,
    high: locations.filter((l) => l.status === "high").length,
    critical: locations.filter((l) => l.status === "critical").length,
  };

  const distributionData = [
    { name: "Safe (Under 50% Full)", value: statusCounts.safe, color: "#10b981" },
    { name: "Moderate (50% - 75% Full)", value: statusCounts.moderate, color: "#f59e0b" },
    { name: "High Risk (75% - 90% Full)", value: statusCounts.high, color: "#f97316" },
    { name: "Critical (Over 90% Full)", value: statusCounts.critical, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Crowd Analytics & Reports
            </h2>
            <DemoBadge label="SIMULATED DATA" />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Past crowd patterns, busy hours, and safety data
          </p>
        </div>

        {/* Time Selector */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
          {["Today", "Past 7 Days", "Peak Hours"].map((t) => (
            <button
              key={t}
              onClick={() => setTimeRange(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                timeRange === t
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Summary Scorecards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Peak Crowd Today
          </span>
          <h3 className="text-2xl font-bold text-slate-900 mt-1 font-mono">16,100</h3>
          <p className="text-xs text-slate-500 mt-1">Recorded around 5:00 PM (evening peak)</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Average Response Time
          </span>
          <h3 className="text-2xl font-bold text-emerald-600 mt-1 font-mono">3.8 min</h3>
          <p className="text-xs text-slate-500 mt-1">Time taken to review and act on alerts</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Clear Walkway Rate
          </span>
          <h3 className="text-2xl font-bold text-blue-600 mt-1 font-mono">96.4%</h3>
          <p className="text-xs text-slate-500 mt-1">Percentage of walking paths clear</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Camera System Uptime
          </span>
          <h3 className="text-2xl font-bold text-indigo-600 mt-1 font-mono">99.8%</h3>
          <p className="text-xs text-slate-500 mt-1">All cameras operating normally</p>
        </div>
      </div>

      {/* Chart 1: Historical Crowd Trends Curve */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span>Hourly Crowd Volume (Today vs Last Week)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Compare today's crowd count with last week and safe limits
            </p>
          </div>
          <span className="text-xs text-slate-400">
            Updated hourly
          </span>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={historicalData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="currentDay" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="prevDay" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                tickFormatter={(v) => `${v / 1000}k`}
              />
              <Tooltip content={<TrendTooltip />} />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
              <Area
                name="Today's Crowd"
                type="monotone"
                dataKey="totalCrowd"
                stroke="#2563eb"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#currentDay)"
              />
              <Area
                name="Last Week's Baseline"
                type="monotone"
                dataKey="simulatedPastWeek"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fillOpacity={1}
                fill="url(#prevDay)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row: Location Comparisons & Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Location Comparison Bar Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-blue-600" />
              <span>Crowd Count vs Maximum Capacity by Location</span>
            </h3>
            <p className="text-xs text-slate-500">
              Compare current crowd numbers with safe limits for each location
            </p>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={locationComparisonData}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v) => `${v / 1000}k`}
                />
                <Tooltip content={<BarTooltip />} />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                <Bar name="Current Crowd" dataKey="current" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar name="Max Safe Capacity" dataKey="capacity" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Risk Status Distribution Donut Chart */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-indigo-600" />
              <span>Location Safety Status</span>
            </h3>
            <p className="text-xs text-slate-500">
              Number of locations by crowd level
            </p>
          </div>

          <div className="h-56 w-full flex items-center justify-center relative my-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            {/* Center Donut Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-slate-900 font-mono">
                {locations.length}
              </span>
              <span className="text-[10px] uppercase text-slate-400">
                Locations
              </span>
            </div>
          </div>

          <div className="space-y-1.5 pt-3 border-t border-slate-100 text-xs">
            {distributionData.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-slate-600">{item.name}</span>
                </div>
                <span className="font-bold text-slate-900 font-mono">
                  {item.value} ({Math.round((item.value / locations.length) * 100)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
