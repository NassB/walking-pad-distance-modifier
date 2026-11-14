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

/**
 * Returns "meters" when the activity's units section explicitly declares
 * distances in metres (Variante B), or "kilometers" otherwise (Variante A:
 * no units section present).
 */
function getFitDistanceUnit(activity) {
  const declared = activity?.units?.session?.total_distance;
  if (declared === "m") return "meters";
  return "kilometers";
}

function normalizeFitJson(activity) {
  const sessions = activity.messages.session ?? [];
  const laps = activity.messages.lap ?? [];
  const records = activity.messages.record ?? [];
  const s = sessions[0] ?? {};

  const unit = getFitDistanceUnit(activity);
  function toMeters(v) {
    const n = finiteNum(v);
    if (n == null) return 0;
    return unit === "meters" ? n : n * KM_TO_M;
  }

  const startTime = parseIso(s.start_time);
  const totalDistanceMeters = toMeters(s.total_distance);
  const durationSeconds =
    finiteNum(s.total_elapsed_time) ?? finiteNum(s.total_timer_time) ?? 0;
  const sport =
    s.sport_profile_name ?? s.sport?.label ?? s.sub_sport?.label ?? "Walking";

  const normalLaps = laps.map((lap) => ({
    startTime: parseIso(lap.start_time),
    distanceMeters: toMeters(lap.total_distance),
    durationSeconds:
      finiteNum(lap.total_elapsed_time) ?? finiteNum(lap.total_timer_time) ?? 0,
    avgHeartRate: finiteNum(lap.avg_heart_rate),
    maxHeartRate: finiteNum(lap.max_heart_rate),
    totalAscent: finiteNum(lap.total_ascent),
    totalDescent: finiteNum(lap.total_descent)
  }));

  const normalRecords = records.map((r) => {
    const cadBase = finiteNum(r.cadence);
    // fractional_cadence is additive sub-step precision; default to 0 when absent so the
    // integer cadence value is used directly without truncation.
    const cadFrac = finiteNum(r.fractional_cadence) ?? 0;
    return {
      timestamp: parseIso(r.timestamp),
      distanceMeters: toMeters(r.distance),
      heartRate: finiteNum(r.heart_rate),
      speed: finiteNum(r.enhanced_speed ?? r.speed),
      cadence: cadBase != null ? Math.round(cadBase + cadFrac) : undefined,
      altitude: finiteNum(r.altitude)
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
              maxHeartRate: maxHR,
              totalAscent: finiteNum(s.total_ascent),
              totalDescent: finiteNum(s.total_descent)
            }
          ],
    records: normalRecords,
    totalAscent: finiteNum(s.total_ascent),
    totalDescent: finiteNum(s.total_descent)
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
      cadence: finiteNum(r.cadence),
      altitude: finiteNum(r.altitude)
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
        maxHeartRate: maxHR,
        totalAscent: finiteNum(summary.totalAscent ?? summary.total_ascent),
        totalDescent: finiteNum(summary.totalDescent ?? summary.total_descent)
      }
    ],
    records: normalRecords,
    totalAscent: finiteNum(summary.totalAscent ?? summary.total_ascent),
    totalDescent: finiteNum(summary.totalDescent ?? summary.total_descent)
  };
}

export function normalizeActivity(activity) {
  if (activity?.messages?.session) {
    return normalizeFitJson(activity);
  }
  return normalizeGarminStyle(activity);
}
