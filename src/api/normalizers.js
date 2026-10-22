/**
 * Data Normalizers for Django API <-> React Frontend Integration
 * Ensures backward compatibility across all frontend components.
 */

/**
 * Normalizes a Location object from Django API or mock state.
 * Bridges safe_capacity <-> capacity, current_count <-> currentCount,
 * location_type <-> type, address <-> zone, current_status <-> status.
 */
export function normalizeLocation(loc) {
  if (!loc) return null;

  const numericId =
    typeof loc.id === "number"
      ? loc.id
      : parseInt(String(loc.id).replace(/\D/g, ""), 10) || 1;

  // Use matching LOC-101..LOC-106 code for seeded locations, or LOC-<id> for others
  const displayId =
    typeof loc.id === "string" && loc.id.startsWith("LOC-")
      ? loc.id
      : numericId <= 6
      ? `LOC-${100 + numericId}`
      : `LOC-${numericId}`;

  const currentCount = loc.current_count ?? loc.currentCount ?? 0;
  const safeCapacity = loc.safe_capacity ?? loc.capacity ?? 1000;
  const occupancyPercentage =
    loc.occupancy_percentage != null
      ? Number(loc.occupancy_percentage)
      : safeCapacity > 0
      ? Math.round((currentCount / safeCapacity) * 100)
      : 0;

  // Status mapping: Django uses 'low', frontend components expect 'safe'
  const rawStatus = (loc.current_status || loc.status || "low").toLowerCase();
  const status = rawStatus === "low" ? "safe" : rawStatus;

  // Flow rate calculation based on occupancy level
  const defaultFlow =
    occupancyPercentage >= 85
      ? "+84/min"
      : occupancyPercentage >= 75
      ? "+52/min"
      : occupancyPercentage >= 50
      ? "-12/min"
      : "+18/min";
  const flowRate = loc.flowRate || defaultFlow;

  // Density per square meter
  const densityVal = ((occupancyPercentage / 100) * 4.2).toFixed(1);
  const densitySqm = loc.densitySqm || `${densityVal} people/m²`;

  // Risk Score (0 - 100)
  const riskScore =
    loc.riskScore ?? Math.min(100, Math.round(occupancyPercentage * 0.95));

  const cameraCount = loc.camera_count || loc.cameraCount || (numericId === 1 ? 6 : numericId === 2 ? 4 : 5);

  return {
    ...loc,
    rawId: numericId,
    id: displayId,
    name: loc.name,
    // Dual field compatibility
    safe_capacity: safeCapacity,
    capacity: safeCapacity,
    current_count: currentCount,
    currentCount: currentCount,
    location_type: loc.location_type || loc.type || "Public Plaza",
    type: loc.location_type || loc.type || "Public Plaza",
    address: loc.address || loc.zone || "Zone A - General Area",
    zone: loc.address || loc.zone || "Zone A - General Area",
    current_status: rawStatus,
    status: status,
    occupancy_percentage: occupancyPercentage,
    cameraCount,
    flowRate,
    densitySqm,
    riskScore,
    lastUpdated: loc.updated_at ? "Just now" : (loc.lastUpdated || "Just now"),
  };
}

/**
 * Normalizes an Alert object from Django API or mock state.
 * Bridges message <-> description, location <-> locationId,
 * and maintains numeric rawId for Django endpoints.
 */
export function normalizeAlert(alert) {
  if (!alert) return null;

  const rawId =
    typeof alert.id === "number"
      ? alert.id
      : parseInt(String(alert.id).replace(/\D/g, ""), 10) || 1;

  const displayId =
    typeof alert.id === "string" && alert.id.startsWith("ALT-")
      ? alert.id
      : `ALT-${rawId}`;

  const createdDate = alert.created_at ? new Date(alert.created_at) : null;
  const timeFormatted =
    createdDate && !isNaN(createdDate.getTime())
      ? createdDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "Recently";

  const message = alert.message || alert.description || "Crowd density threshold exceeded.";
  const description = alert.description || alert.message || "Crowd density threshold exceeded.";

  const severity = (alert.severity || "moderate").toLowerCase();
  const status = (alert.status || "active").toLowerCase();

  // Category identification
  const category =
    alert.category ||
    (severity === "critical"
      ? "Severe Overcrowding"
      : severity === "high"
      ? "High Crowd Warning"
      : severity === "moderate"
      ? "Hallway Congestion"
      : "Path Narrowing");

  // Recommended action default
  const recommendedAction =
    alert.recommendedAction ||
    (severity === "critical"
      ? "Pause entry turnstiles immediately and deploy crowd marshals to guide passenger outflow."
      : severity === "high"
      ? "Direct ground staff to open express side exit gates to help people move smoothly."
      : "Make a public announcement asking passengers to keep main walkways clear.");

  return {
    ...alert,
    rawId,
    id: displayId,
    location: alert.location,
    locationId: alert.location != null ? String(alert.location) : (alert.locationId || ""),
    locationName: alert.location_name || alert.locationName || `Location #${alert.location}`,
    location_name: alert.location_name || alert.locationName || `Location #${alert.location}`,
    severity,
    status,
    category,
    message,
    description,
    timestamp: alert.timestamp || timeFormatted,
    recordedAt: alert.recorded_at || timeFormatted,
    recommendedAction,
    acknowledgedBy:
      alert.acknowledged_by ||
      alert.acknowledgedBy ||
      (alert.acknowledged_at ? "Safety Operator" : null),
    resolvedBy:
      alert.resolved_by ||
      alert.resolvedBy ||
      (alert.resolved_at ? "Safety Command" : null),
    acknowledged_at: alert.acknowledged_at,
    resolved_at: alert.resolved_at,
  };
}

