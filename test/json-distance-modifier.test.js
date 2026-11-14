import assert from "node:assert/strict";
import test from "node:test";

import { applyDistanceScaling } from "../lib/json-distance-modifier.js";
import { normalizeActivity } from "../lib/activity-normalizer.js";
import { activityToTcx } from "../lib/tcx-exporter.js";
import { activityToGpx } from "../lib/gpx-exporter.js";
import { activityToFit } from "../lib/fit-exporter.js";

test("sets FIT-JSON distances from zero without changing ascent or descent", () => {
  const activity = {
    messages: {
      session: [{ total_distance: 0, total_ascent: 12, total_descent: 3 }],
      lap: [{ total_distance: 0, total_ascent: 4, total_descent: 1 }],
      record: [
        { timestamp: "2026-01-01T00:00:00Z", distance: 0 },
        { timestamp: "2026-01-01T00:01:00Z", distance: 0 }
      ]
    }
  };

  const result = applyDistanceScaling(activity, 5);

  assert.deepEqual(result, {
    originalDistanceMeters: 0,
    newDistanceMeters: 5000,
    scale: null
  });
  assert.equal(activity.messages.session[0].total_distance, 5);
  assert.equal(activity.messages.lap[0].total_distance, 5);
  assert.deepEqual(activity.messages.record.map(({ distance }) => distance), [0, 5]);
  assert.equal(activity.messages.session[0].total_ascent, 12);
  assert.equal(activity.messages.session[0].total_descent, 3);
  assert.equal(activity.messages.lap[0].total_ascent, 4);
  assert.equal(activity.messages.lap[0].total_descent, 1);
});

test("applies the requested slope when setting FIT-JSON distance from zero", () => {
  const activity = {
    messages: {
      session: [{ total_distance: 0 }],
      lap: [{ total_distance: 0 }],
      record: []
    }
  };

  applyDistanceScaling(activity, 5, { slope: 2 });

  assert.equal(activity.messages.session[0].total_ascent, 100);
  assert.equal(activity.messages.session[0].total_descent, 0);
  assert.equal(activity.messages.lap[0].total_ascent, 100);
  assert.equal(activity.messages.lap[0].total_descent, 0);
});

test("computes speed in m/s and altitude in meters for km-based FIT-JSON with constantPace and slope", () => {
  const activity = {
    messages: {
      session: [{ start_time: "2026-01-01T00:00:00Z", total_distance: 2, total_elapsed_time: 1000 }],
      lap: [{ total_distance: 1 }, { total_distance: 1 }],
      record: [
        { timestamp: "2026-01-01T00:00:00Z", distance: 0, speed: 1, cadence: 100, altitude: 10 },
        { timestamp: "2026-01-01T00:16:40Z", distance: 2, speed: 1, cadence: 120, altitude: 10 }
      ]
    }
  };

  applyDistanceScaling(activity, 5, { constantPace: true, slope: 3 });

  // 5000 m over 1000 s = 5 m/s
  assert.equal(activity.messages.session[0].avg_speed, 5);
  assert.equal(activity.messages.record[1].speed, 5);
  assert.equal(activity.messages.record[1].cadence, 110);
  // 5000 m * 3% = 150 m altitude at end, distributed across 2 equal laps (75 m each)
  assert.equal(activity.messages.record[1].altitude, 150);
  assert.equal(activity.messages.session[0].total_ascent, 150);
  assert.equal(activity.messages.session[0].total_descent, 0);
  assert.equal(activity.messages.lap[0].total_ascent, 75);
  assert.equal(activity.messages.lap[1].total_ascent, 75);
});

test("does not scale existing altitude or ascent during normal scaling", () => {
  const activity = {
    messages: {
      session: [{ total_distance: 2, total_ascent: 20, total_descent: 5 }],
      lap: [{ total_distance: 2, total_ascent: 20, total_descent: 5 }],
      record: [
        { timestamp: "2026-01-01T00:00:00Z", distance: 0, altitude: 42 },
        { timestamp: "2026-01-01T00:10:00Z", distance: 2, altitude: 62 }
      ]
    }
  };

  applyDistanceScaling(activity, 6);

  assert.equal(activity.messages.session[0].total_distance, 6);
  assert.equal(activity.messages.session[0].total_ascent, 20);
  assert.equal(activity.messages.session[0].total_descent, 5);
  assert.equal(activity.messages.record[0].altitude, 42);
  assert.equal(activity.messages.record[1].altitude, 62);
});

test("handles negative slope by setting total_descent and zero total_ascent", () => {
  const activity = {
    messages: {
      session: [{ total_distance: 1 }],
      lap: [{ total_distance: 0.5 }, { total_distance: 0.5 }],
      record: []
    }
  };

  applyDistanceScaling(activity, 4, { slope: -2.5 });

  assert.equal(activity.messages.session[0].total_ascent, 0);
  assert.equal(activity.messages.session[0].total_descent, 100);
  assert.equal(activity.messages.lap[0].total_ascent, 0);
  assert.equal(activity.messages.lap[0].total_descent, 50);
  assert.equal(activity.messages.lap[1].total_descent, 50);
});

test("scales Garmin-style JSON and exports valid TCX, GPX, and FIT", () => {
  const activity = {
    activityName: "Walking Pad",
    startTimeLocal: "2026-01-01T10:00:00Z",
    summaryDTO: { duration: 1800, distance: 2000, averageHR: 115, maxHR: 132 },
    activityDetailMetrics: [
      { timestamp: "2026-01-01T10:00:00Z", distance: 0, directSpeed: 1.1, heartRate: 110 },
      { timestamp: "2026-01-01T10:30:00Z", distance: 2000, directSpeed: 1.2, heartRate: 120 }
    ]
  };

  const result = applyDistanceScaling(activity, 4.5, { constantPace: true, slope: 1 });
  assert.equal(result.originalDistanceMeters, 2000);
  assert.equal(result.newDistanceMeters, 4500);
  assert.equal(activity.summaryDTO.distance, 4500);
  assert.equal(activity.summaryDTO.totalAscent, 45);
  assert.equal(activity.summaryDTO.averageSpeed, 2.5);

  const normalized = normalizeActivity(activity);
  assert.equal(normalized.totalDistanceMeters, 4500);

  const tcx = activityToTcx(normalized);
  assert.match(tcx, /<DistanceMeters>4500\.00<\/DistanceMeters>/);

  const gpx = activityToGpx(normalized);
  assert.match(gpx, /<ele>45\.00<\/ele>/);

  const fitBytes = activityToFit(normalized);
  assert.ok(fitBytes instanceof Uint8Array);
  assert.ok(fitBytes.length > 14);
  // FIT header signature ".FIT" at bytes 8..11
  assert.equal(String.fromCharCode(fitBytes[8], fitBytes[9], fitBytes[10], fitBytes[11]), ".FIT");
});
