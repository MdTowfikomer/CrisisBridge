import crypto from 'node:crypto';
import { firestore } from '../lib/firebaseAdmin.js';

const GENESIS_HASH = 'GENESIS';

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

/**
 * Appends an event to the persistent Firestore audit ledger.
 */
export async function appendAuditEvent({ alertId, eventType, payload }) {
  const incidentRef = firestore.collection('audit_ledger').doc(alertId);
  const eventsRef = incidentRef.collection('events');

  // Get the last hash from the incident's chain
  const lastEventQuery = await eventsRef.orderBy('timestamp', 'desc').limit(1).get();
  const previousHash = lastEventQuery.empty ? GENESIS_HASH : lastEventQuery.docs[0].data().hash;

  const timestamp = Date.now();
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

  await eventsRef.add(event);

  // Update root doc for quick lookup of the current state
  await incidentRef.set({
    lastUpdated: timestamp,
    lastHash: hash,
    eventType
  }, { merge: true });

  return event;
}

/**
 * Retrieves the full event chain for a specific incident.
 */
export async function getIncidentAuditTrail(alertId) {
  const snapshot = await firestore
    .collection('audit_ledger')
    .doc(alertId)
    .collection('events')
    .orderBy('timestamp', 'asc')
    .get();

  return snapshot.docs.map(doc => doc.data());
}

/**
 * Verifies the integrity of the audit chain for an incident.
 */
export async function verifyIncidentAuditTrail(alertId) {
  const events = await getIncidentAuditTrail(alertId);
  let previousHash = GENESIS_HASH;

  for (const event of events) {
    if (event.previousHash !== previousHash) {
      return {
        valid: false,
        checkedEvents: events.length,
        failureReason: 'Previous hash mismatch (Chain Broken)',
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
        failureReason: 'Event hash mismatch (Data Tampered)',
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
