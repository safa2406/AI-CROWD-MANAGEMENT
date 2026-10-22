import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Video,
  MapPin,
  AlertTriangle,
  BarChart3,
  ShieldCheck,
  Radio,
  Zap,
} from "lucide-react";
import { useCrowd } from "../../context/CrowdContext";

export function Sidebar({ isOpen, onClose }) {
  const { activeAlertsCount, simulationActive, setSimulationActive } = useCrowd();

  const navItems = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard },
    { name: "Live Cameras", path: "/live", icon: Video },
    { name: "Locations", path: "/locations", icon: MapPin },
    {
      name: "Alerts",
      path: "/alerts",
      icon: AlertTriangle,
      badge: activeAlertsCount > 0 ? activeAlertsCount : null,
      badgeColor: "bg-rose-500 text-white",
    },
    { name: "Analytics", path: "/analytics", icon: BarChart3 },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-[#090f1d] text-slate-300 border-r border-[#1a2540] flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand / Logo */}
        <div className="h-16 flex items-center px-6 border-b border-[#1a2540] bg-[#0c1427]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-blue-900/40">
              <ShieldCheck className="w-5 h-5 text-blue-100" />
            </div>
            <div>
              <span className="font-bold text-white tracking-tight text-base flex items-center gap-1.5">
                CROWD<span className="text-blue-400 font-medium">GUARD</span>
              </span>
              <span className="block text-[10px] tracking-wider text-slate-400 font-mono uppercase">
                Crowd Safety System
              </span>
            </div>
          </div>
        </div>

        {/* Live Status Chip */}
        <div className="px-5 py-3 border-b border-[#141e36] bg-[#090f1d]">
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#101a33] border border-[#1b2b52]">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs text-slate-300 font-medium">
                System Status
              </span>
            </div>
            <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
              RUNNING
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase font-mono">
            Navigation
          </div>

          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              onClick={() => {
                if (window.innerWidth < 1024) onClose();
              }}
              className={({ isActive }) =>
                `flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-blue-600 text-white shadow-md shadow-blue-900/30 font-semibold"
                    : "text-slate-400 hover:text-slate-100 hover:bg-[#131e38]"
                }`
              }
            >
              <div className="flex items-center gap-3">
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.name}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${item.badgeColor}`}
                >
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Live Simulation Control */}
        <div className="p-4 border-t border-[#1a2540] bg-[#0c1427]/90">
          <div className="rounded-lg p-3 bg-[#111c38] border border-[#1b2b54]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-semibold text-slate-200">
                  Live Demo Movement
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSimulationActive(!simulationActive)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  simulationActive ? "bg-blue-500" : "bg-slate-700"
                }`}
                title={
                  simulationActive
                    ? "Pause simulated data updates"
                    : "Resume simulated data updates"
                }
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    simulationActive ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400 leading-tight">
              {simulationActive
                ? "Simulating continuous changes in crowd numbers"
                : "Simulation paused (crowd counts are frozen)"}
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span>Room: Control A</span>
            <span className="flex items-center gap-1 text-slate-300">
              <Radio className="w-3 h-3 text-emerald-400" /> Connected
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
