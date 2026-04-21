// FIT binary encoder — produces a minimal valid .fit file importable by Strava.
//
// Implements only the messages needed for a walking/indoor activity:
//   file_id, record (per-second data), lap, session, activity
//
// FIT epoch: 1989-12-31T00:00:00Z = Unix epoch + 631 065 600 s
// Distance fields are stored in centimetres (scale = 100).
// Time fields are stored in milliseconds (scale = 1000).

const FIT_EPOCH_OFFSET = 631065600; // seconds

// Garmin CRC-16 lookup table
const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401,
  0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400
];

function fitCrc16(bytes) {
  let crc = 0;
  for (const b of bytes) {
    let tmp = CRC_TABLE[crc & 0x0f];
    crc = (crc >>> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[b & 0x0f];
    tmp = CRC_TABLE[crc & 0x0f];
    crc = (crc >>> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(b >>> 4) & 0x0f];
  }
  return crc;
}

// Base type constants — value is the FIT base-type byte used in definition messages
const BT = {
  ENUM: 0x00,   // 1 byte; invalid = 0xFF
  UINT8: 0x02,  // 1 byte; invalid = 0xFF
  UINT16: 0x84, // 2 bytes LE; invalid = 0xFFFF
  UINT32: 0x86  // 4 bytes LE; invalid = 0xFFFFFFFF
};

const BT_SIZE = { [BT.ENUM]: 1, [BT.UINT8]: 1, [BT.UINT16]: 2, [BT.UINT32]: 4 };
const BT_INVALID = { [BT.ENUM]: 0xff, [BT.UINT8]: 0xff, [BT.UINT16]: 0xffff, [BT.UINT32]: 0xffffffff };

// Global message numbers (from FIT profile)
const MESG = { FILE_ID: 0, SESSION: 18, LAP: 19, RECORD: 20, ACTIVITY: 34 };

// Local message numbers assigned in this encoder (0–15 range)
const LOCAL = { FILE_ID: 0, SESSION: 1, LAP: 2, RECORD: 3, ACTIVITY: 4 };

function toFitTime(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return 0;
  return Math.max(0, Math.round(date.getTime() / 1000) - FIT_EPOCH_OFFSET);
}

// Minimal byte-array builder
class ByteWriter {
  constructor() {
    this._d = [];
  }

  u8(v) {
    this._d.push((v >>> 0) & 0xff);
  }

  u16(v) {
    const n = (v >>> 0) & 0xffff;
    this._d.push(n & 0xff, (n >>> 8) & 0xff);
  }

  u32(v) {
    const n = v >>> 0;
    this._d.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
  }

  append(arr) {
    for (const b of arr) this._d.push((b >>> 0) & 0xff);
  }

  get length() {
    return this._d.length;
  }

  toUint8Array() {
    return new Uint8Array(this._d);
  }
}

// Write a FIT definition message.
// fields: [{ defNum, type }]
function writeDef(w, localNum, globalNum, fields) {
  w.u8(0x40 | localNum); // definition record header
  w.u8(0x00);             // reserved
  w.u8(0x00);             // architecture: little-endian
  w.u16(globalNum);
  w.u8(fields.length);
  for (const { defNum, type } of fields) {
    w.u8(defNum);
    w.u8(BT_SIZE[type]);
    w.u8(type);
  }
}

// Write a FIT data message.
// values: [{ type, value }] — must match field order in the definition.
function writeData(w, localNum, values) {
  w.u8(localNum); // data record header
  for (const { type, value } of values) {
    const raw = value == null || !Number.isFinite(Number(value))
      ? BT_INVALID[type]
      : Math.round(Number(value));
    if (type === BT.ENUM || type === BT.UINT8) {
      w.u8(raw);
    } else if (type === BT.UINT16) {
      w.u16(raw);
    } else {
      w.u32(raw);
    }
  }
}

export function activityToFit(normalized) {
  const startFit = toFitTime(normalized.startTime);
  const durS = normalized.durationSeconds ?? 0;
  const durMs = Math.round(durS * 1000);
  const distCm = Math.round((normalized.totalDistanceMeters ?? 0) * 100);
  const endFit = startFit + Math.round(durS);

  function safeHR(v) {
    return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  }

  const avgHR = safeHR(normalized.avgHeartRate);
  const maxHR = safeHR(normalized.maxHeartRate);

  const w = new ByteWriter();

  // ── file_id ────────────────────────────────────────────────────────────────
  writeDef(w, LOCAL.FILE_ID, MESG.FILE_ID, [
    { defNum: 0, type: BT.ENUM },   // type
    { defNum: 1, type: BT.UINT16 }, // manufacturer
    { defNum: 2, type: BT.UINT16 }, // product
    { defNum: 4, type: BT.UINT32 }  // time_created
  ]);
  writeData(w, LOCAL.FILE_ID, [
    { type: BT.ENUM,   value: 4 },         // type = activity
    { type: BT.UINT16, value: 255 },        // manufacturer = unknown
    { type: BT.UINT16, value: 0 },          // product = 0
    { type: BT.UINT32, value: startFit }    // time_created
  ]);

  // ── records ────────────────────────────────────────────────────────────────
  const records = normalized.records ?? [];
  if (records.length > 0) {
    writeDef(w, LOCAL.RECORD, MESG.RECORD, [
      { defNum: 253, type: BT.UINT32 }, // timestamp
      { defNum: 5,   type: BT.UINT32 }, // distance (cm)
      { defNum: 6,   type: BT.UINT16 }, // speed (mm/s)
      { defNum: 3,   type: BT.UINT8 },  // heart_rate (bpm)
      { defNum: 4,   type: BT.UINT8 }   // cadence (rpm)
    ]);
    for (const rec of records) {
      const ts = toFitTime(rec.timestamp);
      const d = Number.isFinite(rec.distanceMeters) && rec.distanceMeters >= 0
        ? Math.round(rec.distanceMeters * 100) : null;
      const spd = Number.isFinite(rec.speed) && rec.speed >= 0
        ? Math.round(rec.speed * 1000) : null;
      const hr = safeHR(rec.heartRate);
      const cad = Number.isFinite(rec.cadence) && rec.cadence >= 0
        ? Math.round(rec.cadence) : null;
      writeData(w, LOCAL.RECORD, [
        { type: BT.UINT32, value: ts },
        { type: BT.UINT32, value: d },
        { type: BT.UINT16, value: spd },
        { type: BT.UINT8,  value: hr },
        { type: BT.UINT8,  value: cad }
      ]);
    }
  }

  // ── laps ───────────────────────────────────────────────────────────────────
  const laps = normalized.laps ?? [];
  if (laps.length > 0) {
    writeDef(w, LOCAL.LAP, MESG.LAP, [
      { defNum: 253, type: BT.UINT32 }, // timestamp
      { defNum: 2,   type: BT.UINT32 }, // start_time
      { defNum: 7,   type: BT.UINT32 }, // total_elapsed_time (ms)
      { defNum: 8,   type: BT.UINT32 }, // total_timer_time (ms)
      { defNum: 9,   type: BT.UINT32 }, // total_distance (cm)
      { defNum: 0,   type: BT.ENUM },   // event (9 = lap)
      { defNum: 1,   type: BT.ENUM },   // event_type (1 = stop)
      { defNum: 15,  type: BT.UINT8 },  // avg_heart_rate
      { defNum: 16,  type: BT.UINT8 }   // max_heart_rate
    ]);
    for (const lap of laps) {
      const ls = toFitTime(lap.startTime);
      const lDurMs = Math.round((lap.durationSeconds ?? 0) * 1000);
      const lDistCm = Math.round((lap.distanceMeters ?? 0) * 100);
      const lEnd = ls + Math.round(lap.durationSeconds ?? 0);
      writeData(w, LOCAL.LAP, [
        { type: BT.UINT32, value: lEnd },
        { type: BT.UINT32, value: ls },
        { type: BT.UINT32, value: lDurMs },
        { type: BT.UINT32, value: lDurMs },
        { type: BT.UINT32, value: lDistCm },
        { type: BT.ENUM,   value: 9 },             // event = lap
        { type: BT.ENUM,   value: 1 },              // event_type = stop
        { type: BT.UINT8,  value: safeHR(lap.avgHeartRate) },
        { type: BT.UINT8,  value: safeHR(lap.maxHeartRate) }
      ]);
    }
  }

  // ── session ────────────────────────────────────────────────────────────────
  writeDef(w, LOCAL.SESSION, MESG.SESSION, [
    { defNum: 253, type: BT.UINT32 }, // timestamp
    { defNum: 2,   type: BT.UINT32 }, // start_time
    { defNum: 7,   type: BT.UINT32 }, // total_elapsed_time (ms)
    { defNum: 8,   type: BT.UINT32 }, // total_timer_time (ms)
    { defNum: 9,   type: BT.UINT32 }, // total_distance (cm)
    { defNum: 5,   type: BT.ENUM },   // sport (11 = walking)
    { defNum: 6,   type: BT.ENUM },   // sub_sport (27 = indoor_walking)
    { defNum: 0,   type: BT.ENUM },   // event (8 = session)
    { defNum: 1,   type: BT.ENUM },   // event_type (1 = stop)
    { defNum: 16,  type: BT.UINT8 },  // avg_heart_rate
    { defNum: 17,  type: BT.UINT8 }   // max_heart_rate
  ]);
  writeData(w, LOCAL.SESSION, [
    { type: BT.UINT32, value: endFit },
    { type: BT.UINT32, value: startFit },
    { type: BT.UINT32, value: durMs },
    { type: BT.UINT32, value: durMs },
    { type: BT.UINT32, value: distCm },
    { type: BT.ENUM,   value: 11 },   // sport = walking
    { type: BT.ENUM,   value: 27 },   // sub_sport = indoor_walking
    { type: BT.ENUM,   value: 8 },    // event = session
    { type: BT.ENUM,   value: 1 },    // event_type = stop
    { type: BT.UINT8,  value: avgHR },
    { type: BT.UINT8,  value: maxHR }
  ]);

  // ── activity ───────────────────────────────────────────────────────────────
  writeDef(w, LOCAL.ACTIVITY, MESG.ACTIVITY, [
    { defNum: 253, type: BT.UINT32 }, // timestamp
    { defNum: 0,   type: BT.UINT32 }, // total_timer_time (ms)
    { defNum: 1,   type: BT.UINT16 }, // num_sessions
    { defNum: 2,   type: BT.ENUM },   // type (0 = manual)
    { defNum: 3,   type: BT.ENUM },   // event (26 = activity)
    { defNum: 4,   type: BT.ENUM }    // event_type (1 = stop)
  ]);
  writeData(w, LOCAL.ACTIVITY, [
    { type: BT.UINT32, value: endFit },
    { type: BT.UINT32, value: durMs },
    { type: BT.UINT16, value: 1 },    // num_sessions = 1
    { type: BT.ENUM,   value: 0 },    // type = manual
    { type: BT.ENUM,   value: 26 },   // event = activity
    { type: BT.ENUM,   value: 1 }     // event_type = stop
  ]);

  // ── assemble file ──────────────────────────────────────────────────────────
  const dataBytes = w.toUint8Array();
  const dataSize = dataBytes.length;

  // Header (bytes 0–11 without CRC, then 2-byte header CRC)
  const hdr = new ByteWriter();
  hdr.u8(14);          // header size
  hdr.u8(0x20);        // protocol version 2.0
  hdr.u16(2214);       // profile version 22.14
  hdr.u32(dataSize);   // data size (bytes after header, before file CRC)
  hdr.u8(0x2e);        // '.'
  hdr.u8(0x46);        // 'F'
  hdr.u8(0x49);        // 'I'
  hdr.u8(0x54);        // 'T'
  const hdrBytes = hdr.toUint8Array(); // 12 bytes
  const hdrCrc = fitCrc16(hdrBytes);

  // File CRC covers data bytes only (not the header)
  const fileCrc = fitCrc16(dataBytes);

  const out = new ByteWriter();
  out.append(hdrBytes);
  out.u16(hdrCrc);
  out.append(dataBytes);
  out.u16(fileCrc);

  return out.toUint8Array();
}
