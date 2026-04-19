import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z, ZodError } from 'zod';
import dotenv from 'dotenv';
import { EmergencyAlertSchema } from '@crisisbridge/types';
import { TriageService } from '@crisisbridge/core';
import { NavigationService } from '@crisisbridge/maps';
import { validateConfig } from './services/configValidator.js';
import { EscalationService } from './services/escalation.js';
import {
  ProvisioningRequestSchema,
  buildRoomManifestCsv,
  provisionPropertyRooms,
} from './services/propertyProvisioning.js';
import {
  appendAuditEvent,
  getIncidentAuditTrail,
  verifyIncidentAuditTrail,
} from './services/auditLedger.js';

import { rtdbAdmin } from './lib/firebaseAdmin.js';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

dotenv.config();

// Pre-flight Config Validation
const config = validateConfig();

const fastify = Fastify({
  logger: true,
});

fastify.register(cors, {
  origin: config.ALLOWED_ORIGINS,
});

const triageService = new TriageService(config.GEMINI_API_KEY);

const AlertActionSchema = z.object({
  alertId: z.string().trim().min(1),
});

const ResolveAlertSchema = AlertActionSchema.extend({
  summary: z.string().trim().min(1).optional(),
  actions: z.array(z.string().trim().min(1)).default([]),
});

const PropertyParamsSchema = z.object({
  propertyId: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[a-zA-Z0-9-]+$/, 'propertyId must only contain letters, numbers, and dashes'),  
});

// Timer Management (State is in Firebase)
const activeTimers = new Map();

function setupEscalationTimer(alertId, alert, triage) {
  if (activeTimers.has(alertId)) return;

  const timer = setTimeout(async () => {
    const alertRef = rtdbAdmin.ref(`alerts/${alertId}`);
    const snap = await alertRef.once('value');
    const currentAlert = snap.val();

    if (currentAlert && currentAlert.status === 'PENDING') {
      try {
        fastify.log.warn(`🚨 ESCALATING: Unacknowledged alert ${alertId}`);
        await EscalationService.sendEscalation(alert, triage);
        await appendAuditEvent({
          alertId,
          eventType: 'ESCALATED',
          payload: { alert, triage },
        });
      } catch (error) {
        fastify.log.error(error, `Escalation failed for ${alertId}`);
      }
    }
    activeTimers.delete(alertId);
  }, 30000);

  activeTimers.set(alertId, timer);
}

async function resumeEscalationTimers() {
  const alertsRef = rtdbAdmin.ref('alerts');
  const snapshot = await alertsRef.orderByChild('status').equalTo('PENDING').once('value');
  const pendingAlerts = snapshot.val();

  if (pendingAlerts) {
    Object.entries(pendingAlerts).forEach(([dbKey, alert]) => {
      setupEscalationTimer(dbKey, alert, alert.triage);
    });
  }
}

fastify.get('/health', async () => ({
  status: 'OK',
  timestamp: Date.now(),
  persistence: 'CLOUD_FIRESTORE'
}));

fastify.post('/b2b/properties/:propertyId/provision', async (request, reply) => {
  try {
    const { propertyId } = PropertyParamsSchema.parse(request.params);
    const payload = ProvisioningRequestSchema.parse(request.body || {});
    const manifest = await provisionPropertyRooms({ propertyId, payload });
    return { success: true, ...manifest };
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ error: 'Invalid payload', issues: error.issues });
    return reply.code(500).send({ error: 'Provisioning failed' });
  }
});

fastify.post('/triage', async (request, reply) => {
  try {
    const parsedAlert = EmergencyAlertSchema.parse(request.body);
    const alert = {
      ...parsedAlert,
      entryMethod: request.body?.entryMethod?.toUpperCase() || 'QR',
      propertyId: request.body?.property || 'UNKNOWN',
    };

    const targetLanguage = request.body?.language || 'en';
    const triageResult = await triageService.analyzeAlert(alert, targetLanguage);
    const alertsRef = rtdbAdmin.ref('alerts');
    const newAlertRef = alertsRef.push();
    const alertId = newAlertRef.key;

    const finalAlertData = { ...alert, id: alertId, triage: triageResult };
    await newAlertRef.set(finalAlertData);

    setupEscalationTimer(alertId, finalAlertData, triageResult);

    await appendAuditEvent({
      alertId,
      eventType: 'TRIGGERED',
      payload: { alert: finalAlertData, triage: triageResult },
    });

    return { success: true, alertId, triage: triageResult };
  } catch (error) {
    if (error instanceof ZodError) return reply.code(400).send({ error: 'Invalid alert data', issues: error.issues });
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Triage failed' });
  }
});

