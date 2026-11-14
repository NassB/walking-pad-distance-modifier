import assert from "node:assert/strict";
import test from "node:test";

import { applyDistanceScaling } from "../lib/json-distance-modifier.js";

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
