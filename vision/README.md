# CrowdGuard — Computer Vision Module (Phase 4)

This directory contains the computer-vision environment, test videos, detection scripts, and pretrained models for the CrowdGuard AI crowd detection pipeline.

## Directory Structure

* `models/`: Stores pretrained object detection weights (e.g., `yolov8n.pt`). Ignored by git.
* `videos/`: Stores prerecorded test video footage (e.g., MP4 feeds for transit concourses, gate turnstiles). Large video files are ignored by git.
* `scripts/`: Python scripts for video processing, person detection, and ingestion into the Django REST API.
* `requirements.txt`: Locked dependencies for the standalone `vision-venv` environment.

## Environment Details

* **Virtual Environment:** `vision-venv/` (Python 3.13.1, CPU-only inference)
* **Libraries:** Ultralytics YOLOv8 (`8.4.188`), OpenCV (`5.0.0`), PyTorch CPU (`2.14.1+cpu`)
* **Inference Target:** CPU (no NVIDIA GPU or CUDA required)
