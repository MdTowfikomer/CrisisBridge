import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut } from 'lucide-react';

export const TacticalCanvas = ({ 
  viewBox, 
  svgContent, 
  nodes = {}, 
  pendingNodes = {},
  edges = [], 
  proposedEdges = [],
  mode, 
  selectedNode, 
  edgeStart, 
  onSvgClick, 
  onNodeClick,
  zoom = 1,
  onZoomIn,
  onZoomOut
}) => {
  const svgRef = useRef(null);
  const [hoverNode, setHoverNode] = useState(null);
  const SNAP_THRESHOLD = 30;

  const getSnappedPoint = (rawX, rawY) => {
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

  const renderNode = (node, isPending = false) => {
    const isSelected = selectedNode?.id === node.id;
    const isHovered = hoverNode === node.id;
    
    let color = '#64748b'; // default path
    if (node.type === 'exit') color = '#10b981';
    if (node.type === 'safety') color = '#3b82f6';
    if (node.type === 'transition') color = '#f59e0b';
    if (isPending) color = 'rgba(59, 130, 246, 0.5)';

    return (
      <g 
        key={node.id} 
        onClick={(e) => { e.stopPropagation(); onNodeClick(node); }}
        onMouseEnter={() => setHoverNode(node.id)}
        onMouseLeave={() => setHoverNode(null)}
        className={`cursor-pointer group/node transition-all duration-300 ${isPending ? 'animate-pulse' : ''}`}
      >
        {isPending && (
          <circle 
            cx={node.x} cy={node.y} r={24} 
            fill="rgba(59, 130, 246, 0.2)" className="animate-ping"
          />
        )}

        <circle
          cx={node.x} cy={node.y} r={isSelected ? 20 : 16}
          fill={isSelected ? '#f59e0b' : color}
          className="transition-all duration-200"
          style={isSelected ? { filter: 'url(#node-glow)' } : {}}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
        />

        {node.verified && (
          <g transform={`translate(${node.x + 12}, ${node.y - 16})`}>
            <circle r="6" fill="#10b981" stroke="#0f172a" strokeWidth="1" />
            <path d="M-3 0 L-1 2 L3 -2" stroke="white" strokeWidth="1.5" fill="none" />
          </g>
        )}

        {(isSelected || isHovered || node.label || isPending) && (
          <text 
            x={node.x} y={node.y + 30} 
            fontSize="12" fill={isPending ? "#60a5fa" : "white"} textAnchor="middle" 
            className="pointer-events-none font-black uppercase tracking-widest select-none"
          >
            {node.label || node.type}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="bg-slate-950 rounded-3xl border-2 border-slate-800 overflow-auto relative shadow-inner flex-1 w-full h-[600px] custom-scrollbar">
      <div style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%`, minWidth: '100%', minHeight: '100%', transition: 'width 0.2s, height 0.2s' }}>
        <svg 
          ref={svgRef} 
          viewBox={viewBox} 
          width="100%" height="100%" 
          preserveAspectRatio="xMidYMid meet"
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          className={mode === 'add-node' ? 'w-full h-full cursor-crosshair' : 'w-full h-full cursor-default'}
        >
        <defs>
           <filter id="node-glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>

        {svgContent && (
          <g dangerouslySetInnerHTML={{ __html: svgContent.replace(/<\/?svg[^>]*>/gi, '') }} />
        )}

        {/* Tactical Grid Overlay */}
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="white" strokeWidth="0.5" opacity="0.05"/>
        </pattern>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Edges Layer */}
        {edges.map((edge, i) => {
          const from = nodes[edge.from] || pendingNodes[edge.from];
          const to = nodes[edge.to] || pendingNodes[edge.to];
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

        {/* Proposed Edges */}
        {proposedEdges.map((edge, i) => {
          const from = nodes[edge.from] || pendingNodes[edge.from];
          const to = nodes[edge.to] || pendingNodes[edge.to];
          if (!from || !to) return null;
          return (
            <motion.line
              key={`prop_${i}`} 
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.8 }}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke="#a855f7" strokeWidth="2" strokeDasharray="6,4"
              className="animate-pulse"
            />
          );
        })}

        {/* Nodes Layer */}
        {Object.values(nodes).filter(n => n.status !== 'archived').map(n => renderNode(n, false))}
        {Object.values(pendingNodes).map(n => renderNode(n, true))}

        {/* Ghost Edge Preview */}
        {edgeStart && nodes[edgeStart] && (
          <line 
            x1={nodes[edgeStart].x} y1={nodes[edgeStart].y} 
            x2={mousePos.x} y2={mousePos.y} 
            stroke="#f59e0b" strokeWidth="2" opacity="0.5" strokeDasharray="4"
          />
        )}
      </svg>
      </div>

      {/* Mode Indicator HUD */}
      <div className="absolute top-6 left-6 flex flex-col gap-2 pointer-events-none">
         <div className="bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl flex items-center gap-3 shadow-lg">
            <div className={`w-2 h-2 rounded-full animate-pulse ${mode === 'add-node' ? 'bg-emerald-500' : mode === 'add-edge' ? 'bg-blue-500' : 'bg-slate-500'}`} />
            <span className="text-[10px] font-black uppercase tracking-widest text-white">System: {mode.replace('-', ' ')}</span>
         </div>
         <div className="flex items-center gap-1 pointer-events-auto shadow-lg">
            <button onClick={onZoomOut} className="bg-black/60 backdrop-blur-md border border-white/10 p-2 rounded-lg text-white hover:bg-white/20 active:scale-95 transition-all"><ZoomOut className="w-4 h-4" /></button>
            <div className="bg-black/60 backdrop-blur-md border border-white/10 px-3 py-2 rounded-lg text-white text-[10px] font-black w-14 text-center">{Math.round(zoom * 100)}%</div>
            <button onClick={onZoomIn} className="bg-black/60 backdrop-blur-md border border-white/10 p-2 rounded-lg text-white hover:bg-white/20 active:scale-95 transition-all"><ZoomIn className="w-4 h-4" /></button>
         </div>
      </div>
    </div>
  );
};