fastify.post('/acknowledge', async (request, reply) => {
  try {
    const { alertId } = AlertActionSchema.parse(request.body);
    const alertRef = rtdbAdmin.ref(`alerts/${alertId}`);
    
    const snap = await alertRef.once('value');
    if (!snap.exists()) return reply.code(404).send({ error: 'Alert not found' });

    await alertRef.update({ status: 'ACKNOWLEDGED', acknowledgedAt: Date.now() });

    if (activeTimers.has(alertId)) {
      clearTimeout(activeTimers.get(alertId));
      activeTimers.delete(alertId);
    }

    await appendAuditEvent({
      alertId,
      eventType: 'ACKNOWLEDGED',
      payload: { acknowledgedAt: Date.now() },
    });

    return { success: true };
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to acknowledge' });
  }
});

fastify.post('/resolve', async (request, reply) => {
  try {
    const { alertId, summary, actions } = ResolveAlertSchema.parse(request.body);
    const alertRef = rtdbAdmin.ref(`alerts/${alertId}`);

    const snap = await alertRef.once('value');
    if (!snap.exists()) return reply.code(404).send({ error: 'Alert not found' });

    const alertData = snap.val();
    const incidentRecord = {
      alert: alertData,
      triage: alertData.triage,
      resolvedAt: Date.now(),
      summary: summary || 'Resolved',
      actions,
    };

    const aiSummary = await triageService.generateIncidentSummary(incidentRecord);
    
    await alertRef.update({
      status: 'RESOLVED',
      resolvedAt: incidentRecord.resolvedAt,
      ai_report: aiSummary
    });

    await appendAuditEvent({
      alertId,
      eventType: 'RESOLVED',
      payload: { ...incidentRecord, ai_report: aiSummary },
    });

    return { success: true, record: incidentRecord };
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to resolve' });
  }
});

fastify.get('/audit/:alertId', async (request, reply) => {
  try {
    const { alertId } = AlertActionSchema.parse(request.params);
    const events = await getIncidentAuditTrail(alertId);
    const verification = await verifyIncidentAuditTrail(alertId);

    return {
      success: true,
      alertId,
      events,
      verification,
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Failed to retrieve audit trail' });
  }
});

fastify.get('/audit/:alertId/pdf', async (request, reply) => {
  try {
    const { alertId } = AlertActionSchema.parse(request.params);
    const events = await getIncidentAuditTrail(alertId);
    const verification = await verifyIncidentAuditTrail(alertId);

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.text('CrisisBridge: Formal Incident Report', 20, 20);
    doc.setFontSize(10);
    doc.text(`Incident ID: ${alertId}`, 20, 30);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 35);
    doc.text(`Integrity Status: ${verification.valid ? 'VERIFIED' : 'TAMPERED'}`, 20, 40);

    // Summary Section
    const resolvedEvent = events.find(e => e.eventType === 'RESOLVED');
    const triggerEvent = events.find(e => e.eventType === 'TRIGGERED');

    if (triggerEvent) {
      doc.setFontSize(14);
      doc.text('Executive Summary', 20, 55);
      doc.setFontSize(10);
      doc.text(`Location: ${triggerEvent.payload.alert.location}`, 20, 65);
      doc.text(`Type: ${triggerEvent.payload.alert.type}`, 20, 70);
      doc.text(`Description: ${triggerEvent.payload.alert.description || 'N/A'}`, 20, 75);
    }

    if (resolvedEvent) {
      doc.text(`Resolution: ${resolvedEvent.payload.summary}`, 20, 85);
      doc.text(`AI Summary: ${resolvedEvent.payload.ai_report}`, 20, 90, { maxWidth: 170 });
    }

    // Audit Table
    const tableData = events.map(e => [
      new Date(e.timestamp).toLocaleTimeString(),
      e.eventType,
      e.hash.substring(0, 12) + '...',
      JSON.stringify(e.payload).substring(0, 50) + '...'
    ]);

    doc.autoTable({
      startY: 110,
      head: [['Time', 'Event', 'SHA-256 Hash', 'Payload Extract']],
      body: tableData,
    });

    const pdfBuffer = doc.output('arraybuffer');
    
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="incident-${alertId}.pdf"`);
    return Buffer.from(pdfBuffer);
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Failed to generate PDF report' });
  }
});

fastify.post('/navigate', async (request, reply) => {
  try {
    const { property, from, to, hazards, mapData } = request.body || {};
    const route = mapData
      ? NavigationService.calculateRouteFromData(mapData, { from, to, hazards: hazards || [] })
      : await NavigationService.calculateRoute({ property, from, to, hazards: hazards || [] });
    return { success: true, route };
  } catch (error) {
    return reply.code(500).send({ error: error.message });
  }
});

const start = async () => {
  try {
    await resumeEscalationTimers();
    await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
