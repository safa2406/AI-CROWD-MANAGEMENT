import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle, ArrowRight } from "lucide-react";
import { useCrowd } from "../../context/CrowdContext";
import { SeverityBadge, AlertStatusBadge } from "../common/Badge";

export function RecentAlertsList() {
  const { alerts, acknowledgeAlert } = useCrowd();

  // Show active and acknowledged first, top 4
  const displayAlerts = [...alerts]
    .sort((a, b) => {
      const order = { active: 1, acknowledged: 2, resolved: 3 };
      return (order[a.status] || 4) - (order[b.status] || 4);
    })
    .slice(0, 4);

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-rose-50 text-rose-600 border border-rose-100">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Recent Safety Alerts
            </h3>
            <p className="text-xs text-slate-500">Active alerts that need attention</p>
          </div>
        </div>

        <Link
          to="/alerts"
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
        >
          <span>All Alerts</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto">
        {displayAlerts.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            No active alerts. All areas are currently normal.
          </div>
        ) : (
          displayAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3.5 rounded-lg border transition-all text-xs ${
                alert.status === "active"
                  ? alert.severity === "critical"
                    ? "bg-rose-50/50 border-rose-200"
                    : "bg-orange-50/40 border-orange-200"
                  : "bg-slate-50 border-slate-200/80"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <SeverityBadge severity={alert.severity} />
                  <span className="font-semibold text-slate-900">
                    {alert.locationName}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-400 shrink-0">
                  {alert.timestamp}
                </span>
              </div>

              <p className="mt-1.5 text-slate-600 line-clamp-2 leading-relaxed">
                {alert.description}
              </p>

              <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between">
                <AlertStatusBadge status={alert.status} />

                {alert.status === "active" && (
                  <button
                    onClick={() => acknowledgeAlert(alert.id)}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-white hover:bg-slate-100 text-slate-800 rounded border border-slate-300 shadow-2xs transition-colors"
                  >
                    Acknowledge
                  </button>
                )}
                {alert.status === "acknowledged" && (
                  <span className="text-[11px] text-blue-700 font-medium">
                    Under Review
                  </span>
                )}
                {alert.status === "resolved" && (
                  <span className="text-[11px] text-emerald-700 font-medium">
                    Resolved & Cleared
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
