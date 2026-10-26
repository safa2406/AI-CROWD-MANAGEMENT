"""
CrowdGuard — Multi-Camera YOLO Detection & Metadata Generator
Performs YOLOv8 person detection on all four prerecorded camera videos,
exports timestamped bounding-box timeline JSON files for responsive web rendering,
and generates browser-compatible annotated demonstration videos.
Includes camera-specific high-resolution inference for dense crowds (CAM-03, CAM-04).
"""

import os
import sys
import json
import time
import argparse
from pathlib import Path
import cv2
from ultralytics import YOLO

CAMERA_CONFIGS = {
    "CAM-01": {
        "name": "Camera 1 - Street Pathway",
        "location_id": 1,
        "location_name": "Street Pathway",
        "video_path": Path("vision") / "videos" / "crowd_test.mp4",
        "json_out": Path("public") / "detections" / "cam-01.json",
        "annotated_video_out": Path("public") / "videos" / "cam-01-detected.mp4",
        "conf": 0.35,
        "imgsz": 640,
        "iou": 0.70,
    },
    "CAM-02": {
        "name": "Camera 2 - Metro Station Entrance",
        "location_id": 2,
        "location_name": "Central Metro Station",
        "video_path": Path("vision") / "videos" / "cam_02.mp4",
        "json_out": Path("public") / "detections" / "cam-02.json",
        "annotated_video_out": Path("public") / "videos" / "cam-02-detected.mp4",
        "conf": 0.35,
        "imgsz": 640,
        "iou": 0.70,
    },
    "CAM-03": {
        "name": "Camera 3 - Market Square",
        "location_id": 5,
        "location_name": "City Market Square",
        "video_path": Path("vision") / "videos" / "cam_03.mp4",
        "json_out": Path("public") / "detections" / "cam-03.json",
        "annotated_video_out": Path("public") / "videos" / "cam-03-detected.mp4",
        "conf": 0.22,
        "imgsz": 1280,
        "iou": 0.55,
    },
    "CAM-04": {
        "name": "Camera 4 - Railway Station Hall",
        "location_id": 3,
        "location_name": "Railway Station Hall",
        "video_path": Path("vision") / "videos" / "cam_04.mp4",
        "json_out": Path("public") / "detections" / "cam-04.json",
        "annotated_video_out": Path("public") / "videos" / "cam-04-detected.mp4",
        "conf": 0.22,
        "imgsz": 1280,
        "iou": 0.55,
    },
}

DEFAULT_MODEL = Path("vision") / "models" / "yolov8n.pt"
COCO_PERSON_CLASS_ID = 0


def parse_arguments():
    parser = argparse.ArgumentParser(description="Generate YOLO Person Detections & Annotated Feeds")
    parser.add_argument("--camera", type=str, default="all", choices=["CAM-01", "CAM-02", "CAM-03", "CAM-04", "all"])
    parser.add_argument("--conf", type=float, default=None, help="Override detection confidence threshold")
    parser.add_argument("--imgsz", type=int, default=None, help="Override inference image size (e.g. 1280, 960, 640)")
    parser.add_argument("--iou", type=float, default=None, help="Override NMS IoU threshold (e.g. 0.55)")
    parser.add_argument("--sample-fps", type=float, default=2.5, help="Sampling frequency in FPS for timeline")
    parser.add_argument("--export-videos", action="store_true", default=True, help="Render annotated MP4 videos")
    parser.add_argument("--no-export-videos", action="store_false", dest="export_videos")
    return parser.parse_args()


