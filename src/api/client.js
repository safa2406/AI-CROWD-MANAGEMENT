/**
 * Central API Client for Crowd Safety Management System
 * Connects to Django REST Framework backend at http://127.0.0.1:8000/api
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

/**
 * Custom Error class for API network and HTTP response errors.
 */
export class ApiError extends Error {
  constructor(message, status = null, data = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/**
 * Generic fetch wrapper with timeout, error handling, and JSON parsing.
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
  };

  let response;
  try {
    response = await fetch(url, config);
  } catch (networkErr) {
    throw new ApiError(
      `Failed to connect to backend at ${API_BASE_URL}. Ensure Django server is running.`,
      0,
      { originalError: networkErr.message }
    );
  }

  // Handle empty 204 No Content
  if (response.status === 204) {
    return null;
  }

  let responseData;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      responseData = await response.json();
    } catch {
      responseData = null;
    }
  } else {
    responseData = await response.text();
  }

  if (!response.ok) {
    const errorMsg =
      (responseData && typeof responseData === "object" && (responseData.error || responseData.detail || responseData.message)) ||
      `API request failed with status ${response.status} (${response.statusText})`;
    throw new ApiError(errorMsg, response.status, responseData);
  }

  return responseData;
}

// ==========================================
// API Methods
// ==========================================

export const crowdApi = {
  /**
   * Fetch all monitored locations
   * GET /api/locations/
   */
  async getLocations(signal) {
    return apiRequest("locations/", { method: "GET", signal });
  },

  /**
   * Fetch a single location by numeric ID
   * GET /api/locations/<id>/
   */
  async getLocationById(id, signal) {
    return apiRequest(`locations/${id}/`, { method: "GET", signal });
  },

  /**
   * Create a new monitored location
   * POST /api/locations/
   */
  async createLocation(locationData) {
    return apiRequest("locations/", {
      method: "POST",
      body: JSON.stringify(locationData),
    });
  },

  /**
   * Fetch all safety alerts with optional query filters
   * GET /api/alerts/?status=...&severity=...
   */
  async getAlerts(filters = {}, signal) {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== "all") params.append("status", filters.status);
    if (filters.severity && filters.severity !== "all") params.append("severity", filters.severity);
    if (filters.location) params.append("location", filters.location);

    const query = params.toString() ? `?${params.toString()}` : "";
    return apiRequest(`alerts/${query}`, { method: "GET", signal });
  },

  /**
   * Retrieve a single alert by ID
   * GET /api/alerts/<id>/
   */
  async getAlertById(id, signal) {
    return apiRequest(`alerts/${id}/`, { method: "GET", signal });
  },

  /**
   * Acknowledge an active alert
   * POST /api/alerts/<id>/acknowledge/
   */
  async acknowledgeAlert(id) {
    return apiRequest(`alerts/${id}/acknowledge/`, {
      method: "POST",
    });
  },

  /**
   * Resolve an alert
   * POST /api/alerts/<id>/resolve/
   */
  async resolveAlert(id) {
    return apiRequest(`alerts/${id}/resolve/`, {
      method: "POST",
    });
  },

  /**
   * Fetch aggregate venue dashboard summary KPIs and hourly trends
   * GET /api/dashboard/summary/
   */
  async getDashboardSummary(signal) {
    return apiRequest("dashboard/summary/", { method: "GET", signal });
  },

  /**
   * Fetch historical crowd readings
   * GET /api/readings/?location=<id>
   */
  async getReadings(locationId = null, signal) {
    const query = locationId ? `?location=${locationId}` : "";
    return apiRequest(`readings/${query}`, { method: "GET", signal });
  },

  /**
   * Ingest a new crowd reading
   * POST /api/readings/
   */
  async createReading(readingData) {
    return apiRequest("readings/", {
      method: "POST",
      body: JSON.stringify(readingData),
    });
  },
};
