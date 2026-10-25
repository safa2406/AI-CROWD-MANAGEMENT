"""
CrowdGuard — Phase 4.2: Standalone Person Detection & Video Annotation
Detects and counts people from prerecorded video footage using Ultralytics YOLO (CPU inference).
"""

import os
import sys
import time
import argparse
from pathlib import Path
import cv2
from ultralytics import YOLO


# Constants & Defaults
DEFAULT_INPUT_VIDEO = Path("vision") / "videos" / "crowd_test.mp4"
DEFAULT_OUTPUT_VIDEO = Path("vision") / "output" / "crowd_detected.mp4"
DEFAULT_MODEL_PATH = Path("vision") / "models" / "yolov8n.pt"
COCO_PERSON_CLASS_ID = 0  # COCO class index 0 is 'person'


def parse_arguments():
    """Parse command-line arguments with sensible CrowdGuard defaults."""
    parser = argparse.ArgumentParser(
        description="CrowdGuard: AI Person Detection on Prerecorded Video (CPU Inference)"
    )
    parser.add_argument(
        "--input",
        "-i",
        type=str,
        default=str(DEFAULT_INPUT_VIDEO),
        help=f"Path to input video file (default: {DEFAULT_INPUT_VIDEO})",
    )
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default=str(DEFAULT_OUTPUT_VIDEO),
        help=f"Path to output annotated video (default: {DEFAULT_OUTPUT_VIDEO})",
    )
    parser.add_argument(
        "--model",
        "-m",
        type=str,
        default=str(DEFAULT_MODEL_PATH),
        help=f"Path or name of YOLO model weights (default: {DEFAULT_MODEL_PATH})",
    )
    parser.add_argument(
        "--conf",
        "-c",
        type=float,
        default=0.35,
        help="Confidence threshold for person detections (default: 0.35)",
    )
    parser.add_argument(
        "--imgsz",
        "-s",
        type=int,
        default=640,
        help="Inference image resolution (default: 640; use 1280 for dense HD footage)",
    )
    parser.add_argument(
        "--iou",
        type=float,
        default=0.70,
        help="NMS IoU overlap threshold (default: 0.70; use 0.55 for dense crowds)",
    )
    parser.add_argument(
        "--device",
        "-d",
        type=str,
        default="cpu",
        help="Inference device: 'cpu' (default: cpu)",
    )
    parser.add_argument(
        "--max-frames",
        type=int,
        default=None,
        help="Optional maximum number of frames to process (default: all)",
    )
    return parser.parse_args()


def validate_input_file(input_path: Path):
    """
    Validates that the input video file exists on disk and is non-empty.
    Raises FileNotFoundError or ValueError if invalid.
    """
    if not input_path.exists():
        raise FileNotFoundError(
            f"Input video file does not exist: '{input_path}'.\n"
            f"Please verify the file path and ensure the test video has been placed there."
        )

    file_size = input_path.stat().st_size
    if file_size == 0:
        raise ValueError(
            f"Input video file is empty (0 bytes): '{input_path}'.\n"
            f"A valid, non-empty encoded video file (.mp4, .avi, etc.) is required for processing."
        )


def load_detection_model(model_path: str):
    """
    Loads the YOLO detection model and ensures the target directory exists.
    """
    print(f"[Model] Loading YOLO detection model from: '{model_path}'...")
    try:
        model = YOLO(model_path)
        print(f"[Model] Successfully loaded: {model.model_name or model_path}")
        return model
    except Exception as exc:
        raise RuntimeError(
            f"Failed to load YOLO model from '{model_path}'. Reason: {exc}"
        ) from exc


