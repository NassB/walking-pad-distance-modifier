import {
  applyDistanceScaling,
  detectGarminActivity,
  formatDuration,
  formatKm,
  getActivitySummary,
  kmToMeters,
  metersToKm
} from "./lib/json-distance-modifier.js";
import { normalizeActivity } from "./lib/activity-normalizer.js";
import { activityToTcx } from "./lib/tcx-exporter.js";
import { activityToGpx } from "./lib/gpx-exporter.js";
import { activityToFit } from "./lib/fit-exporter.js";

const state = {
  originalFileName: "activity.json",
  originalJsonText: "",
  parsedActivity: null,
  modifiedActivity: null,
  summary: null
};

const ui = {
  dropZone: document.getElementById("drop-zone"),
  fileInput: document.getElementById("file-input"),
  pickFileBtn: document.getElementById("pick-file-btn"),
  status: document.getElementById("status"),
  summary: document.getElementById("summary"),
  controls: document.getElementById("controls"),
  targetDistance: document.getElementById("target-distance"),
  applyBtn: document.getElementById("apply-btn"),
  exportBtn: document.getElementById("export-btn"),
  stravaBtn: document.getElementById("strava-btn"),
  exportFormat: document.getElementById("export-format"),
  resetBtn: document.getElementById("reset-btn"),
  summaryName: document.getElementById("summary-name"),
  summaryStart: document.getElementById("summary-start"),
  summaryDuration: document.getElementById("summary-duration"),
  summaryDistance: document.getElementById("summary-distance"),
  summaryAvgHr: document.getElementById("summary-avg-hr"),
  summaryMaxHr: document.getElementById("summary-max-hr"),
  originalDistance: document.getElementById("original-distance"),
  newDistance: document.getElementById("new-distance")
};

function setStatus(message, type = "") {
  ui.status.textContent = message;
  ui.status.className = `status ${type}`.trim();
}

function resetState() {
  state.originalFileName = "activity.json";
  state.originalJsonText = "";
  state.parsedActivity = null;
  state.modifiedActivity = null;
  state.summary = null;

  ui.summary.classList.add("hidden");
  ui.controls.classList.add("hidden");
  ui.exportBtn.disabled = true;
  ui.targetDistance.value = "";
  ui.originalDistance.textContent = "—";
  ui.newDistance.textContent = "—";
  setStatus("", "");
}

function renderSummary() {
  const summary = state.summary;
  if (!summary) {
    return;
  }
  ui.summaryName.textContent = summary.nameOrSport ?? "—";
  ui.summaryStart.textContent = summary.startTime ?? "—";
  ui.summaryDuration.textContent = formatDuration(summary.durationSeconds);
  ui.summaryDistance.textContent = formatKm(summary.distanceMeters);
  ui.summaryAvgHr.textContent = Number.isFinite(summary.averageHeartRate)
    ? `${Math.round(summary.averageHeartRate)} bpm`
    : "—";
  ui.summaryMaxHr.textContent = Number.isFinite(summary.maxHeartRate)
    ? `${Math.round(summary.maxHeartRate)} bpm`
    : "—";

  ui.originalDistance.textContent = formatKm(summary.distanceMeters);
  ui.newDistance.textContent = formatKm(summary.distanceMeters);
  ui.targetDistance.value = Number.isFinite(summary.distanceMeters) && summary.distanceMeters > 0
    ? metersToKm(summary.distanceMeters).toFixed(3)
    : "";

  ui.summary.classList.remove("hidden");
  ui.controls.classList.remove("hidden");
}

function cloneActivity(activity) {
  return JSON.parse(JSON.stringify(activity));
}

