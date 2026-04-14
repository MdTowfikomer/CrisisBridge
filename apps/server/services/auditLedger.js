import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, appendFile, readFile } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LEDGER_DIR = path.resolve(__dirname, '..', 'data');
const LEDGER_FILE = path.join(LEDGER_DIR, 'incident-audit-ledger.jsonl');
const GENESIS_HASH = 'GENESIS';

const lastHashByIncident = new Map();
let initialized = false;

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        accumulator[key] = canonicalize(value[key]);
        return accumulator;
      }, {});
  }

  return value;
}

function computeEventHash({ alertId, eventType, timestamp, previousHash, payload }) {
  const hashPayload = JSON.stringify(canonicalize(payload));
  return crypto
    .createHash('sha256')
    .update(`${alertId}|${eventType}|${timestamp}|${previousHash}|${hashPayload}`)
    .digest('hex');
}

function parseLedgerLines(content) {
  if (!content.trim()) {
    return [];
  }

  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function ensureInitialized() {
  if (initialized) {
    return;
  }

  await mkdir(LEDGER_DIR, { recursive: true });

  let content = '';
  try {
    content = await readFile(LEDGER_FILE, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const existingEvents = parseLedgerLines(content);
  for (const event of existingEvents) {
    lastHashByIncident.set(event.alertId, event.hash);
  }

  initialized = true;
}

export async function appendAuditEvent({ alertId, eventType, payload }) {
  await ensureInitialized();

  const timestamp = Date.now();
  const previousHash = lastHashByIncident.get(alertId) || GENESIS_HASH;
  const hash = computeEventHash({
    alertId,
    eventType,
    timestamp,
    previousHash,
    payload,
  });

  const event = {
    alertId,
    eventType,
    timestamp,
    previousHash,
    payload: canonicalize(payload),
    hash,
  };

  await appendFile(LEDGER_FILE, `${JSON.stringify(event)}\n`, 'utf8');
  lastHashByIncident.set(alertId, hash);

  return event;
}

export async function getIncidentAuditTrail(alertId) {
  await ensureInitialized();

  let content = '';
  try {
    content = await readFile(LEDGER_FILE, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  return parseLedgerLines(content).filter((event) => event.alertId === alertId);
}

export async function verifyIncidentAuditTrail(alertId) {
  const events = await getIncidentAuditTrail(alertId);
  let previousHash = GENESIS_HASH;

  for (const event of events) {
    if (event.previousHash !== previousHash) {
      return {
        valid: false,
        checkedEvents: events.length,
        failureReason: 'Previous hash mismatch',
      };
    }

    const expectedHash = computeEventHash({
      alertId: event.alertId,
      eventType: event.eventType,
      timestamp: event.timestamp,
      previousHash: event.previousHash,
      payload: event.payload,
    });

    if (event.hash !== expectedHash) {
      return {
        valid: false,
        checkedEvents: events.length,
        failureReason: 'Event hash mismatch',
      };
    }

    previousHash = event.hash;
  }

  return {
    valid: true,
    checkedEvents: events.length,
    lastHash: previousHash,
  };
}

export function getLedgerFilePath() {
  return LEDGER_FILE;
}