def draw_hud(frame, person_count: int, frame_idx: int, total_frames: int, fps: float):
    """
    Draws a modern public-safety telemetry HUD on the frame.
    Shows person count, status color, frame count, and processing FPS.
    """
    h, w = frame.shape[:2]

    # Status color based on occupancy level
    # safe (<= 10): emerald, moderate (11-25): amber, high (26-40): orange, critical (>40): rose
    if person_count > 40:
        badge_color = (68, 68, 239)    # Red / Rose (BGR)
        status_text = "CRITICAL SURGE"
    elif person_count > 25:
        badge_color = (22, 115, 249)   # Orange (BGR)
        status_text = "HIGH DENSITY"
    elif person_count > 10:
        badge_color = (11, 158, 245)   # Amber (BGR)
        status_text = "MODERATE"
    else:
        badge_color = (129, 185, 16)   # Emerald Green (BGR)
        status_text = "NORMAL"

    # Semi-transparent top HUD banner
    overlay = frame.copy()
    banner_height = max(50, int(h * 0.08))
    cv2.rectangle(overlay, (0, 0), (w, banner_height), (15, 23, 42), -1)  # Dark navy #0f172a
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

    # Left: System branding & Live Person Counter
    title_text = "CROWDGUARD AI VISION"
    cv2.putText(
        frame,
        title_text,
        (16, int(banner_height * 0.42)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (203, 213, 225),  # Slate-300
        1,
        cv2.LINE_AA,
    )

    count_str = f"PEOPLE DETECTED: {person_count}"
    cv2.putText(
        frame,
        count_str,
        (16, int(banner_height * 0.85)),
        cv2.FONT_HERSHEY_DUPLEX,
        0.75,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )

    # Right: Telemetry & Status Pill
    status_pill = f"STATUS: {status_text}"
    status_size = cv2.getTextSize(status_pill, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]
    right_x = w - status_size[0] - 20
    cv2.putText(
        frame,
        status_pill,
        (right_x, int(banner_height * 0.55)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        badge_color,
        2,
        cv2.LINE_AA,
    )

    # Sub-telemetry: Frame & FPS
    progress_str = f"Frame {frame_idx}/{total_frames if total_frames > 0 else '?'}"
    if fps > 0:
        progress_str += f" | {fps:.1f} FPS"
    prog_size = cv2.getTextSize(progress_str, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)[0]
    cv2.putText(
        frame,
        progress_str,
        (w - prog_size[0] - 20, int(banner_height * 0.88)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.45,
        (148, 163, 184),
        1,
        cv2.LINE_AA,
    )


def draw_person_boxes(frame, boxes):
    """
    Draws bounding boxes and confidence tags around detected people.
    """
    for box in boxes:
        # Coordinates (xyxy)
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        conf = float(box.conf[0])

        # High-visibility bounding box (Cyan / Blue Accent: (246, 189, 56) in BGR)
        box_color = (246, 189, 56)
        cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)

        # Label tag
        label = f"Person {int(conf * 100)}%"
        (label_w, label_h), baseline = cv2.getTextSize(
            label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1
        )
        tag_y1 = max(0, y1 - label_h - 6)
        tag_y2 = y1

        # Background tag rectangle
        cv2.rectangle(
            frame,
            (x1, tag_y1),
            (x1 + label_w + 6, tag_y2),
            box_color,
            -1,
        )
        # Tag text in dark navy
        cv2.putText(
            frame,
            label,
            (x1 + 3, tag_y2 - 3),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (15, 23, 42),
            1,
            cv2.LINE_AA,
        )


def process_video(
    input_video_path: Path,
    output_video_path: Path,
    model_path: str,
    conf_threshold: float = 0.35,
    imgsz: int = 640,
    iou: float = 0.70,
    device: str = "cpu",
    max_frames: int = None,
):
    """
    Processes video frame-by-frame, runs YOLO person detection on CPU,
    annotates frames, and saves the result to the output video.
    """
    # 1. Validate Input File
    print("=" * 65)
    print(" CROWDGUARD AI — PHASE 4.2 PERSON DETECTION PIPELINE")
    print("=" * 65)
    print(f"[Input] Target Video Path : {input_video_path}")
    print(f"[Output] Annotated Video  : {output_video_path}")
    print(f"[Engine] Inference Device : {device.upper()}")
    print(f"[Config] Conf Threshold   : {conf_threshold}")

    validate_input_file(input_video_path)

    # 2. Open Video Stream with OpenCV
    cap = cv2.VideoCapture(str(input_video_path))
    if not cap.isOpened():
        raise RuntimeError(
            f"OpenCV could not open video file '{input_video_path}'.\n"
            f"The file may be corrupted, truncated, or encoded in an unsupported codec."
        )

    # Read Video Properties
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"[Video Info] Resolution  : {width} x {height}")
    print(f"[Video Info] Frame Rate  : {fps:.2f} FPS")
    print(f"[Video Info] Total Frames: {total_frames if total_frames > 0 else 'Unknown'}")

    if width <= 0 or height <= 0:
        cap.release()
        raise ValueError(
            f"Invalid video dimensions ({width}x{height}) detected by OpenCV for '{input_video_path}'."
        )

    # 3. Load YOLO Detection Model
    model = load_detection_model(model_path)

    # 4. Initialize Video Writer
    output_video_path.parent.mkdir(parents=True, exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(output_video_path), fourcc, fps, (width, height))

    if not writer.isOpened():
        # Fallback to alternate mp4 codec if needed
        fourcc = cv2.VideoWriter_fourcc(*"avc1")
        writer = cv2.VideoWriter(str(output_video_path), fourcc, fps, (width, height))

    if not writer.isOpened():
        cap.release()
        raise RuntimeError(
            f"Failed to initialize OpenCV VideoWriter for output file '{output_video_path}'.\n"
            f"Check file permissions and ensure an MP4-compatible video codec is available."
        )

    print(f"[Writer] Initialized output stream: {output_video_path}")
    print("-" * 65)
    print(" Starting Frame Processing & Person Detection...")
    print("-" * 65)

    # Tracking metrics
    processed_count = 0
    total_people_detected = 0
    peak_people_count = 0
    start_time = time.time()
    last_log_time = start_time

    try:
        while cap.isOpened():
            if max_frames and processed_count >= max_frames:
                print(f"[Info] Reached user-specified limit of {max_frames} frames.")
                break

            ret, frame = cap.read()
            if not ret:
                # End of video reached or frame reading error
                break

            processed_count += 1
            frame_start = time.time()

            # Run YOLO person detection (COCO class 0 = 'person')
            results = model.predict(
                frame,
                classes=[COCO_PERSON_CLASS_ID],
                conf=conf_threshold,
                imgsz=imgsz,
                iou=iou,
                device=device,
                verbose=False,
            )

            # Extract detected person bounding boxes
            boxes = results[0].boxes if len(results) > 0 else []
            person_count = len(boxes)

            # Update stats
            total_people_detected += person_count
            if person_count > peak_people_count:
                peak_people_count = person_count

            # Calculate processing FPS
            frame_time = time.time() - frame_start
            current_fps = 1.0 / frame_time if frame_time > 0 else 0.0

            # Annotate frame: draw bounding boxes and telemetry HUD
            draw_person_boxes(frame, boxes)
            draw_hud(frame, person_count, processed_count, total_frames, current_fps)

            # Write annotated frame
            writer.write(frame)

            # Terminal progress logging (every 10 frames or at least once per second)
            now = time.time()
            if processed_count == 1 or processed_count % 10 == 0 or (now - last_log_time) >= 1.0:
                pct = (
                    f"{(processed_count / total_frames * 100):.1f}%"
                    if total_frames > 0
                    else "N/A"
                )
                print(
                    f"[Progress] Frame {processed_count:4d}/{total_frames} ({pct:>5}) | "
                    f"People: {person_count:2d} | "
                    f"Rate: {current_fps:4.1f} FPS"
                )
                last_log_time = now

    except KeyboardInterrupt:
        print("\n[Warning] Processing interrupted by user (Ctrl+C). Saving partial output...")
    finally:
        # Proper resource cleanup
        cap.release()
        writer.release()
        print("-" * 65)
        print("[Cleanup] VideoCapture and VideoWriter resources released.")

    # 5. Output Summary Report
    elapsed_time = time.time() - start_time
    avg_fps = processed_count / elapsed_time if elapsed_time > 0 else 0.0
    avg_people = (
        total_people_detected / processed_count if processed_count > 0 else 0.0
    )

    print("=" * 65)
    print(" DETECTION PROCESSING COMPLETE")
    print("=" * 65)
    print(f"Total Frames Processed : {processed_count}")
    print(f"Elapsed Processing Time: {elapsed_time:.2f} seconds")
    print(f"Average Processing Speed: {avg_fps:.2f} FPS")
    print(f"Peak People Detected   : {peak_people_count}")
    print(f"Average People / Frame : {avg_people:.1f}")
    print(f"Output Video Saved To  : {output_video_path.resolve()}")
    print("=" * 65)

    return {
        "frames_processed": processed_count,
        "elapsed_time": elapsed_time,
        "avg_fps": avg_fps,
        "peak_people": peak_people_count,
        "avg_people": avg_people,
        "output_path": str(output_video_path.resolve()),
    }


def main():
    args = parse_arguments()
    input_path = Path(args.input)
    output_path = Path(args.output)

    try:
        process_video(
            input_video_path=input_path,
            output_video_path=output_path,
            model_path=args.model,
            conf_threshold=args.conf,
            imgsz=args.imgsz,
            iou=args.iou,
            device=args.device,
            max_frames=args.max_frames,
        )
        sys.exit(0)
    except FileNotFoundError as fnf_err:
        print(f"\n[ERROR: Missing Input Video]\n{fnf_err}", file=sys.stderr)
        sys.exit(1)
    except ValueError as val_err:
        print(f"\n[ERROR: Invalid Video Data]\n{val_err}", file=sys.stderr)
        sys.exit(1)
    except RuntimeError as rt_err:
        print(f"\n[ERROR: Runtime Exception]\n{rt_err}", file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        print(f"\n[FATAL ERROR: Unexpected Exception]\n{exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
