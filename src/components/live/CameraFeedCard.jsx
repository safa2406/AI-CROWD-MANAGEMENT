import React, { useState, useEffect, useRef } from "react";
import { useCrowd } from "../../context/CrowdContext";
import { CAMERA_FEEDS } from "../../data/cameraFeeds";
import { VideoDetectionOverlay } from "./VideoDetectionOverlay";
import { StatusBadge, AlertStatusBadge } from "../common/Badge";
import {
  AlertCircle,
  LayoutGrid,
  Square,
  Maximize2,
  RefreshCw,
  VolumeX,
  Layers,
  Sparkles,
  Eye,
} from "lucide-react";

export function CameraFeedCard() {
  const { locations, selectedCameraId, setSelectedCameraId } = useCrowd();
  const [viewMode, setViewMode] = useState("quad"); // 'quad' (4-grid) | 'single' (focused theater)
  const [streamMode, setStreamMode] = useState("overlay"); // 'overlay' (Dynamic YOLO Overlay) | 'annotated' (Burned-in Stream) | 'raw' (Clean Feed)
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [videoErrors, setVideoErrors] = useState({});
  const [detectedCounts, setDetectedCounts] = useState(() => {
    const initial = {};
    CAMERA_FEEDS.forEach((cam) => {
      initial[cam.id] = cam.detectionData?.timeline?.[0]?.count ?? 0;
    });
    return initial;
  });

  const quadVideoRefs = useRef({});
  const focusVideoRef = useRef(null);

  const activeCamera =
    CAMERA_FEEDS.find((c) => c.id === selectedCameraId) || CAMERA_FEEDS[0];

  const handleVideoError = (camId) => {
    setVideoErrors((prev) => ({ ...prev, [camId]: true }));
  };

  const handleRetryVideo = (camId) => {
    setVideoErrors((prev) => ({ ...prev, [camId]: false }));
  };

  const handleCameraCountChange = (camId, count) => {
    setDetectedCounts((prev) => {
      if (prev[camId] === count) return prev;
      return { ...prev, [camId]: count };
    });
  };

  // Helper to resolve live location data from Django context
  const getLocationForCamera = (cam) => {
    return (
      locations.find(
        (l) =>
          l.numericId === cam.numericLocationId ||
          l.id === cam.displayLocationId ||
          l.name === cam.locationName
      ) || {
        name: cam.locationName,
        currentCount: 0,
        capacity: 1000,
        status: "safe",
        occupancyPercentage: 0,
      }
    );
  };

  const activeLoc = getLocationForCamera(activeCamera);
  const activeDetectedCount = detectedCounts[activeCamera.id] ?? 0;

  const getOccupancyBarColor = (pct) => {
    if (pct >= 90) return "bg-rose-500";
    if (pct >= 75) return "bg-orange-500";
    if (pct >= 50) return "bg-amber-500";
    return "bg-emerald-500";
  };

  // Resolve video URL for camera based on stream mode
  const getVideoSource = (cam) => {
    if (streamMode === "annotated") {
      return cam.annotatedVideoSrc || cam.videoSrc;
    }
    return cam.videoSrc;
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-xl overflow-hidden flex flex-col text-slate-200">
      {/* Top HUD Navigation & Mode Switcher */}
      <div className="px-4 py-3 bg-[#0d162b] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-400 font-mono font-bold text-[10px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            ONLINE
          </div>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-white tracking-wide">
              {viewMode === "single"
                ? `${activeCamera.id}: ${activeCamera.cameraName}`
                : "Live Multi-Camera Matrix (4 Feeds)"}
            </span>
            <span className="hidden md:inline px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950/90 text-blue-300 border border-blue-800">
              PRERECORDED DEMO
            </span>
          </div>
        </div>

        {/* View Controls & Camera Tabs */}
        <div className="flex items-center gap-2">
          {/* Stream Mode Selector */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 px-2 py-1 rounded-lg border border-slate-700 text-[11px]">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <select
              value={streamMode}
              onChange={(e) => setStreamMode(e.target.value)}
              className="bg-transparent text-slate-200 font-medium focus:outline-hidden cursor-pointer"
              title="Select AI Detection Overlay or Video Stream Mode"
            >
              <option value="overlay" className="bg-slate-900 text-white">
                AI Dynamic Overlay
              </option>
              <option value="annotated" className="bg-slate-900 text-white">
                Annotated Video Stream
              </option>
              <option value="raw" className="bg-slate-900 text-white">
                Clean Feed (No AI)
              </option>
            </select>
          </div>

          {/* View Mode Toggle: Quad vs Single */}
          <div className="flex items-center bg-slate-800/90 p-0.5 rounded-lg border border-slate-700">
            <button
              onClick={() => setViewMode("quad")}
              title="Quad View (All 4 Feeds)"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-all ${
                viewMode === "quad"
                  ? "bg-blue-600 text-white font-bold shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">4-Feed Grid</span>
            </button>
            <button
              onClick={() => setViewMode("single")}
              title="Focus View (Single Camera Theater)"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-all ${
                viewMode === "single"
                  ? "bg-blue-600 text-white font-bold shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Square className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Focus View</span>
            </button>
          </div>

          {/* Quick Camera Switcher Pills */}
          <div className="flex items-center gap-1 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700">
            {CAMERA_FEEDS.map((cam) => (
              <button
                key={cam.id}
                onClick={() => {
                  setSelectedCameraId(cam.id);
                  if (viewMode === "quad") setViewMode("single");
                }}
                className={`px-2 py-1 rounded text-[11px] transition-all ${
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
      </div>

      {/* Main Viewport: Quad Grid or Single Focus */}
      {viewMode === "quad" ? (
        /* ======================================================== */
        /* QUAD GRID VIEW: All 4 Camera Cards with Video Playback   */
        /* ======================================================== */
        <div className="p-4 bg-slate-950">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CAMERA_FEEDS.map((cam) => {
              const loc = getLocationForCamera(cam);
              const camCount = detectedCounts[cam.id] ?? 0;
              const occupancy = Math.min(
                100,
                Math.round((loc.currentCount / (loc.capacity || 1000)) * 100)
              );
              const isSelected = selectedCameraId === cam.id;
              const hasError = videoErrors[cam.id];
              const videoSrc = getVideoSource(cam);

              return (
                <div
                  key={cam.id}
                  className={`bg-slate-900 rounded-lg border transition-all overflow-hidden flex flex-col group ${
                    isSelected
                      ? "border-blue-500 shadow-md shadow-blue-950/40"
                      : "border-slate-800 hover:border-slate-700"
                  }`}
                >
                  {/* Card Mini Header */}
                  <div className="px-3 py-2 bg-[#0d162b] border-b border-slate-800/90 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-blue-400">
                        {cam.id}
                      </span>
                      <span className="text-slate-300 font-medium truncate max-w-[150px] sm:max-w-[180px]">
                        {cam.cameraName}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {streamMode === "raw" ? (
                        <span className="text-[10px] text-slate-400 font-mono bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                          AI Inactive
                        </span>
                      ) : (
                        <span className="text-[10px] text-cyan-400 font-mono bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/60">
                          {camCount} People
                        </span>
                      )}
                      <button
                        onClick={() => {
                          setSelectedCameraId(cam.id);
                          setViewMode("single");
                        }}
                        title="Expand to Focus View"
                        className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* HTML5 Video Area with Synchronized AI Overlay */}
                  <div className="relative aspect-video w-full bg-black overflow-hidden flex items-center justify-center">
                    {hasError ? (
                      <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-2">
                          <AlertCircle className="w-5 h-5 text-amber-400" />
                        </div>
                        <p className="text-xs font-semibold text-slate-300">
                          Video Feed Unavailable
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                          {videoSrc}
                        </p>
                        <button
                          onClick={() => handleRetryVideo(cam.id)}
                          className="mt-2.5 px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center gap-1 border border-slate-700"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Retry</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        <video
                          ref={(el) => {
                            if (el) quadVideoRefs.current[cam.id] = el;
                          }}
                          key={`${cam.id}-${streamMode}`}
                          src={videoSrc}
                          autoPlay
                          loop
                          muted
                          playsInline
                          onError={() => handleVideoError(cam.id)}
                          className="w-full h-full object-cover"
                        />

                        {/* Synchronized YOLO Bounding Box & HUD Overlay */}
                        {streamMode !== "raw" && (
                          <VideoDetectionOverlay
                            videoRef={{ current: quadVideoRefs.current[cam.id] }}
                            camera={cam}
                            showBoxes={streamMode === "overlay" && showBoundingBoxes}
                            onPersonCountChange={(count) =>
                              handleCameraCountChange(cam.id, count)
                            }
                            compact={true}
                            hideHudBadges={streamMode === "annotated"}
                          />
                        )}
                      </>
                    )}
                  </div>

                  {/* Card Telemetry Footer */}
                  <div className="p-3 bg-slate-900/90 border-t border-slate-800 text-xs flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-400 font-medium block">
                          Monitored Sector (ID: {cam.numericLocationId}):
                        </span>
                        <span className="font-semibold text-white">
                          {loc.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <StatusBadge status={loc.status} size="sm" />
                        <AlertStatusBadge
                          status={loc.alertInfo?.status || "none"}
                          label={loc.alertInfo?.badgeLabel || "NO ALERTS"}
                          size="sm"
                        />
                      </div>
                    </div>

                    {/* Camera Viewport vs Venue Database Telemetry */}
                    <div className="grid grid-cols-2 gap-2 p-2 bg-slate-950/70 rounded-lg border border-slate-800 text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[10px]">
                          Camera Headcount:
                        </span>
                        {streamMode === "raw" ? (
                          <span className="font-mono font-medium text-slate-400 text-xs">
                            AI Inactive (Feed Only)
                          </span>
                        ) : (
                          <span className="font-mono font-bold text-cyan-400 text-xs">
                            {camCount} in camera view
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">
                          Venue DB Count:
                        </span>
                        <span className="font-mono font-bold text-white text-xs">
                          {loc.currentCount.toLocaleString()} / {loc.capacity.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Venue Capacity Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>Venue Safe Occupancy:</span>
                        <span className="font-mono font-semibold text-slate-200">
                          {occupancy}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${getOccupancyBarColor(
                            occupancy
                          )}`}
                          style={{ width: `${occupancy}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ======================================================== */
        /* SINGLE FOCUS VIEW: Theater Viewport for Selected Camera  */
        /* ======================================================== */
        <div className="flex flex-col bg-slate-950">
          <div className="relative aspect-video w-full bg-black overflow-hidden flex items-center justify-center select-none group">
            {videoErrors[activeCamera.id] ? (
              <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-300">
                <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-3">
                  <AlertCircle className="w-6 h-6 text-amber-400" />
                </div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                  Video Stream Unavailable
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Failed to load video file at{" "}
                  <code className="text-slate-200">
                    {getVideoSource(activeCamera)}
                  </code>
                </p>
                <button
                  onClick={() => handleRetryVideo(activeCamera.id)}
                  className="mt-4 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center gap-1.5 border border-slate-700"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reload Video Stream</span>
                </button>
              </div>
            ) : (
              <>
                <video
                  ref={focusVideoRef}
                  key={`${activeCamera.id}-${streamMode}`}
                  src={getVideoSource(activeCamera)}
                  autoPlay
                  loop
                  muted
                  playsInline
                  onError={() => handleVideoError(activeCamera.id)}
                  className="w-full h-full object-cover"
                />

                {/* Theater-Sized Synchronized AI Bounding Box Overlay */}
                {streamMode !== "raw" && (
                  <VideoDetectionOverlay
                    videoRef={focusVideoRef}
                    camera={activeCamera}
                    showBoxes={streamMode === "overlay" && showBoundingBoxes}
                    onPersonCountChange={(count) =>
                      handleCameraCountChange(activeCamera.id, count)
                    }
                    compact={false}
                    hideHudBadges={streamMode === "annotated"}
                  />
                )}
              </>
            )}
          </div>

          {/* Quick-Select Thumbnail Row Below Focus Player */}
          <div className="p-3 bg-slate-900/95 border-t border-slate-800 flex items-center justify-between gap-3 overflow-x-auto">
            <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap pl-1">
              Select Feed:
            </span>
            <div className="flex items-center gap-2.5">
              {CAMERA_FEEDS.map((cam) => {
                const isSelected = selectedCameraId === cam.id;
                const camCount = detectedCounts[cam.id] ?? 0;
                return (
                  <button
                    key={cam.id}
                    onClick={() => setSelectedCameraId(cam.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                      isSelected
                        ? "bg-blue-600/20 border-blue-500 text-white shadow-xs"
                        : "bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span className="font-mono font-bold">{cam.id}</span>
                    <span className="truncate max-w-[120px]">{cam.cameraName}</span>
                    {streamMode === "raw" ? (
                      <span className="font-mono text-[10px] text-slate-400 font-medium bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                        Feed Only
                      </span>
                    ) : (
                      <span className="font-mono text-[11px] text-cyan-300 font-semibold bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-800/50">
                        {camCount} people
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Control Toolbar Below Video */}
      <div className="px-4 py-3 bg-[#0d162b] border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showBoundingBoxes}
              disabled={streamMode !== "overlay"}
              onChange={(e) => setShowBoundingBoxes(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer disabled:opacity-50"
            />
            <span
              className={`font-medium ${
                streamMode === "overlay" ? "text-slate-300" : "text-slate-500"
              }`}
            >
              Show Person Bounding Boxes
            </span>
          </label>

          <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
            <Sparkles className={`w-3.5 h-3.5 ${streamMode === "raw" ? "text-slate-500" : "text-cyan-400"}`} />
            <span>
              {streamMode === "raw"
                ? "AI Inactive (Clean Feed)"
                : "YOLOv8n CPU Inference Active"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
            <VolumeX className="w-3.5 h-3.5 text-slate-500" />
            <span>Muted Autoplay</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-slate-400 text-[11px] flex-wrap">
          <span>Lens: {activeCamera.lensType}</span>
          <span>•</span>
          <span>
            Sector: <strong className="text-white">{activeLoc.name}</strong>
          </span>
          <span>•</span>
          <div className="inline-flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 uppercase">Crowd:</span>
            <StatusBadge status={activeLoc.status} size="sm" />
            <span className="text-[10px] text-slate-400 uppercase ml-1">Alert:</span>
            <AlertStatusBadge
              status={activeLoc.alertInfo?.status || "none"}
              label={activeLoc.alertInfo?.badgeLabel || "NO ALERTS"}
              size="sm"
            />
          </div>
          <span>•</span>
          <span>
            Selected: <strong className="text-white">{activeCamera.id}</strong> (
            {streamMode === "raw" ? (
              <span className="text-slate-400 font-mono font-medium">
                Feed Only / AI Inactive
              </span>
            ) : (
              <span className="text-cyan-400 font-mono font-bold">
                {activeDetectedCount} people detected
              </span>
            )}
            )
          </span>
        </div>
      </div>

      {/* Technical Architecture Notice */}
      <div className="px-4 py-2.5 bg-slate-950/80 border-t border-slate-900 text-slate-400 text-[11px] leading-relaxed flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-blue-400 shrink-0" />
        <span>
          <strong className="text-slate-200">Prerecorded Demonstration Footage:</strong>{" "}
          Displaying prerecorded venue footage for AI person detection. Person bounding boxes and camera headcounts correspond directly to actual YOLOv8 detections. Location safe capacities and venue risk statuses are synchronized with the Django REST API.
        </span>
      </div>
    </div>
  );
}
