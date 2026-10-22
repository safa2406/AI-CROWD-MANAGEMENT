import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ToastContainer } from "../common/Toast";

export function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased text-slate-800">
      {/* Dark Navy Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Workspace */}
      <div className="lg:pl-64 flex flex-col min-h-screen flex-1">
        <Header onOpenSidebar={() => setIsSidebarOpen(true)} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>

        {/* Global Toast Container */}
        <ToastContainer />

        {/* System Footer */}
        <footer className="py-3 px-6 border-t border-slate-200 bg-white text-slate-400 text-xs flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600">
              Crowd Safety Management System
            </span>
            <span>•</span>
            <span>Phase 1 (React Frontend)</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400 text-[11px]">
            <span>CAMERA FEEDS: DEMO MODE</span>
            <span>•</span>
            <span>SYSTEM STATUS: NORMAL</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
