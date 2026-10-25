"""
CrowdGuard — Multi-Camera Feed Runner & Django AI Ingestion
Processes prerecorded video feeds with YOLOv8n (CPU inference),
samples frames at configurable FPS, prevents duplicate requests,
and posts actual detected person counts to the Django REST API (POST /api/readings/).
Includes camera-specific high-resolution inference for dense crowds (CAM-03, CAM-04).
"""

import os
import sys
import time
import argparse
from pathlib import Path
import cv2
import requests
from ultralytics import YOLO


CAMERA_CONFIGS = {
    "CAM-01": {
        "name": "Camera 1 - Platform 2 East",
        "location_id": 1,
        "location_name": "Central Metro Interchange",
        "default_video": Path("vision") / "videos" / "crowd_test.mp4",
        "conf": 0.35,
        "imgsz": 640,
        "iou": 0.70,
    },
    "CAM-02": {
        "name": "Camera 2 - Entrance Turnstiles",
        "location_id": 2,
        "location_name": "Stadium Gate A & B Turnstiles",
        "default_video": Path("vision") / "videos" / "cam_02.mp4",
        "conf": 0.35,
        "imgsz": 640,
        "iou": 0.70,
    },
    "CAM-03": {
        "name": "Camera 3 - Concourse Junction",
        "location_id": 5,
        "location_name": "East Grandstand Promenade",
        "default_video": Path("vision") / "videos" / "cam_03.mp4",
        "conf": 0.22,
        "imgsz": 1280,
        "iou": 0.55,
    },
    "CAM-04": {
        "name": "Camera 4 - Departures Hall",
        "location_id": 3,
        "location_name": "North Terminal Concourse",
        "default_video": Path("vision") / "videos" / "cam_04.mp4",
        "conf": 0.22,
        "imgsz": 1280,
        "iou": 0.55,
    },
}

DEFAULT_MODEL_PATH = Path("vision") / "models" / "yolov8n.pt"
DEFAULT_API_URL = "http://127.0.0.1:8000/api/readings/"
COCO_PERSON_CLASS_ID = 0


def parse_arguments():
    parser = argparse.ArgumentParser(
        description="CrowdGuard: Multi-Camera YOLO Feed Runner & Django API Ingestion"
    )
    parser.add_argument(
        "--camera",
        "-c",
        type=str,
        default="all",
        choices=["CAM-01", "CAM-02", "CAM-03", "CAM-04", "all"],
        help="Camera feed to run (default: all)",
    )
    parser.add_argument(
        "--video",
        "-v",
        type=str,
        default=None,
        help="Optional override path to input video file for the selected camera",
    )
    parser.add_argument(
        "--location-id",
        "-l",
        type=int,
        default=None,
        help="Optional override for the database Location ID",
    )
    parser.add_argument(
        "--api-url",
        "-u",
        type=str,
        default=DEFAULT_API_URL,
        help=f"Django API readings endpoint (default: {DEFAULT_API_URL})",
    )
    parser.add_argument(
        "--model",
        "-m",
        type=str,
        default=str(DEFAULT_MODEL_PATH),
        help=f"Path to YOLO model weights (default: {DEFAULT_MODEL_PATH})",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=None,
        help="Override YOLO detection confidence threshold (defaults to camera-specific)",
    )
    parser.add_argument(
        "--imgsz",
        type=int,
        default=None,
        help="Override inference image size (defaults to camera-specific, e.g. 1280 for CAM-03/04)",
    )
    parser.add_argument(
        "--iou",
        type=float,
        default=None,
        help="Override NMS IoU threshold (defaults to camera-specific)",
    )
    parser.add_argument(
        "--sample-fps",
        type=float,
        default=1.5,
        help="Number of video frames to sample per second for inference (default: 1.5)",
    )
    parser.add_argument(
        "--report-interval",
        type=float,
        default=3.0,
        help="Minimum seconds between sending readings to Django (default: 3.0)",
    )
    parser.add_argument(
        "--max-readings",
        type=int,
        default=None,
        help="Optional limit on number of API readings to send per camera",
    )
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Loop prerecorded videos continuously for continuous demonstration",
    )
    parser.add_argument(
        "--skip-duplicates",
        action="store_true",
        default=False,
        help="Suppress posting if detected person count has not changed since last report",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run YOLO detection without sending HTTP POST requests to Django",
    )
    return parser.parse_args()


def validate_video_file(video_path: Path):
    if not video_path.exists():
        raise FileNotFoundError(f"Video file does not exist: '{video_path}'")
    if video_path.stat().st_size == 0:
        raise ValueError(f"Video file is empty (0 bytes): '{video_path}'")


