"""
Verification test for decoupled WebcamDetector pipeline.
Tests:
1. WebcamDetector instantiation and status schema.
2. Thread safety and graceful start/stop with synthetic frame feed.
3. YOLOv8n inference on CPU updating detections asynchronously.
4. Smooth generation of latest_frame_jpeg with HUD overlay.
5. Clean thread termination and camera release without deadlocks.
"""

import sys
import time
import unittest
import numpy as np
import cv2
from pathlib import Path
from unittest.mock import MagicMock

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT_DIR / "vision" / "scripts"))

from webcam_runner import WebcamDetector, DEFAULT_MODEL_PATH


class DecoupledWebcamPipelineTest(unittest.TestCase):
    def test_01_status_schema(self):
        detector = WebcamDetector(model_path=str(DEFAULT_MODEL_PATH))
        status = detector.get_status()
        self.assertFalse(status["is_running"])
        self.assertFalse(status["is_starting"])
        self.assertIn("camera_index", status)
        self.assertIn("crowd_count", status)
        self.assertIn("fps", status)
        self.assertIn("frame_count", status)
        self.assertIn("safe_capacity", status)
        self.assertEqual(status["safe_capacity"], 5)

    def test_02_idempotent_stop(self):
        detector = WebcamDetector(model_path=str(DEFAULT_MODEL_PATH))
        # Stop when already stopped
        success, msg = detector.stop_capture()
        self.assertTrue(success)
        self.assertFalse(detector.is_running)

    def test_03_synthetic_frame_inference_and_display(self):
        detector = WebcamDetector(model_path=str(DEFAULT_MODEL_PATH))
        detector.load_model()
        self.assertIsNotNone(detector.model)

        # Mock OpenCV VideoCapture
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True

        # Create a synthetic 640x480 frame
        sample_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        sample_frame[:] = (50, 50, 50)

        # Simulate 30 FPS hardware webcam delivery
        def mock_read():
            time.sleep(0.033)
            return True, sample_frame.copy()

        mock_cap.read.side_effect = mock_read

        detector.cap = mock_cap
        detector.is_running = True
        detector.stop_event.clear()

        # Start capture and display threads
        import threading
        detector.cap_thread = threading.Thread(target=detector._capture_loop, daemon=True)
        detector.infer_thread = threading.Thread(target=detector._inference_loop, daemon=True)
        detector.thread = threading.Thread(target=detector._worker_loop, daemon=True)

        detector.post_crowd_reading = MagicMock(return_value=True)

        detector.cap_thread.start()
        detector.infer_thread.start()
        detector.thread.start()

        # Let the pipeline run for 1.5 seconds
        time.sleep(1.5)

        # Verify that raw frame was captured
        with detector.raw_frame_lock:
            self.assertIsNotNone(detector.raw_frame)
            self.assertEqual(detector.raw_frame.shape, (480, 640, 3))

        # Verify that display loop encoded JPEG
        with detector.lock:
            self.assertIsNotNone(detector.latest_frame_jpeg)
            self.assertGreater(len(detector.latest_frame_jpeg), 1000)
            self.assertGreater(detector.frame_count, 15)
            self.assertGreater(detector.fps, 10.0)

        # Stop capture and ensure clean join
        stop_start = time.time()
        success, msg = detector.stop_capture()
        stop_elapsed = time.time() - stop_start

        self.assertTrue(success)
        self.assertFalse(detector.is_running)
        self.assertIsNone(detector.cap)
        self.assertIsNone(detector.raw_frame)
        self.assertLess(stop_elapsed, 2.0, "Stop should cleanly complete within 2 seconds")

    def test_04_real_video_frame_person_detection(self):
        """Test with real video frames containing people to verify detection and headcount."""
        video_path = ROOT_DIR / "vision" / "videos" / "crowd_test.mp4"
        if not video_path.exists():
            self.skipTest("crowd_test.mp4 not found")

        cap = cv2.VideoCapture(str(video_path))
        ret, real_frame = cap.read()
        cap.release()
        self.assertTrue(ret and real_frame is not None)

        detector = WebcamDetector(model_path=str(DEFAULT_MODEL_PATH))
        detector.load_model()
        detector.post_crowd_reading = MagicMock(return_value=True)

        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True

        def mock_read():
            time.sleep(0.033)
            return True, real_frame.copy()

        mock_cap.read.side_effect = mock_read
        detector.cap = mock_cap
        detector.is_running = True
        detector.stop_event.clear()

        import threading
        detector.cap_thread = threading.Thread(target=detector._capture_loop, daemon=True)
        detector.infer_thread = threading.Thread(target=detector._inference_loop, daemon=True)
        detector.thread = threading.Thread(target=detector._worker_loop, daemon=True)

        detector.cap_thread.start()
        detector.infer_thread.start()
        detector.thread.start()

        # Allow 2 seconds for inference to detect people in the frame
        time.sleep(2.0)

        with detector.detections_lock:
            boxes = list(detector.last_boxes)
            count = detector.detected_count

        status = detector.get_status()

        # Stop
        detector.stop_capture()

        # Real crowd test frame MUST detect people
        self.assertGreater(len(boxes), 0, "YOLO should detect people in crowd_test.mp4 frame")
        self.assertEqual(count, len(boxes))
        self.assertEqual(status["crowd_count"], count)
        print(f"[Test 04] Successfully detected {count} people with boxes: {boxes[:2]}")


if __name__ == "__main__":
    unittest.main()
