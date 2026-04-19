import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  GraphData, 
  GraphNode, 
  RouteRequest, 
  RouteResult, 
  Position 
} from '@crisisbridge/types';

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
  async getMapData(propertyId: string, dataDir?: string): Promise<GraphData> {
    // Resolve data directory relative to the workspace root if not provided
    const baseDir = dataDir || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
    
    try {
      const mapPath = path.resolve(baseDir, propertyId, 'navigation.json');
      const data = await fs.readFile(mapPath, 'utf-8');
      return JSON.parse(data) as GraphData;
    } catch (e) {
      try {
        const fallbackPath = path.resolve(baseDir, propertyId, 'graph.json');
        const data = await fs.readFile(fallbackPath, 'utf-8');
        return JSON.parse(data) as GraphData;
      } catch (e2) {
        throw new Error(`Map data not found for property: ${propertyId}`);
      }
    }
  },

  async getFloorplanSvg(propertyId: string, dataDir?: string): Promise<string> {
    const baseDir = dataDir || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
    try {
      const svgPath = path.resolve(baseDir, propertyId, 'floorplan.svg');
      const svg = await fs.readFile(svgPath, 'utf-8');
      return svg;
    } catch (e) {
      throw new Error(`Floor plan SVG not found for property: ${propertyId}`);
    }
  },

  calculateRouteFromData(map: GraphData, { from, to, hazards = [] }: Omit<RouteRequest, 'property'>): RouteResult {
    // 1. Resolve 'from' coordinates to the closest node on the same floor
    let startNodeId: string | null = null;
    let minDistance = Infinity;

    const nodes = Object.values(map.nodes);
    for (const node of nodes) {
      if (from.floor && node.floor !== from.floor) continue;

      const dist = Math.sqrt(Math.pow(node.x - from.x, 2) + Math.pow(node.y - from.y, 2));
      if (dist < minDistance) {
        minDistance = dist;
        startNodeId = node.id;
      }
    }

    if (!startNodeId) {
      for (const node of nodes) {
        const dist = Math.sqrt(Math.pow(node.x - from.x, 2) + Math.pow(node.y - from.y, 2));
        if (dist < minDistance) {
          minDistance = dist;
          startNodeId = node.id;
        }
      }
    }

    if (!startNodeId) {
      throw new Error('Could not resolve starting node from coordinates');
    }

    // 2. Determine destination
    const isExitMode = !to || to === 'EXIT';
    let destinationNodeId: string | null = null;

    if (!isExitMode) {
      if (!map.nodes[to]) {
        throw new Error(`Destination node not found: ${to}`);
      }
      destinationNodeId = to;
    }

    // 3. Build adjacency list
    const graph: Record<string, { to: string; weight: number; instruction: string }[]> = {}; 
    for (const nodeId in map.nodes) {
      graph[nodeId] = [];
    }

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

    let finalGoalId: string | null = null;

    while (!pq.isEmpty()) {
      const current = pq.dequeue();
      if (!current) break;

      const reachedGoal = isExitMode
        ? map.nodes[current].type === 'exit'
        : current === destinationNodeId;

      if (reachedGoal) {
        finalGoalId = current;
        break;
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

    if (finalGoalId) {
      const routePath: string[] = [];
      let curr: string | null = finalGoalId;
      while (curr !== null) {
        routePath.unshift(curr);
        curr = previous[curr];
      }

      const steps = [];
      for (let i = 0; i < routePath.length - 1; i++) {
        const fromNodeId = routePath[i];
        const toNodeId = routePath[i + 1];
        const edge = graph[fromNodeId].find(e => e.to === toNodeId);
        steps.push({
          from: map.nodes[fromNodeId],
          to: map.nodes[toNodeId],
          instruction: edge ? edge.instruction : `Proceed to ${map.nodes[toNodeId].label}`,  
          weight: edge ? edge.weight : 10,
        });
      }

      return {
        steps,
        path: routePath,
        destination: map.nodes[finalGoalId],
        estimatedTime: steps.reduce((sum, s) => sum + s.weight, 0),
        viewBox: map.viewBox || '0 0 1000 800',
      };
    }

    throw new Error('No path to destination found');
  },

  async calculateRoute(req: RouteRequest, dataDir?: string): Promise<RouteResult> {
    const map = await this.getMapData(req.property, dataDir);
    return this.calculateRouteFromData(map, req);
  }
};
