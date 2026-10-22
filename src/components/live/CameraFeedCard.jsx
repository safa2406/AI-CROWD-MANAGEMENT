import React, { useState, useEffect } from "react";
import { useCrowd } from "../../context/CrowdContext";
import { Camera, AlertCircle } from "lucide-react";

export function CameraFeedCard() {
  const { cameras, selectedCameraId, setSelectedCameraId } = useCrowd();
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [currentTime, setCurrentTime] = useState("");

  const activeCamera =
    cameras.find((c) => c.id === selectedCameraId) || cameras[0];

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setCurrentTime(
        d.toISOString().replace("T", " ").substring(0, 19)
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-xl overflow-hidden flex flex-col text-slate-200">
      {/* HUD Header */}
      <div className="px-4 py-3 bg-[#0d162b] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-400 font-mono font-bold text-[10px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            LIVE
          </div>
          <span className="font-semibold text-white">
            {activeCamera.cameraName}
          </span>
          <span className="text-slate-400 hidden sm:inline">
            ({activeCamera.locationName})
          </span>
        </div>

        {/* Camera Switcher Pills */}
        <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700">
          <span className="text-[11px] text-slate-400 px-1 hidden md:inline">Select Camera:</span>
          {cameras.map((cam) => (
            <button
              key={cam.id}
              onClick={() => setSelectedCameraId(cam.id)}
              className={`px-2.5 py-1 rounded text-xs transition-all ${
                selectedCameraId === cam.id
                  ? "bg-blue-600 text-white font-bold shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {cam.id}
            </button>
          ))}
        </div>
      </div>

      {/* Synthetic CCTV Viewport Area */}
      <div className="relative aspect-video w-full bg-slate-950 overflow-hidden flex items-center justify-center select-none group">
        <div className="absolute inset-0 bg-radial from-slate-900 via-slate-950 to-black opacity-90" />

        {/* Grid perspective lines */}
        <svg
          className="absolute inset-0 w-full h-full opacity-20 pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <line x1="0" y1="100%" x2="50%" y2="40%" stroke="#38bdf8" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="100%" y1="100%" x2="50%" y2="40%" stroke="#38bdf8" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="25%" y1="100%" x2="50%" y2="40%" stroke="#38bdf8" strokeWidth="0.5" />
          <line x1="75%" y1="100%" x2="50%" y2="40%" stroke="#38bdf8" strokeWidth="0.5" />
          <ellipse cx="50%" cy="40%" rx="30" ry="15" stroke="#38bdf8" strokeWidth="1" fill="none" opacity="0.4" />
          <ellipse cx="50%" cy="65%" rx="180" ry="70" stroke="#38bdf8" strokeWidth="1" fill="none" opacity="0.2" />
        </svg>

        {/* Optional Heatmap Overlay */}
        {showHeatmap && (
          <div className="absolute inset-0 pointer-events-none mix-blend-screen opacity-70 bg-gradient-to-tr from-rose-600/40 via-amber-500/30 to-emerald-500/10 transition-opacity" />
        )}

        {/* Center Simulated CCTV Viewport Graphics */}
        <div className="relative text-center p-6 z-10 max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/30 mx-auto flex items-center justify-center mb-3">
            <Camera className="w-8 h-8 text-blue-400 opacity-90 animate-pulse" />
          </div>
          <h4 className="text-white font-bold tracking-wider text-sm sm:text-base">
            LIVE CAMERA FEED
          </h4>
          <p className="text-xs text-slate-400 mt-1">
            Location: <span className="text-slate-200 font-semibold">{activeCamera.locationName}</span>
          </p>

          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-400/30 text-amber-300 text-xs font-mono">
            <span>⚠</span>
            <span>SIMULATED DEMO FEED</span>
          </div>
        </div>

        {/* Interactive Simulated AI Bounding Boxes */}
        {showBoundingBoxes && (
          <div className="absolute inset-0 pointer-events-none p-4">
            {activeCamera.overlayObjects.map((obj) => (
              <div
                key={obj.id}
                style={{
                  left: `${obj.x}%`,
                  top: `${obj.y}%`,
                  width: `${obj.w}%`,
                  height: `${obj.h}%`,
                }}
                className={`absolute border-2 rounded-xs flex flex-col justify-between transition-all duration-300 ${
                  obj.alert
                    ? "border-rose-500 bg-rose-500/15"
                    : "border-blue-400 bg-blue-500/10"
                }`}
              >
                <div
                  className={`text-[10px] px-1.5 py-0.5 inline-self-start font-semibold rounded-xs ${
                    obj.alert ? "bg-rose-600 text-white" : "bg-blue-600 text-white"
                  }`}
                >
                  {obj.label}
                </div>
                <div className="text-[9px] font-mono p-0.5 text-right text-slate-300">
                  AI Conf: 94%
                </div>
              </div>
            ))}
          </div>
        )}

        {/* HUD Top Left Details */}
        <div className="absolute top-3 left-3 text-[11px] text-slate-300 bg-black/60 backdrop-blur-xs px-2.5 py-1.5 rounded border border-slate-700/60 space-y-0.5 pointer-events-none">
          <div className="flex items-center gap-2 text-emerald-400 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>RECORDING [DEMO]</span>
          </div>
          <div className="font-mono">{currentTime}</div>
          <div className="text-slate-400">Rate: 30 FPS • 1080p</div>
        </div>

        {/* HUD Top Right Telemetry */}
        <div className="absolute top-3 right-3 text-[11px] text-slate-300 bg-black/60 backdrop-blur-xs px-2.5 py-1.5 rounded border border-slate-700/60 text-right space-y-0.5 pointer-events-none">
          <div className="text-blue-400 font-semibold">
            {activeCamera.aiModel}
          </div>
          <div>People in View: <strong className="text-white">{activeCamera.detectionCount}</strong></div>
          <div className="text-amber-300">
            Crowd Level: {activeCamera.densityLevel}
          </div>
        </div>
      </div>

      {/* Control Toolbar Below Video */}
      <div className="px-4 py-3 bg-[#0d162b] border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showBoundingBoxes}
              onChange={(e) => setShowBoundingBoxes(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
            />
            <span className="text-slate-300 font-medium">
              Show Person Detection Boxes
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={(e) => setShowHeatmap(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
            />
            <span className="text-slate-300 font-medium">Show Crowd Heatmap</span>
          </label>
        </div>

        <div className="flex items-center gap-3 text-slate-400 text-[11px]">
          <span>Lens: {activeCamera.lensType}</span>
          <span>•</span>
          <span>Feed Status: Connected</span>
        </div>
      </div>

      {/* Technical Architecture Notice */}
      <div className="px-4 py-2.5 bg-slate-950/80 border-t border-slate-900 text-slate-400 text-[11px] leading-relaxed flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-blue-400 shrink-0" />
        <span>
          <strong className="text-slate-200">Note:</strong>{" "}
          This screen demonstrates live video feeds with AI person-detection boxes. In Phase 2, real CCTV security cameras and Django AI will stream directly into this view.
        </span>
      </div>
    </div>
  );
}
