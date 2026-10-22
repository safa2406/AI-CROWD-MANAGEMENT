import React, { useState, useMemo } from "react";
import { useCrowd } from "../context/CrowdContext";
import { AddLocationModal } from "../components/locations/AddLocationModal";
import { StatusBadge, DemoBadge } from "../components/common/Badge";
import { EmptyState } from "../components/common/EmptyState";
import { LOCATION_TYPE_OPTIONS } from "../data/mockData";
import {
  Search,
  Plus,
  LayoutGrid,
  List,
  Camera,
  TrendingUp,
  TrendingDown,
  X,
} from "lucide-react";

export function LocationsPage() {
  const { locations } = useCrowd();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("All Types");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'table'
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Filtered locations
  const filteredLocations = useMemo(() => {
    return locations.filter((loc) => {
      const matchesSearch =
        loc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        loc.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        loc.zone.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType =
        selectedType === "All Types" || loc.type === selectedType;

      const matchesStatus =
        selectedStatus === "all" || loc.status === selectedStatus;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [locations, searchTerm, selectedType, selectedStatus]);

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedType("All Types");
    setSelectedStatus("all");
  };

  const getOccupancyColor = (pct) => {
    if (pct >= 90) return "bg-rose-500";
    if (pct >= 75) return "bg-orange-500";
    if (pct >= 50) return "bg-amber-500";
    return "bg-emerald-500";
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Monitored Locations
            </h2>
            <DemoBadge label="SIMULATED DATA" />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            View all locations, their crowd capacities, and connected cameras
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Location</span>
        </button>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search location by name, ID, or area..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-300 bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            {LOCATION_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="safe">Safe (Under 50% Full)</option>
            <option value="moderate">Moderate (50% - 75% Full)</option>
            <option value="high">High Risk (75% - 90% Full)</option>
            <option value="critical">Critical (Over 90% Full)</option>
          </select>

          {/* View Toggle */}
          <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-100">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "grid"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-400 hover:text-slate-700"
              }`}
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "table"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-400 hover:text-slate-700"
              }`}
              title="Table view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span>
          Showing <strong>{filteredLocations.length}</strong> of{" "}
          <strong>{locations.length}</strong> locations
        </span>
        {(searchTerm || selectedType !== "All Types" || selectedStatus !== "all") && (
          <button
            onClick={resetFilters}
            className="text-blue-600 hover:text-blue-700 font-semibold"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Results Rendering: Grid or Table */}
      {filteredLocations.length === 0 ? (
        <EmptyState
          title="No locations found"
          description="Try changing your search words or clearing the status filter."
          actionLabel="Clear Filters"
          onAction={resetFilters}
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLocations.map((loc) => {
            const occupancyPct = Math.min(
              100,
              Math.round((loc.currentCount / loc.capacity) * 100)
            );
            const isPositiveFlow = loc.flowRate?.startsWith("+");

            return (
              <div
                key={loc.id}
                className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[11px] text-slate-400 font-mono block">
                        {loc.id}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                        {loc.name}
                      </h4>
                      <p className="text-xs text-slate-500">{loc.zone}</p>
                    </div>
                    <StatusBadge status={loc.status} size="sm" />
                  </div>

                  <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-500 font-medium">Capacity Used</span>
                      <div className="text-xs">
                        <strong className="text-slate-900 font-mono">
                          {loc.currentCount.toLocaleString()}
                        </strong>
                        <span className="text-slate-400">
                          {" "}/ {loc.capacity.toLocaleString()} max
                        </span>
                      </div>
                    </div>

                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${getOccupancyColor(
                          occupancyPct
                        )}`}
                        style={{ width: `${occupancyPct}%` }}
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Fullness: <strong>{occupancyPct}%</strong></span>
                      <span>Density: <strong>{loc.densitySqm}</strong></span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500 text-[11px]">
                    <div className="flex items-center gap-1">
                      <span>Flow:</span>
                      {isPositiveFlow ? (
                        <span className="text-rose-600 font-semibold flex items-center">
                          <TrendingUp className="w-3 h-3 mr-0.5" />
                          {loc.flowRate} entering
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-semibold flex items-center">
                          <TrendingDown className="w-3 h-3 mr-0.5" />
                          {loc.flowRate} leaving
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-slate-400">
                      <Camera className="w-3.5 h-3.5" />
                      <span>{loc.cameraCount} Cameras</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-medium">
                    {loc.type}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Crowd Level: <strong className="text-slate-800">{loc.riskScore}/100</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table Mode */
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-mono tracking-wider text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-semibold">Location</th>
                  <th className="py-3 px-4 font-semibold">Area</th>
                  <th className="py-3 px-4 font-semibold">Type</th>
                  <th className="py-3 px-4 font-semibold">Current Crowd</th>
                  <th className="py-3 px-4 font-semibold">Max Capacity</th>
                  <th className="py-3 px-4 font-semibold">Capacity Used</th>
                  <th className="py-3 px-4 font-semibold">Cameras</th>
                  <th className="py-3 px-4 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLocations.map((loc) => {
                  const occupancyPct = Math.min(
                    100,
                    Math.round((loc.currentCount / loc.capacity) * 100)
                  );
                  return (
                    <tr
                      key={loc.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {loc.name}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {loc.id}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{loc.zone}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px]">
                          {loc.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {loc.currentCount.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">
                        {loc.capacity.toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full ${getOccupancyColor(
                                occupancyPct
                              )}`}
                              style={{ width: `${occupancyPct}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] font-semibold text-slate-700">
                            {occupancyPct}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">
                        {loc.cameraCount}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <StatusBadge status={loc.status} size="sm" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Location Modal */}
      <AddLocationModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </div>
  );
}
