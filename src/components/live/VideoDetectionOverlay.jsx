import React, { useState, useEffect, useRef } from "react";

/**
 * VideoDetectionOverlay
 * Renders real-time, responsive bounding boxes and HUD person counts
 * synchronized with HTML5 video playback using actual YOLOv8 detection metadata.
 */
export function VideoDetectionOverlay({
  videoRef,
  camera,
  showBoxes = true,
  onPersonCountChange,
  compact = false,
  hideHudBadges = false,
}) {
  const [currentBoxes, setCurrentBoxes] = useState([]);
  const [personCount, setPersonCount] = useState(0);
  const [videoTime, setVideoTime] = useState("0.0");
  const [wallClock, setWallClock] = useState("");
  const animFrameRef = useRef(null);
  const lastSecRef = useRef(-1);

  const timeline = camera?.detectionData?.timeline || [];
  const duration = camera?.detectionData?.duration || 25.0;

  // Real-time wall clock ticker
  useEffect(() => {
    const updateWallClock = () => {
      const d = new Date();
      setWallClock(d.toISOString().replace("T", " ").substring(0, 19));
    };
    updateWallClock();
    const interval = setInterval(updateWallClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Frame synchronization loop
  useEffect(() => {
    const video = videoRef?.current;
    if (!video || timeline.length === 0) return;

    const syncDetections = () => {
      if (video && !video.paused && !video.ended) {
        const curTime = video.currentTime % duration;
        const roundedSec = Math.floor(curTime * 10) / 10;

        if (roundedSec !== lastSecRef.current) {
          lastSecRef.current = roundedSec;
          setVideoTime(curTime.toFixed(1));

          // Fast binary/nearest search for closest timeline sample
          let bestSample = timeline[0];
          let minDiff = Math.abs(timeline[0].time - curTime);

          for (let i = 1; i < timeline.length; i++) {
            const diff = Math.abs(timeline[i].time - curTime);
            if (diff < minDiff) {
              minDiff = diff;
              bestSample = timeline[i];
            } else if (timeline[i].time > curTime + 0.5) {
              // Timeline is sorted, early exit
              break;
            }
          }

          if (bestSample) {
            setCurrentBoxes(bestSample.boxes || []);
            setPersonCount(bestSample.count || 0);
            if (onPersonCountChange) {
              onPersonCountChange(bestSample.count || 0);
            }
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(syncDetections);
    };

    animFrameRef.current = requestAnimationFrame(syncDetections);

    // Fallback on timeupdate event
    const handleTimeUpdate = () => {
      if (!video) return;
      const curTime = video.currentTime % duration;
      let bestSample = timeline[0];
      let minDiff = Math.abs(timeline[0].time - curTime);

      for (let i = 1; i < timeline.length; i++) {
        const diff = Math.abs(timeline[i].time - curTime);
        if (diff < minDiff) {
          minDiff = diff;
          bestSample = timeline[i];
        } else if (timeline[i].time > curTime + 0.5) {
          break;
        }
      }

      if (bestSample) {
        setCurrentBoxes(bestSample.boxes || []);
        setPersonCount(bestSample.count || 0);
        if (onPersonCountChange) {
          onPersonCountChange(bestSample.count || 0);
        }
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (video) {
        video.removeEventListener("timeupdate", handleTimeUpdate);
      }
    };
  }, [videoRef, timeline, duration, onPersonCountChange]);

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
      {/* 1. Responsive SVG Bounding Boxes Layer */}
      {showBoxes && currentBoxes.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
        >
          <defs>
            <filter id={`glow-${camera.id}`} x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#22d3ee" floodOpacity="0.6" />
            </filter>
          </defs>

          {currentBoxes.map((box, idx) => {
            const bx = box.x * 1000;
            const by = box.y * 1000;
            const bw = box.w * 1000;
            const bh = box.h * 1000;
            const confPct = Math.round(box.conf * 100);
            const cornerSize = Math.max(8, Math.min(24, Math.min(bw, bh) * 0.25));

            const tagW = compact ? 70 : 85;
            const tagH = compact ? 15 : 19;
            const tagY = Math.max(2, by - tagH - 2);

            return (
              <g key={idx}>
                {/* Translucent Bounding Box Fill & Cyan Border */}
                <rect
                  x={bx}
                  y={by}
                  width={bw}
                  height={bh}
                  fill="rgba(6, 182, 212, 0.12)"
                  stroke="#22d3ee"
                  strokeWidth="2.5"
                  rx="3"
                  filter={`url(#glow-${camera.id})`}
                />

                {/* High-Tech Corner Reticles */}
                {/* Top-Left */}
                <path
                  d={`M ${bx} ${by + cornerSize} L ${bx} ${by} L ${bx + cornerSize} ${by}`}
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  fill="none"
                />
                {/* Top-Right */}
                <path
                  d={`M ${bx + bw - cornerSize} ${by} L ${bx + bw} ${by} L ${bx + bw} ${by + cornerSize}`}
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  fill="none"
                />
                {/* Bottom-Left */}
                <path
                  d={`M ${bx} ${by + bh - cornerSize} L ${bx} ${by + bh} L ${bx + cornerSize} ${by + bh}`}
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  fill="none"
                />
                {/* Bottom-Right */}
                <path
                  d={`M ${bx + bw - cornerSize} ${by + bh} L ${bx + bw} ${by + bh} L ${bx + bw} ${by + bh - cornerSize}`}
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  fill="none"
                />

                {/* Confidence Label Tag */}
                <rect
                  x={bx}
                  y={tagY}
                  width={tagW}
                  height={tagH}
                  fill="#0d162b"
                  stroke="#0891b2"
                  strokeWidth="1"
                  rx="3"
                />
                <text
                  x={bx + (compact ? 4 : 6)}
                  y={tagY + (compact ? 11 : 14)}
                  fill="#38bdf8"
                  fontSize={compact ? "9.5" : "11"}
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  person {confPct}%
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {/* 2. Top-Left CCTV Camera Metadata */}
      {!hideHudBadges && (
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 pointer-events-none">
          <div className="flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-xs px-2 py-0.5 rounded border border-slate-700/60 text-[10px] font-mono text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="font-bold text-white">{camera.id}</span>
            <span className="text-slate-400 hidden sm:inline">•</span>
            <span className="text-slate-300 hidden sm:inline">{camera.cameraName}</span>
          </div>
          <div className="bg-slate-950/75 backdrop-blur-xs px-2 py-0.5 rounded border border-slate-800 text-[9px] font-mono text-slate-400">
            <span>{wallClock}</span>
            <span className="mx-1 text-slate-600">|</span>
            <span>T+{videoTime}s</span>
          </div>
        </div>
      )}

      {/* 3. Top-Right: Prominent "PEOPLE DETECTED" HUD Badge */}
      {!hideHudBadges && (
        <div className="absolute top-2 right-2 z-10 pointer-events-none">
          <div
            className={`flex items-center gap-2 px-2.5 py-1 rounded-lg backdrop-blur-xs shadow-lg transition-all ${
              personCount > 20
                ? "bg-rose-950/90 border border-rose-500/80 text-rose-300 shadow-rose-950/50"
                : personCount > 10
                ? "bg-amber-950/90 border border-amber-500/80 text-amber-300 shadow-amber-950/50"
                : "bg-slate-950/90 border border-cyan-500/80 text-cyan-300 shadow-cyan-950/50"
            }`}
          >
            <div className="flex flex-col items-end">
              <span className="text-[9px] uppercase tracking-wider font-mono font-semibold text-slate-300">
                People Detected
              </span>
              <span
                className={`font-mono font-black tracking-tight leading-none ${
                  compact ? "text-base" : "text-xl"
                }`}
              >
                {personCount}
              </span>
            </div>
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                personCount > 20
                  ? "bg-rose-400 animate-ping"
                  : personCount > 10
                  ? "bg-amber-400 animate-pulse"
                  : "bg-cyan-400 animate-pulse"
              }`}
            />
          </div>
        </div>
      )}

      {/* 4. Bottom-Left & Bottom-Right System Indicators */}
      {!hideHudBadges && (
        <>
          <div className="absolute bottom-2 left-2 z-10 flex items-center gap-2 pointer-events-none">
            <div className="bg-slate-950/85 backdrop-blur-xs px-2 py-0.5 rounded border border-cyan-500/40 text-[9px] font-mono text-cyan-300 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>YOLOv8n (CPU Inference)</span>
            </div>
          </div>

          <div className="absolute bottom-2 right-2 z-10 pointer-events-none">
            <div className="bg-slate-950/85 backdrop-blur-xs px-2 py-0.5 rounded border border-slate-700 text-[9px] font-mono text-slate-400">
              PRERECORDED DEMO
            </div>
          </div>
        </>
      )}
    </div>
  );
}
