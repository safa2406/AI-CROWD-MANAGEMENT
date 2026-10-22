import React, { useState, useMemo } from "react";
import { useCrowd } from "../context/CrowdContext";
import {
  SeverityBadge,
  AlertStatusBadge,
  DemoBadge,
} from "../components/common/Badge";
import { EmptyState } from "../components/common/EmptyState";
import {
  CheckCircle2,
  Clock,
  Search,
  Check,
  ShieldAlert,
} from "lucide-react";

export function AlertsPage() {
  const { alerts, acknowledgeAlert, resolveAlert, dataSourceMode } = useCrowd();

  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const counts = useMemo(() => {
    return {
      all: alerts.length,
      active: alerts.filter((a) => a.status === "active").length,
      acknowledged: alerts.filter((a) => a.status === "acknowledged").length,
      resolved: alerts.filter((a) => a.status === "resolved").length,
    };
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const matchesStatus =
        statusFilter === "all" || alert.status === statusFilter;
      const matchesSeverity =
        severityFilter === "all" || alert.severity === severityFilter;
      const matchesSearch =
        alert.locationName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        alert.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        alert.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        alert.id.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesStatus && matchesSeverity && matchesSearch;
    });
  }, [alerts, statusFilter, severityFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Safety Alerts & Warnings
            </h2>
            <DemoBadge
              variant={dataSourceMode === "backend" ? "backend" : "demo"}
              label={dataSourceMode === "backend" ? "DJANGO BACKEND ALERTS" : "SIMULATED DEMO ALERTS"}
            />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Review crowd alerts, warnings, and take quick safety actions
          </p>
        </div>

        {/* Status Count Pills */}
        <div className="flex items-center gap-2 text-xs">
          <div className="px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span>{counts.active} Active</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 font-semibold">
            {counts.acknowledged} Under Review
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold">
            {counts.resolved} Resolved
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 overflow-x-auto">
          {[
            { id: "all", label: "All Alerts", count: counts.all },
            { id: "active", label: "Active", count: counts.active },
            { id: "acknowledged", label: "Under Review", count: counts.acknowledged },
            { id: "resolved", label: "Resolved", count: counts.resolved },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                statusFilter === tab.id
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  statusFilter === tab.id
                    ? "bg-slate-100 text-slate-700 font-bold"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Severity & Search */}
        <div className="flex items-center gap-2 flex-1 md:max-w-md">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="moderate">Moderate</option>
            <option value="low">Low</option>
          </select>

          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search alerts by keyword or area..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Incident Stream Cards */}
      <div className="space-y-4">
        {filteredAlerts.length === 0 ? (
          <EmptyState
            title="No alerts found"
            description="There are no alerts matching your filter right now."
            actionLabel="View All Alerts"
            onAction={() => {
              setStatusFilter("all");
              setSeverityFilter("all");
              setSearchQuery("");
            }}
          />
        ) : (
          filteredAlerts.map((alert) => {
            const isCritical = alert.severity === "critical";
            const isHigh = alert.severity === "high";

            return (
              <div
                key={alert.id}
                className={`bg-white rounded-xl border p-5 shadow-xs transition-all ${
                  alert.status === "active"
                    ? isCritical
                      ? "border-rose-300 ring-1 ring-rose-200 bg-rose-50/15"
                      : isHigh
                      ? "border-orange-300 bg-orange-50/10"
                      : "border-slate-300"
                    : alert.status === "acknowledged"
                    ? "border-blue-200 bg-blue-50/10"
                    : "border-slate-200 bg-slate-50/50 opacity-90"
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  {/* Left Column: Details */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono text-xs font-bold text-slate-400">
                        {alert.id}
                      </span>
                      <SeverityBadge severity={alert.severity} />
                      <AlertStatusBadge status={alert.status} />
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                        {alert.category}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">
                      {alert.locationName}
                    </h3>

                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                      {alert.description}
                    </p>

                    {/* Protocol Action Box */}
                    {alert.recommendedAction && (
                      <div className="p-3 rounded-lg bg-slate-100/80 border border-slate-200 text-xs text-slate-700 flex items-start gap-2">
                        <ShieldAlert className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-slate-900 block font-semibold">
                            Recommended Action:
                          </strong>
                          <span>{alert.recommendedAction}</span>
                        </div>
                      </div>
                    )}

                    {/* Audit Info */}
                    <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        Reported: {alert.timestamp} ({alert.recordedAt})
                      </span>
                      {alert.acknowledgedBy && (
                        <span>Under review by: {alert.acknowledgedBy}</span>
                      )}
                      {alert.resolvedBy && (
                        <span className="text-emerald-600 font-semibold">
                          Resolved: {alert.resolvedBy}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Interactive Action Buttons */}
                  <div className="flex lg:flex-col items-center lg:items-end gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                    {alert.status === "active" && (
                      <>
                        <button
                          onClick={() => acknowledgeAlert(alert.id)}
                          className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Acknowledge</span>
                        </button>

                        <button
                          onClick={() => resolveAlert(alert.id)}
                          className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark Resolved</span>
                        </button>
                      </>
                    )}

                    {alert.status === "acknowledged" && (
                      <button
                        onClick={() => resolveAlert(alert.id)}
                        className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Mark as Resolved & Cleared</span>
                      </button>
                    )}

                    {alert.status === "resolved" && (
                      <div className="px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200 text-xs font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Resolved & Closed</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
