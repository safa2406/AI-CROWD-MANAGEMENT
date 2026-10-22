import React, { createContext, useContext, useState, useEffect } from "react";
import {
  INITIAL_LOCATIONS,
  INITIAL_ALERTS,
  SIMULATED_CAMERAS,
} from "../data/mockData";

const CrowdContext = createContext(null);

export function CrowdProvider({ children }) {
  const [locations, setLocations] = useState(INITIAL_LOCATIONS);
  const [alerts, setAlerts] = useState(INITIAL_ALERTS);
  const [cameras] = useState(SIMULATED_CAMERAS);
  const [simulationActive, setSimulationActive] = useState(true);
  const [selectedCameraId, setSelectedCameraId] = useState("CAM-01");
  const [toasts, setToasts] = useState([]);
  const toastSeqRef = React.useRef(0);

  // Toast dispatch helper
  const addToast = (message, type = "info") => {
    toastSeqRef.current += 1;
    const id = `tst-${toastSeqRef.current}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Helper to determine status from occupancy ratio
  const calculateStatus = (count, capacity) => {
    const ratio = count / capacity;
    if (ratio >= 0.9) return "critical";
    if (ratio >= 0.75) return "high";
    if (ratio >= 0.5) return "moderate";
    return "safe";
  };

  // Add new monitored location
  const addLocation = (formData) => {
    const capacity = parseInt(formData.capacity, 10) || 1000;
    const currentCount = parseInt(formData.currentCount, 10) || 0;
    const status = calculateStatus(currentCount, capacity);

    const newLoc = {
      id: `LOC-${Math.floor(100 + Math.random() * 900)}`,
      name: formData.name,
      type: formData.type || "Public Plaza",
      zone: formData.zone || "Zone A - General Area",
      capacity,
      currentCount,
      status,
      cameraCount: parseInt(formData.cameraCount, 10) || 1,
      flowRate: "+0/min",
      riskScore: Math.round((currentCount / capacity) * 90),
      activeAlertsCount: 0,
      densitySqm: `${((currentCount / capacity) * 4).toFixed(1)} p/m²`,
      lastUpdated: "Just now",
    };

    setLocations((prev) => [newLoc, ...prev]);
    addToast(`Added location: ${newLoc.name}`, "success");
    return newLoc;
  };

  // Acknowledge Alert
  const acknowledgeAlert = (alertId) => {
    setAlerts((prev) =>
      prev.map((item) =>
        item.id === alertId
          ? {
              ...item,
              status: "acknowledged",
              acknowledgedBy: "Safety Operator (Current Session)",
              acknowledgedAt: new Date().toLocaleTimeString(),
            }
          : item
      )
    );
    addToast(`Alert ${alertId} acknowledged. Response protocol initiated.`, "warning");
  };

  // Resolve Alert
  const resolveAlert = (alertId) => {
    setAlerts((prev) =>
      prev.map((item) =>
        item.id === alertId
          ? {
              ...item,
              status: "resolved",
              resolvedBy: "Safety Command (Resolved)",
              resolvedAt: new Date().toLocaleTimeString(),
            }
          : item
      )
    );
    addToast(`Alert ${alertId} resolved. Log updated in audit registry.`, "success");
  };

  // Interactive Live Crowd Simulation (Tick every 5s if active)
  useEffect(() => {
    if (!simulationActive) return;

    const interval = setInterval(() => {
      setLocations((prevLocations) =>
        prevLocations.map((loc) => {
          // Slight realistic drift: -25 to +35 people
          const delta = Math.floor(Math.random() * 61) - 25;
          const updatedCount = Math.max(50, Math.min(loc.capacity * 1.05, loc.currentCount + delta));
          const roundedCount = Math.round(updatedCount);
          const newStatus = calculateStatus(roundedCount, loc.capacity);
          const flow = delta >= 0 ? `+${delta}/min` : `${delta}/min`;
          const density = `${((roundedCount / loc.capacity) * 4.2).toFixed(1)} p/m²`;

          return {
            ...loc,
            currentCount: roundedCount,
            status: newStatus,
            flowRate: flow,
            densitySqm: density,
            lastUpdated: "Simulated",
          };
        })
      );
    }, 4500);

    return () => clearInterval(interval);
  }, [simulationActive]);

  // Derived metrics
  const totalLocations = locations.length;
  const totalCrowdCount = locations.reduce((acc, curr) => acc + curr.currentCount, 0);
  const totalCapacity = locations.reduce((acc, curr) => acc + curr.capacity, 0);
  const activeAlerts = alerts.filter((a) => a.status === "active");
  const activeAlertsCount = activeAlerts.length;
  const highRiskLocations = locations.filter(
    (l) => l.status === "high" || l.status === "critical"
  );
  const highRiskLocationsCount = highRiskLocations.length;

  return (
    <CrowdContext.Provider
      value={{
        locations,
        alerts,
        cameras,
        simulationActive,
        setSimulationActive,
        selectedCameraId,
        setSelectedCameraId,
        toasts,
        addToast,
        removeToast,
        addLocation,
        acknowledgeAlert,
        resolveAlert,
        totalLocations,
        totalCrowdCount,
        totalCapacity,
        activeAlerts,
        activeAlertsCount,
        highRiskLocations,
        highRiskLocationsCount,
      }}
    >
      {children}
    </CrowdContext.Provider>
  );
}

export function useCrowd() {
  const context = useContext(CrowdContext);
  if (!context) {
    throw new Error("useCrowd must be used within a CrowdProvider");
  }
  return context;
}
