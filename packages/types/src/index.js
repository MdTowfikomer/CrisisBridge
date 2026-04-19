import { z } from 'zod';
export const EmergencyType = z.enum(['FIRE', 'SECURITY', 'MEDICAL']);
export const EmergencyAlertSchema = z.object({
    id: z.string().uuid().optional(),
    type: EmergencyType,
    location: z.string(), // e.g., "Room 305"
    description: z.string().optional(),
    status: z.enum(['PENDING', 'ACKNOWLEDGED', 'RESOLVED']).default('PENDING'),
    timestamp: z.number(), // Date.now()
});
export const IncidentRecordSchema = z.object({
    alert: EmergencyAlertSchema,
    responderId: z.string().optional(),
    actions: z.array(z.string()),
    summary: z.string().optional(),
    isFinalized: z.boolean().default(false),
});
//# sourceMappingURL=index.js.map