import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface GraphNode {
  id: string;
  x: number;
  y: number;
  floor: number;
  label: string;
  type: string;
}

interface GraphEdge {
  from: string;
  to: string;
  weight: number;
  instruction: string;
}

interface GraphData {
  propertyId: string;
  name: string;
  viewBox: string;
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
}

export interface RouteRequest {
  property: string;
  from: { x: number; y: number; floor: number };
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

class PriorityQueue<T> {
  private elements: { element: T; priority: number }[] = [];

  enqueue(element: T, priority: number) {
    this.elements.push({ element, priority });
    this.elements.sort((a, b) => a.priority - b.priority);
  }

  dequeue(): T | undefined {
    return this.elements.shift()?.element;
  }

  isEmpty(): boolean {
    return this.elements.length === 0;
  }
}

export const NavigationService = {
  async getMapData(propertyId: string): Promise<GraphData> {
    try {
      const mapPath = path.resolve(__dirname, '../data/maps', propertyId, 'navigation.json');
      const data = await fs.readFile(mapPath, 'utf-8');
      return JSON.parse(data) as GraphData;
    } catch (e) {
      throw new Error(`Map data not found for property: ${propertyId}`);
    }
  },

  async calculateRoute({ property, from, to, hazards = [] }: RouteRequest): Promise<RouteResult> {
    const map = await this.getMapData(property);

    // 1. Resolve 'from' coordinates to the closest node on the same floor
    let startNodeId: string | null = null;
    let minDistance = Infinity;

    for (const node of Object.values(map.nodes)) {
      if (node.floor !== from.floor) continue;
      
      const dist = Math.sqrt(Math.pow(node.x - from.x, 2) + Math.pow(node.y - from.y, 2));
      if (dist < minDistance) {
        minDistance = dist;
        startNodeId = node.id;
      }
    }

    if (!startNodeId) {
      throw new Error('Could not resolve starting node from coordinates on the given floor');
    }

    // 2. Determine destination
    const isExitMode = !to || to === 'EXIT';
    let destinationNodeId: string | null = null;

    if (!isExitMode) {
      if (!map.nodes[to]) {
        throw new Error(`Destination node not found: ${to}`);
      }
      destinationNodeId = to;
    } else {
      const exits = Object.values(map.nodes).filter(n => n.type === 'exit');
      if (exits.length === 0) {
        throw new Error('No exits found on map');
      }
    }

    // 3. Build adjacency list
    const graph: Record<string, { to: string; weight: number; instruction: string }[]> = {};
    for (const nodeId in map.nodes) {
      graph[nodeId] = [];
    }

    // We also treat edges as potentially bidirectional if explicitly defined. Current schema handles JSON.
    for (const edge of map.edges) {
      if (hazards.includes(edge.from) || hazards.includes(edge.to)) continue;
      if (graph[edge.from]) {
        graph[edge.from].push({ to: edge.to, weight: edge.weight, instruction: edge.instruction });
      }
    }

    // 4. Dijkstra's Algorithm
    const distances: Record<string, number> = {};
    const previous: Record<string, string | null> = {};
    const pq = new PriorityQueue<string>();

    for (const nodeId in map.nodes) {
      distances[nodeId] = Infinity;
      previous[nodeId] = null;
    }

    distances[startNodeId] = 0;
    pq.enqueue(startNodeId, 0);

    while (!pq.isEmpty()) {
      const current = pq.dequeue();
      if (!current) break;

      const reachedGoal = isExitMode
        ? map.nodes[current].type === 'exit'
        : current === destinationNodeId;

      if (reachedGoal) {
        const routePath: string[] = [];
        let curr: string | null = current;
        while (curr !== null) {
          routePath.unshift(curr);
          curr = previous[curr];
        }

        const steps = [];
        for (let i = 0; i < routePath.length - 1; i++) {
          const fromNode = routePath[i];
          const toNode = routePath[i + 1];
          const edge = graph[fromNode].find(e => e.to === toNode);
          steps.push({
            from: map.nodes[fromNode],
            to: map.nodes[toNode],
            instruction: edge ? edge.instruction : `Proceed to ${map.nodes[toNode].label}`,
            weight: edge ? edge.weight : 10,
          });
        }

        return {
          steps,
          path: routePath,
          destination: map.nodes[current],
          estimatedTime: steps.reduce((sum, s) => sum + s.weight, 0),
          viewBox: map.viewBox || '0 0 1000 800',
        };
      }

      if (graph[current]) {
        for (const neighbor of graph[current]) {
          const alt = distances[current] + neighbor.weight;
          if (alt < distances[neighbor.to]) {
            distances[neighbor.to] = alt;
            previous[neighbor.to] = current;
            pq.enqueue(neighbor.to, alt);
          }
        }
      }
    }

    throw new Error('No path to destination found');
  }
};
