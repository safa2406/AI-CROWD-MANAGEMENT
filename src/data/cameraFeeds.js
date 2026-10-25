/**
 * Prerecorded Camera Feed Definitions
 * Mapped to Django REST API Database Locations
 * Includes static preloaded YOLO detections and annotated video sources
 */
import cam01Detections from "./detections/cam_01.json";
import cam02Detections from "./detections/cam_02.json";
import cam03Detections from "./detections/cam_03.json";
import cam04Detections from "./detections/cam_04.json";

export const CAMERA_DETECTIONS_MAP = {
  "CAM-01": cam01Detections,
  "CAM-02": cam02Detections,
  "CAM-03": cam03Detections,
  "CAM-04": cam04Detections,
};

export const CAMERA_FEEDS = [
  {
    id: "CAM-01",
    numericLocationId: 1,
    displayLocationId: "LOC-101",
    locationName: "Central Metro Interchange",
    cameraName: "Camera 1 - Platform 2 East",
    videoSrc: "/videos/cam-01.mp4",
    annotatedVideoSrc: "/videos/cam-01-detected.mp4",
    resolution: "852x480 @ 30fps",
    lensType: "Wide Angle Concourse",
    zone: "Zone A Underground",
    detectionData: cam01Detections,
  },
  {
    id: "CAM-02",
    numericLocationId: 2,
    displayLocationId: "LOC-102",
    locationName: "Stadium Gate A & B Turnstiles",
    cameraName: "Camera 2 - Entrance Turnstiles",
    videoSrc: "/videos/cam-02.mp4",
    annotatedVideoSrc: "/videos/cam-02-detected.mp4",
    resolution: "854x480 @ 25fps",
    lensType: "Standard Entry Gates",
    zone: "Zone B Main Gates",
    detectionData: cam02Detections,
  },
  {
    id: "CAM-03",
    numericLocationId: 5,
    displayLocationId: "LOC-105",
    locationName: "East Grandstand Promenade",
    cameraName: "Camera 3 - Concourse Junction",
    videoSrc: "/videos/cam-03.mp4",
    annotatedVideoSrc: "/videos/cam-03-detected.mp4",
    resolution: "1280x720 @ 30fps",
    lensType: "Wide Angle Walkway",
    zone: "Zone B Grandstand",
    detectionData: cam03Detections,
  },
  {
    id: "CAM-04",
    numericLocationId: 3,
    displayLocationId: "LOC-103",
    locationName: "North Terminal Concourse",
    cameraName: "Camera 4 - Departures Hall",
    videoSrc: "/videos/cam-04.mp4",
    annotatedVideoSrc: "/videos/cam-04-detected.mp4",
    resolution: "1280x720 @ 25fps",
    lensType: "Standard Transit Hall",
    zone: "Zone A Departures",
    detectionData: cam04Detections,
  },
];