def post_crowd_reading(api_url: str, location_id: int, crowd_count: int, timeout: float = 3.0):
    payload = {
        "location": location_id,
        "crowd_count": crowd_count,
        "data_source": "cctv_ai_detection",
    }
    headers = {"Content-Type": "application/json", "Accept": "application/json"}

    try:
        response = requests.post(api_url, json=payload, headers=headers, timeout=timeout)
        if response.status_code == 201:
            return True, response.json()
        else:
            try:
                err_body = response.json()
            except Exception:
                err_body = response.text
            return False, f"HTTP {response.status_code}: {err_body}"
    except requests.exceptions.ConnectionError:
        return False, f"Could not connect to Django at {api_url}. Verify Django server is running."
    except requests.exceptions.Timeout:
        return False, f"Timeout connecting to Django at {api_url} (>{timeout}s)."
    except Exception as exc:
        return False, f"Network error: {exc}"


def process_camera_feed(
    camera_id: str,
    camera_info: dict,
    video_path: Path,
    location_id: int,
    model: YOLO,
    api_url: str,
    conf_override: float = None,
    imgsz_override: int = None,
    iou_override: float = None,
    sample_fps: float = 1.5,
    report_interval: float = 3.0,
    max_readings: int = None,
    loop: bool = False,
    skip_duplicates: bool = False,
    dry_run: bool = False,
):
    conf_threshold = conf_override if conf_override is not None else camera_info.get("conf", 0.35)
    imgsz = imgsz_override if imgsz_override is not None else camera_info.get("imgsz", 640)
    iou = iou_override if iou_override is not None else camera_info.get("iou", 0.70)

    print("\n" + "=" * 70)
    print(f" PROCESSING CAMERA: {camera_id} — {camera_info['name']}")
    print("=" * 70)
    print(f"Target Location ID   : {location_id} ({camera_info['location_name']})")
    print(f"Input Video File     : {video_path}")
    print(f"Inference Parameters : conf={conf_threshold:.2f}, imgsz={imgsz}, iou={iou:.2f}")
    print(f"Frame Sampling Rate  : ~{sample_fps:.1f} FPS (CPU inference)")
    print(f"API Post Interval    : >= {report_interval:.1f}s")
    print(f"Duplicate Prevention : {'Active' if skip_duplicates else 'Standard'}")
    print(f"Continuous Looping   : {'Yes' if loop else 'No'}")
    print(f"Endpoint             : {api_url} {'[DRY RUN]' if dry_run else ''}")

    validate_video_file(video_path)
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"OpenCV could not open '{video_path}'")

    native_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    video_duration = total_frames / native_fps if native_fps > 0 else 0
    frame_stride = max(1, int(round(native_fps / sample_fps)))

    frame_idx = 0
    sampled_frame_count = 0
    readings_sent = 0
    failed_readings = 0
    duplicates_skipped = 0
    peak_count = 0
    accumulated_people = 0
    last_reported_count = None
    last_report_wall_time = 0.0
    feed_start_time = time.time()

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                if loop:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    frame_idx = 0
                    continue
                else:
                    break

            frame_idx += 1
            if frame_idx % frame_stride != 0:
                continue

            sampled_frame_count += 1
            infer_start = time.time()

            results = model.predict(
                frame,
                classes=[COCO_PERSON_CLASS_ID],
                conf=conf_threshold,
                imgsz=imgsz,
                iou=iou,
                device="cpu",
                verbose=False,
            )

            infer_duration = time.time() - infer_start
            detected_boxes = results[0].boxes if len(results) > 0 else []
            actual_person_count = len(detected_boxes)

            accumulated_people += actual_person_count
            if actual_person_count > peak_count:
                peak_count = actual_person_count

            current_wall_time = time.time()
            elapsed_since_last_report = current_wall_time - last_report_wall_time
            video_time_sec = frame_idx / native_fps if native_fps > 0 else 0

            print(
                f"[{camera_id} @ {video_time_sec:5.1f}s | Frame {frame_idx:4d}/{total_frames}] "
                f"YOLO Headcount: {actual_person_count:2d} people (Infer: {infer_duration*1000:4.0f}ms @ {imgsz}px)"
            )

            # Check cadence
            if elapsed_since_last_report >= report_interval:
                if skip_duplicates and last_reported_count == actual_person_count:
                    duplicates_skipped += 1
                    print(f"  --> [SKIP DUPLICATE] Headcount unchanged ({actual_person_count}); skipping redundant POST")
                    continue

                if dry_run:
                    print(f"  --> [DRY RUN] Would send {actual_person_count} to Location {location_id}")
                    last_report_wall_time = current_wall_time
                    last_reported_count = actual_person_count
                    readings_sent += 1
                else:
                    success, result = post_crowd_reading(
                        api_url=api_url,
                        location_id=location_id,
                        crowd_count=actual_person_count,
                    )
                    last_report_wall_time = current_wall_time

                    if success:
                        readings_sent += 1
                        last_reported_count = actual_person_count
                        occ = result.get("occupancy_percentage", 0.0)
                        print(
                            f"  --> [DJANGO POST 201] Saved Reading #{result.get('id')} | "
                            f"{result.get('location_name')} (ID: {location_id}) | "
                            f"Count: {actual_person_count} | Occupancy: {occ}% | Source: cctv_ai_detection"
                        )
                    else:
                        failed_readings += 1
                        print(f"  --> [DJANGO POST FAILED] {result}")

                if max_readings and readings_sent >= max_readings:
                    print(f"[Info] Reached requested limit of {max_readings} readings for {camera_id}.")
                    break

    finally:
        cap.release()

    total_time = time.time() - feed_start_time
    avg_count = accumulated_people / sampled_frame_count if sampled_frame_count > 0 else 0

    print("-" * 70)
    print(f" SUMMARY FOR {camera_id} ({camera_info['name']}):")
    print(f"  * Sampled Frames (YOLO) : {sampled_frame_count}")
    print(f"  * Successful Posts      : {readings_sent}")
    print(f"  * Failed Posts          : {failed_readings}")
    print(f"  * Duplicates Skipped    : {duplicates_skipped}")
    print(f"  * Peak Detected Count   : {peak_count}")
    print(f"  * Average Count         : {avg_count:.1f}")
    print(f"  * Total Time            : {total_time:.2f}s")
    print("=" * 70)

    return {
        "camera_id": camera_id,
        "location_id": location_id,
        "location_name": camera_info["location_name"],
        "samples": sampled_frame_count,
        "readings_sent": readings_sent,
        "failed_readings": failed_readings,
        "duplicates_skipped": duplicates_skipped,
        "peak_count": peak_count,
        "avg_count": round(avg_count, 1),
        "total_time": round(total_time, 2),
    }


