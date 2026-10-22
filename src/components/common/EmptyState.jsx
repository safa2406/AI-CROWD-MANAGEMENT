import React from "react";
import { SearchX } from "lucide-react";

export function EmptyState({
  title = "No results found",
  description = "Try adjusting your search keywords or active filters to view monitored locations or incidents.",
  actionLabel,
  onAction,
  icon: Icon = SearchX,
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-white rounded-xl border border-dashed border-slate-300">
      <div className="p-3.5 bg-slate-100 rounded-full text-slate-400 mb-3">
        <Icon className="w-8 h-8" />
      </div>
      <h4 className="text-base font-semibold text-slate-800">{title}</h4>
      <p className="mt-1 text-sm text-slate-500 max-w-md">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-4 py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
