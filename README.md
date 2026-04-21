# walking-pad-distance-modifier

Chrome extension (Manifest V3) to load Garmin-style walking activity JSON files (including FIT converted to JSON), inspect key activity fields, modify distance values, and export an updated file for Strava import.

## Features

- Popup-only Chrome extension (client-side, no backend)
- Drag-and-drop and file picker support for `.json`
- Garmin-style JSON detection with clear validation errors for unsupported formats
- Activity summary display when available:
  - activity name / sport
  - start time
  - duration
  - total distance
  - average heart rate
  - max heart rate
- Distance modification via a target value in kilometers
- Proportional distance recalculation for all distance fields (session, laps, records)
- Export the modified activity in four formats, selectable via a dropdown:
  - **JSON** — original format with distances patched in-place
  - **TCX** — Garmin Training Center XML; recommended for Strava with heart-rate data
  - **GPX** — GPS Exchange Format with heart-rate extensions; for indoor activities coordinates default to 0,0
  - **FIT** — Garmin FIT binary; includes file_id, records, laps, session, and activity messages
- Reset button to clear current state

## Project structure

- `/manifest.json`
- `/popup.html`
- `/popup.css`
- `/popup.js`
- `/lib/json-distance-modifier.js` — Garmin JSON detection, summary extraction, distance scaling
- `/lib/activity-normalizer.js` — normalizes both JSON formats into a common intermediate form
- `/lib/tcx-exporter.js` — converts normalized activity to TCX XML
- `/lib/gpx-exporter.js` — converts normalized activity to GPX XML with heart-rate extensions
- `/lib/fit-exporter.js` — encodes normalized activity to FIT binary (file_id + records + laps + session + activity)
- `/assets/icon16.png`
- `/assets/icon48.png`
- `/assets/icon128.png`

## Build contract (CI)

- `npm ci` installs project dependencies from `package-lock.json`.
- `npm run build` produces a production-ready extension in `/dist`.
- `/dist/manifest.json` must exist at the root of the built extension output.
- The ZIP package for distribution must contain the contents of `/dist` at archive root (not a parent `dist/` folder).
- The current build script uses Unix shell commands and is intended for CI/Linux environments.

## Supported JSON shapes (examples)

The extension supports Garmin-like activity objects that include fields such as:

```json
{
  "activityName": "Treadmill Walk",
  "activityTypeDTO": { "typeKey": "walking" },
  "startTimeLocal": "2026-01-01 06:30:00",
  "summaryDTO": {
    "duration": 3600,
    "distance": 5000,
    "averageHR": 120,
    "maxHR": 148
  },
  "activityDetailMetrics": [
    { "directSpeed": 1.4, "distance": 100 },
    { "directSpeed": 1.5, "distance": 200 }
  ]
}
```

Distance values are expected in meters. Indoor walking JSON may not contain GPS coordinates, and that is supported.

It also supports FIT files converted to JSON with a `messages` root structure:

```json
{
  "messages": {
    "session": [{ "start_time": "2026-04-14T20:00:31Z", "total_distance": 0.37, "sport": { "label": "Walking" } }],
    "lap": [{ "total_distance": 0.12 }],
    "record": [{ "timestamp": "2026-04-14T20:00:32Z", "distance": 0.001 }]
  }
}
```

In this FIT-JSON shape, distance values are in kilometers for `messages.session[*].total_distance`, `messages.lap[*].total_distance`, and `messages.record[*].distance`.

## How distance recalculation works

1. Read original total distance from known summary fields.
2. Compute a proportional scaling factor from the target distance.
3. For Garmin-like JSON, scale recognized top-level distance fields and record-level numeric `*distance*` fields.
4. For FIT-JSON, scale `messages.session[*].total_distance`, `messages.lap[*].total_distance`, and `messages.record[*].distance`.
5. Keep all unrelated fields unchanged.

## Export formats for Strava

After applying the desired distance, select an export format from the dropdown and click **Export Modified File**:

| Format | File | Notes |
|--------|------|-------|
| JSON | `.json` | Patched activity in original format; useful for re-processing. |
| TCX | `.tcx` | Garmin Training Center XML. **Best for Strava** — preserves laps, heart-rate, and timing. |
| GPX | `.gpx` | GPS Exchange Format with Garmin heart-rate extensions (`gpxtpx:hr`). Indoor activities export with lat=0, lon=0 (no GPS map in Strava). |
| FIT | `.fit` | Garmin FIT binary. Contains `file_id`, per-second `record` messages, `lap`, `session`, and `activity` messages with correct CRC. |

## Current limitations

- Supports common Garmin-style field names, not every possible export variant.
- Record-level scaling is key-name based (`distance` substring) and numeric-only.
- GPX exports for indoor activities use lat=0, lon=0 placeholder coordinates (no real GPS).
- Does not infer or regenerate GPS tracks.
- Keeps JSON semantically intact, but formatting may differ from the original after export.

## Manual test steps (Chrome unpacked extension)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the project folder:
   `/home/runner/work/walking-pad-distance-modifier/walking-pad-distance-modifier`
5. Open the extension popup.
6. Load a Garmin-style `.json` file via drag-drop or **Choose JSON File**.
7. Enter a new distance in km and click **Apply Distance**.
8. Click **Export Modified JSON** and verify output filename ends with `-modified.json`.
