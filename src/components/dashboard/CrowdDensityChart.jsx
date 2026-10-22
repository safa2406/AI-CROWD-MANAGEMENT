import React, { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useCrowd } from "../../context/CrowdContext";
import { HOURLY_CROWD_TRENDS } from "../../data/mockData";
import { Info, MapPin, Layers } from "lucide-react";

// Tooltip declared outside component to adhere to React compiler rules
const CustomTooltip = ({ active, payload, label, locationName }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const occupancyPct = data.capacity
      ? Math.round((data.crowd / data.capacity) * 100)
      : null;

    return (
      <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-700 text-xs">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-1.5 mb-2">
          <span className="font-semibold text-slate-300 font-mono">{label}</span>
          <span className="text-[11px] text-blue-400 font-medium truncate max-w-[160px]">
            {locationName}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 py-0.5">
          <span className="text-slate-400">Crowd Count:</span>
          <span className="font-bold text-blue-400 font-mono">
            {data.crowd?.toLocaleString()} people
          </span>
        </div>
        {occupancyPct !== null && (
          <div className="flex items-center justify-between gap-4 py-0.5 text-amber-300">
            <span className="text-slate-400">Capacity Used:</span>
            <span className="font-bold font-mono">{occupancyPct}%</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-4 py-0.5">
          <span className="text-slate-400">Safe Limit:</span>
          <span className="font-medium text-emerald-400 font-mono">
            {data.safeLimit?.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 py-0.5">
          <span className="text-slate-400">Critical Limit:</span>
          <span className="font-medium text-rose-400 font-mono">
            {data.peakLimit?.toLocaleString()}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export function CrowdDensityChart() {
  const { locations, hourlyTrends } = useCrowd();
  const [selectedLocationId, setSelectedLocationId] = useState("all");
  const [activeRange, setActiveRange] = useState("Today");

  const selectedLocation = useMemo(() => {
    if (selectedLocationId === "all") return null;
    return locations.find((l) => l.id === selectedLocationId) || null;
  }, [locations, selectedLocationId]);

  // Generate dataset based on selection (Aggregate vs Individual Location)
  const fullData = useMemo(() => {
    if (selectedLocationId === "all" || !selectedLocation) {
      const sourceTrends =
        hourlyTrends && hourlyTrends.length > 0
          ? hourlyTrends
          : HOURLY_CROWD_TRENDS;

      return sourceTrends.map((item) => ({
        time: item.time,
        crowd: item.totalCrowd ?? item.total_crowd,
        safeLimit: item.safeLimit ?? item.safe_limit ?? 19800,
        peakLimit: item.peakLimit ?? item.peak_limit ?? 22770,
        capacity: item.capacity || 19800,
      }));
    }

    const typeFactors = {
      "Transit Station": [0.45, 0.85, 0.7, 0.62, 0.75, 0.78, 0.72, 0.8, 0.88, 0.95, 0.92, 0.68, 0.45, 0.3],
      "Stadium Entrance": [0.2, 0.3, 0.45, 0.5, 0.65, 0.82, 0.85, 0.8, 0.88, 0.75, 0.6, 0.4, 0.25, 0.15],
      "Stadium Walkway": [0.15, 0.25, 0.35, 0.45, 0.6, 0.75, 0.8, 0.85, 0.9, 0.82, 0.7, 0.45, 0.25, 0.15],
      "Public Plaza": [0.2, 0.3, 0.4, 0.5, 0.65, 0.7, 0.68, 0.6, 0.65, 0.72, 0.68, 0.55, 0.4, 0.25],
      "Footbridge": [0.3, 0.6, 0.5, 0.45, 0.55, 0.6, 0.52, 0.48, 0.62, 0.7, 0.65, 0.45, 0.3, 0.2],
    };

    const defaultFactors = [0.25, 0.45, 0.65, 0.6, 0.75, 0.8, 0.72, 0.74, 0.85, 0.94, 0.9, 0.7, 0.5, 0.3];
    const factors = typeFactors[selectedLocation.type] || defaultFactors;

    const targetPeak = Math.max(
      selectedLocation.currentCount,
      Math.round(selectedLocation.capacity * 0.85)
    );
    const maxFactor = Math.max(...factors);
    const scale = targetPeak / maxFactor;

    const safeLimit = Math.round(selectedLocation.capacity * 0.75);
    const peakLimit = Math.round(selectedLocation.capacity * 0.9);

    const times = [
      "08:00", "09:00", "10:00", "11:00", "12:00", "13:00",
      "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00",
    ];

    return times.map((t, idx) => {
      let count = Math.round(factors[idx] * scale);
      if (t === "15:00") {
        count = selectedLocation.currentCount;
      }
      return {
        time: t,
        crowd: Math.min(
          Math.round(selectedLocation.capacity * 1.05),
          Math.max(30, count)
        ),
        safeLimit,
        peakLimit,
        capacity: selectedLocation.capacity,
      };
    });
  }, [selectedLocationId, selectedLocation, hourlyTrends]);

  // Apply time range filter
  const chartData = useMemo(() => {
    if (activeRange === "Peak Hours") {
      return fullData.filter((d) => {
        const hour = parseInt(d.time.split(":")[0], 10);
        return hour >= 11 && hour <= 19;
      });
    }
    return fullData;
  }, [fullData, activeRange]);

  const safeLimit =
    chartData.length > 0 ? chartData[0].safeLimit : 12000;
  const criticalLimit =
    chartData.length > 0 ? chartData[0].peakLimit : 17000;

  const locationLabel = selectedLocation
    ? selectedLocation.name
    : "All Locations (Combined)";

  const formatLimitLabel = (val) => {
    if (val >= 1000) return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`;
    return `${val}`;
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
      {/* Header with Title & Interactive Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Hourly Crowd Trend
            </h3>
            <span
              className={`text-xs px-2 py-0.5 rounded font-medium ${
                selectedLocationId === "all"
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "bg-indigo-50 text-indigo-700 border border-indigo-200"
              }`}
            >
              {selectedLocationId === "all"
                ? "All Locations Combined"
                : `Single Location: ${selectedLocation?.id}`}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {selectedLocationId === "all"
              ? "Total crowd count across all locations compared to safe limits"
              : `Crowd count over time for ${selectedLocation?.name} (${selectedLocation?.zone})`}
          </p>
        </div>

        {/* Dropdown & Time Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Location Selector Dropdown */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
              {selectedLocationId === "all" ? (
                <Layers className="w-3.5 h-3.5 text-blue-600" />
              ) : (
                <MapPin className="w-3.5 h-3.5 text-indigo-600" />
              )}
            </div>
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              className="pl-8 pr-8 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs transition-colors hover:border-slate-400"
            >
              <option value="all">🌐 All Locations (Combined)</option>
              <optgroup label="Select a Location">
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    📍 {loc.name} ({loc.id})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Time Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            {["Today", "Peak Hours", "Full Day"].map((range) => (
              <button
                key={range}
                onClick={() => setActiveRange(range)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  activeRange === range
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recharts Area Container */}
      <div className="h-72 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="crowdGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="time"
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
              tickFormatter={(v) =>
                v >= 1000
                  ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`
                  : `${v}`
              }
              domain={[0, (dataMax) => Math.max(dataMax, criticalLimit) * 1.1]}
            />
            <Tooltip
              content={
                <CustomTooltip locationName={locationLabel} />
              }
            />
            <ReferenceLine
              y={safeLimit}
              stroke="#10b981"
              strokeDasharray="4 4"
              label={{
                value: `Safe Limit (${formatLimitLabel(safeLimit)})`,
                fill: "#059669",
                fontSize: 10,
                position: "insideTopRight",
              }}
            />
            <ReferenceLine
              y={criticalLimit}
              stroke="#f43f5e"
              strokeDasharray="4 4"
              label={{
                value: `Critical Limit (${formatLimitLabel(criticalLimit)})`,
                fill: "#e11d48",
                fontSize: 10,
                position: "insideTopRight",
              }}
            />
            <Area
              type="monotone"
              dataKey="crowd"
              stroke="#2563eb"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#crowdGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend & quick insight */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-blue-600 inline-block" />
            <span className="font-medium text-slate-700">
              {selectedLocationId === "all" ? "Total Crowd" : "Location Crowd"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-emerald-500 inline-block" />
            <span>Safe Limit ({formatLimitLabel(safeLimit)})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-rose-500 inline-block" />
            <span>Critical Overcrowded Limit ({formatLimitLabel(criticalLimit)})</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-slate-400">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>
            {selectedLocationId === "all"
              ? "Busiest time expected around 5:00 PM (rush hour)"
              : `Current crowd: ${selectedLocation?.currentCount.toLocaleString()} / ${selectedLocation?.capacity.toLocaleString()} (${Math.round(
                  ((selectedLocation?.currentCount || 0) /
                    (selectedLocation?.capacity || 1)) *
                    100
                )}% full)`}
          </span>
        </div>
      </div>
    </div>
  );
}
