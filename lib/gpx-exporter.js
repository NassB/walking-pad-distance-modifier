function xmlEsc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toIso(date) {
  return date instanceof Date && !isNaN(date.getTime())
    ? date.toISOString()
    : "";
}

export function activityToGpx(normalized) {
  const startIso = toIso(normalized.startTime) || "1970-01-01T00:00:00Z";
  const name = xmlEsc(String(normalized.sport ?? "Walking"));

  const trkpts = (normalized.records ?? [])
    .map((r) => {
      const time = toIso(r.timestamp);
      if (!time) return null;

      const hrEl =
        Number.isFinite(r.heartRate) && r.heartRate > 0
          ? `<gpxtpx:hr>${Math.round(r.heartRate)}</gpxtpx:hr>`
          : "";
      const cadEl =
        Number.isFinite(r.cadence) && r.cadence >= 0
          ? `<gpxtpx:cad>${Math.round(r.cadence)}</gpxtpx:cad>`
          : "";
      const extInner = [hrEl, cadEl].filter(Boolean).join("");
      const extEl = extInner
        ? `\n        <extensions><gpxtpx:TrackPointExtension>${extInner}</gpxtpx:TrackPointExtension></extensions>`
        : "";

      return `      <trkpt lat="0.0" lon="0.0">\n        <time>${xmlEsc(time)}</time>${extEl}\n      </trkpt>`;
    })
    .filter(Boolean)
    .join("\n");

  const trkseg = trkpts
    ? `    <trkseg>\n${trkpts}\n    </trkseg>`
    : `    <trkseg/>`;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="walking-pad-distance-modifier"`,
    `  xmlns="http://www.topografix.com/GPX/1/1"`,
    `  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"`,
    `  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`,
    `  xsi:schemaLocation="http://www.topografix.com/GPX/1/1`,
    `    http://www.topografix.com/GPX/1/1/gpx.xsd">`,
    `  <metadata>`,
    `    <name>${name}</name>`,
    `    <time>${xmlEsc(startIso)}</time>`,
    `  </metadata>`,
    `  <trk>`,
    `    <name>${name}</name>`,
    `    <type>${name}</type>`,
    trkseg,
    `  </trk>`,
    `</gpx>`
  ].join("\n");
}
