# walking-pad-distance-modifier

Chrome extension (Manifest V3) to load a Garmin-style walking activity JSON file, inspect key activity fields, modify distance values, and export an updated JSON file.

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
- Proportional distance recalculation for known top-level distance fields and record-level `*distance*` numeric fields
- Export updated file as `<original-name>-modified.json`
- Reset button to clear current state

## Project structure

- `/manifest.json`
- `/popup.html`
- `/popup.css`
- `/popup.js`
- `/lib/json-distance-modifier.js`
- `/assets/icon16.png`
- `/assets/icon48.png`
- `/assets/icon128.png`

## Build contract (CI)

- `npm ci` installs project dependencies from `package-lock.json`.
- `npm run build` produces a production-ready extension in `/dist`.
- `/dist/manifest.json` must exist at the root of the built extension output.
- The ZIP package for distribution must contain the contents of `/dist` at archive root (not a parent `dist/` folder).

## Garmin-style JSON shape (example)

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

## How distance recalculation works

1. Read original total distance from known Garmin-like fields.
2. Compute `scale = newDistanceMeters / originalDistanceMeters`.
3. Multiply recognized top-level distance fields by `scale`.
4. Multiply record-level numeric fields whose key contains `distance` by `scale`.
5. Keep all unrelated fields unchanged.

## Current limitations

- Supports common Garmin-style field names, not every possible export variant.
- Record-level scaling is key-name based (`distance` substring) and numeric-only.
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
