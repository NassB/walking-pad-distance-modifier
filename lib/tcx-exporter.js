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

function sportTcxLabel(sport) {
  const s = String(sport).toLowerCase();
  if (/run|jog/.test(s)) return "Running";
  if (/bik|cycl|ride/.test(s)) return "Biking";
  if (/walk/.test(s)) return "Walking";
  return "Other";
}

function hrValue(v) {
  return Number.isFinite(v) && v > 0 ? `<Value>${Math.round(v)}</Value>` : null;
}

function groupRecordsByLap(laps, records) {
  if (!records || records.length === 0) return laps.map(() => []);
  // When there is only one lap, or no lap has a start time to compare against,
  // assign all records to the first lap rather than attempting timestamp-based grouping.
  const hasTimedLaps = laps.length > 1 && laps.some((l) => l.startTime);
  if (!hasTimedLaps) return [records, ...laps.slice(1).map(() => [])];

  const result = laps.map(() => []);
  for (const rec of records) {
    if (!rec.timestamp) {
      result[0].push(rec);
      continue;
    }
    let idx = 0;
    for (let i = laps.length - 1; i >= 0; i--) {
      if (laps[i].startTime && rec.timestamp >= laps[i].startTime) {
        idx = i;
        break;
      }
    }
    result[idx].push(rec);
  }
  return result;
}

export function activityToTcx(normalized) {
  const sport = xmlEsc(sportTcxLabel(normalized.sport ?? "Walking"));
  const startId = toIso(normalized.startTime) || "1970-01-01T00:00:00Z";

  const lapGroups = groupRecordsByLap(normalized.laps, normalized.records);

  const lapsXml = normalized.laps
    .map((lap, i) => {
      const lapStart = xmlEsc(toIso(lap.startTime) || startId);
      const lapRecords = lapGroups[i] ?? [];

      const tpXml = lapRecords
        .map((r) => {
          const timeEl = toIso(r.timestamp) ? `        <Time>${xmlEsc(toIso(r.timestamp))}</Time>` : "";
          const distEl =
            Number.isFinite(r.distanceMeters) && r.distanceMeters >= 0
              ? `        <DistanceMeters>${r.distanceMeters.toFixed(2)}</DistanceMeters>`
              : "";
          const altEl =
            Number.isFinite(r.altitude)
              ? `        <AltitudeMeters>${r.altitude.toFixed(2)}</AltitudeMeters>`
              : "";
          const hrVal = hrValue(r.heartRate);
          const hrEl = hrVal ? `        <HeartRateBpm>${hrVal}</HeartRateBpm>` : "";
          const cadEl =
            Number.isFinite(r.cadence) && r.cadence >= 0
              ? `        <Cadence>${Math.round(r.cadence)}</Cadence>`
              : "";
          const inner = [timeEl, distEl, altEl, hrEl, cadEl].filter(Boolean).join("\n");
          return inner ? `      <Trackpoint>\n${inner}\n      </Trackpoint>` : null;
        })
        .filter(Boolean)
        .join("\n");

      const trackEl = tpXml
        ? `      <Track>\n${tpXml}\n      </Track>`
        : "";

      const avgHrVal = hrValue(lap.avgHeartRate);
      const maxHrVal = hrValue(lap.maxHeartRate);

      return [
        `    <Lap StartTime="${lapStart}">`,
        `      <TotalTimeSeconds>${(lap.durationSeconds ?? 0).toFixed(0)}</TotalTimeSeconds>`,
        `      <DistanceMeters>${(lap.distanceMeters ?? 0).toFixed(2)}</DistanceMeters>`,
        avgHrVal ? `      <AverageHeartRateBpm>${avgHrVal}</AverageHeartRateBpm>` : null,
        maxHrVal ? `      <MaximumHeartRateBpm>${maxHrVal}</MaximumHeartRateBpm>` : null,
        `      <Intensity>Active</Intensity>`,
        `      <TriggerMethod>Manual</TriggerMethod>`,
        trackEl || null,
        `    </Lap>`
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<TrainingCenterDatabase`,
    `  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"`,
    `  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`,
    `  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2`,
    `    http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">`,
    `  <Activities>`,
    `    <Activity Sport="${sport}">`,
    `      <Id>${xmlEsc(startId)}</Id>`,
    lapsXml,
    `    </Activity>`,
    `  </Activities>`,
    `</TrainingCenterDatabase>`
  ].join("\n");
}
