import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useCrowd } from "../../context/CrowdContext";
import { crowdApi } from "../../api/client";
import { StatusBadge, AlertStatusBadge } from "../common/Badge";
import {
  Camera,
  Play,
  Square,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  Info,
} from "lucide-react";

export function LiveWebcamViewport() {
  const { locations, addToast } = useCrowd();

  // Webcam state
  const [isRunning, setIsRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [cameraIndex, setCameraIndex] = useState(0);
  const [fps, setFps] = useState(0);
  const [headcount, setHeadcount] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [streamTimestamp, setStreamTimestamp] = useState(Date.now());

  // Demo capacity configuration
  const [demoCapacity, setDemoCapacity] = useState(5);
  const [isEditingCapacity, setIsEditingCapacity] = useState(false);
  const [tempCapacity, setTempCapacity] = useState(5);
  const [isUpdatingCapacity, setIsUpdatingCapacity] = useState(false);

  // Poll status periodically (every 1.5s)
  useEffect(() => {
    let isMounted = true;
    let pollController = null;

    const checkStatus = async () => {
      if (pollController) {
        try {
          pollController.abort();
        } catch {
          // ignore
        }
      }
      pollController = new AbortController();

      try {
        const res = await crowdApi.getWebcamStatus(pollController.signal);
        if (!isMounted || !res) return;

        setIsRunning(Boolean(res.is_running));
        setIsStarting(Boolean(res.is_starting));
        if (res.fps != null) setFps(res.fps);
        if (res.crowd_count != null) setHeadcount(res.crowd_count);
        if (res.error) setErrorMessage(res.error);
        if (res.demo_location && res.demo_location.safe_capacity) {
          setDemoCapacity(res.demo_location.safe_capacity);
          if (!isEditingCapacity) {
            setTempCapacity(res.demo_location.safe_capacity);
          }
        }
      } catch {
        // Backend or webcam runner silent error
      }
    };

    checkStatus();
    const timer = setInterval(checkStatus, 1500);

    return () => {
      isMounted = false;
      if (pollController) {
        try {
          pollController.abort();
        } catch {
          // ignore
        }
      }
      clearInterval(timer);
    };
  }, [isEditingCapacity]);

  // Resolve live demonstration location from global context
  const demoLocation = locations.find(
    (l) => l.name === "Live Demonstration Area" || l.id === "LOC-DEMO"
  ) || {
    id: "LOC-DEMO",
    name: "Live Demonstration Area",
    currentCount: headcount,
    capacity: demoCapacity,
    status: "safe",
    occupancyPercentage: Math.round((headcount / demoCapacity) * 100),
  };

  const effectiveCapacity = demoLocation.capacity || demoCapacity || 5;
  const effectiveCount = isRunning ? headcount : demoLocation.currentCount;
  const occupancyPct = Math.round((effectiveCount / effectiveCapacity) * 100);

  // Start Webcam Handler
  const handleStartWebcam = async () => {
    setIsStarting(true);
    setErrorMessage(null);

    try {
      const res = await crowdApi.startWebcam(cameraIndex);
      if (res && res.success !== false) {
        setIsRunning(true);
        setErrorMessage(null);
        setStreamTimestamp(Date.now());
        addToast("Webcam started successfully. YOLO detection active.", "success");
      } else {
        const msg = (res && (res.error || res.message)) || "Failed to open webcam.";
        setErrorMessage(msg);
        addToast(msg, "error");
      }
    } catch (err) {
      const msg = err.message || "Could not connect to webcam service.";
      setErrorMessage(msg);
      addToast(msg, "error");
    } finally {
      setIsStarting(false);
    }
  };

  // Stop Webcam Handler
  const handleStopWebcam = async () => {
    try {
      await crowdApi.stopWebcam();
      setIsRunning(false);
      setHeadcount(0);
      setFps(0);
      setErrorMessage(null);
      addToast("Webcam stopped and camera resource released.", "info");
    } catch (err) {
      addToast("Error stopping webcam: " + err.message, "error");
    }
  };

  // Save Configured Capacity
  const handleSaveCapacity = async (newVal) => {
    const val = parseInt(newVal, 10);
    if (!val || val <= 0) {
      addToast("Capacity must be a positive number greater than 0.", "error");
      return;
    }

    setIsUpdatingCapacity(true);
    try {
      await crowdApi.configureWebcamCapacity(val);
      setDemoCapacity(val);
      setIsEditingCapacity(false);
      addToast(`Demonstration capacity updated to ${val} people.`, "success");
    } catch (err) {
      addToast("Failed to update capacity: " + err.message, "error");
    } finally {
      setIsUpdatingCapacity(false);
    }
  };

  const getOccupancyBarColor = (pct) => {
    if (pct >= 90) return "bg-rose-500";
    if (pct >= 75) return "bg-orange-500";
    if (pct >= 50) return "bg-amber-500";
    return "bg-emerald-500";
  };

  const feedUrl = `${crowdApi.getWebcamFeedUrl()}?t=${streamTimestamp}`;

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-xl overflow-hidden flex flex-col text-slate-200">
      {/* Top HUD Header & Controls */}
      <div className="px-4 py-3 bg-[#0d162b] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          {/* Status Badge */}
          {isRunning ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/90 border border-emerald-700 text-emerald-300 font-mono font-bold text-[11px]">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE WEBCAM ACTIVE
            </div>
          ) : isStarting ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-950/90 border border-amber-700 text-amber-300 font-mono font-bold text-[11px]">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
              OPENING CAMERA...
            </div>
          ) : errorMessage ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-950/90 border border-rose-700 text-rose-300 font-mono font-bold text-[11px]">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
              CAMERA UNAVAILABLE
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-400 font-mono font-bold text-[11px]">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              CAMERA STANDBY
            </div>
          )}

          <div>
            <span className="font-semibold text-white tracking-wide block sm:inline">
              Laptop Webcam Feed (OpenCV + YOLOv8n)
            </span>
            <span className="text-[11px] text-slate-400 ml-2 hidden md:inline">
              Target: Live Demonstration Area (Capacity: {effectiveCapacity})
            </span>
          </div>
        </div>

        {/* Start / Stop Webcam Actions */}
        <div className="flex items-center gap-2">
          {!isRunning ? (
            <button
              onClick={handleStartWebcam}
              disabled={isStarting}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md ${
                isStarting
                  ? "bg-emerald-800 text-emerald-200 cursor-wait opacity-75"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer active:scale-95"
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isStarting ? "Initializing..." : "Start Webcam"}</span>
            </button>
          ) : (
            <button
              onClick={handleStopWebcam}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop Webcam</span>
            </button>
          )}

          {/* Quick Refresh Status */}
          <button
            onClick={() => setStreamTimestamp(Date.now())}
            title="Refresh stream viewport"
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors border border-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Video Viewport */}
      <div className="relative aspect-video w-full bg-black overflow-hidden flex items-center justify-center select-none">
        {errorMessage && !isRunning ? (
          /* Error State Card */
          <div className="w-full h-full bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center text-slate-300">
            <div className="w-14 h-14 rounded-2xl bg-rose-950/80 border border-rose-700/80 flex items-center justify-center mb-3 text-rose-400 shadow-lg">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">
              Webcam Capture Error
            </h4>
            <p className="text-xs text-rose-300/90 mt-2 max-w-md bg-rose-950/30 p-3 rounded-lg border border-rose-900/40 font-mono">
              {errorMessage}
            </p>
            <p className="text-[11px] text-slate-400 mt-3 max-w-sm">
              {errorMessage && (errorMessage.toLowerCase().includes("zoom") || errorMessage.toLowerCase().includes("permission") || errorMessage.toLowerCase().includes("busy"))
                ? "Please ensure your laptop camera is not in use by another app (Zoom, Teams, Meet) and Windows camera privacy permissions are enabled."
                : "Ensure the CrowdGuard webcam runner service is active on port 8001 (python vision/scripts/webcam_runner.py --port 8001)."}
            </p>
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={handleStartWebcam}
                className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-md transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Webcam</span>
              </button>
              <button
                onClick={() => setErrorMessage(null)}
                className="px-3 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : isRunning ? (
          /* Live Stream Image (MJPEG) */
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            <img
              src={feedUrl}
              alt="Live Laptop Webcam Stream with YOLO Detections"
              onError={() => {
                setErrorMessage("Stream disconnected. The webcam runner may have stopped.");
                setIsRunning(false);
              }}
              className="w-full h-full object-contain"
            />

            {/* Overlaid Live Badges */}
            <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-950/80 border border-slate-700/80 text-white font-mono text-[11px] backdrop-blur-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>LIVE FEED</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-950/80 border border-cyan-800/80 text-cyan-300 font-mono font-bold text-[11px] backdrop-blur-xs">
                <span>{headcount} People Detected</span>
              </div>
            </div>

            <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-none">
              <div className="px-2.5 py-1 rounded-md bg-slate-950/80 border border-slate-700/80 text-slate-300 font-mono text-[11px] backdrop-blur-xs">
                {fps > 0 ? `${fps} FPS` : "Processing"} • YOLOv8n CPU
              </div>
            </div>
          </div>
        ) : (
          /* Standby State */
          <div className="w-full h-full bg-[#0a0f1d] flex flex-col items-center justify-center p-8 text-center text-slate-300">
            <div className="w-16 h-16 rounded-2xl bg-blue-950/60 border border-blue-800/60 flex items-center justify-center mb-4 text-blue-400 shadow-xl shadow-blue-950/30">
              <Camera className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Laptop Webcam Demonstration Ready
            </h3>
            <p className="text-xs text-slate-400 mt-1.5 max-w-md leading-relaxed">
              Click <strong className="text-emerald-400 font-semibold">Start Webcam</strong> to activate your laptop's camera.
              The Python vision module will run the pretrained YOLOv8n model, display bounding boxes around people, and ingest real readings into the Django REST API.
            </p>

            {/* Demonstration Step Card */}
            <div className="mt-5 max-w-lg w-full bg-slate-900/90 border border-slate-800 rounded-xl p-4 text-left shadow-lg">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-200 mb-2.5 pb-2 border-b border-slate-800">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  Jury Review Demonstration Guide (Capacity = {effectiveCapacity})
                </span>
                <span className="font-mono text-[11px] text-blue-400">LOC-DEMO</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/40">
                  <span className="block font-bold text-emerald-400 text-xs">0–3 People</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">0% – 60%</span>
                  <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-900 text-emerald-200">
                    Normal Status
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-orange-950/40 border border-orange-800/40">
                  <span className="block font-bold text-orange-400 text-xs">4 People</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">80% (&ge;75%)</span>
                  <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-900 text-orange-200">
                    High Alert
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-800/40">
                  <span className="block font-bold text-rose-400 text-xs">5+ People</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">&ge;100% (&ge;90%)</span>
                  <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-900 text-rose-200">
                    Critical Alert
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleStartWebcam}
              disabled={isStarting}
              className="mt-5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-950/40 active:scale-95 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isStarting ? "Starting Camera..." : "Start Live Webcam"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Demonstration Telemetry & Config Toolbar */}
      <div className="p-4 bg-slate-900/95 border-t border-slate-800 text-xs flex flex-col gap-3">
        {/* Row 1: Location & Status */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-800/50">
                LOC-DEMO
              </span>
              <span className="font-bold text-white text-sm">
                Live Demonstration Area
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Sector: Zone DEMO - Live Webcam Feed • Monitored by OpenCV Vision Module
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 font-medium uppercase">Safety Status:</span>
              <StatusBadge status={demoLocation.status} size="sm" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 font-medium uppercase">Alert Status:</span>
              <AlertStatusBadge
                status={demoLocation.alertInfo?.status || "none"}
                label={demoLocation.alertInfo?.badgeLabel || (occupancyPct >= 90 ? "CRITICAL ALERT" : occupancyPct >= 75 ? "HIGH ALERT" : "NORMAL")}
                size="sm"
              />
            </div>
          </div>
        </div>

        {/* Row 2: Live Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Metric 1: Headcount */}
          <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 block uppercase font-medium">
              Webcam Detected People
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-mono font-bold text-cyan-400">
                {effectiveCount}
              </span>
              <span className="text-[11px] text-slate-400">people in view</span>
            </div>
          </div>

          {/* Metric 2: Configurable Capacity */}
          <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 block uppercase font-medium">
                Safe Capacity
              </span>
              {!isEditingCapacity ? (
                <button
                  onClick={() => setIsEditingCapacity(true)}
                  className="text-[10px] text-blue-400 hover:text-blue-300 underline cursor-pointer"
                >
                  Configure
                </button>
              ) : null}
            </div>
            {isEditingCapacity ? (
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={tempCapacity}
                  onChange={(e) => setTempCapacity(e.target.value)}
                  className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white font-mono"
                />
                <button
                  onClick={() => handleSaveCapacity(tempCapacity)}
                  disabled={isUpdatingCapacity}
                  className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-bold"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsEditingCapacity(false);
                    setTempCapacity(demoCapacity);
                  }}
                  className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-xl font-mono font-bold text-white">
                  {effectiveCapacity}
                </span>
                <span className="text-[11px] text-slate-400">max capacity</span>
              </div>
            )}
          </div>

          {/* Metric 3: Occupancy Percentage */}
          <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 block uppercase font-medium">
              Demonstration Occupancy
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span
                className={`text-xl font-mono font-bold ${
                  occupancyPct >= 90
                    ? "text-rose-400"
                    : occupancyPct >= 75
                    ? "text-orange-400"
                    : occupancyPct >= 50
                    ? "text-amber-400"
                    : "text-emerald-400"
                }`}
              >
                {occupancyPct}%
              </span>
              <span className="text-[10px] text-slate-400">
                {occupancyPct >= 90 ? "Critical surge" : occupancyPct >= 75 ? "High risk" : "Safe zone"}
              </span>
            </div>
          </div>

          {/* Metric 4: Backend Sync Status */}
          <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 block uppercase font-medium">
              Backend Ingestion
            </span>
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Django DB Synced</span>
              </div>
              <Link
                to="/alerts"
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-[10px] font-semibold transition-colors"
              >
                <span>View Alerts</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Row 3: Occupancy Bar */}
        <div className="space-y-1 mt-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Occupancy Threshold Progress:</span>
            <span className="font-mono font-semibold text-slate-200">
              {effectiveCount} / {effectiveCapacity} people ({occupancyPct}%)
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getOccupancyBarColor(
                occupancyPct
              )}`}
              style={{ width: `${Math.min(100, occupancyPct)}%` }}
            />
          </div>
        </div>

        {/* Row 4: Jury Demonstration Threshold Reference */}
        <div className="p-2.5 bg-blue-950/30 border border-blue-800/40 rounded-lg flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>
              <strong>Threshold Logic:</strong> High at 75% (&ge;4 people at cap 5) &bull; Critical at 90% (&ge;5 people at cap 5) &bull; Critical takes precedence.
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>Camera Device Index:</span>
            <select
              value={cameraIndex}
              disabled={isRunning}
              onChange={(e) => setCameraIndex(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-[10px] rounded px-1.5 py-0.5 focus:outline-hidden disabled:opacity-50 cursor-pointer"
            >
              <option value={0}>Camera 0 (Default Laptop Webcam)</option>
              <option value={1}>Camera 1 (Secondary / External USB)</option>
              <option value={2}>Camera 2</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
