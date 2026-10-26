import React, { useState, useEffect, useRef, useMemo } from "react";
import { useCrowd } from "../context/CrowdContext";
import { CameraFeedCard } from "../components/live/CameraFeedCard";
import { StatusBadge, AlertStatusBadge, DemoBadge } from "../components/common/Badge";
import {
  Video,
  TrendingUp,
  TrendingDown,
  Camera,
  Activity,
} from "lucide-react";

export function LiveMonitoringPage() {
  const { locations, setSelectedCameraId } = useCrowd();

  // Maintain previous crowd counts and timestamps per location to derive dynamic flow
  const locationHistoryRef = useRef({});
  const [demoTick, setDemoTick] = useState(0);

  // Subtle demonstration interval when counts are unchanged (cleans up on unmount)
  useEffect(() => {
    const timer = setInterval(() => {
      setDemoTick((t) => t + 1);
    }, 2500);

    return () => clearInterval(timer);
  }, []);

  // Compute dynamic flow rates: measured from count changes when active, subtle demo flow when steady
  const flows = useMemo(() => {
    const now = Date.now();
    const result = {};

    locations.forEach((loc) => {
      const id = loc.id;
      const currentCount = Number(loc.currentCount) || 0;
      const history = locationHistoryRef.current[id];

      if (!history) {
        // Initial baseline capture
        locationHistoryRef.current[id] = {
          prevCount: currentCount,
          lastObservedTime: now,
          lastChangeTime: 0,
          measuredRate: 0,
          measuredDirection: null,
        };

        const baseRate = Math.max(3, Math.min(15, Math.round(loc.capacity * 0.04)));
        result[id] = {
          type: "demo",
          direction: "inflow",
          rate: baseRate,
          text: `+${baseRate}/min entering`,
          isPositive: true,
        };
        return;
      }

      const timeDeltaSec = Math.max(1, (now - history.lastObservedTime) / 1000);
      const countDelta = currentCount - history.prevCount;

      if (countDelta !== 0) {
        // Real measured change from YOLO / backend
        const rawRate = Math.round((Math.abs(countDelta) / timeDeltaSec) * 60);
        const boundedRate = Math.min(80, Math.max(4, rawRate));
        const direction = countDelta > 0 ? "inflow" : "outflow";

        history.prevCount = currentCount;
        history.lastObservedTime = now;
        history.lastChangeTime = now;
        history.measuredRate = boundedRate;
        history.measuredDirection = direction;

        result[id] = {
          type: "measured",
          direction,
          rate: boundedRate,
          text:
            direction === "inflow"
              ? `+${boundedRate}/min net inflow`
              : `-${boundedRate}/min net outflow`,
          isPositive: direction === "inflow",
        };
      } else {
        // Count is unchanged
        const secondsSinceChange = (now - history.lastChangeTime) / 1000;

        // Briefly retain real measured direction if change occurred recently (< 6 seconds)
        if (
          history.lastChangeTime > 0 &&
          secondsSinceChange < 6 &&
          history.measuredDirection
        ) {
          result[id] = {
            type: "measured",
            direction: history.measuredDirection,
            rate: history.measuredRate,
            text:
              history.measuredDirection === "inflow"
                ? `+${history.measuredRate}/min net inflow`
                : `-${history.measuredRate}/min net outflow`,
            isPositive: history.measuredDirection === "inflow",
          };
        } else {
          // Unchanged count: subtle demonstration oscillation (phase-offset per location)
          const numericId =
            loc.numericId || parseInt(id.replace(/\D/g, ""), 10) || 1;
          const phase = demoTick * 0.7 + numericId * 1.5;
          const wave = Math.sin(phase);

          const capScale = Math.max(
            3,
            Math.min(12, Math.round(loc.capacity * 0.03))
          );
          const demoRate = Math.max(
            2,
            Math.round(capScale * (0.6 + 0.4 * Math.abs(wave)))
          );

          if (wave > 0.2) {
            result[id] = {
              type: "demo",
              direction: "inflow",
              rate: demoRate,
              text: `+${demoRate}/min entering`,
              isPositive: true,
            };
          } else if (wave < -0.2) {
            result[id] = {
              type: "demo",
              direction: "outflow",
              rate: demoRate,
              text: `-${demoRate}/min leaving`,
              isPositive: false,
            };
          } else {
            result[id] = {
              type: "demo",
              direction: "steady",
              rate: 0,
              text: "Steady",
              isPositive: null,
            };
          }
        }
        history.lastObservedTime = now;
      }
    });

    return result;
  }, [locations, demoTick]);

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
            <DemoBadge label="PRERECORDED DEMO FEEDS" />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Watch 4 prerecorded camera feeds with AI detection and check real-time crowd levels at each location
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
            const flowInfo = flows[loc.id] || {
              type: "demo",
              direction: "steady",
              rate: 0,
              text: "Steady",
              isPositive: null,
            };
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
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-medium uppercase">Crowd:</span>
                        <StatusBadge status={loc.status} size="sm" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-medium uppercase">Alert:</span>
                        <AlertStatusBadge
                          status={loc.alertInfo?.status || "none"}
                          label={loc.alertInfo?.badgeLabel || "NO ALERTS"}
                          size="sm"
                        />
                      </div>
                    </div>
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
                    <div
                      className="flex items-center gap-1 text-[11px]"
                      title="Estimated net flow derived from YOLO detection count changes over time (not gate tracking)."
                    >
                      <span>Flow:</span>
                      {flowInfo.direction === "inflow" ? (
                        <span
                          className={`font-semibold flex items-center ${
                            flowInfo.type === "measured"
                              ? "text-rose-600"
                              : "text-rose-600/90"
                          }`}
                        >
                          <TrendingUp className="w-3 h-3 mr-0.5" />
                          {flowInfo.text}
                        </span>
                      ) : flowInfo.direction === "outflow" ? (
                        <span
                          className={`font-semibold flex items-center ${
                            flowInfo.type === "measured"
                              ? "text-emerald-600"
                              : "text-emerald-600/90"
                          }`}
                        >
                          <TrendingDown className="w-3 h-3 mr-0.5" />
                          {flowInfo.text}
                        </span>
                      ) : (
                        <span className="text-slate-600 font-medium flex items-center">
                          <Activity className="w-3 h-3 mr-0.5 text-slate-400" />
                          {flowInfo.text}
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
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-slate-500">
                      Crowd: <strong className="text-slate-700 uppercase">{loc.status === "low" ? "SAFE" : loc.status}</strong>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-500">
                      Alert: <strong className="text-slate-700 uppercase">{loc.alertInfo?.label || "No Alerts"}</strong>
                    </span>
                  </div>

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
