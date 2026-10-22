import React from "react";

export function StatusBadge({ status, size = "md" }) {
  const normalized = (status || "").toLowerCase();

  const configs = {
    safe: {
      bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dot: "bg-emerald-500",
      label: "Safe",
    },
    moderate: {
      bg: "bg-amber-50 text-amber-700 border-amber-200",
      dot: "bg-amber-500",
      label: "Moderate",
    },
    high: {
      bg: "bg-orange-50 text-orange-700 border-orange-200",
      dot: "bg-orange-500",
      label: "Crowded",
    },
    critical: {
      bg: "bg-rose-50 text-rose-700 border-rose-300",
      dot: "bg-rose-600 animate-ping",
      label: "Overcrowded",
    },
  };

  const current = configs[normalized] || {
    bg: "bg-slate-100 text-slate-700 border-slate-200",
    dot: "bg-slate-400",
    label: status || "Unknown",
  };

  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs font-medium";

  return (
    <span
      className={`inline-flex items-center gap-1.5 border rounded-full font-semibold uppercase tracking-wider ${current.bg} ${sizeClasses}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
      {current.label}
    </span>
  );
}

export function SeverityBadge({ severity }) {
  const norm = (severity || "").toLowerCase();
  const styles = {
    critical: "bg-rose-100 text-rose-800 border-rose-300",
    high: "bg-orange-100 text-orange-800 border-orange-300",
    moderate: "bg-amber-100 text-amber-800 border-amber-300",
    low: "bg-blue-100 text-blue-800 border-blue-300",
  };

  return (
    <span
      className={`inline-block px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider rounded-md border ${
        styles[norm] || "bg-slate-100 text-slate-700 border-slate-200"
      }`}
    >
      {severity}
    </span>
  );
}

export function AlertStatusBadge({ status }) {
  const norm = (status || "").toLowerCase();
  const styles = {
    active: "bg-rose-50 text-rose-700 border-rose-300",
    acknowledged: "bg-blue-50 text-blue-700 border-blue-200",
    resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };

  const labels = {
    active: "Active",
    acknowledged: "Under Review",
    resolved: "Resolved",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full border ${
        styles[norm] || "bg-slate-100 text-slate-700 border-slate-200"
      }`}
    >
      {labels[norm] || status}
    </span>
  );
}

export function DemoBadge({ label = "DEMO DATA" }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium tracking-wider uppercase bg-slate-900/80 text-amber-300 border border-amber-400/40 rounded shadow-xs">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 animate-pulse" />
      {label}
    </span>
  );
}
