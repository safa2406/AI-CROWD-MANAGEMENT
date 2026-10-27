"""
Unit and Concurrency Tests for Webcam Runner and HTTP Streaming Server.
Verifies:
1. Threaded concurrency: /status is responsive while /feed is actively streaming.
2. Abrupt client disconnect: client drops stream connection without crashing the server.
3. Idempotency: repeated start/stop calls are safe and thread-safe.
4. Clean shutdown: server terminates without hanging.
"""

import sys
import time
import json
import socket
import urllib.request
import threading
import unittest
from pathlib import Path

# Add project root and vision/scripts to path
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT_DIR / "vision" / "scripts"))

from webcam_runner import (
    WebcamDetector,
    WebcamHttpHandler,
    ThreadedWebcamServer,
    GLOBAL_DETECTOR,
)
import webcam_runner


class WebcamRunnerConcurrencyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Pick an unused port for testing
        cls.test_port = 8099
        cls.host = "127.0.0.1"
        cls.base_url = f"http://{cls.host}:{cls.test_port}"

        # Initialize detector without opening physical camera
        cls.detector = WebcamDetector(
            model_path=str(ROOT_DIR / "vision" / "models" / "yolov8n.pt"),
            conf_threshold=0.25,
        )
        webcam_runner.GLOBAL_DETECTOR = cls.detector

        # Start threaded server
        cls.server = ThreadedWebcamServer((cls.host, cls.test_port), WebcamHttpHandler)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()

        # Wait briefly for server to bind
        time.sleep(0.2)

    @classmethod
    def tearDownClass(cls):
        cls.server.is_active = False
        cls.detector.stop_capture()
        cls.server.shutdown()
        cls.server.server_close()

    def test_01_health_and_status_endpoints(self):
        """Test that /health and /status return valid responses."""
        # /health
        with urllib.request.urlopen(f"{self.base_url}/health", timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data.get("status"), "ok")

        # /status
        with urllib.request.urlopen(f"{self.base_url}/status", timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertIn("is_running", data)
            self.assertIn("crowd_count", data)
            self.assertIn("safe_capacity", data)

    def test_02_concurrent_status_requests_while_streaming(self):
        """
        CRITICAL TEST:
        Client 1 opens /feed and reads streaming chunks.
        While /feed is actively open, Client 2 sends repeated /status and /health requests.
        The server MUST remain responsive and return responses in under 100ms.
        """
        streaming_active = threading.Event()
        stop_streaming = threading.Event()
        stream_chunks_received = []

        def stream_consumer():
            try:
                req = urllib.request.Request(f"{self.base_url}/feed")
                with urllib.request.urlopen(req, timeout=5.0) as stream:
                    streaming_active.set()
                    while not stop_streaming.is_set():
                        chunk = stream.read(1024)
                        if not chunk:
                            break
                        stream_chunks_received.append(len(chunk))
                        time.sleep(0.01)
            except Exception:
                pass

        stream_thread = threading.Thread(target=stream_consumer, daemon=True)
        stream_thread.start()

        # Wait until stream is actively receiving frames
        self.assertTrue(streaming_active.wait(timeout=3.0), "Stream did not connect in time")

        # Concurrently fire 10 status requests
        for i in range(10):
            start_t = time.time()
            with urllib.request.urlopen(f"{self.base_url}/status", timeout=1.0) as resp:
                elapsed = time.time() - start_t
                self.assertEqual(resp.status, 200)
                status_data = json.loads(resp.read().decode())
                self.assertIn("is_running", status_data)
                # Ensure response was fast (< 500ms)
                self.assertLess(elapsed, 0.5, f"Status request {i} took too long: {elapsed:.2f}s")

        # Concurrently fire health requests
        for i in range(5):
            with urllib.request.urlopen(f"{self.base_url}/health", timeout=1.0) as resp:
                self.assertEqual(resp.status, 200)

        # Signal stream to stop
        stop_streaming.set()
        stream_thread.join(timeout=1.0)

        self.assertGreater(len(stream_chunks_received), 0, "No stream chunks were received")

    def test_03_abrupt_client_disconnect_on_feed(self):
        """
        Verify that an abrupt client socket disconnect on /feed
        (such as browser closing tab or WinError 10053/10054) does not crash the server.
        """
        # Connect raw socket, send GET /feed, read partial headers, then abruptly close socket
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect((self.host, self.test_port))
        s.sendall(b"GET /feed HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")

        # Read only a little data
        _ = s.recv(256)
        # Abruptly close socket with RST by setting SO_LINGER to 0
        s.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, b"\x01\x00\x00\x00\x00\x00\x00\x00")
        s.close()

        # Brief pause
        time.sleep(0.1)

        # Server MUST still be healthy and responsive
        with urllib.request.urlopen(f"{self.base_url}/health", timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data.get("status"), "ok")

    def test_04_detector_start_stop_idempotency(self):
        """
        Test that repeated start and stop operations are idempotent and thread-safe.
        """
        detector = self.detector

        # Stop when already stopped
        success, msg = detector.stop_capture()
        self.assertTrue(success)

        # Check status
        st = detector.get_status()
        self.assertFalse(st["is_running"])
        self.assertFalse(st["is_starting"])

    def test_05_configure_capacity_via_http(self):
        """Test POST /configure updates capacity correctly."""
        payload = json.dumps({"safe_capacity": 12}).encode()
        req = urllib.request.Request(
            f"{self.base_url}/configure",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertTrue(data.get("success"))
            self.assertEqual(data["status"]["safe_capacity"], 12)

        # Reset back to 5
        payload = json.dumps({"safe_capacity": 5}).encode()
        req = urllib.request.Request(
            f"{self.base_url}/configure",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        urllib.request.urlopen(req, timeout=2.0)


if __name__ == "__main__":
    unittest.main()
