import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, Bell, ShieldAlert, Clock } from "lucide-react";
import { useCrowd } from "../../context/CrowdContext";
import { DemoBadge } from "../common/Badge";

export function Header({ onOpenSidebar }) {
  const location = useLocation();
  const { activeAlertsCount, highRiskLocationsCount, dataSourceMode, error } = useCrowd();
  const [timeStr, setTimeStr] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const getPageTitle = (pathname) => {
    switch (pathname) {
      case "/":
        return {
          title: "Crowd Safety Dashboard",
          subtitle: "Real-time crowd numbers and safety alerts",
        };
      case "/live":
        return {
          title: "Live Camera Feeds",
          subtitle: "View live cameras and crowd detection boxes",
        };
      case "/locations":
        return {
          title: "Monitored Locations",
          subtitle: "Check crowd capacity and status for each area",
        };
      case "/alerts":
        return {
          title: "Safety Alerts",
          subtitle: "Review crowd warnings and take quick action",
        };
      case "/analytics":
        return {
          title: "Crowd Analytics & Reports",
          subtitle: "Past crowd patterns, busy hours, and safety data",
        };
      default:
        return {
          title: "Crowd Safety Management",
          subtitle: "Control Operations",
        };
    }
  };

  const pageMeta = getPageTitle(location.pathname);

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 lg:hidden focus:outline-hidden"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            {pageMeta.title}
          </h1>
          <p className="hidden sm:block text-xs text-slate-500 font-medium">
            {pageMeta.subtitle}
          </p>
        </div>
      </div>

      {/* Right: Live Time, Alert bell, Demo badge */}
      <div className="flex items-center gap-2.5 sm:gap-4">
        {/* Dynamic Data Source Indicator */}
        <DemoBadge
          variant={
            dataSourceMode === "backend"
              ? "backend"
              : dataSourceMode === "error" || error
              ? "error"
              : "demo"
          }
          label={
            dataSourceMode === "backend"
              ? "DJANGO BACKEND DATA"
              : dataSourceMode === "error" || error
              ? "BACKEND OFFLINE (DEMO)"
              : "SIMULATED DEMO DATA"
          }
        />

        {/* Live Clock */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-lg text-slate-700 font-mono text-xs border border-slate-200">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span>{timeStr || "00:00:00"}</span>
          <span className="text-[10px] text-slate-400 font-sans">LIVE</span>
        </div>

        {/* High Risk locations pill if any */}
        {highRiskLocationsCount > 0 && (
          <Link
            to="/locations"
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 text-xs font-semibold hover:bg-orange-100 transition-colors"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-orange-600" />
            <span>{highRiskLocationsCount} Busy Areas</span>
          </Link>
        )}

        {/* Alert Bell Button */}
        <Link
          to="/alerts"
          className="relative p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors border border-slate-200/80"
          aria-label="View Active Alerts"
        >
          <Bell className="w-5 h-5" />
          {activeAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow-xs animate-pulse">
              {activeAlertsCount}
            </span>
          )}
        </Link>

        {/* Operator Profile pill */}
        <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center shadow-xs">
            OP
          </div>
          <div className="text-left text-xs">
            <span className="block font-semibold text-slate-800 leading-none">
              Safety Operator
            </span>
            <span className="text-[10px] text-slate-500">Station #1</span>
          </div>
        </div>
      </div>
    </header>
  );
}
