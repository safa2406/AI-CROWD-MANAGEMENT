"""
CrowdGuard — Live Laptop Webcam Detection & Streaming Module
Captures frames from laptop webcam via OpenCV, runs YOLOv8n person detection on CPU,
draws bounding boxes and telemetry HUD, streams live MJPEG video over HTTP,
and posts crowd readings to the Django REST API (/api/readings/).
"""

import os
import sys
import time
import socket
import argparse
import threading
import json
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import cv2
import numpy as np
import requests
from ultralytics import YOLO

# Constants & Paths
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_MODEL_PATH = ROOT_DIR / "vision" / "models" / "yolov8n.pt"
DEFAULT_API_URL = "http://127.0.0.1:8000/api/readings/"
DEFAULT_LOCATIONS_URL = "http://127.0.0.1:8000/api/locations/"
COCO_PERSON_CLASS_ID = 0  # Class 0 in COCO is 'person'


class WebcamDetector:
    """
    Manages OpenCV webcam capture, YOLO inference, and reading ingestion to Django.
    """

    def __init__(
        self,
        model_path=str(DEFAULT_MODEL_PATH),
        api_url=DEFAULT_API_URL,
        camera_index=0,
        location_id=None,
        location_name="Live Demonstration Area",
        conf_threshold=0.25,
        imgsz=640,
        report_interval=2.5,
    ):
        self.model_path = model_path
        self.api_url = api_url
        self.camera_index = camera_index
        self.location_id = location_id
        self.location_name = location_name
        self.conf_threshold = conf_threshold
        self.imgsz = imgsz
        self.report_interval = report_interval

        self.model = None
        self.cap = None
        self.is_running = False
        self.is_starting = False
        self.error_message = None

        self.latest_frame_jpeg = None
        self.current_count = 0
        self.fps = 0.0
        self.frame_count = 0
        self.safe_capacity = 5

        self.last_reported_count = None
        self.last_report_time = 0.0

        self.lock = threading.Lock()
        self.thread = None
        self.cap_thread = None
        self.infer_thread = None
        self.stop_event = threading.Event()

        # Decoupled pipeline thread coordination & state
        self.raw_frame = None
        self.raw_frame_lock = threading.Lock()
        self.new_frame_event = threading.Event()

        self.last_boxes = []
        self.detected_count = 0
        self.detections_lock = threading.Lock()

    def load_model(self):
        """Loads YOLO model if not already loaded and pre-warms CPU inference graph."""
        if self.model is None:
            if not Path(self.model_path).exists():
                raise FileNotFoundError(f"YOLO model weights not found at: {self.model_path}")
            self.model = YOLO(self.model_path)
            # Pre-warm model graph so first camera frame does not stall
            try:
                dummy = np.zeros((320, 320, 3), dtype=np.uint8)
                self.model(dummy, imgsz=320, device="cpu", verbose=False)
            except Exception as e:
                print(f"[WebcamDetector] Model warmup notice: {e}")

    def resolve_location_id(self):
        """Resolves database location ID for the demonstration location."""
        if self.location_id is not None:
            return self.location_id

        try:
            resp = requests.get(DEFAULT_LOCATIONS_URL, timeout=3.0)
            if resp.status_code == 200:
                locations = resp.json()
                for loc in locations:
                    if loc.get("name") == self.location_name:
                        self.location_id = loc.get("id")
                        self.safe_capacity = loc.get("safe_capacity", 5)
                        print(f"[WebcamDetector] Resolved location '{self.location_name}' -> ID: {self.location_id}, Capacity: {self.safe_capacity}")
                        return self.location_id
                # If not found by exact name, check if any demo location exists
                for loc in locations:
                    if "Demo" in loc.get("name", ""):
                        self.location_id = loc.get("id")
                        self.safe_capacity = loc.get("safe_capacity", 5)
                        return self.location_id
        except Exception as e:
            print(f"[WebcamDetector] Note: Could not query Django locations: {e}. Defaulting location ID to 7.")

        self.location_id = 7
        return self.location_id

    def post_crowd_reading(self, count):
        """Posts crowd count reading to Django REST API."""
        loc_id = self.resolve_location_id()
        payload = {
            "location": loc_id,
            "crowd_count": count,
            "data_source": "cctv_ai_detection",
        }
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        try:
            resp = requests.post(self.api_url, json=payload, headers=headers, timeout=2.0)
            if resp.status_code in (200, 201):
                self.last_reported_count = count
                self.last_report_time = time.time()
                data = resp.json()
                print(f"[WebcamDetector] Ingested reading -> Count: {count} at Location ID {loc_id} (Occupancy: {data.get('occupancy_percentage', 'N/A')}%)")
                return True
            else:
                print(f"[WebcamDetector] Django API returned HTTP {resp.status_code}: {resp.text}")
                return False
        except requests.exceptions.RequestException as e:
            # Non-fatal connection notice
            print(f"[WebcamDetector] Could not post to Django API ({self.api_url}): {e}")
            return False

    def start_capture(self, camera_index=None):
        """Initializes camera and starts decoupled capture, inference, and display threads."""
        with self.lock:
            if self.is_running:
                return True, "Webcam is already running."
            if self.is_starting:
                return False, "Webcam initialization is already in progress."

            if camera_index is not None:
                self.camera_index = camera_index

            self.error_message = None
            self.is_starting = True

        try:
            self.load_model()
            self.resolve_location_id()

            # Attempt camera open (try DirectShow on Windows first for fast init, fallback to default)
            print(f"[WebcamDetector] Opening webcam index {self.camera_index}...")
            cap = None
            if os.name == "nt":
                cap = cv2.VideoCapture(self.camera_index, cv2.CAP_DSHOW)
            if cap is None or not cap.isOpened():
                if cap is not None:
                    cap.release()
                cap = cv2.VideoCapture(self.camera_index)

            if not cap.isOpened():
                error_msg = (
                    f"Webcam could not be opened on camera index {self.camera_index}. "
                    "Please verify that a camera is connected, permissions are granted, "
                    "and no other application (e.g. Zoom, Teams, browser) is using it."
                )
                with self.lock:
                    self.error_message = error_msg
                    self.is_starting = False
                    self.is_running = False
                if cap is not None:
                    cap.release()
                print(f"[WebcamDetector] ERROR: {error_msg}")
                return False, error_msg

            # Set preferred resolution & attempt 1-frame driver buffer (best-effort optimization)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            try:
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            except Exception:
                pass

            # Test frame read
            ret, test_frame = cap.read()
            if not ret or test_frame is None:
                error_msg = "Camera opened but failed to capture a test frame. Camera permission denied or device busy."
                with self.lock:
                    self.error_message = error_msg
                    self.is_starting = False
                    self.is_running = False
                cap.release()
                print(f"[WebcamDetector] ERROR: {error_msg}")
                return False, error_msg

            with self.raw_frame_lock:
                self.raw_frame = test_frame
            with self.detections_lock:
                self.last_boxes = []
                self.detected_count = 0

            self.cap = cap
            self.stop_event.clear()
            self.new_frame_event.set()
            self.is_running = True
            self.is_starting = False

            # Launch decoupled background threads:
            # 1. Capture thread: Continuously reads frames from OpenCV to prevent driver buffering/lag
            # 2. Inference thread: Runs YOLOv8n detection asynchronously on the latest frame
            # 3. Display thread: Overlays cached detections, encodes JPEG, and updates stream at smooth 25-30 FPS
            self.cap_thread = threading.Thread(target=self._capture_loop, daemon=True)
            self.infer_thread = threading.Thread(target=self._inference_loop, daemon=True)
            self.thread = threading.Thread(target=self._worker_loop, daemon=True)

            self.cap_thread.start()
            self.infer_thread.start()
            self.thread.start()

            print(f"[WebcamDetector] Webcam capture started successfully on device {self.camera_index}.")
            return True, "Webcam capture started successfully."

        except Exception as exc:
            err = f"Failed to start webcam: {str(exc)}"
            with self.lock:
                self.error_message = err
                self.is_starting = False
                self.is_running = False
            if self.cap:
                try:
                    self.cap.release()
                except Exception:
                    pass
                self.cap = None
            return False, err

    def stop_capture(self):
        """Stops detection workers and safely releases OpenCV camera."""
        with self.lock:
            if not self.is_running and not self.is_starting:
                return True, "Webcam is not running."
            self.is_running = False
            self.is_starting = False
            self.stop_event.set()
            self.new_frame_event.set()

        # Gracefully join all worker threads before releasing camera resource
        threads_to_join = [
            t for t in (
                getattr(self, "thread", None),
                getattr(self, "infer_thread", None),
                getattr(self, "cap_thread", None),
            )
            if t and t.is_alive()
        ]
        for t in threads_to_join:
            t.join(timeout=1.5)

        with self.lock:
            if self.cap:
                try:
                    self.cap.release()
                except Exception as e:
                    print(f"[WebcamDetector] Error releasing camera: {e}")
                self.cap = None

            with self.raw_frame_lock:
                self.raw_frame = None
            with self.detections_lock:
                self.last_boxes = []
                self.detected_count = 0

            self.latest_frame_jpeg = None
            self.current_count = 0
            self.fps = 0.0
            self.thread = None
            self.cap_thread = None
            self.infer_thread = None

        print("[WebcamDetector] Webcam capture stopped and camera resource released.")
        return True, "Webcam stopped successfully."

    def _capture_loop(self):
        """
        Dedicated capture thread:
        Continuously reads frames from camera into memory as fast as camera provides them.
        Drains OpenCV/driver buffer immediately so frames never queue up or lag behind reality.
        """
        while not self.stop_event.is_set():
            with self.lock:
                cap = self.cap
                if cap is None or not cap.isOpened():
                    break

            ret, frame = cap.read()
            if not ret or frame is None:
                if self.stop_event.is_set():
                    break
                time.sleep(0.01)
                continue

            with self.raw_frame_lock:
                self.raw_frame = frame
            self.new_frame_event.set()

    def _inference_loop(self):
        """
        Dedicated inference thread:
        Runs YOLOv8n person detection asynchronously on the latest captured frame.
        Reuses cached detections and does not block video capture or streaming display.
        """
        while not self.stop_event.is_set():
            # Wait for a fresh frame or stop signal
            if not self.new_frame_event.wait(timeout=0.2):
                continue
            if self.stop_event.is_set():
                break

            with self.raw_frame_lock:
                if self.raw_frame is None:
                    continue
                infer_frame = self.raw_frame.copy()

            if self.model is None:
                time.sleep(0.05)
                continue

            try:
                # Run YOLO person detection on CPU
                results = self.model(
                    infer_frame,
                    conf=self.conf_threshold,
                    imgsz=self.imgsz,
                    classes=[COCO_PERSON_CLASS_ID],
                    verbose=False,
                    device="cpu"
                )

                new_boxes = []
                if len(results) > 0 and results[0].boxes is not None:
                    for box in results[0].boxes:
                        cls_id = int(box.cls[0])
                        if cls_id == COCO_PERSON_CLASS_ID:
                            xyxy = box.xyxy[0].cpu().numpy().astype(int)
                            conf = float(box.conf[0])
                            new_boxes.append((int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3]), conf))

                with self.detections_lock:
                    self.last_boxes = new_boxes
                    self.detected_count = len(new_boxes)

            except Exception as yolo_err:
                print(f"[WebcamDetector] Inference error: {yolo_err}")

            # Controlled cadence: brief pause to allow display thread full CPU access for smooth 25-30 FPS
            time.sleep(0.08)

    def _worker_loop(self):
        """
        Dedicated display & streaming thread:
        Fetches the latest fresh frame, overlays cached YOLO bounding boxes and HUD,
        encodes JPEG, updates latest_frame_jpeg at smooth 25-30 FPS, and reports to Django.
        """
        prev_time = time.time()
        fps_smoothing = 0.9
        current_fps = 0.0
        frame_counter = 0

        while not self.stop_event.is_set():
            loop_start = time.time()

            # Grab the latest raw camera frame
            with self.raw_frame_lock:
                frame = None if self.raw_frame is None else self.raw_frame.copy()

            if frame is None:
                # Camera hasn't captured first frame yet
                time.sleep(0.01)
                continue

            frame_counter += 1
            now = time.time()
            dt = now - prev_time
            prev_time = now
            if dt > 0:
                inst_fps = 1.0 / dt
                current_fps = current_fps * fps_smoothing + inst_fps * (1.0 - fps_smoothing)

            # Retrieve latest cached detection results safely
            with self.detections_lock:
                boxes_to_draw = list(self.last_boxes)
                person_count = self.detected_count

            # Render annotations on the frame (preserving exact visual HUD design)
            h, w = frame.shape[:2]

            # 1. Draw person bounding boxes
            for i, (x1, y1, x2, y2, conf) in enumerate(boxes_to_draw, 1):
                # Box styling: Vibrant Cyan / Emerald
                color = (0, 230, 118)  # BGR Emerald
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

                # Label tag
                label = f"Person #{i} {int(conf * 100)}%"
                (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                cv2.rectangle(frame, (x1, max(0, y1 - lh - 6)), (x1 + lw + 6, y1), color, -1)
                cv2.putText(
                    frame,
                    label,
                    (x1 + 3, y1 - 4),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    (0, 20, 10),
                    1,
                    cv2.LINE_AA,
                )

            # 2. Draw HUD Top Telemetry Bar
            hud_bg = frame.copy()
            cv2.rectangle(hud_bg, (0, 0), (w, 42), (13, 22, 43), -1)  # Navy dark banner
            cv2.addWeighted(hud_bg, 0.85, frame, 0.15, 0, frame)

            # Live Indicator Dot & Text
            cv2.circle(frame, (16, 21), 6, (0, 255, 120), -1)  # Emerald dot
            cv2.putText(
                frame,
                "LIVE WEBCAM",
                (30, 26),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )

            # Status and Occupancy Calculation
            cap_val = max(1, self.safe_capacity)
            occupancy_pct = round((person_count / cap_val) * 100, 1)
            if occupancy_pct >= 90.0:
                status_str = "CRITICAL"
                status_color = (68, 68, 239)  # Red BGR
            elif occupancy_pct >= 75.0:
                status_str = "HIGH RISK"
                status_color = (22, 115, 249)  # Orange BGR
            elif occupancy_pct >= 50.0:
                status_str = "MODERATE"
                status_color = (11, 158, 245)  # Amber BGR
            else:
                status_str = "NORMAL"
                status_color = (129, 185, 16)  # Green BGR

            # Telemetry text: Count & Occupancy
            count_text = f"People: {person_count}/{cap_val} ({occupancy_pct}%)"
            cv2.putText(
                frame,
                count_text,
                (170, 26),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.52,
                (220, 240, 255),
                1,
                cv2.LINE_AA,
            )

            # Status Badge on HUD
            status_tag = f"[{status_str}]"
            cv2.putText(
                frame,
                status_tag,
                (w - 180, 26),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                status_color,
                2,
                cv2.LINE_AA,
            )

            # Bottom telemetry bar
            bottom_hud = frame.copy()
            cv2.rectangle(bottom_hud, (0, h - 24), (w, h), (10, 16, 30), -1)
            cv2.addWeighted(bottom_hud, 0.8, frame, 0.2, 0, frame)
            bottom_info = f"FPS: {current_fps:.1f} | Model: YOLOv8n (CPU) | Loc: {self.location_name}"
            cv2.putText(
                frame,
                bottom_info,
                (12, h - 8),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.38,
                (160, 180, 200),
                1,
                cv2.LINE_AA,
            )

            # Encode annotated frame to JPEG for MJPEG stream
            ret_enc, jpeg_bytes = cv2.imencode(
                ".jpg",
                frame,
                [int(cv2.IMWRITE_JPEG_QUALITY), 75]
            )

            if ret_enc:
                with self.lock:
                    self.latest_frame_jpeg = jpeg_bytes.tobytes()
                    self.current_count = person_count
                    self.fps = round(current_fps, 1)
                    self.frame_count = frame_counter

            # Report readings to Django API (throttled interval or on change)
            time_since_report = now - self.last_report_time
            count_changed = (person_count != self.last_reported_count)
            should_report = (
                (time_since_report >= self.report_interval) or
                (count_changed and time_since_report >= 1.0)
            )

            if should_report:
                self.last_reported_count = person_count
                self.last_report_time = now
                threading.Thread(
                    target=self.post_crowd_reading,
                    args=(person_count,),
                    daemon=True
                ).start()

            # Pacing sleep to cap display loop at ~25-30 FPS
            elapsed = time.time() - loop_start
            sleep_time = max(0.001, 0.035 - elapsed)
            time.sleep(sleep_time)

    def get_status(self):
        """Returns JSON-serializable status dictionary."""
        with self.lock:
            return {
                "is_running": self.is_running,
                "is_starting": self.is_starting,
                "camera_index": self.camera_index,
                "crowd_count": self.current_count,
                "fps": self.fps,
                "frame_count": self.frame_count,
                "error": self.error_message,
                "location_id": self.location_id,
                "location_name": self.location_name,
                "safe_capacity": self.safe_capacity,
            }


# Global detector instance
GLOBAL_DETECTOR = None


class ThreadedWebcamServer(ThreadingHTTPServer):
    """
    Multi-threaded HTTP server so streaming endpoints (/feed)
    do not starve or block status (/status), control (/start, /stop), or health checks.
    """
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.is_active = True

    def handle_error(self, request, client_address):
        """Suppress noisy tracebacks on normal client disconnects (WinError 10053/10054)."""
        exc_type, _, _ = sys.exc_info()
        if exc_type and issubclass(
            exc_type,
            (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, ConnectionError, OSError)
        ):
            return
        super().handle_error(request, client_address)


# Global detector instance and cached standby frame
GLOBAL_DETECTOR = None
_STANDBY_FRAME_JPEG = None


class WebcamHttpHandler(BaseHTTPRequestHandler):
    """
    HTTP Handler providing MJPEG live stream and control endpoints.
    Handles concurrent requests safely in daemon threads.
    """

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _safe_write(self, data):
        """Safely writes bytes to client socket, absorbing client aborts/resets."""
        try:
            self.wfile.write(data)
            return True
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, ConnectionError, OSError):
            return False

    def _send_json(self, status_code, data_dict):
        """Helper to send JSON responses safely with Connection: close."""
        body = json.dumps(data_dict).encode("utf-8")
        try:
            self.send_response(status_code)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, ConnectionError, OSError):
            pass

    def do_OPTIONS(self):
        try:
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Connection", "close")
            self.end_headers()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, ConnectionError, OSError):
            pass

    def do_GET(self):
        global GLOBAL_DETECTOR

        if self.path == "/status" or self.path == "/api/webcam/status":
            status_data = GLOBAL_DETECTOR.get_status() if GLOBAL_DETECTOR else {}
            self._send_json(200, status_data)
            return

        elif self.path == "/health":
            self._send_json(200, {"status": "ok"})
            return

        elif self.path.startswith("/feed") or self.path.startswith("/api/webcam/feed"):
            # Stream MJPEG
            try:
                self.send_response(200)
                self.send_cors_headers()
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.send_header("Pragma", "no-cache")
                self.send_header("Expires", "0")
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
                self.end_headers()
            except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, ConnectionError, OSError):
                return

            try:
                while getattr(self.server, "is_active", True):
                    frame_data = GLOBAL_DETECTOR.latest_frame_jpeg if GLOBAL_DETECTOR else None
                    if frame_data is not None:
                        header = f"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: {len(frame_data)}\r\n\r\n".encode("utf-8")
                        payload = header + frame_data + b"\r\n"
                    else:
                        # Send placeholder standby image
                        standby_img = self._create_standby_frame()
                        header = f"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: {len(standby_img)}\r\n\r\n".encode("utf-8")
                        payload = header + standby_img + b"\r\n"

                    if not self._safe_write(payload):
                        break

                    try:
                        self.wfile.flush()
                    except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, ConnectionError, OSError):
                        break

                    time.sleep(0.04)  # ~25 fps output
            except Exception:
                pass
            return

        else:
            self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        global GLOBAL_DETECTOR

        content_length = int(self.headers.get("Content-Length", 0))
        post_body = self.rfile.read(content_length) if content_length > 0 else b"{}"

        try:
            payload = json.loads(post_body.decode("utf-8")) if post_body else {}
        except Exception:
            payload = {}

        if self.path == "/start" or self.path == "/api/webcam/start":
            cam_idx = payload.get("camera_index", None)
            success, message = GLOBAL_DETECTOR.start_capture(cam_idx)
            status_code = 200 if success else 400
            res = {"success": success, "message": message, "status": GLOBAL_DETECTOR.get_status()}
            self._send_json(status_code, res)
            return

        elif self.path == "/stop" or self.path == "/api/webcam/stop":
            success, message = GLOBAL_DETECTOR.stop_capture()
            res = {"success": success, "message": message, "status": GLOBAL_DETECTOR.get_status()}
            self._send_json(200, res)
            return

        elif self.path == "/configure" or self.path == "/api/webcam/configure":
            if "safe_capacity" in payload:
                GLOBAL_DETECTOR.safe_capacity = int(payload["safe_capacity"])
            if "camera_index" in payload:
                GLOBAL_DETECTOR.camera_index = int(payload["camera_index"])
            GLOBAL_DETECTOR.error_message = None
            res = {"success": True, "status": GLOBAL_DETECTOR.get_status()}
            self._send_json(200, res)
            return

        else:
            self._send_json(404, {"error": "Not found"})

    def _create_standby_frame(self):
        """Generates or returns cached standby placeholder image when camera is stopped."""
        global _STANDBY_FRAME_JPEG
        if _STANDBY_FRAME_JPEG is not None:
            return _STANDBY_FRAME_JPEG

        img = np.zeros((480, 640, 3), dtype=np.uint8)
        img[:] = (15, 23, 42)  # Dark slate background

        # Center card
        cv2.rectangle(img, (120, 140), (520, 340), (30, 41, 59), -1)
        cv2.rectangle(img, (120, 140), (520, 340), (51, 65, 85), 1)

        cv2.putText(
            img,
            "WEBCAM STANDBY",
            (210, 215),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            img,
            "Click 'Start Webcam' to begin live detection",
            (165, 255),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (148, 163, 184),
            1,
            cv2.LINE_AA,
        )
        cv2.putText(
            img,
            "CrowdGuard AI - College Review Demonstration",
            (160, 295),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.42,
            (56, 189, 248),
            1,
            cv2.LINE_AA,
        )
        ret, jpeg = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 65])
        _STANDBY_FRAME_JPEG = jpeg.tobytes()
        return _STANDBY_FRAME_JPEG

    def log_message(self, format, *args):
        """Suppress standard logging for cleaner terminal output."""
        return


