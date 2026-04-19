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
  getLedgerFilePath,
  verifyIncidentAuditTrail,
} from './services/auditLedger.js';

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

// Active in-memory map for escalation timing + responder flow.
const activeAlerts = new Map();

fastify.get('/health', async (request, reply) => {
  return {
    status: 'OK',
    timestamp: Date.now(),
    ledgerFile: getLedgerFilePath(),
  };
});

fastify.post('/b2b/properties/:propertyId/provision', async (request, reply) => {
  try {
    const { propertyId } = PropertyParamsSchema.parse(request.params);     
    const payload = ProvisioningRequestSchema.parse(request.body || {});   
    const manifest = await provisionPropertyRooms({ propertyId, payload });
    return { success: true, ...manifest };
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Invalid provisioning payload',
        issues: error.issues,
      });
    }

    fastify.log.error(error, 'Provisioning pipeline failed');
    return reply.code(500).send({ error: 'Failed to provision room artifacts' });
  }
});

fastify.post('/b2b/properties/:propertyId/provision/csv', async (request, reply) => {
  try {
    const { propertyId } = PropertyParamsSchema.parse(request.params);     
    const payload = ProvisioningRequestSchema.parse(request.body || {});   
    const manifest = await provisionPropertyRooms({ propertyId, payload });
    const csv = buildRoomManifestCsv(manifest);

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header(
      'Content-Disposition',
      `attachment; filename="${manifest.propertyId.toLowerCase()}-room-manifest.csv"`
    );
    return csv;
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Invalid provisioning payload',
        issues: error.issues,
      });
    }

    fastify.log.error(error, 'Provisioning CSV export failed');
    return reply.code(500).send({ error: 'Failed to export room manifest' });
  }
});

fastify.post('/triage', async (request, reply) => {
  try {
    const parsedAlert = EmergencyAlertSchema.parse(request.body);
    const alert = {
      ...parsedAlert,
      entryMethod:
        typeof request.body?.entryMethod === 'string' ? request.body.entryMethod.toUpperCase() : 'QR',
      propertyId: typeof request.body?.property === 'string' ? request.body.property : undefined,
    };

    const triageResult = await triageService.analyzeAlert(alert);
    const alertId = parsedAlert.id || `alert-${Date.now()}`;

    const escalationTimer = setTimeout(async () => {
      const storedAlert = activeAlerts.get(alertId);
      if (!storedAlert || storedAlert.acknowledged) {
        return;
      }

      try {
        fastify.log.warn(`Escalating unacknowledged alert: ${alertId}`);   
        await EscalationService.sendEscalation(storedAlert.alert, storedAlert.triage);
        await appendAuditEvent({
          alertId,
          eventType: 'ESCALATED',
          payload: {
            alert: storedAlert.alert,
            triage: storedAlert.triage,
          },
        });
      } catch (error) {
        fastify.log.error(error, `Escalation flow failed for ${alertId}`); 
      }
    }, 30000);

    activeAlerts.set(alertId, {
      alert,
      triage: triageResult,
      acknowledged: false,
      escalationTimer,
    });

    await appendAuditEvent({
      alertId,
      eventType: 'TRIGGERED',
      payload: {
        alert,
        triage: triageResult,
      },
    });

    return {
      success: true,
      alertId,
      triage: triageResult,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Invalid alert data',
        issues: error.issues,
      });
    }

    fastify.log.error(error, 'Triage route failed');
    return reply.code(500).send({ error: 'Triage failed' });
  }
});

fastify.post('/acknowledge', async (request, reply) => {
  try {
    const { alertId } = AlertActionSchema.parse(request.body);
    const alertEntry = activeAlerts.get(alertId);
    if (!alertEntry) {
      return reply.code(404).send({ error: 'Alert not found' });
    }

    alertEntry.acknowledged = true;
    if (alertEntry.escalationTimer) {
      clearTimeout(alertEntry.escalationTimer);
    }

    await appendAuditEvent({
      alertId,
      eventType: 'ACKNOWLEDGED',
      payload: {
        acknowledgedAt: Date.now(),
      },
    });

    fastify.log.info(`Alert acknowledged: ${alertId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Invalid acknowledge payload',
        issues: error.issues,
      });
    }

    fastify.log.error(error, 'Acknowledge route failed');
    return reply.code(500).send({ error: 'Failed to acknowledge alert' }); 
  }
});

fastify.post('/resolve', async (request, reply) => {
  try {
    const { alertId, summary, actions } = ResolveAlertSchema.parse(request.body);
    const alertEntry = activeAlerts.get(alertId);
    if (!alertEntry) {
      return reply.code(404).send({ error: 'Alert not found' });
    }

    if (alertEntry.escalationTimer) {
      clearTimeout(alertEntry.escalationTimer);
    }

    const incidentRecord = {
      alert: alertEntry.alert,
      triage: alertEntry.triage,
      resolvedAt: Date.now(),
      summary: summary || 'No summary provided',
      actions,
    };

    const aiSummary = await triageService.generateIncidentSummary(incidentRecord);
    incidentRecord.ai_report = aiSummary;

    await appendAuditEvent({
      alertId,
      eventType: 'RESOLVED',
      payload: {
        resolvedAt: incidentRecord.resolvedAt,
        summary: incidentRecord.summary,
        actions: incidentRecord.actions,
        ai_report: incidentRecord.ai_report,
      },
    });

    const auditVerification = await verifyIncidentAuditTrail(alertId);     
    fastify.log.info(`Incident finalized with tamper-evident audit trail: ${alertId}`);
    activeAlerts.delete(alertId);

    return { success: true, record: incidentRecord, audit: auditVerification };
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Invalid resolve payload',
        issues: error.issues,
      });
    }

    fastify.log.error(error, 'Resolve route failed');
    return reply.code(500).send({ error: 'Failed to finalize incident' }); 
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
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Invalid audit request',
        issues: error.issues,
      });
    }

    fastify.log.error(error, 'Audit retrieval failed');
    return reply.code(500).send({ error: 'Failed to retrieve audit trail' });
  }
});

fastify.post('/navigate', async (request, reply) => {
  try {
    const { property, from, to, hazards, mapData } = request.body || {};
    if (!property || !from) {
      return reply.code(400).send({ error: 'property and from fields are required' });
    }

    let route;
    if (mapData) {
      route = NavigationService.calculateRouteFromData(mapData, { from, to, hazards: hazards || [] });
    } else {
      route = await NavigationService.calculateRoute({ property, from, to, hazards: hazards || [] });
    }

    return { success: true, route };
  } catch (error) {

    fastify.log.error(error, 'Navigation route failed');
    return reply.code(500).send({ error: error.message || 'Navigation failed' });
  }
});

fastify.get('/map/:propertyId', async (request, reply) => {
  try {
    const { propertyId } = request.params;
    const map = await NavigationService.getMapData(propertyId);
    return { success: true, map };
  } catch (error) {
    fastify.log.error(error, 'Map route failed');
    return reply.code(500).send({ error: 'Failed to get map data' });      
  }
});

fastify.get('/floorplan/:propertyId', async (request, reply) => {
  try {
    const { propertyId } = request.params;
    const svg = await NavigationService.getFloorplanSvg(propertyId);       
    reply.header('Content-Type', 'image/svg+xml');
    reply.header('Cache-Control', 'public, max-age=3600');
    return svg;
  } catch (error) {
    fastify.log.error(error, 'Floorplan route failed');
    return reply.code(404).send({ error: 'Floor plan not found' });        
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
