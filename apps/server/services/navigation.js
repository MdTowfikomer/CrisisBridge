import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PriorityQueue {
  constructor() {
    this.elements = [];
  }
  enqueue(element, priority) {
    this.elements.push({ element, priority });
    this.elements.sort((a, b) => a.priority - b.priority);
  }
  dequeue() {
    return this.elements.shift().element;
  }
  isEmpty() {
    return this.elements.length === 0;
  }
}

export const NavigationService = {
  async getMapData(propertyId) {
    try {
      const mapPath = path.resolve(__dirname, '../data/maps', propertyId, 'navigation.json');
      const data = await fs.readFile(mapPath, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      // Try fallback to graph.json if navigation.json is missing
      try {
        const fallbackPath = path.resolve(__dirname, '../data/maps', propertyId, 'graph.json');
        const data = await fs.readFile(fallbackPath, 'utf-8');
        return JSON.parse(data);
      } catch (e2) {
        throw new Error(`Map data not found for property: ${propertyId}`);
      }
    }
  },

  async getFloorplanSvg(propertyId) {
    try {
      // Check if floorplan.svg exists in the property folder
      const svgPath = path.resolve(__dirname, '../data/maps', propertyId, 'floorplan.svg');
      const svg = await fs.readFile(svgPath, 'utf-8');
      return svg;
    } catch (e) {
      throw new Error(`Floor plan SVG not found for property: ${propertyId}`);
    }
  },

  async calculateRoute({ property, from, to, hazards = [] }) {
    const map = await this.getMapData(property);

    // 1. Resolve 'from' to closest map node using Euclidean distance, prioritizing same floor
    let startNodeId = null;
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

    // If no node found on same floor, search all nodes as backup
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

    // 2. Determine destination(s)
    const isExitMode = !to || to === 'EXIT';
    let destinationNodeId = null;

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
    const graph = {};
    for (const nodeId in map.nodes) {
      graph[nodeId] = [];
    }
    for (const edge of map.edges) {
      // Prevent navigation through hazardous nodes or edges
      if (hazards.includes(edge.from) || hazards.includes(edge.to)) continue;
      if (graph[edge.from]) {
        graph[edge.from].push({ to: edge.to, weight: edge.weight, instruction: edge.instruction });
      }
      // Assuming all edges in this schema are bidirectional for safety unless it's a vertical elevator/stair jump
      // which we already have in navigation.json as dual edges.
    }

    // 4. Dijkstra's algorithm
    const distances = {};
    const previous = {};
    const pq = new PriorityQueue();

    for (const nodeId in map.nodes) {
      distances[nodeId] = Infinity;
      previous[nodeId] = null;
    }

    distances[startNodeId] = 0;
    pq.enqueue(startNodeId, 0);

    let finalGoalId = null;

    while (!pq.isEmpty()) {
      const current = pq.dequeue();

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
      const routePath = [];
      let curr = finalGoalId;
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
        destination: map.nodes[finalGoalId],
        estimatedTime: steps.reduce((sum, s) => sum + s.weight, 0),
        viewBox: map.viewBox || '0 0 1000 800',
      };
    }

    throw new Error('No path to destination found');
  },
};
