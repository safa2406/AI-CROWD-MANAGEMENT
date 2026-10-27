import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  INITIAL_LOCATIONS,
  INITIAL_ALERTS,
  SIMULATED_CAMERAS,
  HOURLY_CROWD_TRENDS,
} from "../data/mockData";
import { crowdApi } from "../api/client";
import {
  normalizeLocation,
  normalizeAlert,
  getLocationAlertInfo,
} from "../api/normalizers";

const CrowdContext = createContext(null);

export function CrowdProvider({ children }) {
  // Initialize state with normalized initial data to avoid rendering undefined during initial fetch
  const [locations, setLocations] = useState(() =>
    INITIAL_LOCATIONS.map(normalizeLocation)
  );
  const [alerts, setAlerts] = useState(() =>
    INITIAL_ALERTS.map(normalizeAlert)
  );
  const [cameras] = useState(SIMULATED_CAMERAS);
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [hourlyTrends, setHourlyTrends] = useState(HOURLY_CROWD_TRENDS);

  // Operational Mode: 'backend' (Live Django DB) vs 'demo' (In-memory simulation)
  const [dataSourceMode, setDataSourceMode] = useState("backend");
  const [simulationActive, setSimulationActiveState] = useState(false);

  // Connection & UI states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCameraId, setSelectedCameraId] = useState("CAM-01");
  const [toasts, setToasts] = useState([]);
  const toastSeqRef = useRef(0);
  const isFetchingRef = useRef(false);

  // Toast dispatch helper
  const addToast = useCallback((message, type = "info") => {
    toastSeqRef.current += 1;
    const id = `tst-${toastSeqRef.current}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Status calculation helper
  const calculateStatus = (count, capacity) => {
    const ratio = count / capacity;
    if (ratio >= 0.9) return "critical";
    if (ratio >= 0.75) return "high";
    if (ratio >= 0.5) return "moderate";
    return "safe";
  };

  /**
   * Fetch live data from Django REST API endpoints
   */
  const fetchBackendData = useCallback(
    async (signal, isManualRetry = false, isSilent = false) => {
      // Avoid overlapping background polling fetches
      if (isSilent && isFetchingRef.current) {
        return;
      }
      isFetchingRef.current = true;

      if (!isSilent) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [summaryRes, alertsRes] = await Promise.all([
          crowdApi.getDashboardSummary(signal),
          crowdApi.getAlerts({}, signal),
        ]);

        if (signal?.aborted) return;

        // Use locations embedded in summaryRes if available (avoids duplicate /api/locations/ queries)
        let rawLocations = Array.isArray(summaryRes?.locations) ? summaryRes.locations : null;
        if (!rawLocations && !signal?.aborted) {
          const locRes = await crowdApi.getLocations(signal);
          if (Array.isArray(locRes)) {
            rawLocations = locRes;
          }
        }

        if (rawLocations) {
          setLocations(rawLocations.map(normalizeLocation));
        }

        if (Array.isArray(alertsRes)) {
          setAlerts(alertsRes.map(normalizeAlert));
        }

        if (summaryRes) {
          setDashboardSummary(summaryRes);
          if (
            Array.isArray(summaryRes.hourly_crowd_trends) &&
            summaryRes.hourly_crowd_trends.length > 0
          ) {
            setHourlyTrends(summaryRes.hourly_crowd_trends);
          }
        }

        setDataSourceMode("backend");
        setError(null);
        if (isManualRetry) {
          addToast("Connected to Django backend successfully.", "success");
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        const msg =
          err.message ||
          "Unable to connect to Django backend. Ensure http://127.0.0.1:8000/ is running.";
        if (!isSilent) {
          setError(msg);
          setDataSourceMode("error");
          addToast(msg, "error");
        }
      } finally {
        isFetchingRef.current = false;
        if (!isSilent) {
          setIsLoading(false);
        }
      }
    },
    [addToast]
  );

  // Initial load on component mount
  useEffect(() => {
    const controller = new AbortController();
    fetchBackendData(controller.signal);
    return () => controller.abort();
  }, [fetchBackendData]);

  // Automatic background synchronization with Django (silent polling every 3.5s)
  useEffect(() => {
    if (dataSourceMode !== "backend") return;

    const interval = setInterval(() => {
      fetchBackendData(undefined, false, true);
    }, 3500);

    return () => clearInterval(interval);
  }, [dataSourceMode, fetchBackendData]);

  /**
   * Switch between Live Backend Mode and Live Demo Mode
   */
  const setSimulationActive = useCallback(
    (active) => {
      setSimulationActiveState(active);
      if (active) {
        // Switch to demo simulation mode
        setDataSourceMode("demo");
        setError(null);
        addToast(
          "Switched to Demo Simulation Mode. Continuous crowd movement active (simulated).",
          "info"
        );
      } else {
        // Switch back to backend mode and re-fetch clean data from Django
        setDataSourceMode("backend");
        addToast("Switched to Live Backend Mode. Reloading from Django...", "info");
        fetchBackendData(undefined, true);
      }
    },
    [addToast, fetchBackendData]
  );

  /**
   * Manual refresh handler
   */
  const refreshData = useCallback(() => {
    if (dataSourceMode === "backend" || dataSourceMode === "error") {
      fetchBackendData(undefined, true);
    } else {
      addToast("Demo data reset to baseline.", "info");
      setLocations(INITIAL_LOCATIONS.map(normalizeLocation));
      setAlerts(INITIAL_ALERTS.map(normalizeAlert));
    }
  }, [dataSourceMode, fetchBackendData, addToast]);

  /**
   * Add new monitored location
   * Persists to Django POST /api/locations/ when in backend mode
   */
  const addLocation = useCallback(
    async (formData) => {
      const capacity = parseInt(formData.capacity, 10) || 1000;
      const currentCount = parseInt(formData.currentCount, 10) || 0;
      const status = calculateStatus(currentCount, capacity);

      if (dataSourceMode === "backend") {
        try {
          const payload = {
            name: formData.name,
            location_type: formData.type || "Public Plaza",
            address: formData.zone || "Zone A - General Area",
            safe_capacity: capacity,
          };

          const createdBackendLoc = await crowdApi.createLocation(payload);

          // If initial crowd count specified, create initial reading
          if (currentCount > 0 && createdBackendLoc.id) {
            try {
              await crowdApi.createReading({
                location: createdBackendLoc.id,
                crowd_count: currentCount,
                data_source: "manual_entry",
              });
            } catch {
              // Non-blocking reading error
            }
          }

          // Refresh complete backend state to update totals and summaries
          await fetchBackendData();
          addToast(`Added location: ${createdBackendLoc.name} (Saved to Django)`, "success");
          return normalizeLocation(createdBackendLoc);
        } catch (err) {
          addToast(`Failed to add location: ${err.message}`, "error");
          throw err;
        }
      } else {
        // Demo mode: local in-memory addition
        const newLoc = normalizeLocation({
          id: `LOC-${Math.floor(100 + Math.random() * 900)}`,
          name: formData.name,
          location_type: formData.type || "Public Plaza",
          address: formData.zone || "Zone A - General Area",
          safe_capacity: capacity,
          current_count: currentCount,
          current_status: status === "safe" ? "low" : status,
          cameraCount: parseInt(formData.cameraCount, 10) || 1,
          flowRate: "+0/min",
          riskScore: Math.round((currentCount / capacity) * 90),
          densitySqm: `${((currentCount / capacity) * 4).toFixed(1)} people/m²`,
        });

        setLocations((prev) => [newLoc, ...prev]);
        addToast(`Added location: ${newLoc.name} (Demo Mode)`, "success");
        return newLoc;
      }
    },
    [dataSourceMode, fetchBackendData, addToast]
  );

  /**
   * Acknowledge Alert
   * Persists to Django POST /api/alerts/<id>/acknowledge/
   */
  const acknowledgeAlert = useCallback(
    async (alertId) => {
      const targetAlert = alerts.find((a) => a.id === alertId || a.rawId === alertId);
      const numericId =
        targetAlert?.rawId ??
        (typeof alertId === "number"
          ? alertId
          : parseInt(String(alertId).replace(/\D/g, ""), 10));

      if (dataSourceMode === "backend" && numericId) {
        try {
          await crowdApi.acknowledgeAlert(numericId);
          setAlerts((prev) =>
            prev.map((item) =>
              item.id === alertId || item.rawId === numericId
                ? {
                    ...item,
                    status: "acknowledged",
                    acknowledgedBy: "Safety Operator (Current Session)",
                    acknowledged_at: new Date().toISOString(),
                    acknowledgedAt: new Date().toLocaleTimeString(),
                  }
                : item
            )
          );
          // Refetch backend data to synchronize summary KPIs and ensure full consistency with Django
          fetchBackendData(undefined, false, true);
          addToast(`Alert ${alertId} acknowledged. Saved to Django backend.`, "warning");
        } catch (err) {
          addToast(`Failed to acknowledge alert: ${err.message}`, "error");
        }
      } else {
        // Demo mode: in-memory state update
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
        addToast(`Alert ${alertId} acknowledged (Demo Mode).`, "warning");
      }
    },
    [alerts, dataSourceMode, addToast, fetchBackendData]
  );

  /**
   * Resolve Alert
   * Persists to Django POST /api/alerts/<id>/resolve/
   */
  const resolveAlert = useCallback(
    async (alertId) => {
      const targetAlert = alerts.find((a) => a.id === alertId || a.rawId === alertId);
      const numericId =
        targetAlert?.rawId ??
        (typeof alertId === "number"
          ? alertId
          : parseInt(String(alertId).replace(/\D/g, ""), 10));

      if (dataSourceMode === "backend" && numericId) {
        try {
          await crowdApi.resolveAlert(numericId);
          setAlerts((prev) =>
            prev.map((item) =>
              item.id === alertId || item.rawId === numericId
                ? {
                    ...item,
                    status: "resolved",
                    resolvedBy: "Safety Command (Resolved)",
                    resolved_at: new Date().toISOString(),
                    resolvedAt: new Date().toLocaleTimeString(),
                  }
                : item
            )
          );
          // Refetch backend data to synchronize summary KPIs and ensure full consistency with Django
          fetchBackendData(undefined, false, true);
          addToast(`Alert ${alertId} marked as resolved. Updated in Django database.`, "success");
        } catch (err) {
          addToast(`Failed to resolve alert: ${err.message}`, "error");
        }
      } else {
        // Demo mode: in-memory state update
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
        addToast(`Alert ${alertId} resolved (Demo Mode).`, "success");
      }
    },
    [alerts, dataSourceMode, addToast, fetchBackendData]
  );

  /**
   * Demo Simulation Loop:
   * STRICT SEPARATION: Only runs if simulationActive is true AND mode is 'demo'.
   * NEVER sends simulated readings or fake alerts to the Django backend.
   */
  useEffect(() => {
    if (!simulationActive || dataSourceMode !== "demo") return;

    const interval = setInterval(() => {
      setLocations((prevLocations) =>
        prevLocations.map((loc) => {
          const delta = Math.floor(Math.random() * 61) - 25;
          const updatedCount = Math.max(
            50,
            Math.min(loc.capacity * 1.05, loc.currentCount + delta)
          );
          const roundedCount = Math.round(updatedCount);
          const newStatus = calculateStatus(roundedCount, loc.capacity);
          const flow = delta >= 0 ? `+${delta}/min` : `${delta}/min`;
          const density = `${((roundedCount / loc.capacity) * 4.2).toFixed(1)} people/m²`;

          return {
            ...loc,
            currentCount: roundedCount,
            current_count: roundedCount,
            status: newStatus,
            current_status: newStatus === "safe" ? "low" : newStatus,
            flowRate: flow,
            densitySqm: density,
            lastUpdated: "Simulated",
          };
        })
      );
    }, 4500);

    return () => clearInterval(interval);
  }, [simulationActive, dataSourceMode]);

  // Enrich locations with real-time alert state derived from Django alert records
  const enrichedLocations = useMemo(() => {
    return locations.map((loc) => {
      const alertInfo = getLocationAlertInfo(loc, alerts);
      return {
        ...loc,
        alertInfo,
        alertStatus: alertInfo.status,
        alertLabel: alertInfo.badgeLabel,
      };
    });
  }, [locations, alerts]);

  // Derived metrics with priority to backend summary when in backend mode
  const totalLocations = dashboardSummary?.total_locations ?? locations.length;
  const totalCrowdCount =
    dashboardSummary?.total_crowd_count ??
    locations.reduce((acc, curr) => acc + (curr.currentCount || 0), 0);
  const totalCapacity =
    dashboardSummary?.total_safe_capacity ??
    locations.reduce((acc, curr) => acc + (curr.capacity || 0), 0);
  const activeAlerts = alerts.filter((a) => a.status === "active");
  const activeAlertsCount = activeAlerts.length;
  const highRiskLocations = locations.filter(
    (l) => l.status === "high" || l.status === "critical"
  );
  const highRiskLocationsCount =
    dashboardSummary?.high_crowd_locations_count ?? highRiskLocations.length;
  const overallOccupancyPct =
    dashboardSummary?.overall_occupancy_percentage ??
    (totalCapacity > 0 ? Math.round((totalCrowdCount / totalCapacity) * 100) : 0);

  const getLocationAlert = useCallback(
    (locationOrId) => getLocationAlertInfo(locationOrId, alerts),
    [alerts]
  );

  return (
    <CrowdContext.Provider
      value={{
        locations: enrichedLocations,
        alerts,
        cameras,
        simulationActive,
        setSimulationActive,
        dataSourceMode,
        dashboardSummary,
        hourlyTrends,
        isLoading,
        error,
        refreshData,
        selectedCameraId,
        setSelectedCameraId,
        toasts,
        addToast,
        removeToast,
        addLocation,
        acknowledgeAlert,
        resolveAlert,
        getLocationAlert,
        totalLocations,
        totalCrowdCount,
        totalCapacity,
        activeAlerts,
        activeAlertsCount,
        highRiskLocations,
        highRiskLocationsCount,
        overallOccupancyPct,
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
