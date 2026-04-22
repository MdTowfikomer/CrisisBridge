/**
 * CrisisBridge Auto-Linker Worker
 * Uses a Spatial Grid to connect safety nodes to transit paths efficiently
 */

class SpatialGrid {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  key(x, y) {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  insert(node) {
    const k = this.key(node.x, node.y);
    if (!this.cells.has(k)) this.cells.set(k, []);
    this.cells.get(k).push(node);
  }

  // Returns neighbors within the 3x3 surrounding cells
  neighbors(x, y) {
    const results = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const k = this.key(x + dx * this.cellSize, y + dy * this.cellSize);
        if (this.cells.has(k)) {
          results.push(...this.cells.get(k));
        }
      }
    }
    return results;
  }
}

self.onmessage = ({ data }) => {
  const { nodes, threshold } = data;
  
  try {
    const proposedEdges = [];
    const activeNodes = Object.values(nodes).filter(n => n.status !== 'archived');

    if (activeNodes.length === 0) {
      self.postMessage({ proposedEdges: [], status: 'success' });
      return;
    }

    // Build Spatial Grid for all active nodes
    const grid = new SpatialGrid(threshold * 2);
    activeNodes.forEach(node => grid.insert(node));

    const edgeSet = new Set(); // to avoid bidirectional duplicates

    // For each node, find its nearest neighbors
    activeNodes.forEach(nodeA => {
      const candidates = grid.neighbors(nodeA.x, nodeA.y);
      
      const sortedCandidates = candidates
        .filter(n => n.id !== nodeA.id)
        .map(nodeB => ({ node: nodeB, dist: Math.hypot(nodeB.x - nodeA.x, nodeB.y - nodeA.y) }))
        .filter(c => c.dist <= threshold * 3) // Generous distance threshold
        .sort((a, b) => a.dist - b.dist);

      // Connect to up to 3 nearest neighbors to form a clean mesh without spiderwebs
      sortedCandidates.slice(0, 3).forEach(({ node: nodeB, dist }) => {
        const key1 = `${nodeA.id}-${nodeB.id}`;
        const key2 = `${nodeB.id}-${nodeA.id}`;
        
        if (!edgeSet.has(key1) && !edgeSet.has(key2)) {
          edgeSet.add(key1);
          proposedEdges.push({
            id: `proposed_edge_${Math.random().toString(36).substr(2, 9)}`,
            from: nodeA.id,
            to: nodeB.id,
            weight: Math.round(dist),
            instruction: 'Proceed',
            dist: Math.round(dist)
          });
        }
      });
    });

    self.postMessage({ proposedEdges, status: 'success' });
  } catch (error) {
    self.postMessage({ error: error.message, status: 'error' });
  }
};
