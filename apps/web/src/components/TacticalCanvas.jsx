import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';

export const TacticalCanvas = ({ 
  viewBox, 
  svgContent, 
  nodes, 
  edges, 
  mode, 
  selectedNode, 
  edgeStart, 
  onSvgClick, 
  onNodeClick 
}) => {
  const svgRef = useRef(null);
  const [hoverNode, setHoverNode] = useState(null);
  const SNAP_THRESHOLD = 30;

  const getSnappedPoint = (rawX, rawY) => {
    // If in edge mode, find the nearest node for snapping
    if (mode === 'add-edge') {
      let nearest = null;
      let minDist = SNAP_THRESHOLD;

      Object.values(nodes).forEach(node => {
        const dist = Math.sqrt(Math.pow(node.x - rawX, 2) + Math.pow(node.y - rawY, 2));
        if (dist < minDist) {
          minDist = dist;
          nearest = node;
        }
      });

      if (nearest) return { x: nearest.x, y: nearest.y, snappedId: nearest.id };
    }
    return { x: rawX, y: rawY, snappedId: null };
  };

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e) => {
    if (!svgRef.current) return;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursorpt = pt.matrixTransform(svgRef.current.getScreenCTM().inverse());
    
    const snapped = getSnappedPoint(cursorpt.x, cursorpt.y);
    setMousePos(snapped);
  };

  const handleClick = (e) => {
    onSvgClick(mousePos);
  };

  return (
    <div className="bg-slate-950 rounded-3xl border-2 border-slate-800 overflow-hidden relative shadow-inner group">
      <svg
        ref={svgRef}
        viewBox={viewBox}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        className={mode === 'add-node' ? 'w-full h-full cursor-crosshair' : 'w-full h-full cursor-default'}
      >
        <defs>
           <filter id="node-glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>

        {svgContent && (
          <g dangerouslySetInnerHTML={{ __html: svgContent.replace(/<\/?svg[^>]*>/gi, '') }} className="opacity-30" />
        )}

        {/* Snapping Crosshair (HUD) */}
        {mode !== 'select' && (
           <g className="pointer-events-none">
              <line x1={mousePos.x} y1="0" x2={mousePos.x} y2="100%" stroke="white" strokeWidth="0.5" opacity="0.1" />
              <line x1="0" y1={mousePos.y} x2="100%" y2={mousePos.y} stroke="white" strokeWidth="0.5" opacity="0.1" />
              <circle 
                cx={mousePos.x} cy={mousePos.y} r={mousePos.snappedId ? 10 : 4} 
                fill="none" stroke={mousePos.snappedId ? "#10b981" : "white"} 
                strokeWidth="1.5" className="transition-all"
              />
           </g>
        )}

        {/* Tactical Grid Overlay */}
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="white" strokeWidth="0.5" opacity="0.05"/>
        </pattern>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Edges Layer */}
        {edges.map((edge, i) => {
          const from = nodes[edge.from];
          const to = nodes[edge.to];
          if (!from || !to) return null;
          return (
            <motion.line
              key={i} 
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.4 }}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,5"
            />
          );
        })}

        {/* Interactive Nodes Layer */}
        {Object.values(nodes).map(node => {
          const isSelected = selectedNode?.id === node.id;
          const isEdgeStart = edgeStart === node.id;
          const isHovered = hoverNode === node.id;

          return (
            <g 
              key={node.id} 
              onClick={(e) => { e.stopPropagation(); onNodeClick(node); }}
              onMouseEnter={() => setHoverNode(node.id)}
              onMouseLeave={() => setHoverNode(null)}
              className="cursor-pointer group/node"
            >
              <circle
                cx={node.x} cy={node.y} r={isSelected ? 12 : 8}
                fill={isSelected ? '#f59e0b' : node.type === 'exit' ? '#10b981' : node.type === 'room' ? '#3b82f6' : '#64748b'}
                className="transition-all duration-200"
                style={isSelected ? { filter: 'url(#node-glow)' } : {}}
              />
              {(isSelected || isHovered || node.label) && (
                <text 
                  x={node.x} y={node.y - 15} 
                  fontSize="10" fill="white" textAnchor="middle" 
                  className="pointer-events-none font-black uppercase tracking-tighter"
                >
                  {node.label || node.type}
                </text>
              )}
            </g>
          );
        })}

        {/* Ghost Edge Preview */}
        {edgeStart && nodes[edgeStart] && (
          <line 
            x1={nodes[edgeStart].x} y1={nodes[edgeStart].y} 
            x2={nodes[edgeStart].x} y2={nodes[edgeStart].y} 
            stroke="#f59e0b" strokeWidth="2" opacity="0.5"
          />
        )}
      </svg>

      {/* Mode Indicator HUD */}
      <div className="absolute top-6 left-6 pointer-events-none">
         <div className="bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full animate-pulse ${mode === 'add-node' ? 'bg-emerald-500' : mode === 'add-edge' ? 'bg-blue-500' : 'bg-slate-500'}`} />
            <span className="text-[10px] font-black uppercase tracking-widest text-white">System: {mode.replace('-', ' ')}</span>
         </div>
      </div>
    </div>
  );
};
