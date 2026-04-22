// pixelScanner.worker.js
// A highly efficient OffscreenCanvas Web Worker for finding pure color blobs
// (Red = Extinguishers, Green = Exits, Blue = First Aid) in flat raster images.

self.onmessage = async function(e) {
  const { base64, w, h } = e.data;
  
  try {
    // Convert base64 DataURL back into an image bitmap off the main thread
    const response = await fetch(base64);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    
    // Create an invisible canvas in memory
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    
    // Extract raw RGBA pixel data
    const imageData = ctx.getImageData(0, 0, w, h).data;
    const nodes = [];
    
    // Keep track of pixels we've already counted to avoid double-counting blobs
    const visited = new Uint8Array(w * h);
    
    // Step by 2 pixels to drastically speed up processing time on large images
    for (let y = 0; y < h; y += 2) { 
      for (let x = 0; x < w; x += 2) {
        const idx = (y * w + x) * 4;
        if (visited[y * w + x]) continue;
        
        const r = imageData[idx];
        const g = imageData[idx + 1];
        const b = imageData[idx + 2];
        const a = imageData[idx + 3];
        
        // Ignore transparent or nearly transparent pixels
        if (a < 50) continue;
        
        // Helper function for more forgiving relative color matching
        const checkColor = (r, g, b, target) => {
          if (target === 'extinguisher') return r > 120 && r - g > 40 && r - b > 40;
          if (target === 'exit') return g > 80 && g - r > 25 && g - b > 25;
          if (target === 'firstaid') return b > 120 && b - r > 40 && b - g > 40;
          return false;
        };

        let type = null;
        let label = '';
        
        if (checkColor(r, g, b, 'extinguisher')) { type = 'extinguisher'; label = 'Fire Extinguisher'; }
        else if (checkColor(r, g, b, 'exit')) { type = 'exit'; label = 'Emergency Exit'; }
        else if (checkColor(r, g, b, 'firstaid')) { type = 'firstaid'; label = 'First Aid Kit'; }
        
        if (type) {
          // Found a trigger pixel! Run a Breadth-First Search (BFS) to find the entire blob's center of mass
          let sumX = 0, sumY = 0, count = 0;
          const queue = [[x, y]];
          visited[y * w + x] = 1;
          
          while(queue.length > 0) {
            const [cx, cy] = queue.shift();
            sumX += cx;
            sumY += cy;
            count++;
            
            // Check adjacent pixels
            const neighbors = [[cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]];
            for (let [nx, ny] of neighbors) {
              if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                 if (!visited[ny * w + nx]) {
                   const nIdx = (ny * w + nx) * 4;
                   const nr = imageData[nIdx], ng = imageData[nIdx+1], nb = imageData[nIdx+2], na = imageData[nIdx+3];
                   
                   if (checkColor(nr, ng, nb, type) && na > 50) {
                     visited[ny * w + nx] = 1;
                     queue.push([nx, ny]);
                   }
                 }
              }
            }
          }
          
          // Only register it if the blob is big enough (filters out tiny compression artifacts/noise)
          if (count > 8) {
             nodes.push({
               id: `node_auto_${Math.random().toString(36).substr(2, 9)}`,
               x: Math.round(sumX / count), // Center of mass
               y: Math.round(sumY / count),
               type: type,
               label: label,
               verified: false, // Must be approved by admin
               floor: 1
             });
          }
        }
      }
    }
    
    self.postMessage({ type: 'DETECTED', payload: nodes });
  } catch (err) {
    self.postMessage({ type: 'ERROR', error: err.message });
  }
};
