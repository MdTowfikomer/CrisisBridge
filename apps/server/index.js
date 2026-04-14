import Fastify from 'fastify';
import cors from '@fastify/cors';
import { EmergencyAlertSchema } from 'types';
import { TriageService } from './services/triage.js';
import { EscalationService } from './services/escalation.js';

const fastify = Fastify({
  logger: true
});

fastify.register(cors, {
  origin: '*'
});

// Mock active alerts store for tracking acknowledgment
const activeAlerts = new Map();

fastify.get('/health', async (request, reply) => {
  return { status: 'OK', timestamp: Date.now() };
});

fastify.post('/triage', async (request, reply) => {
  const alert = request.body;
  
  try {
    // Validate alert data using the shared Zod schema
    EmergencyAlertSchema.parse(alert);
    
    // Phase 2: AI Triage with Gemini
    const triageResult = await TriageService.analyzeAlert(alert);
    
    // Store alert and set escalation timeout
    const alertId = alert.id || `alert-${Date.now()}`;
    activeAlerts.set(alertId, { alert, triage: triageResult, acknowledged: false });
    
    // Start escalation timer (30 seconds for demo)
    setTimeout(async () => {
      const storedAlert = activeAlerts.get(alertId);
      if (storedAlert && !storedAlert.acknowledged) {
        fastify.log.warn(`Escalating unacknowledged alert: ${alertId}`);
        await EscalationService.sendEscalation(alert, triageResult);
      }
    }, 30000);
    
    return {
      success: true,
      alertId,
      triage: triageResult
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(400).send({ error: 'Invalid alert data or triage failed' });
  }
});

fastify.post('/acknowledge', async (request, reply) => {
  const { alertId } = request.body;
  if (activeAlerts.has(alertId)) {
    const alertEntry = activeAlerts.get(alertId);
    alertEntry.acknowledged = true;
    fastify.log.info(`Alert acknowledged: ${alertId}`);
    return { success: true };
  }
  return reply.code(404).send({ error: 'Alert not found' });
});

fastify.post('/resolve', async (request, reply) => {
  const { alertId, summary, actions } = request.body;
  
  if (activeAlerts.has(alertId)) {
    const { alert, triage } = activeAlerts.get(alertId);
    
    const incidentRecord = {
      alert,
      triage,
      resolvedAt: Date.now(),
      summary: summary || 'No summary provided',
      actions: actions || []
    };

    try {
      // Phase 5: Generate AI Post-Incident Summary
      const aiSummary = await TriageService.generateIncidentSummary(incidentRecord);
      incidentRecord.ai_report = aiSummary;

      // In a real app: await addDoc(collection(db, 'incidents'), incidentRecord);
      fastify.log.info(`Incident finalized with AI Summary: ${alertId}`);
      
      activeAlerts.delete(alertId);
      return { success: true, record: incidentRecord };
    } catch (error) {
      fastify.log.error('Firestore/Summary Error:', error);
      return reply.code(500).send({ error: 'Failed to finalize audit log' });
    }
  }
  return reply.code(404).send({ error: 'Alert not found' });
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
