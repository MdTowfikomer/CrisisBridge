/**
 * CrisisBridge Pathfinder
 * Implements Dijkstra's algorithm for situation-aware guidance
 */

export class Pathfinder {
  constructor(nodes, edges, profile = null) {
    this.nodes = nodes;
    this.edges = edges;
    this.profile = profile || {
      weights: { exit: 1, safety: 1, path: 1, transition: 1 }
    };
  }

  // Calculate mission-adjusted weight for an edge
  getAdjustedWeight(edge) {
    const toNode = this.nodes[edge.to];
    if (!toNode) return edge.weight;

    const multiplier = this.profile.weights[toNode.type] || 1;
    return edge.weight * multiplier;
  }

  findPath(startNodeId, targetIdOrType = 'exit') {
    const distances = {};
    const previous = {};
    const nodes = new Set(Object.keys(this.nodes));

    for (const nodeId of nodes) {
      distances[nodeId] = Infinity;
      previous[nodeId] = null;
    }
    distances[startNodeId] = 0;

    while (nodes.size > 0) {
      // Find node with minimum distance
      let minNodeId = null;
      for (const nodeId of nodes) {
        if (minNodeId === null || distances[nodeId] < distances[minNodeId]) {
          minNodeId = nodeId;
        }
      }

      if (distances[minNodeId] === Infinity) break;

      // Check if we reached a target
      if (minNodeId === targetIdOrType || this.nodes[minNodeId].type === targetIdOrType) {
        return this.reconstructPath(previous, minNodeId);
      }

      nodes.delete(minNodeId);

      // Relax edges
      const neighbors = this.edges.filter(e => e.from === minNodeId);
      for (const edge of neighbors) {
        const alt = distances[minNodeId] + this.getAdjustedWeight(edge);
        if (alt < distances[edge.to]) {
          distances[edge.to] = alt;
          previous[edge.to] = minNodeId;
        }
      }
    }

    return null;
  }

  reconstructPath(previous, targetId) {
    const path = [];
    let current = targetId;
    while (current !== null) {
      path.unshift(current);
      current = previous[current];
    }
    return path;
  }
}