def main():
    args = parse_arguments()
    print("=" * 70)
    print(" CROWDGUARD AI — MULTI-CAMERA FEED RUNNER & DJANGO INGESTION")
    print("=" * 70)

    model_path = Path(args.model)
    if not model_path.exists():
        print(f"[Error] YOLO model weights missing: {model_path}", file=sys.stderr)
        sys.exit(1)

    print(f"[Model] Loading YOLO model: {model_path} (CPU)...")
    model = YOLO(str(model_path))

    cams_to_run = list(CAMERA_CONFIGS.keys()) if args.camera == "all" else [args.camera]
    summary_list = []

    for cam_id in cams_to_run:
        cam_info = CAMERA_CONFIGS[cam_id]
        video_path = Path(args.video) if (args.video and args.camera != "all") else cam_info["default_video"]
        location_id = args.location_id if (args.location_id and args.camera != "all") else cam_info["location_id"]

        try:
            res = process_camera_feed(
                camera_id=cam_id,
                camera_info=cam_info,
                video_path=video_path,
                location_id=location_id,
                model=model,
                api_url=args.api_url,
                conf_override=args.conf,
                imgsz_override=args.imgsz,
                iou_override=args.iou,
                sample_fps=args.sample_fps,
                report_interval=args.report_interval,
                max_readings=args.max_readings,
                loop=args.loop,
                skip_duplicates=args.skip_duplicates,
                dry_run=args.dry_run,
            )
            summary_list.append(res)
        except Exception as exc:
            print(f"\n[Error processing {cam_id}]: {exc}")
            summary_list.append({
                "camera_id": cam_id,
                "location_id": location_id,
                "location_name": cam_info["location_name"],
                "error": str(exc),
                "readings_sent": 0,
            })

    print("\n" + "=" * 70)
    print(" PIPELINE INGESTION RUN SUMMARY")
    print("=" * 70)
    for r in summary_list:
        if "error" in r:
            print(f" {r['camera_id']} ({r['location_name']}): ERROR ({r['error']})")
        else:
            print(f" {r['camera_id']} (Loc {r['location_id']} - {r['location_name']}): "
                  f"{r['readings_sent']} readings sent | Peak: {r['peak_count']} | Avg: {r['avg_count']}")
    print("=" * 70)


if __name__ == "__main__":
    main()
