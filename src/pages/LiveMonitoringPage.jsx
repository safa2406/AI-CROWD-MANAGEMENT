import React from "react";
import { useCrowd } from "../context/CrowdContext";
import { CameraFeedCard } from "../components/live/CameraFeedCard";
import { StatusBadge, DemoBadge } from "../components/common/Badge";
import {
  Video,
  TrendingUp,
  TrendingDown,
  Camera,
} from "lucide-react";

export function LiveMonitoringPage() {
  const { locations, setSelectedCameraId } = useCrowd();

  const cameraMap = {
    "LOC-101": "CAM-01",
    "LOC-102": "CAM-02",
    "LOC-105": "CAM-03",
    "LOC-103": "CAM-04",
  };

  const getOccupancyBarColor = (pct) => {
    if (pct >= 90) return "bg-rose-500";
    if (pct >= 75) return "bg-orange-500";
    if (pct >= 50) return "bg-amber-500";
    return "bg-emerald-500";
  };

  return (
    <div className="space-y-6">
      {/* Page Header Notice */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Live Camera Monitoring
            </h2>
            <DemoBadge label="SIMULATED DEMO DATA" />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Watch live camera feeds and check real-time crowd levels at each location
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-medium">4 Active Cameras</span>
        </div>
      </div>

      {/* Dedicated Monitoring Area: Simulated Camera Viewport */}
      <div>
        <CameraFeedCard />
      </div>

      {/* Individual Location Monitoring Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Locations Live Status
            </h3>
            <p className="text-xs text-slate-500">
              Current crowd numbers and capacity bars for each area
            </p>
          </div>
          <span className="text-xs text-slate-500">
            {locations.length} Locations Monitored
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map((loc) => {
            const occupancyPct = Math.min(
              100,
              Math.round((loc.currentCount / loc.capacity) * 100)
            );
            const isPositiveFlow = loc.flowRate?.startsWith("+");
            const hasDedicatedCamera = Boolean(cameraMap[loc.id]);

            return (
              <div
                key={loc.id}
                className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[11px] text-slate-400 font-medium block">
                        {loc.id} • {loc.type}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 mt-0.5 leading-snug">
                        {loc.name}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">{loc.zone}</p>
                    </div>
                    <StatusBadge status={loc.status} size="sm" />
                  </div>

                  {/* Crowd Count & Capacity */}
                  <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-500 font-medium">Estimated Crowd</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-base font-bold text-slate-900 font-mono">
                          {loc.currentCount.toLocaleString()}
                        </span>
                        <span className="text-slate-400 text-xs">
                          / {loc.capacity.toLocaleString()} max
                        </span>
                      </div>
                    </div>

                    {/* Occupancy bar */}
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${getOccupancyBarColor(
                          occupancyPct
                        )}`}
                        style={{ width: `${occupancyPct}%` }}
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Capacity Used: <strong className="text-slate-700">{occupancyPct}%</strong></span>
                      <span>Density: <strong className="text-slate-700">{loc.densitySqm}</strong></span>
                    </div>
                  </div>

                  {/* Telemetry info */}
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-1 text-[11px]">
                      <span>Flow:</span>
                      {isPositiveFlow ? (
                        <span className="text-rose-600 font-semibold flex items-center">
                          <TrendingUp className="w-3 h-3 mr-0.5" />
                          {loc.flowRate} entering
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-semibold flex items-center">
                          <TrendingDown className="w-3 h-3 mr-0.5" />
                          {loc.flowRate} leaving
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Camera className="w-3.5 h-3.5 text-slate-400" />
                      <span>{loc.cameraCount} Camera{loc.cameraCount > 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </div>

                {/* Card Action */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    Status: <strong className="text-slate-600 uppercase">{loc.status}</strong>
                  </span>

                  {hasDedicatedCamera ? (
                    <button
                      onClick={() => {
                        setSelectedCameraId(cameraMap[loc.id]);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 flex items-center gap-1.5 transition-colors"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>View Camera</span>
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400 italic">
                      Camera on standby
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