def is_port_in_use(port, host="127.0.0.1"):
    """Checks if a given network port is already in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def main():
    global GLOBAL_DETECTOR

    parser = argparse.ArgumentParser(
        description="CrowdGuard: Live Laptop Webcam Detection & Streaming Server"
    )
    parser.add_argument("--port", type=int, default=8001, help="Streaming HTTP server port (default: 8001)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Server host (default: 127.0.0.1)")
    parser.add_argument("--camera-index", "-c", type=int, default=0, help="Webcam device index (default: 0)")
    parser.add_argument("--model", "-m", type=str, default=str(DEFAULT_MODEL_PATH), help="Path to YOLOv8n model weights")
    parser.add_argument("--conf", type=float, default=0.25, help="YOLO confidence threshold (default: 0.25)")
    parser.add_argument("--imgsz", type=int, default=640, help="Inference resolution (default: 640)")
    parser.add_argument("--api-url", "-u", type=str, default=DEFAULT_API_URL, help="Django readings API endpoint")
    parser.add_argument("--autostart", action="store_true", help="Start camera capture immediately upon launch")
    args = parser.parse_args()

    # Prevent multiple webcam server processes from running simultaneously
    if is_port_in_use(args.port, args.host):
        print(f"\n[WebcamRunner] ERROR: Port {args.port} is already in use.")
        print("[WebcamRunner] An instance of the webcam runner is already active.")
        print("[WebcamRunner] Exiting duplicate process to prevent camera resource conflicts.\n")
        sys.exit(0)

    print("\n" + "=" * 65)
    print(" CROWDGUARD AI — LIVE WEBCAM DEMONSTRATION MODULE")
    print("=" * 65)
    print(f" * HTTP Streaming Service: http://{args.host}:{args.port}/feed")
    print(f" * Status Endpoint:        http://{args.host}:{args.port}/status")
    print(f" * Django REST API Target: {args.api_url}")
    print(f" * YOLO Weights:           {args.model}")
    print(f" * Camera Device Index:    {args.camera_index}")
    print(f" * Confidence Threshold:   {args.conf}")
    print("=" * 65)

    GLOBAL_DETECTOR = WebcamDetector(
        model_path=args.model,
        api_url=args.api_url,
        camera_index=args.camera_index,
        conf_threshold=args.conf,
        imgsz=args.imgsz,
    )

    # Pre-warm YOLO model and resolve location on launch
    try:
        GLOBAL_DETECTOR.load_model()
        GLOBAL_DETECTOR.resolve_location_id()
    except Exception as e:
        print(f"[WebcamDetector] Note: {e}")

    if args.autostart:
        print("[WebcamRunner] Auto-start enabled. Initializing camera capture...")
        GLOBAL_DETECTOR.start_capture()

    server = ThreadedWebcamServer((args.host, args.port), WebcamHttpHandler)
    server.is_active = True
    print(f"[WebcamRunner] Service listening on http://{args.host}:{args.port} (Press Ctrl+C to stop)")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[WebcamRunner] Shutdown signal received. Cleaning up...")
    finally:
        server.is_active = False
        if GLOBAL_DETECTOR:
            GLOBAL_DETECTOR.stop_capture()
        server.server_close()
        print("[WebcamRunner] Clean shutdown complete.")


if __name__ == "__main__":
    main()
