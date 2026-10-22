import React from "react";
import { useCrowd } from "../../context/CrowdContext";
import { CheckCircle2, AlertTriangle, Info, AlertOctagon, X } from "lucide-react";

export function ToastContainer() {
  const { toasts, removeToast } = useCrowd();

  if (!toasts.length) return null;

  const iconMap = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />,
    error: <AlertOctagon className="w-5 h-5 text-rose-500 shrink-0" />,
    info: <Info className="w-5 h-5 text-blue-500 shrink-0" />,
  };

  const borderMap = {
    success: "border-emerald-200 bg-emerald-50/95 text-emerald-900",
    warning: "border-amber-200 bg-amber-50/95 text-amber-900",
    error: "border-rose-200 bg-rose-50/95 text-rose-900",
    info: "border-blue-200 bg-blue-50/95 text-blue-900",
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg border shadow-lg backdrop-blur-xs transition-all animate-in slide-in-from-bottom-5 duration-200 ${
            borderMap[toast.type] || borderMap.info
          }`}
        >
          {iconMap[toast.type] || iconMap.info}
          <div className="flex-1 text-xs font-medium leading-relaxed">
            {toast.message}
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