async function loadActivityFromFile(file) {
  if (!file) {
    return;
  }
  if (!file.name.toLowerCase().endsWith(".json")) {
    setStatus("Please select a .json file.", "error");
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!detectGarminActivity(parsed)) {
      throw new Error("Unsupported JSON format. This does not look like a Garmin-style activity export.");
    }

    const summary = getActivitySummary(parsed);

    state.originalFileName = file.name;
    state.originalJsonText = text;
    state.parsedActivity = parsed;
    state.modifiedActivity = cloneActivity(parsed);
    state.summary = summary;

    renderSummary();
    ui.exportBtn.disabled = true;
    setStatus("File loaded. Enter a new distance and click Apply Distance.", "success");
  } catch (error) {
    resetState();
    setStatus(error.message || "Failed to parse JSON file.", "error");
  }
}

function applyDistance() {
  if (!state.parsedActivity) {
    setStatus("Please load a JSON file first.", "error");
    return;
  }

  const targetDistanceKm = Number(ui.targetDistance.value);
  if (!Number.isFinite(targetDistanceKm) || targetDistanceKm <= 0) {
    setStatus("Please enter a valid positive distance in kilometers.", "error");
    return;
  }

  try {
    const cloned = cloneActivity(state.parsedActivity);
    const { newDistanceMeters } = applyDistanceScaling(cloned, targetDistanceKm);
    state.modifiedActivity = cloned;

    ui.newDistance.textContent = formatKm(newDistanceMeters);
    ui.exportBtn.disabled = false;
    setStatus("Distance updated. You can now export the modified JSON.", "success");
  } catch (error) {
    ui.exportBtn.disabled = true;
    setStatus(error.message || "Failed to update distance.", "error");
  }
}

function makeExportFileName(originalName, ext = "json") {
  const lower = originalName.toLowerCase();
  const base = lower.endsWith(".json") ? originalName.slice(0, -5) : originalName;
  return `${base}-modified.${ext}`;
}

function exportModifiedFile() {
  if (!state.modifiedActivity) {
    setStatus("No modified JSON available yet.", "error");
    return;
  }

  const format = ui.exportFormat?.value ?? "json";
  let blob;
  let ext;

  try {
    if (format === "tcx") {
      const xml = activityToTcx(normalizeActivity(state.modifiedActivity));
      blob = new Blob([xml], { type: "application/vnd.garmin.tcx+xml" });
      ext = "tcx";
    } else if (format === "gpx") {
      const xml = activityToGpx(normalizeActivity(state.modifiedActivity));
      blob = new Blob([xml], { type: "application/gpx+xml" });
      ext = "gpx";
    } else if (format === "fit") {
      const bytes = activityToFit(normalizeActivity(state.modifiedActivity));
      blob = new Blob([bytes], { type: "application/octet-stream" });
      ext = "fit";
    } else {
      blob = new Blob([JSON.stringify(state.modifiedActivity, null, 2)], {
        type: "application/json"
      });
      ext = "json";
    }
  } catch (error) {
    setStatus(error.message || "Failed to convert activity.", "error");
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = makeExportFileName(state.originalFileName, ext);
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus(`Exported ${anchor.download}.`, "success");
}

function handleDrop(event) {
  event.preventDefault();
  ui.dropZone.classList.remove("drag-over");
  const [file] = event.dataTransfer?.files || [];
  void loadActivityFromFile(file);
}

function init() {
  resetState();

  ui.pickFileBtn.addEventListener("click", () => ui.fileInput.click());
  ui.fileInput.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    void loadActivityFromFile(file);
  });

  ui.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    ui.dropZone.classList.add("drag-over");
  });
  ui.dropZone.addEventListener("dragleave", () => ui.dropZone.classList.remove("drag-over"));
  ui.dropZone.addEventListener("drop", handleDrop);

  ui.applyBtn.addEventListener("click", applyDistance);
  ui.exportBtn.addEventListener("click", exportModifiedFile);
  ui.stravaBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://www.strava.com/upload/select" });
  });
  ui.resetBtn.addEventListener("click", resetState);

  ui.targetDistance.addEventListener("input", () => {
    const km = Number(ui.targetDistance.value);
    if (Number.isFinite(km) && km > 0) {
      ui.newDistance.textContent = formatKm(kmToMeters(km));
    } else {
      ui.newDistance.textContent = "—";
    }
  });
}

init();
