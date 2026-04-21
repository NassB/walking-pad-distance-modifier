const KM_TO_M = 1000;

function deepGet(obj, ...keys) {
  let cur = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[k];
  }
  return cur;
}

function parseIso(str) {
  if (!str || typeof str !== "string") return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function finiteNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeFitJson(activity) {
  const sessions = activity.messages.session ?? [];
  const laps = activity.messages.lap ?? [];
  const records = activity.messages.record ?? [];
  const s = sessions[0] ?? {};

  const startTime = parseIso(s.start_time);
  const totalDistanceMeters = (finiteNum(s.total_distance) ?? 0) * KM_TO_M;
  const durationSeconds =
    finiteNum(s.total_elapsed_time) ?? finiteNum(s.total_timer_time) ?? 0;
  const sport =
    s.sport_profile_name ?? s.sport?.label ?? s.sub_sport?.label ?? "Walking";

  const normalLaps = laps.map((lap) => ({
    startTime: parseIso(lap.start_time),
    distanceMeters: (finiteNum(lap.total_distance) ?? 0) * KM_TO_M,
    durationSeconds:
      finiteNum(lap.total_elapsed_time) ?? finiteNum(lap.total_timer_time) ?? 0,
    avgHeartRate: finiteNum(lap.avg_heart_rate),
    maxHeartRate: finiteNum(lap.max_heart_rate)
  }));

  const normalRecords = records.map((r) => {
    const cadBase = finiteNum(r.cadence);
    const cadFrac = finiteNum(r.fractional_cadence) ?? 0;
    return {
      timestamp: parseIso(r.timestamp),
      distanceMeters: (finiteNum(r.distance) ?? 0) * KM_TO_M,
      heartRate: finiteNum(r.heart_rate),
      speed: finiteNum(r.enhanced_speed ?? r.speed),
      cadence: cadBase != null ? Math.round(cadBase + cadFrac) : undefined
    };
  });

  const avgHR = finiteNum(s.avg_heart_rate);
  const maxHR = finiteNum(s.max_heart_rate);

  return {
    sport,
    startTime,
    totalDistanceMeters,
    durationSeconds,
    avgHeartRate: avgHR,
    maxHeartRate: maxHR,
    laps:
      normalLaps.length > 0
        ? normalLaps
        : [
            {
              startTime,
              distanceMeters: totalDistanceMeters,
              durationSeconds,
              avgHeartRate: avgHR,
              maxHeartRate: maxHR
            }
          ],
    records: normalRecords
  };
}

function normalizeGarminStyle(activity) {
  const summary = activity.summaryDTO ?? activity;

  const distanceMeters =
    finiteNum(deepGet(summary, "distance")) ??
    finiteNum(deepGet(summary, "totalDistance")) ??
    finiteNum(deepGet(activity, "activitySummary", "distance")) ??
    0;

  const durationSeconds =
    finiteNum(deepGet(summary, "duration")) ??
    finiteNum(deepGet(summary, "elapsedDuration")) ??
    0;

  const startTime =
    parseIso(activity.startTimeLocal) ??
    parseIso(activity.startTimeGMT) ??
    parseIso(activity.startTime);

  const sport =
    activity.activityName ??
    deepGet(activity, "activityTypeDTO", "typeKey") ??
    deepGet(activity, "activityType", "typeKey") ??
    activity.sport ??
    "Walking";

  const avgHR =
    finiteNum(deepGet(summary, "averageHR")) ??
    finiteNum(deepGet(summary, "averageHeartRate"));
  const maxHR =
    finiteNum(deepGet(summary, "maxHR")) ??
    finiteNum(deepGet(summary, "maxHeartRate"));

  const recordsContainer =
    ["activityDetailMetrics", "records", "samples", "laps", "waypoints"]
      .map((k) => activity[k])
      .find((a) => Array.isArray(a)) ?? [];

  const normalRecords = recordsContainer.map((r) => {
    const distEntry = Object.entries(r).find(
      ([k, v]) => /distance/i.test(k) && typeof v === "number"
    );
    return {
      timestamp: parseIso(r.startTime ?? r.timestamp ?? r.time),
      distanceMeters: distEntry ? distEntry[1] : undefined,
      heartRate: finiteNum(r.heartRate ?? r.heart_rate),
      speed: finiteNum(r.directSpeed ?? r.speed ?? r.enhanced_speed),
      cadence: finiteNum(r.cadence)
    };
  });

  return {
    sport,
    startTime,
    totalDistanceMeters: distanceMeters,
    durationSeconds,
    avgHeartRate: avgHR,
    maxHeartRate: maxHR,
    laps: [
      {
        startTime,
        distanceMeters,
        durationSeconds,
        avgHeartRate: avgHR,
        maxHeartRate: maxHR
      }
    ],
    records: normalRecords
  };
}

export function normalizeActivity(activity) {
  if (activity?.messages?.session) {
    return normalizeFitJson(activity);
  }
  return normalizeGarminStyle(activity);
}
