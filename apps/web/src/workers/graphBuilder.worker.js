/**
 * CrisisBridge Graph Builder Worker
 * Handles off-thread SVG parsing and proximity calculation
 */

self.onmessage = ({ data }) => {
  const { svgString, threshold, existingNodes = {} } = data;
  
  try {
    // We use a regex-based approach for node extraction to avoid DOMParser overhead/limitations in workers
    const nodes = {};
    const conflicts = [];

    // Pattern to find elements with specific IDs or Classes
    // Looking for id="exit_..." or class="extinguisher" or class="fire_exit"
    const elementPattern = /<(circle|rect|path|g|image)[^>]*?(id|class)=["']([^"']*?(exit|extinguisher|stairs|transition|hydrant)[^"']*?)["'][^>]*?>/gi;
    
    // Pattern to extract coordinates (simplified for this architectural phase)
    // In a production env, we'd use a more robust SVG path parser
    const xPattern = /(?:x|cx)=["']([^"']+)["']/;
    const yPattern = /(?:y|cy)=["']([^"']+)["']/;

    let match;
    while ((match = elementPattern.exec(svgString)) !== null) {
      const [fullTag, tagType, attrType, attrValue] = match;
      
      const xMatch = fullTag.match(xPattern);
      const yMatch = fullTag.match(yPattern);
      
      if (xMatch && yMatch) {
        const x = parseFloat(xMatch[1]);
        const y = parseFloat(yMatch[1]);
        const id = `auto_${attrValue}_${Math.random().toString(36).substr(2, 5)}`;
        
        // Detection Logic
        let type = 'path';
        if (attrValue.includes('exit')) type = 'exit';
        if (attrValue.includes('extinguisher') || attrValue.includes('hydrant')) type = 'safety';
        if (attrValue.includes('stairs') || attrValue.includes('transition')) type = 'transition';

        const newNode = {
          id,
          x,
          y,
          label: attrValue.replace(/[_-]/g, ' ').toUpperCase(),
          type,
          source: 'auto-detected',
          verified: false
        };

        // Conflict detection (OQ2)
        const conflict = Object.values(existingNodes).find(en => 
          Math.abs(en.x - x) < 5 && Math.abs(en.y - y) < 5
        );

        if (conflict) {
          conflicts.push({ auto: newNode, manual: conflict });
        } else {
          nodes[id] = newNode;
        }
      }
    }

    self.postMessage({ nodes, conflicts, status: 'success' });
  } catch (error) {
    self.postMessage({ error: error.message, status: 'error' });
  }
};
