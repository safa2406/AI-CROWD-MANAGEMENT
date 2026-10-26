"""
CrowdGuard — Multi-Camera Feed Runner & Django AI Ingestion
Processes prerecorded video feeds with YOLOv8n (CPU inference),
samples frames at configurable FPS, prevents duplicate requests,
and posts actual detected person counts to the Django REST API (POST /api/readings/).
Includes camera-specific high-resolution inference for dense crowds (CAM-03, CAM-04).
Implements a single-threaded round-robin execution engine that concurrently processes
and loops all four cameras without blocking.
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
        "name": "Camera 1 - Street Pathway",
        "location_id": 1,
        "location_name": "Street Pathway",
        "default_video": Path("vision") / "videos" / "crowd_test.mp4",
        "conf": 0.35,
        "imgsz": 640,
        "iou": 0.70,
    },
    "CAM-02": {
        "name": "Camera 2 - Metro Station Entrance",
        "location_id": 2,
        "location_name": "Central Metro Station",
        "default_video": Path("vision") / "videos" / "cam_02.mp4",
        "conf": 0.35,
        "imgsz": 640,
        "iou": 0.70,
    },
    "CAM-03": {
        "name": "Camera 3 - Market Square",
        "location_id": 5,
        "location_name": "City Market Square",
        "default_video": Path("vision") / "videos" / "cam_03.mp4",
        "conf": 0.22,
        "imgsz": 1280,
        "iou": 0.55,
    },
    "CAM-04": {
        "name": "Camera 4 - Railway Station Hall",
        "location_id": 3,
        "location_name": "Railway Station Hall",
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
        help="Optional override for the database Location ID (single-camera mode only)",
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


def get_next_camera_frame(state: dict, loop: bool):
    """
    Advances a camera stream to its next sampled frame based on frame_stride.
    Returns (success: bool, frame: np.ndarray | None).
    Rewinds to frame 0 independently if loop=True when EOF is reached.
    """
    cap = state["cap"]
    stride = state["frame_stride"]

    # First frame of the video
    if state["frame_idx"] == 0:
        ret, frame = cap.read()
        if ret:
            state["frame_idx"] = 1
            return True, frame
        if loop:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = cap.read()
            if ret:
                state["frame_idx"] = 1
                return True, frame
        state["active"] = False
        return False, None

    # Advance skipped frames via grab()
    for _ in range(stride - 1):
        grabbed = cap.grab()
        if not grabbed:
            if loop:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                state["frame_idx"] = 0
            else:
                state["active"] = False
                return False, None
        else:
            state["frame_idx"] += 1

    # Read and decode target frame
    ret, frame = cap.read()
    if not ret:
        if loop:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            state["frame_idx"] = 0
            ret, frame = cap.read()
            if ret:
                state["frame_idx"] = 1
                return True, frame
            state["active"] = False
            return False, None
        else:
            state["active"] = False
            return False, None

    state["frame_idx"] += 1
    return True, frame


def process_camera_feeds(
    cameras_to_run: list,
    camera_configs: dict,
    model: YOLO,
    api_url: str,
    video_overrides: dict = None,
    location_overrides: dict = None,
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
    """
    Single-threaded round-robin multi-camera processor.
    Interleaves frame reading and YOLO inference across all cameras in cameras_to_run,
    ensuring each camera has independent reporting cadence, duplicate suppression,
    and EOF rewind without blocking sibling feeds.
    """
    video_overrides = video_overrides or {}
    location_overrides = location_overrides or {}

    camera_states = []

    print("\n" + "=" * 70)
    print(" INITIALIZING CAMERA FEEDS")
    print("=" * 70)

    for cam_id in cameras_to_run:
        cam_info = camera_configs[cam_id]
        vpath = video_overrides.get(cam_id) or cam_info["default_video"]
        loc_id = location_overrides.get(cam_id) or cam_info["location_id"]

        conf_threshold = conf_override if conf_override is not None else cam_info.get("conf", 0.35)
        imgsz = imgsz_override if imgsz_override is not None else cam_info.get("imgsz", 640)
        iou = iou_override if iou_override is not None else cam_info.get("iou", 0.70)

        validate_video_file(vpath)
        cap = cv2.VideoCapture(str(vpath))
        if not cap.isOpened():
            raise RuntimeError(f"OpenCV could not open video file: '{vpath}'")

        native_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        frame_stride = max(1, int(round(native_fps / sample_fps)))

        print(f"[{cam_id}] {cam_info['name']}")
        print(f"  Target Location   : ID {loc_id} ({cam_info['location_name']})")
        print(f"  Input Video       : {vpath} ({total_frames} frames @ {native_fps:.1f} fps)")
        print(f"  Inference Params  : conf={conf_threshold:.2f}, imgsz={imgsz}, iou={iou:.2f}")
        print(f"  Sampling Stride   : every {frame_stride} frames (~{sample_fps:.1f} FPS)")

        camera_states.append({
            "camera_id": cam_id,
            "info": cam_info,
            "video_path": vpath,
            "location_id": loc_id,
            "cap": cap,
            "native_fps": native_fps,
            "total_frames": total_frames,
            "frame_stride": frame_stride,
            "conf_threshold": conf_threshold,
            "imgsz": imgsz,
            "iou": iou,
            "frame_idx": 0,
            "sampled_frame_count": 0,
            "readings_sent": 0,
            "failed_readings": 0,
            "duplicates_skipped": 0,
            "peak_count": 0,
            "accumulated_people": 0,
            "last_reported_count": None,
            "last_report_wall_time": 0.0,
            "active": True,
            "feed_start_time": time.time(),
        })

    print("-" * 70)
    print(f"API Post Interval    : >= {report_interval:.1f}s per camera")
    print(f"Duplicate Prevention : {'Active' if skip_duplicates else 'Standard'}")
    print(f"Continuous Looping   : {'Yes (per-feed rewind)' if loop else 'No'}")
    print(f"Endpoint             : {api_url} {'[DRY RUN]' if dry_run else ''}")
    print("=" * 70 + "\n")

    try:
        while any(s["active"] for s in camera_states):
            for s in camera_states:
                if not s["active"]:
                    continue

                ret, frame = get_next_camera_frame(s, loop=loop)
                if not ret:
                    continue

                s["sampled_frame_count"] += 1
                infer_start = time.time()

                results = model.predict(
                    frame,
                    classes=[COCO_PERSON_CLASS_ID],
                    conf=s["conf_threshold"],
                    imgsz=s["imgsz"],
                    iou=s["iou"],
                    device="cpu",
                    verbose=False,
                )

                infer_duration = time.time() - infer_start
                detected_boxes = results[0].boxes if len(results) > 0 else []
                actual_person_count = len(detected_boxes)

                s["accumulated_people"] += actual_person_count
                if actual_person_count > s["peak_count"]:
                    s["peak_count"] = actual_person_count

                current_wall_time = time.time()
                elapsed_since_last_report = current_wall_time - s["last_report_wall_time"]
                video_time_sec = s["frame_idx"] / s["native_fps"] if s["native_fps"] > 0 else 0

                print(
                    f"[{s['camera_id']} @ {video_time_sec:5.1f}s | Frame {s['frame_idx']:4d}/{s['total_frames']}] "
                    f"YOLO Headcount: {actual_person_count:2d} people (Infer: {infer_duration*1000:4.0f}ms @ {s['imgsz']}px)"
                )

                # Check cadence for sending reading to Django
                if elapsed_since_last_report >= report_interval:
                    if skip_duplicates and s["last_reported_count"] == actual_person_count:
                        s["duplicates_skipped"] += 1
                        print(f"  --> [{s['camera_id']} SKIP DUPLICATE] Headcount unchanged ({actual_person_count}); skipping redundant POST")
                        continue

                    if dry_run:
                        print(f"  --> [{s['camera_id']} DRY RUN] Would send {actual_person_count} to Location {s['location_id']}")
                        s["last_report_wall_time"] = current_wall_time
                        s["last_reported_count"] = actual_person_count
                        s["readings_sent"] += 1
                    else:
                        success, result = post_crowd_reading(
                            api_url=api_url,
                            location_id=s["location_id"],
                            crowd_count=actual_person_count,
                        )
                        s["last_report_wall_time"] = current_wall_time

                        if success:
                            s["readings_sent"] += 1
                            s["last_reported_count"] = actual_person_count
                            occ = result.get("occupancy_percentage", 0.0)
                            print(
                                f"  --> [{s['camera_id']} DJANGO POST 201] Saved Reading #{result.get('id')} | "
                                f"{result.get('location_name')} (ID: {s['location_id']}) | "
                                f"Count: {actual_person_count} | Occupancy: {occ}% | Source: cctv_ai_detection"
                            )
                        else:
                            s["failed_readings"] += 1
                            print(f"  --> [{s['camera_id']} DJANGO POST FAILED] {result}")

                    if max_readings and s["readings_sent"] >= max_readings:
                        print(f"[Info] Reached requested limit of {max_readings} readings for {s['camera_id']}.")
                        s["active"] = False

    except KeyboardInterrupt:
        print("\n[User Interrupt] Stopping feed runner (Ctrl+C)...")
    finally:
        for s in camera_states:
            if s.get("cap") is not None and s["cap"].isOpened():
                s["cap"].release()

    results_summary = []
    print("\n" + "=" * 70)
    print(" MULTI-CAMERA FEED INGESTION SUMMARY")
    print("=" * 70)

    for s in camera_states:
        total_time = time.time() - s["feed_start_time"]
        avg_count = s["accumulated_people"] / s["sampled_frame_count"] if s["sampled_frame_count"] > 0 else 0

        print(f" CAMERA: {s['camera_id']} ({s['info']['name']}):")
        print(f"  * Monitored Location    : ID {s['location_id']} ({s['info']['location_name']})")
        print(f"  * Sampled Frames (YOLO) : {s['sampled_frame_count']}")
        print(f"  * Successful Posts      : {s['readings_sent']}")
        print(f"  * Failed Posts          : {s['failed_readings']}")
        print(f"  * Duplicates Skipped    : {s['duplicates_skipped']}")
        print(f"  * Peak Detected Count   : {s['peak_count']}")
        print(f"  * Average Count         : {avg_count:.1f}")
        print(f"  * Running Time          : {total_time:.2f}s")
        print("-" * 70)

        results_summary.append({
            "camera_id": s["camera_id"],
            "location_id": s["location_id"],
            "location_name": s["info"]["location_name"],
            "samples": s["sampled_frame_count"],
            "readings_sent": s["readings_sent"],
            "failed_readings": s["failed_readings"],
            "duplicates_skipped": s["duplicates_skipped"],
            "peak_count": s["peak_count"],
            "avg_count": round(avg_count, 1),
            "total_time": round(total_time, 2),
        })

    return results_summary


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
    """
    Backward-compatible entry point for processing a single camera feed.
    """
    res_list = process_camera_feeds(
        cameras_to_run=[camera_id],
        camera_configs={camera_id: camera_info},
        model=model,
        api_url=api_url,
        video_overrides={camera_id: video_path},
        location_overrides={camera_id: location_id},
        conf_override=conf_override,
        imgsz_override=imgsz_override,
        iou_override=iou_override,
        sample_fps=sample_fps,
        report_interval=report_interval,
        max_readings=max_readings,
        loop=loop,
        skip_duplicates=skip_duplicates,
        dry_run=dry_run,
    )
    return res_list[0] if res_list else None


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
    video_overrides = {}
    location_overrides = {}

    if args.camera != "all":
        if args.video:
            video_overrides[args.camera] = Path(args.video)
        if args.location_id:
            location_overrides[args.camera] = args.location_id

    summary_list = process_camera_feeds(
        cameras_to_run=cams_to_run,
        camera_configs=CAMERA_CONFIGS,
        model=model,
        api_url=args.api_url,
        video_overrides=video_overrides,
        location_overrides=location_overrides,
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
