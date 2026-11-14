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
  const sessionDistanceValue = Number(getAtPath(activity, ["messages", "session", 0, "total_distance"]));
  if (Number.isFinite(sessionDistanceValue)) {
    return sessionDistanceValue;
  }

  const records = getAtPath(activity, FIT_RECORD_PATH);
  if (!Array.isArray(records)) {
    return undefined;
  }

  let maxDistanceValue = undefined;
  for (const record of records) {
    const distanceValue = Number(record?.distance);
    if (!Number.isFinite(distanceValue)) {
      continue;
    }
    if (!Number.isFinite(maxDistanceValue) || distanceValue > maxDistanceValue) {
      maxDistanceValue = distanceValue;
    }
  }
  return maxDistanceValue;
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
    const rawDistanceValue = getFitOriginalDistanceKm(activity);
    const unit = getFitDistanceUnit(activity);
    const distanceMeters = Number.isFinite(rawDistanceValue)
      ? (unit === "meters" ? rawDistanceValue : kmToMeters(rawDistanceValue))
      : undefined;
    const fitRecords = getAtPath(activity, FIT_RECORD_PATH);
    let heartRateSum = 0;
    let heartRateCount = 0;
    let maxHeartRateFromRecords = undefined;
    if (Array.isArray(fitRecords)) {
      for (const record of fitRecords) {
        const heartRate = Number(record?.heart_rate);
        if (!Number.isFinite(heartRate)) {
          continue;
        }
        heartRateSum += heartRate;
        heartRateCount += 1;
        if (!Number.isFinite(maxHeartRateFromRecords) || heartRate > maxHeartRateFromRecords) {
          maxHeartRateFromRecords = heartRate;
        }
      }
    }
    const averageHeartRateFromRecords = heartRateCount
      ? heartRateSum / heartRateCount
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

function applyConstantPaceToSummaries(targets, avgCadence, avgSpeed) {
  for (const s of targets) {
    if (!s || typeof s !== "object") {
      continue;
    }
    if (avgCadence !== undefined) {
      s.avg_cadence = avgCadence;
      s.max_cadence = avgCadence;
    }
    if (Number.isFinite(avgSpeed)) {
      s.avg_speed = avgSpeed;
      s.max_speed = avgSpeed;
      s.enhanced_avg_speed = avgSpeed;
      s.enhanced_max_speed = avgSpeed;
    }
  }
}

function applySlopeToFitSummaries(sessions, laps, newDistanceMeters, slope) {
  if (!slope || slope === 0) {
    return;
  }
  const elevationDelta = (newDistanceMeters * slope) / 100;
  const totalAscent = elevationDelta > 0 ? elevationDelta : 0;
  const totalDescent = elevationDelta < 0 ? Math.abs(elevationDelta) : 0;

  if (Array.isArray(sessions)) {
    for (const s of sessions) {
      if (s && typeof s === "object") {
        s.total_ascent = totalAscent;
        s.total_descent = totalDescent;
      }
    }
  }

  if (Array.isArray(laps) && laps.length > 0) {
    const lapDistances = laps.map((l) => (l && Number.isFinite(Number(l.total_distance)) ? Math.max(0, Number(l.total_distance)) : 0));
    const totalLapDistance = lapDistances.reduce((sum, d) => sum + d, 0);

    for (let i = 0; i < laps.length; i += 1) {
      const lap = laps[i];
      if (!lap || typeof lap !== "object") {
        continue;
      }
      const share = totalLapDistance > 0 ? lapDistances[i] / totalLapDistance : 1 / laps.length;
      lap.total_ascent = totalAscent * share;
      lap.total_descent = totalDescent * share;
    }
  }
}

function processRecords(records, scale, options = {}) {
  if (!Array.isArray(records) || records.length === 0) {
    return { avgCadence: undefined, avgSpeed: undefined };
  }

  const { constantPace, slope, distanceUnit = "meters" } = options;
  const toMetersFactor = distanceUnit === "kilometers" ? METERS_PER_KM : 1;

  let avgCadence = undefined;
  if (constantPace) {
    let cadSum = 0;
    let cadCount = 0;
    for (const r of records) {
      const cadValue = Number(r?.cadence);
      if (Number.isFinite(cadValue)) {
        cadSum += cadValue;
        cadCount++;
      }
    }
    if (cadCount > 0) {
      avgCadence = cadSum / cadCount;
    }
  }

  const getTs = (r) => {
    const val = r?.timestamp || r?.startTime || r?.time || r?.start_time;
    return val ? new Date(val).getTime() : null;
  };

  const startTime = getTs(records[0]);
  const lastRecord = records[records.length - 1];
  const endTime = getTs(lastRecord);
  const totalDurationMs = startTime !== null && endTime !== null ? endTime - startTime : 0;

  // Find the primary distance key
  const distanceKey = Object.keys(lastRecord).find((k) => /distance/i.test(k) && typeof lastRecord[k] === "number") || "distance";
  const originalTotalDistance = Number(lastRecord[distanceKey]) || 0;
  const newTotalDistance = originalTotalDistance * scale;
  const newTotalDistanceMeters = newTotalDistance * toMetersFactor;
  const avgSpeed = totalDurationMs > 0 ? newTotalDistanceMeters / (totalDurationMs / 1000) : undefined;

  for (const record of records) {
    if (!record || typeof record !== "object") {
      continue;
    }

    const currentTime = getTs(record);
    const elapsedMs = startTime !== null && currentTime !== null ? currentTime - startTime : 0;

    if (constantPace && totalDurationMs > 0) {
      const newDist = (elapsedMs / totalDurationMs) * newTotalDistance;
      for (const key of Object.keys(record)) {
        if (/distance/i.test(key) && typeof record[key] === "number") {
          record[key] = newDist;
        }
      }
      if (Number.isFinite(avgSpeed)) {
        if ("speed" in record) record.speed = avgSpeed;
        if ("enhanced_speed" in record) record.enhanced_speed = avgSpeed;
        if ("directSpeed" in record) record.directSpeed = avgSpeed;
      }
    } else {
      for (const key of Object.keys(record)) {
        if (typeof record[key] === "number" && /distance/i.test(key)) {
          record[key] *= scale;
        }
      }
    }

    if (constantPace && avgCadence !== undefined) {
      if ("cadence" in record) record.cadence = avgCadence;
    }

    if (slope && slope !== 0) {
      const currentDistMeters = (Number(record[distanceKey]) || 0) * toMetersFactor;
      const alt = (currentDistMeters * slope) / 100;
      record.altitude = alt;
      if ("enhanced_altitude" in record) record.enhanced_altitude = alt;
    }
  }

  return {
    avgCadence,
    avgSpeed
  };
}

