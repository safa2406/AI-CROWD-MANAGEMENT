import React from "react";

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  colorScheme = "blue",
  isAlert = false,
}) {
  const colorMap = {
    blue: {
      bg: "bg-blue-50 text-blue-600 border-blue-100",
      accent: "text-blue-600",
      bar: "bg-blue-600",
    },
    amber: {
      bg: "bg-amber-50 text-amber-600 border-amber-100",
      accent: "text-amber-600",
      bar: "bg-amber-500",
    },
    rose: {
      bg: "bg-rose-50 text-rose-600 border-rose-100",
      accent: "text-rose-600",
      bar: "bg-rose-500",
    },
    emerald: {
      bg: "bg-emerald-50 text-emerald-600 border-emerald-100",
      accent: "text-emerald-600",
      bar: "bg-emerald-500",
    },
  };

  const scheme = colorMap[colorScheme] || colorMap.blue;

  return (
    <div
      className={`relative bg-white rounded-xl border p-5 shadow-xs transition-all hover:shadow-md ${
        isAlert
          ? "border-rose-300 ring-1 ring-rose-300/50"
          : "border-slate-200/90"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {title}
          </p>
          <h3 className="mt-2 text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">
            {value}
          </h3>
        </div>
        {Icon && (
          <div className={`p-3 rounded-lg border ${scheme.bg}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100">
        <span className="font-medium">{subtitle}</span>
        {trend && (
          <span
            className={`font-semibold ${
              trend.isPositive ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {trend.text}
          </span>
        )}
      </div>
    </div>
  );
}
