import React, { useState } from "react";
import { Modal } from "../common/Modal";
import { useCrowd } from "../../context/CrowdContext";
import { LOCATION_TYPE_OPTIONS } from "../../data/mockData";
import { PlusCircle } from "lucide-react";

export function AddLocationModal({ isOpen, onClose }) {
  const { addLocation } = useCrowd();

  const [formData, setFormData] = useState({
    name: "",
    type: "Transit Station",
    zone: "",
    capacity: 2500,
    currentCount: 800,
    cameraCount: 4,
  });

  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = "Location name is required";
    if (!formData.zone.trim()) errs.zone = "Area or zone is required";
    if (Number(formData.capacity) <= 0)
      errs.capacity = "Safe capacity must be greater than 0";
    if (Number(formData.currentCount) < 0)
      errs.currentCount = "Current count cannot be negative";
    return errs;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    addLocation(formData);
    setFormData({
      name: "",
      type: "Transit Station",
      zone: "",
      capacity: 2500,
      currentCount: 800,
      cameraCount: 4,
    });
    setErrors({});
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Monitored Location">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Location Name *
          </label>
          <input
            type="text"
            placeholder="e.g. South Metro Tunnel Link"
            value={formData.name}
            onChange={(e) =>
              setFormData({ ...formData, name: e.target.value })
            }
            className={`w-full px-3 py-2 text-xs rounded-lg border bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
              errors.name ? "border-rose-400 bg-rose-50/20" : "border-slate-300"
            }`}
          />
          {errors.name && (
            <p className="mt-1 text-[11px] text-rose-600">{errors.name}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Location Type
            </label>
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData({ ...formData, type: e.target.value })
              }
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              {LOCATION_TYPE_OPTIONS.filter((t) => t !== "All Types").map(
                (opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                )
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Area / Zone *
            </label>
            <input
              type="text"
              placeholder="e.g. Zone D - Concourse"
              value={formData.zone}
              onChange={(e) =>
                setFormData({ ...formData, zone: e.target.value })
              }
              className={`w-full px-3 py-2 text-xs rounded-lg border bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
                errors.zone ? "border-rose-400 bg-rose-50/20" : "border-slate-300"
              }`}
            />
            {errors.zone && (
              <p className="mt-1 text-[11px] text-rose-600">{errors.zone}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Max Safe Capacity *
            </label>
            <input
              type="number"
              min="100"
              value={formData.capacity}
              onChange={(e) =>
                setFormData({ ...formData, capacity: e.target.value })
              }
              className={`w-full px-3 py-2 text-xs rounded-lg border bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
                errors.capacity ? "border-rose-400" : "border-slate-300"
              }`}
            />
            {errors.capacity && (
              <p className="mt-1 text-[11px] text-rose-600">{errors.capacity}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Current Crowd
            </label>
            <input
              type="number"
              min="0"
              value={formData.currentCount}
              onChange={(e) =>
                setFormData({ ...formData, currentCount: e.target.value })
              }
              className={`w-full px-3 py-2 text-xs rounded-lg border bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
                errors.currentCount ? "border-rose-400" : "border-slate-300"
              }`}
            />
            {errors.currentCount && (
              <p className="mt-1 text-[11px] text-rose-600">
                {errors.currentCount}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Number of Cameras
            </label>
            <input
              type="number"
              min="1"
              max="24"
              value={formData.cameraCount}
              onChange={(e) =>
                setFormData({ ...formData, cameraCount: e.target.value })
              }
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add Location</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
