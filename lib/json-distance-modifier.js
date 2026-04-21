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
const FIT_MESSAGES_PATH = ["messages"];
const FIT_SESSION_PATH = ["messages", "session"];
const FIT_LAP_PATH = ["messages", "lap"];
const FIT_RECORD_PATH = ["messages", "record"];

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

/**
 * Returns "meters" when the activity's units section explicitly declares
 * distances in metres (Variante B), or "kilometers" otherwise (Variante A:
 * no units section present, or units section absent/different).
 */
function getFitDistanceUnit(activity) {
  const declared = activity?.units?.session?.total_distance;
  if (declared === "m") return "meters";
  return "kilometers";
}

function isFitJsonActivity(activity) {
  const messages = getAtPath(activity, FIT_MESSAGES_PATH);
  if (!messages || typeof messages !== "object") {
    return false;
  }
  return (
    Array.isArray(getAtPath(activity, FIT_SESSION_PATH)) ||
    Array.isArray(getAtPath(activity, FIT_RECORD_PATH)) ||
    Array.isArray(messages.activity)
  );
}

function getFitOriginalDistanceKm(activity) {
  const sessionDistanceKm = Number(getAtPath(activity, ["messages", "session", 0, "total_distance"]));
  if (Number.isFinite(sessionDistanceKm)) {
    return sessionDistanceKm;
  }

  const records = getAtPath(activity, FIT_RECORD_PATH);
  if (!Array.isArray(records)) {
    return undefined;
  }

  let maxDistanceKm;
  for (const record of records) {
    const distanceKm = Number(record?.distance);
    if (!Number.isFinite(distanceKm)) {
      continue;
    }
    if (!Number.isFinite(maxDistanceKm) || distanceKm > maxDistanceKm) {
      maxDistanceKm = distanceKm;
    }
  }
  return maxDistanceKm;
}

function findRecordsContainer(activity) {
  const fitRecords = getAtPath(activity, FIT_RECORD_PATH);
  if (Array.isArray(fitRecords)) {
    return fitRecords;
  }
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
  if (isFitJsonActivity(activity)) {
    return true;
  }
  return (
    Boolean(activity.summaryDTO) ||
    Boolean(activity.activityTypeDTO) ||
    Boolean(activity.activityName) ||
    Number.isFinite(firstFiniteNumber(activity, ROOT_DISTANCE_PATHS))
  );
}

export function getActivitySummary(activity) {
  if (isFitJsonActivity(activity)) {
    const session = getAtPath(activity, ["messages", "session", 0]);
    const rawDistanceKm = getFitOriginalDistanceKm(activity);
    const unit = getFitDistanceUnit(activity);
    const distanceMeters = Number.isFinite(rawDistanceKm)
      ? (unit === "meters" ? rawDistanceKm : kmToMeters(rawDistanceKm))
      : undefined;
    const fitRecords = getAtPath(activity, FIT_RECORD_PATH);
    const recordHeartRates = Array.isArray(fitRecords)
      ? fitRecords
          .map((record) => Number(record?.heart_rate))
          .filter((value) => Number.isFinite(value))
      : [];
    const averageHeartRateFromRecords = recordHeartRates.length
      ? recordHeartRates.reduce((sum, value) => sum + value, 0) / recordHeartRates.length
      : undefined;
    const maxHeartRateFromRecords = recordHeartRates.length
      ? Math.max(...recordHeartRates)
      : undefined;
    const sessionAvgHeartRate = Number(session?.avg_heart_rate);
    const sessionMaxHeartRate = Number(session?.max_heart_rate);
    const sessionElapsedSeconds = Number(session?.total_elapsed_time);
    const sessionTimerSeconds = Number(session?.total_timer_time);
    const activityTimerSeconds = Number(getAtPath(activity, ["messages", "activity", 0, "total_timer_time"]));
    return {
      nameOrSport:
        session?.sport_profile_name ??
        session?.sport?.label ??
        session?.sub_sport?.label ??
        getAtPath(activity, ["messages", "activity", 0, "type", "label"]) ??
        "—",
      startTime: session?.start_time ?? "—",
      durationSeconds: Number.isFinite(sessionElapsedSeconds)
        ? sessionElapsedSeconds
        : Number.isFinite(sessionTimerSeconds)
          ? sessionTimerSeconds
          : Number.isFinite(activityTimerSeconds)
            ? activityTimerSeconds
            : undefined,
      distanceMeters,
      averageHeartRate: Number.isFinite(sessionAvgHeartRate)
        ? sessionAvgHeartRate
        : averageHeartRateFromRecords,
      maxHeartRate: Number.isFinite(sessionMaxHeartRate)
        ? sessionMaxHeartRate
        : maxHeartRateFromRecords
    };
  }
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

  if (isFitJsonActivity(activity)) {
    const sessions = getAtPath(activity, FIT_SESSION_PATH);
    const unit = getFitDistanceUnit(activity);
    const rawOriginal = getFitOriginalDistanceKm(activity);
    if (!Number.isFinite(rawOriginal) || rawOriginal <= 0) {
      throw new Error("Could not find a valid original distance in the JSON file.");
    }
    // Normalise original distance to metres for the return value and scale calculation.
    const originalDistanceMeters =
      unit === "meters" ? rawOriginal : kmToMeters(rawOriginal);

    const targetKm = Number(newDistanceKm);
    if (!Number.isFinite(targetKm) || targetKm <= 0) {
      throw new Error("Target distance must be a positive number.");
    }
    const newDistanceMeters = kmToMeters(targetKm);
    // Scale is a dimensionless ratio and is correct regardless of whether the
    // stored values are in km or m (both numerator and denominator are in metres).
    const scale = newDistanceMeters / originalDistanceMeters;

    if (Array.isArray(sessions)) {
      for (const session of sessions) {
        if (session && typeof session === "object" && Number.isFinite(Number(session.total_distance))) {
          session.total_distance = Number(session.total_distance) * scale;
        }
      }
    }

    const laps = getAtPath(activity, FIT_LAP_PATH);
    if (Array.isArray(laps)) {
      for (const lap of laps) {
        if (lap && typeof lap === "object" && Number.isFinite(Number(lap.total_distance))) {
          lap.total_distance = Number(lap.total_distance) * scale;
        }
      }
    }

    const records = getAtPath(activity, FIT_RECORD_PATH);
    if (Array.isArray(records)) {
      for (const record of records) {
        if (record && typeof record === "object" && Number.isFinite(Number(record.distance))) {
          record.distance = Number(record.distance) * scale;
        }
      }
    }

    return {
      originalDistanceMeters,
      newDistanceMeters,
      scale
    };
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
