import React from "react";

export function StatusBadge({ status, size = "md" }) {
  const normalized = (status || "").toLowerCase();

  const configs = {
    safe: {
      bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dot: "bg-emerald-500",
      label: "Safe",
    },
    low: {
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

export function AlertStatusBadge({ status, size = "md", label, showDot = true }) {
  const norm = (status || "").toLowerCase();
  const styles = {
    active: "bg-rose-50 text-rose-700 border-rose-300",
    acknowledged: "bg-blue-50 text-blue-700 border-blue-200",
    resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    none: "bg-slate-50 text-slate-500 border-slate-200",
  };

  const dots = {
    active: "bg-rose-500 animate-ping",
    acknowledged: "bg-blue-500",
    resolved: "bg-emerald-500",
    none: "bg-slate-400",
  };

  const labels = {
    active: "Active",
    acknowledged: "Under Review",
    resolved: "Resolved",
    none: "No Alerts",
  };

  const displayLabel = label || labels[norm] || status;
  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-xs font-semibold uppercase tracking-wider"
      : "px-2.5 py-0.5 text-xs font-medium";

  return (
    <span
      className={`inline-flex items-center gap-1.5 border rounded-full ${
        styles[norm] || "bg-slate-100 text-slate-700 border-slate-200"
      } ${sizeClasses}`}
    >
      {showDot && dots[norm] && (
        <span className={`w-1.5 h-1.5 rounded-full ${dots[norm]}`} />
      )}
      {displayLabel}
    </span>
  );
}

export function DemoBadge({ label = "DEMO DATA", variant = "auto" }) {
  const isBackend =
    variant === "backend" ||
    (variant === "auto" && label && label.toUpperCase().includes("DJANGO"));

  const isError =
    variant === "error" ||
    (variant === "auto" &&
      label &&
      (label.toUpperCase().includes("OFFLINE") ||
        label.toUpperCase().includes("ERROR") ||
        label.toUpperCase().includes("FAILED")));

  if (isBackend) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 text-[11px] font-mono font-semibold tracking-wider uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 rounded shadow-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 shadow-xs shadow-emerald-400/50" />
        {label}
      </span>
    );
  }

  if (isError) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 text-[11px] font-mono font-semibold tracking-wider uppercase bg-rose-950/80 text-rose-300 border border-rose-500/40 rounded shadow-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mr-1.5" />
        {label}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium tracking-wider uppercase bg-slate-900/80 text-amber-300 border border-amber-400/40 rounded shadow-xs">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 animate-pulse" />
      {label}
    </span>
  );
}
