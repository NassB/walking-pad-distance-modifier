<p align="center">
  <img src="assets/icon128.png" width="112" height="112" alt="Walking Pad Distance Modifier" />
</p>

<h1 align="center">Walking Pad Distance Modifier</h1>

<p align="center">
  Adjust an indoor walking activity's distance and prepare it for Strava.
  <br />
  A local Chrome extension for Garmin-style activity data.
</p>

<p align="center">
  <a href="#get-started">Get started</a> ·
  <a href="#export-formats">Export formats</a> ·
  <a href="#privacy">Privacy</a> ·
  <a href="#development">Development</a>
</p>

## What it does

Walking pads and wearable devices do not always agree on distance. This extension lets you load a Garmin-style JSON activity, enter a target distance in kilometers, and export the adjusted activity.

- **Inspect** the activity's distance, duration, start time, and heart rate when available.
- **Adjust** distance fields in supported sessions, laps, and records. Options are available for constant pace and cadence and for slope.
- **Export** as JSON, TCX, GPX, or FIT; open Strava's upload page from the extension.
- **Keep processing local**: the extension has no backend. See [Privacy](#privacy) before using a third-party FIT converter.

## Get started

### 1. Install the extension

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Select **Load unpacked** and choose the repository root (or the built `dist/` folder).
4. Open **Walking Pad Distance Modifier** from the extensions menu.

### 2. Prepare your activity

The extension accepts a **Garmin-style `.json` file**, not a `.fit` file directly. If you already have supported JSON, skip to the next step.

To obtain JSON from a Garmin Connect activity:

1. Open the activity in Garmin Connect and choose **⋮ → Export Original** to download the FIT file.
2. Convert the FIT file to JSON with a compatible converter, such as [fitfiletools.com/convert](https://fitfiletools.com/convert).
3. Save the resulting JSON file.

> **Privacy:** fitfiletools.com is a third-party service. Uploading your FIT file shares the activity data in it, which may include health information, with that service. Use it only if you trust the service.

The extension also displays a dismissible guide on matching Garmin Connect activity pages.

### 3. Adjust and export

1. Drop the JSON file into the popup or select **Choose JSON File**.
2. Enter the new distance in kilometers. Optionally select **Constant pace & cadence** or enter a **Slope (%)**.
3. Select **Apply Distance**, choose a format, and select **Export Modified File**.
4. For Strava, use **Open Strava Upload** and select the exported activity file.

The original file is not overwritten; the downloaded file has a `-modified` suffix.

## Export formats

| Format | Best used for | Notes |
| --- | --- | --- |
| **JSON** | Keeping or reprocessing the adjusted source | Retains the input JSON structure; not a Strava activity upload format. |
| **TCX** | Strava import with timing and heart rate | Includes laps and available trackpoint data. |
| **GPX** | Sharing timestamped trackpoints with heart-rate extensions | Uses placeholder `0,0` coordinates; it does not carry the adjusted distance as a track. |
| **FIT** | Binary activity export | Contains session, lap, and record messages. |

Import behavior depends on the source data and the destination service. Check the result after upload.

## Supported input

Garmin-style JSON uses distances in **meters**, for example:

```json
{
  "activityName": "Treadmill Walk",
  "startTimeLocal": "2026-01-01 06:30:00",
  "summaryDTO": { "duration": 3600, "distance": 5000, "averageHR": 120 },
  "activityDetailMetrics": [
    { "directSpeed": 1.4, "distance": 100 },
    { "directSpeed": 1.5, "distance": 200 }
  ]
}
```

FIT converted to JSON can use a `messages` root:

```json
{
  "messages": {
    "session": [{ "start_time": "2026-04-14T20:00:31Z", "total_distance": 0.37 }],
    "lap": [{ "total_distance": 0.12 }],
    "record": [{ "timestamp": "2026-04-14T20:00:32Z", "distance": 0.001 }]
  }
}
```

For FIT-JSON, distances default to **kilometers**. When `units.session.total_distance` is `"m"`, they are interpreted as meters. Common field names are supported, but not every Garmin export variant.

## How adjustment works

For a nonzero original distance, the extension calculates a ratio from the target distance and applies it to recognized distance fields. For FIT-JSON with a zero original distance, it assigns the target to sessions, divides it among laps, and distributes it across records.

Record fields are identified by name; normal scaling also affects numeric altitude and elevation fields. The optional constant-pace and slope settings modify additional data. Always review the exported activity before sharing it.

### Limitations

- The extension does not read FIT files directly or regenerate GPS tracks.
- GPX records use placeholder coordinates and do not represent a real route or distance.
- Available timing, heart rate, and lap data depend on the input format and its fields.
- Not all export variants or field names are supported; JSON formatting may change on export.

## Privacy

The extension processes loaded JSON in the browser without an extension backend. The optional Garmin Connect banner links to a third-party converter; using that service means sharing your FIT file with it. Uploading an export to Strava likewise shares it with Strava.

## Development

Requirements: Node.js 20 or later and a Unix-like shell for the build script.

```sh
npm ci
npm test
npm run build
```

The build copies the unpacked extension to `dist/`. CI runs the tests and packages the **contents** of `dist/` at the ZIP root, where `manifest.json` must be present.

| Path | Purpose |
| --- | --- |
| `popup.*` | Extension interface |
| `content.*` | Garmin Connect guide banner |
| `lib/` | Distance adjustment, normalization, and export |
| `assets/` | Vector logo and Chrome icons |
| `test/` | Node.js regression tests |
| `.github/workflows/` | Build and test automation |
