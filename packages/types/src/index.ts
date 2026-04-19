import { z } from 'zod';

export interface Position {
  x: number;
  y: number;
  floor: number;
}

export interface GraphNode extends Position {
  id: string;
  label: string;
  type: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  weight: number;
  instruction: string;
}

export interface GraphData {
  propertyId: string;
  name: string;
  viewBox: string;
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
}

export interface RouteRequest {
  property: string;
  from: Position;
  to: string;
  hazards?: string[];
}

export interface RouteResult {
  steps: {
    from: GraphNode;
    to: GraphNode;
    instruction: string;
    weight: number;
  }[];
  path: string[];
  destination: GraphNode;
  estimatedTime: number;
  viewBox: string;
}

export interface TrackingState {
  position: Position | null;
  heading: number;
  strideLength: number;
  stepCount: number;
  isActive: boolean;
}

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface TriageResult {
  severity: Severity;
  classification: string;
  immediate_action: string;
  task_card: {
    title: string;
    action_item: string;
  };
  requires_ems: boolean;
}

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