export function applyDistanceScaling(activity, newDistanceKm, options = {}) {
  if (!detectGarminActivity(activity)) {
    throw new Error("Unsupported JSON format. Expected Garmin-style activity JSON.");
  }

  if (isFitJsonActivity(activity)) {
    const sessions = getAtPath(activity, FIT_SESSION_PATH);
    const unit = getFitDistanceUnit(activity);
    const originalDistanceValue = getFitOriginalDistanceKm(activity);
    if (!Number.isFinite(originalDistanceValue) || originalDistanceValue < 0) {
      throw new Error("Original distance must be a finite value greater than or equal to zero.");
    }

    const targetKm = Number(newDistanceKm);
    if (!Number.isFinite(targetKm) || targetKm <= 0) {
      throw new Error("Target distance must be a positive number.");
    }
    const newDistanceMeters = kmToMeters(targetKm);

    if (originalDistanceValue === 0) {
      const targetDistanceValue = unit === "meters" ? newDistanceMeters : targetKm;

      if (Array.isArray(sessions)) {
        for (const session of sessions) {
          if (session && typeof session === "object") {
            session.total_distance = targetDistanceValue;
          }
        }
      }

      const laps = getAtPath(activity, FIT_LAP_PATH);
      if (Array.isArray(laps) && laps.length > 0) {
        const distancePerLap = targetDistanceValue / laps.length;
        for (const lap of laps) {
          if (lap && typeof lap === "object") {
            lap.total_distance = distancePerLap;
          }
        }
      }

      const records = getAtPath(activity, FIT_RECORD_PATH);
      if (Array.isArray(records) && records.length > 0) {
        if (records.length === 1) {
          if (records[0] && typeof records[0] === "object") {
            records[0].distance = targetDistanceValue;
          }
        } else {
          const lastRecordIndex = records.length - 1;
          for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
            const record = records[recordIndex];
            if (record && typeof record === "object") {
              record.distance = (recordIndex / lastRecordIndex) * targetDistanceValue;
            }
          }
        }
        // Handle slope and cadence for records even if original distance was 0
        const { avgCadence, avgSpeed } = processRecords(records, 1, { ...options, distanceUnit: unit });

        if (options.constantPace) {
          applyConstantPaceToSummaries([...(sessions || []), ...(laps || [])], avgCadence, avgSpeed);
        }
      }

      applySlopeToFitSummaries(sessions, laps, newDistanceMeters, options.slope);

      return {
        originalDistanceMeters: 0,
        newDistanceMeters,
        scale: null
      };
    }

    // Normalise original distance to metres for the return value and scale calculation.
    const originalDistanceMeters =
      unit === "meters" ? originalDistanceValue : kmToMeters(originalDistanceValue);
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
      const { avgCadence, avgSpeed } = processRecords(records, scale, { ...options, distanceUnit: unit });

      if (options.constantPace) {
        applyConstantPaceToSummaries([...(sessions || []), ...(laps || [])], avgCadence, avgSpeed);
      }
    }

    applySlopeToFitSummaries(sessions, laps, newDistanceMeters, options.slope);

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
  const { avgCadence, avgSpeed } = processRecords(records, scale, { ...options, distanceUnit: "meters" });

  if (options.constantPace) {
    const summary = activity.summaryDTO || activity;
    if (avgCadence !== undefined) {
      summary.averageRunningCadenceInStepsPerMinute = avgCadence;
      summary.maxRunningCadenceInStepsPerMinute = avgCadence;
      summary.avg_cadence = avgCadence;
      summary.max_cadence = avgCadence;
    }
    if (Number.isFinite(avgSpeed)) {
      summary.averageSpeed = avgSpeed;
      summary.maxSpeed = avgSpeed;
      summary.enhanced_avg_speed = avgSpeed;
      summary.enhanced_max_speed = avgSpeed;
    }
  }

  if (options.slope && options.slope !== 0) {
    const elevationDelta = (newDistanceMeters * options.slope) / 100;
    const totalAscent = elevationDelta > 0 ? elevationDelta : 0;
    const totalDescent = elevationDelta < 0 ? Math.abs(elevationDelta) : 0;
    const summary = activity.summaryDTO || activity;
    summary.total_ascent = totalAscent;
    summary.totalAscent = totalAscent;
    summary.total_descent = totalDescent;
    summary.totalDescent = totalDescent;
  }

  return {
    originalDistanceMeters,
    newDistanceMeters,
    scale
  };
}
