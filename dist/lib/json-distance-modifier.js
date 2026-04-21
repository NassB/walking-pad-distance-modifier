const METERS_PER_KM = 1000;

const ROOT_DISTANCE_PATHS = [
  ["summaryDTO", "distance"],
  ["summaryDTO", "totalDistance"],
  ["distance"],
  ["totalDistance"],
  ["activitySummary", "distance"],
  ["activitySummary", "totalDistance"]
];

const ROOT_DURATION_PATHS = [
  ["summaryDTO", "duration"],
  ["summaryDTO", "elapsedDuration"],
  ["duration"],
  ["elapsedDuration"]
];

const ROOT_START_PATHS = [["startTimeLocal"], ["startTimeGMT"], ["startTime"]];
const ROOT_NAME_PATHS = [["activityName"], ["activityTypeDTO", "typeKey"], ["activityType", "typeKey"], ["sport"]];
const ROOT_AVG_HR_PATHS = [["summaryDTO", "averageHR"], ["summaryDTO", "averageHeartRate"], ["averageHR"], ["averageHeartRate"]];
const ROOT_MAX_HR_PATHS = [["summaryDTO", "maxHR"], ["summaryDTO", "maxHeartRate"], ["maxHR"], ["maxHeartRate"]];

export function metersToKm(value) {
  return Number(value) / METERS_PER_KM;
}

export function kmToMeters(value) {
  return Number(value) * METERS_PER_KM;
}

export function formatKm(meters) {
  if (!Number.isFinite(Number(meters))) {
    return "—";
  }
  return `${metersToKm(meters).toFixed(3)} km`;
}

export function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total < 0) {
    return "—";
  }
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  return [hrs, mins, secs].map((n) => String(n).padStart(2, "0")).join(":");
}

function getAtPath(obj, path) {
  let current = obj;
  for (const key of path) {
    if (current == null || typeof current !== "object" || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function setAtPath(obj, path, value) {
  let current = obj;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (current == null || typeof current !== "object" || !(key in current)) {
      return false;
    }
    current = current[key];
  }
  const lastKey = path[path.length - 1];
  if (current == null || typeof current !== "object" || !(lastKey in current)) {
    return false;
  }
  current[lastKey] = value;
  return true;
}

function firstValue(obj, paths) {
  for (const path of paths) {
    const value = getAtPath(obj, path);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}

function firstFiniteNumber(obj, paths) {
  for (const path of paths) {
    const value = Number(getAtPath(obj, path));
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function findRecordsContainer(activity) {
  const candidates = ["activityDetailMetrics", "records", "samples", "laps", "waypoints"];
  for (const key of candidates) {
    if (Array.isArray(activity[key])) {
      return activity[key];
    }
  }
  return null;
}

export function detectGarminActivity(activity) {
  if (!activity || typeof activity !== "object" || Array.isArray(activity)) {
    return false;
  }
  return (
    Boolean(activity.summaryDTO) ||
    Boolean(activity.activityTypeDTO) ||
    Boolean(activity.activityName) ||
    Number.isFinite(firstFiniteNumber(activity, ROOT_DISTANCE_PATHS))
  );
}

export function getActivitySummary(activity) {
  const distanceMeters = firstFiniteNumber(activity, ROOT_DISTANCE_PATHS);
  return {
    nameOrSport: firstValue(activity, ROOT_NAME_PATHS) ?? "—",
    startTime: firstValue(activity, ROOT_START_PATHS) ?? "—",
    durationSeconds: firstFiniteNumber(activity, ROOT_DURATION_PATHS),
    distanceMeters,
    averageHeartRate: firstFiniteNumber(activity, ROOT_AVG_HR_PATHS),
    maxHeartRate: firstFiniteNumber(activity, ROOT_MAX_HR_PATHS)
  };
}

function scaleRecordDistances(records, scale) {
  if (!Array.isArray(records)) {
    return;
  }
  for (const record of records) {
    if (!record || typeof record !== "object") {
      continue;
    }
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === "number" && /distance/i.test(key)) {
        record[key] = value * scale;
      }
    }
  }
}

export function applyDistanceScaling(activity, newDistanceKm) {
  if (!detectGarminActivity(activity)) {
    throw new Error("Unsupported JSON format. Expected Garmin-style activity JSON.");
  }

  const originalDistanceMeters = firstFiniteNumber(activity, ROOT_DISTANCE_PATHS);
  if (!Number.isFinite(originalDistanceMeters) || originalDistanceMeters <= 0) {
    throw new Error("Could not find a valid original distance in the JSON file.");
  }

  const targetKm = Number(newDistanceKm);
  if (!Number.isFinite(targetKm) || targetKm <= 0) {
    throw new Error("Target distance must be a positive number.");
  }

  const newDistanceMeters = kmToMeters(targetKm);
  const scale = newDistanceMeters / originalDistanceMeters;

  for (const path of ROOT_DISTANCE_PATHS) {
    const existingValue = Number(getAtPath(activity, path));
    if (Number.isFinite(existingValue)) {
      setAtPath(activity, path, existingValue * scale);
    }
  }

  const records = findRecordsContainer(activity);
  scaleRecordDistances(records, scale);

  return {
    originalDistanceMeters,
    newDistanceMeters,
    scale
  };
}
