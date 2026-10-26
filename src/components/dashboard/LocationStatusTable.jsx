import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCrowd } from "../../context/CrowdContext";
import { StatusBadge, AlertStatusBadge } from "../common/Badge";
import { Video, ArrowUpRight, TrendingUp, TrendingDown, Activity } from "lucide-react";

export function LocationStatusTable() {
  const { locations, setSelectedCameraId } = useCrowd();
  const navigate = useNavigate();

  // Maintain previous crowd counts and timestamps per location to derive dynamic flow
  const locationHistoryRef = useRef({});
  const [tick, setTick] = useState(0);

  // Periodic interval to settle flow indicator to Steady after count changes
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 2500);

    return () => clearInterval(timer);
  }, []);

  // Compute dynamic flow rates matching Live Camera Feeds logic (without simulated movement when unchanged)
  const flows = useMemo(() => {
    const now = Date.now();
    const result = {};

    locations.forEach((loc) => {
      const id = loc.id;
      const currentCount = Number(loc.currentCount) || 0;
      const history = locationHistoryRef.current[id];

      if (!history) {
        // First observation: record baseline and present a neutral waiting state
        locationHistoryRef.current[id] = {
          prevCount: currentCount,
          lastObservedTime: now,
          lastChangeTime: 0,
          measuredRate: 0,
          measuredDirection: null,
          isInitial: true,
        };

        result[id] = {
          type: "initial",
          direction: "neutral",
          rate: 0,
          text: "Evaluating...",
          isPositive: null,
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
        history.isInitial = false;

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
          !history.isInitial &&
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
          // Count remains unchanged: display Steady (no simulated flow)
          history.isInitial = false;
          result[id] = {
            type: "steady",
            direction: "steady",
            rate: 0,
            text: "Steady",
            isPositive: null,
          };
        }
        history.lastObservedTime = now;
      }
    });

    return result;
  }, [locations, tick]);

  const handleViewFeed = (locationId) => {
    const cameraMap = {
      "LOC-101": "CAM-01",
      "LOC-102": "CAM-02",
      "LOC-105": "CAM-03",
      "LOC-103": "CAM-04",
    };
    if (cameraMap[locationId]) {
      setSelectedCameraId(cameraMap[locationId]);
    }
    navigate("/live");
  };

  const getOccupancyColor = (percentage) => {
    if (percentage >= 90) return "bg-rose-500";
    if (percentage >= 75) return "bg-orange-500";
    if (percentage >= 50) return "bg-amber-500";
    return "bg-emerald-500";
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 tracking-tight">
            Crowd Status by Location
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Current crowd levels, safe limits, and movement rate for each area
          </p>
        </div>

        <button
          onClick={() => navigate("/locations")}
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 self-start sm:self-auto transition-colors"
        >
          <span>View All Locations</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50/80 text-slate-500 uppercase font-mono tracking-wider text-[11px] border-b border-slate-200">
            <tr>
              <th className="py-3 px-4 font-semibold">Location & Area</th>
              <th className="py-3 px-4 font-semibold">Type</th>
              <th className="py-3 px-4 font-semibold">Crowd / Capacity</th>
              <th className="py-3 px-4 font-semibold">Capacity Used</th>
              <th className="py-3 px-4 font-semibold">Crowd Flow</th>
              <th className="py-3 px-4 font-semibold">Crowd Status</th>
              <th className="py-3 px-4 font-semibold">Alert Status</th>
              <th className="py-3 px-4 font-semibold text-right">Camera</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {locations.map((loc) => {
              const occupancyPct = Math.min(
                100,
                Math.round((loc.currentCount / loc.capacity) * 100)
              );
              const flowInfo = flows[loc.id] || {
                type: "steady",
                direction: "steady",
                rate: 0,
                text: "Steady",
                isPositive: null,
              };

              return (
                <tr
                  key={loc.id}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  <td className="py-3.5 px-4 font-medium text-slate-900">
                    <div className="font-semibold text-slate-900">{loc.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {loc.id} • {loc.zone}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium text-[11px]">
                      {loc.type}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono">
                    <span className="font-bold text-slate-900">
                      {loc.currentCount.toLocaleString()}
                    </span>
                    <span className="text-slate-400">
                      {" "}/ {loc.capacity.toLocaleString()} max
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${getOccupancyColor(
                            occupancyPct
                          )}`}
                          style={{ width: `${occupancyPct}%` }}
                        />
                      </div>
                      <span className="font-mono font-semibold text-slate-800 text-[11px]">
                        {occupancyPct}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="text-slate-700 font-medium">{loc.densitySqm}</div>
                    <div
                      className="flex items-center gap-1 text-[11px]"
                      title="Estimated net flow derived from YOLO detection count changes over time (not gate tracking)."
                    >
                      {flowInfo.direction === "inflow" ? (
                        <span className="text-rose-600 flex items-center font-medium">
                          <TrendingUp className="w-3 h-3 mr-0.5" />
                          {flowInfo.text}
                        </span>
                      ) : flowInfo.direction === "outflow" ? (
                        <span className="text-emerald-600 flex items-center font-medium">
                          <TrendingDown className="w-3 h-3 mr-0.5" />
                          {flowInfo.text}
                        </span>
                      ) : flowInfo.type === "initial" ? (
                        <span className="text-slate-500 flex items-center font-medium">
                          <Activity className="w-3 h-3 mr-0.5 text-slate-400 animate-pulse" />
                          Evaluating...
                        </span>
                      ) : (
                        <span className="text-slate-600 flex items-center font-medium">
                          <Activity className="w-3 h-3 mr-0.5 text-slate-400" />
                          Steady
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={loc.status} size="sm" />
                  </td>
                  <td className="py-3.5 px-4">
                    <AlertStatusBadge
                      status={loc.alertInfo?.status || "none"}
                      label={loc.alertInfo?.badgeLabel || "NO ALERTS"}
                      size="sm"
                    />
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => handleViewFeed(loc.id)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 rounded-lg border border-slate-200 transition-colors"
                      title="View camera feed"
                    >
                      <Video className="w-3 h-3" />
                      <span>View</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