def draw_hud_banner(frame, person_count, cam_id, cam_name, time_sec, fps, imgsz, conf):
    """Draw a clean HUD overlay banner matching CrowdGuard UI design."""
    h, w = frame.shape[:2]
    banner_height = max(44, int(h * 0.09))
    
    # Semi-transparent dark banner overlay at top
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, banner_height), (13, 22, 43), -1)
    cv2.addWeighted(overlay, 0.85, frame, 0.15, 0, frame)
    cv2.line(frame, (0, banner_height), (w, banner_height), (51, 65, 85), 1)

    # Left: Camera ID & Tag
    cv2.putText(
        frame,
        f"{cam_id} | {cam_name}",
        (14, int(banner_height * 0.45)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.48,
        (203, 213, 225),
        1,
        cv2.LINE_AA,
    )

    # Left sub: People Count
    count_str = f"PEOPLE DETECTED: {person_count}"
    cv2.putText(
        frame,
        count_str,
        (14, int(banner_height * 0.85)),
        cv2.FONT_HERSHEY_DUPLEX,
        0.65,
        (56, 189, 248),  # Sky blue accent
        2,
        cv2.LINE_AA,
    )

    # Right: Telemetry
    telemetry = f"T+{time_sec:.1f}s | YOLOv8n (CPU @ {imgsz}px, c={conf:.2f})"
    t_size = cv2.getTextSize(telemetry, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)[0]
    cv2.putText(
        frame,
        telemetry,
        (w - t_size[0] - 16, int(banner_height * 0.45)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.42,
        (148, 163, 184),
        1,
        cv2.LINE_AA,
    )

    demo_tag = "REC [PRERECORDED DEMO]"
    d_size = cv2.getTextSize(demo_tag, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)[0]
    cv2.putText(
        frame,
        demo_tag,
        (w - d_size[0] - 16, int(banner_height * 0.85)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.42,
        (52, 211, 153),  # Emerald-400
        1,
        cv2.LINE_AA,
    )


def draw_bounding_boxes(frame, boxes):
    """Draw bounding boxes and confidence labels over detected people."""
    h, w = frame.shape[:2]
    for box in boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        conf = float(box.conf[0])

        # Clamp coordinates
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)

        # Cyan bounding box
        box_color = (246, 189, 56)  # BGR cyan/blue (rgb: 56, 189, 246)
        cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)

        # Corner reticles
        reticle_len = max(5, int(min(x2 - x1, y2 - y1) * 0.25))
        cv2.line(frame, (x1, y1), (x1 + reticle_len, y1), (255, 255, 255), 2)
        cv2.line(frame, (x1, y1), (x1, y1 + reticle_len), (255, 255, 255), 2)
        cv2.line(frame, (x2, y1), (x2 - reticle_len, y1), (255, 255, 255), 2)
        cv2.line(frame, (x2, y1), (x2, y1 + reticle_len), (255, 255, 255), 2)
        cv2.line(frame, (x1, y2), (x1 + reticle_len, y2), (255, 255, 255), 2)
        cv2.line(frame, (x1, y2), (x1, y2 - reticle_len), (255, 255, 255), 2)
        cv2.line(frame, (x2, y2), (x2 - reticle_len, y2), (255, 255, 255), 2)
        cv2.line(frame, (x2, y2), (x2, y2 - reticle_len), (255, 255, 255), 2)

        # Label tag
        label = f"person {int(conf * 100)}%"
        (lbl_w, lbl_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.38, 1)
        tag_y1 = max(0, y1 - lbl_h - 5)
        cv2.rectangle(frame, (x1, tag_y1), (x1 + lbl_w + 5, tag_y1 + lbl_h + 5), (13, 22, 43), -1)
        cv2.rectangle(frame, (x1, tag_y1), (x1 + lbl_w + 5, tag_y1 + lbl_h + 5), box_color, 1)
        cv2.putText(
            frame,
            label,
            (x1 + 3, tag_y1 + lbl_h + 2),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.38,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )


def process_camera(cam_id: str, config: dict, model: YOLO, cli_conf: float, cli_imgsz: int, cli_iou: float, sample_fps: float, export_videos: bool):
    video_path = config["video_path"]
    json_out = config["json_out"]
    annotated_video_out = config["annotated_video_out"]

    # Resolve active parameters: CLI override -> camera-specific config -> default
    conf = cli_conf if cli_conf is not None else config.get("conf", 0.35)
    imgsz = cli_imgsz if cli_imgsz is not None else config.get("imgsz", 640)
    iou = cli_iou if cli_iou is not None else config.get("iou", 0.70)

    print(f"\n[{cam_id}] Processing: {video_path}")
    print(f"[{cam_id}] Settings: conf={conf:.2f}, imgsz={imgsz}, iou={iou:.2f}, sample_fps={sample_fps:.1f}")

    if not video_path.exists():
        raise FileNotFoundError(f"Video file missing: {video_path}")

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video {video_path}")

    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0.0

    print(f"[{cam_id}] Native Resolution: {w}x{h} @ {fps:.1f} FPS | Total Frames: {total_frames} ({duration:.1f}s)")

    # Sample stride
    sample_stride = max(1, int(round(fps / sample_fps)))

    # Setup video writer if export requested
    writer = None
    if export_videos:
        annotated_video_out.parent.mkdir(parents=True, exist_ok=True)
        fourcc = cv2.VideoWriter_fourcc(*"H264")
        writer = cv2.VideoWriter(str(annotated_video_out), cv2.CAP_MSMF, fourcc, fps, (w, h))
        if not writer.isOpened():
            fourcc = cv2.VideoWriter_fourcc(*"avc1")
            writer = cv2.VideoWriter(str(annotated_video_out), fourcc, fps, (w, h))
        if not writer.isOpened():
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            writer = cv2.VideoWriter(str(annotated_video_out), fourcc, fps, (w, h))
        if writer.isOpened():
            print(f"[{cam_id}] Annotated video output: {annotated_video_out}")
        else:
            print(f"[{cam_id}] Warning: VideoWriter could not be opened; continuing JSON generation only.")
            writer = None

    timeline = []
    counts = []
    frame_idx = 0
    sampled_idx = 0
    t0 = time.time()

    current_boxes = []
    current_count = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame_idx += 1
        time_sec = round(frame_idx / fps, 2) if fps > 0 else 0.0

        # Run inference if sampled frame or first frame
        if frame_idx == 1 or frame_idx % sample_stride == 0:
            sampled_idx += 1
            results = model.predict(
                frame,
                classes=[COCO_PERSON_CLASS_ID],
                conf=conf,
                imgsz=imgsz,
                iou=iou,
                device="cpu",
                verbose=False,
            )
            detected_boxes = results[0].boxes if len(results) > 0 else []
            current_boxes = detected_boxes
            current_count = len(detected_boxes)
            counts.append(current_count)

            # Store normalized box coordinates
            box_entries = []
            for b in detected_boxes:
                bx1, by1, bx2, by2 = map(float, b.xyxy[0])
                b_conf = round(float(b.conf[0]), 3)
                norm_x = round(bx1 / w, 4)
                norm_y = round(by1 / h, 4)
                norm_w = round((bx2 - bx1) / w, 4)
                norm_h = round((by2 - by1) / h, 4)
                box_entries.append({
                    "x": max(0.0, min(1.0, norm_x)),
                    "y": max(0.0, min(1.0, norm_y)),
                    "w": max(0.0, min(1.0, norm_w)),
                    "h": max(0.0, min(1.0, norm_h)),
                    "conf": b_conf,
                    "label": "person",
                })

            timeline.append({
                "time": time_sec,
                "frame": frame_idx,
                "count": current_count,
                "boxes": box_entries,
            })

        # Write to annotated video if writer is active
        if writer is not None:
            annotated_frame = frame.copy()
            draw_bounding_boxes(annotated_frame, current_boxes)
            draw_hud_banner(
                annotated_frame,
                person_count=current_count,
                cam_id=cam_id,
                cam_name=config["name"],
                time_sec=time_sec,
                fps=fps,
                imgsz=imgsz,
                conf=conf,
            )
            writer.write(annotated_frame)

    cap.release()
    if writer is not None:
        writer.release()

    elapsed = time.time() - t0
    peak_count = max(counts) if counts else 0
    min_count = min(counts) if counts else 0
    avg_count = round(sum(counts) / len(counts), 1) if counts else 0

    # Write timeline JSON metadata
    json_out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "camera_id": cam_id,
        "camera_name": config["name"],
        "location_id": config["location_id"],
        "location_name": config["location_name"],
        "width": w,
        "height": h,
        "fps": fps,
        "total_frames": total_frames,
        "duration": round(duration, 2),
        "sampled_frames": len(timeline),
        "stats": {
            "peak_count": peak_count,
            "min_count": min_count,
            "avg_count": avg_count,
            "sample_fps": sample_fps,
            "conf_threshold": conf,
            "imgsz": imgsz,
            "iou": iou,
        },
        "timeline": timeline,
    }

    with open(json_out, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    # Also save copy in src/data/detections/ for bundled static imports
    src_data_out = Path("src") / "data" / "detections" / f"{cam_id.lower().replace('-', '_')}.json"
    src_data_out.parent.mkdir(parents=True, exist_ok=True)
    with open(src_data_out, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    print(f"[{cam_id}] Complete: {len(timeline)} samples in {elapsed:.1f}s | Peak: {peak_count} | Avg: {avg_count}")
    print(f"[{cam_id}] Saved detection timeline JSON: {json_out} and {src_data_out}")

    return {
        "camera_id": cam_id,
        "location_id": config["location_id"],
        "duration": duration,
        "samples": len(timeline),
        "peak": peak_count,
        "avg": avg_count,
        "elapsed": elapsed,
        "imgsz": imgsz,
        "conf": conf,
    }


def main():
    args = parse_arguments()
    print("=" * 70)
    print(" CROWDGUARD AI — ACCURACY OPTIMIZED DETECTION GENERATOR")
    print("=" * 70)

    if not DEFAULT_MODEL.exists():
        print(f"[Error] YOLO model weights not found at: {DEFAULT_MODEL}", file=sys.stderr)
        sys.exit(1)

    print(f"[Model] Loading YOLO model: {DEFAULT_MODEL} (CPU)...")
    model = YOLO(str(DEFAULT_MODEL))

    cams_to_process = list(CAMERA_CONFIGS.keys()) if args.camera == "all" else [args.camera]
    results = []

    for cam_id in cams_to_process:
        res = process_camera(
            cam_id=cam_id,
            config=CAMERA_CONFIGS[cam_id],
            model=model,
            cli_conf=args.conf,
            cli_imgsz=args.imgsz,
            cli_iou=args.iou,
            sample_fps=args.sample_fps,
            export_videos=args.export_videos,
        )
        results.append(res)

    print("\n" + "=" * 70)
    print(" SUMMARY OF PROCESSED CAMERAS")
    print("=" * 70)
    for r in results:
        print(f" {r['camera_id']} (Loc {r['location_id']}): "
              f"{r['samples']} samples | Peak: {r['peak']} people | Avg: {r['avg']} | "
              f"imgsz={r['imgsz']}, conf={r['conf']} | Elapsed: {r['elapsed']:.1f}s")
    print("=" * 70)


if __name__ == "__main__":
    main()
