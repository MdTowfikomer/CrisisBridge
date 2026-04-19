import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { MapPin, ArrowRight, ArrowLeft, Navigation, CheckCircle2, AlertTriangle, Locate } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/* ═══════════════════════════════════════════════
   Utility: calculate angle between two points
   ═══════════════════════════════════════════════ */
function angleBetween(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/* ═══════════════════════════════════════════════
   Utility: Build SVG polyline points from path
   ═══════════════════════════════════════════════ */
function buildPathPoints(route, mapData) {
  if (!route || !mapData) return '';
  return route.path
    .map((nodeId) => {
      const node = mapData.nodes[nodeId];
      return node ? `${node.x},${node.y}` : '';
    })
    .filter(Boolean)
    .join(' ');
}

/* ═══════════════════════════════════════════════
   Utility: Build SVG path d from route
   ═══════════════════════════════════════════════ */
function buildPathD(route, mapData) {
  if (!route || !mapData || route.path.length < 2) return '';
  const points = route.path
    .map((nodeId) => mapData.nodes[nodeId])
    .filter(Boolean);
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

/* ═══════════════════════════════════════════════
   Utility: Calculate total path length for animation
   ═══════════════════════════════════════════════ */
function getSegmentLengths(route, mapData) {
  if (!route || !mapData) return [];
  const lengths = [];
  for (let i = 0; i < route.path.length - 1; i++) {
    const from = mapData.nodes[route.path[i]];
    const to = mapData.nodes[route.path[i + 1]];
    if (from && to) {
      lengths.push(Math.sqrt(Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2)));
    }
  }
  return lengths;
}

export function NavigationGuide({ startLocation, propertyId, apiBaseUrl, onCancel }) {
  const [route, setRoute] = useState(null);
  const [mapData, setMapData] = useState(null);
  const [floorplanSvg, setFloorplanSvg] = useState('');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hazards, setHazards] = useState([]);
  const pathRef = useRef(null);
  const [pathTotalLength, setPathTotalLength] = useState(0);

  const [userId] = useState(() => `user_${Math.random().toString(36).substr(2, 9)}`);

  // Subscribe to hazards
  useEffect(() => {
    if (!propertyId) return;
    const hazardsRef = ref(rtdb, `hazards/${propertyId}`);
    const unsub = onValue(hazardsRef, (snap) => {
      const data = snap.val();
      if (data) {
        setHazards(Object.keys(data).filter((k) => data[k] === true));
      } else {
        setHazards([]);
      }
    });
    return () => unsub();
  }, [propertyId]);

  // Fetch floor plan SVG, route and map data
  useEffect(() => {
    let active = true;
    const fetchAll = async () => {
      setLoading(true);
      try {
        // Fetch CAD floor plan SVG
        const svgRes = await fetch(`${apiBaseUrl}/floorplan/${propertyId || 'UNKNOWN'}`);
        if (svgRes.ok) {
          const svgText = await svgRes.text();
          if (active) setFloorplanSvg(svgText);
        }

        // Fetch map graph data
        const mapRes = await fetch(`${apiBaseUrl}/map/${propertyId || 'UNKNOWN'}`);
        const mapResult = await mapRes.json();
        if (mapResult.success && active) {
          setMapData(mapResult.map);
        }

        // Fetch navigation route
        const navRes = await fetch(`${apiBaseUrl}/navigate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ property: propertyId, from: startLocation, to: 'EXIT', hazards }),
        });
        const navData = await navRes.json();
        if (!navData.success) throw new Error(navData.error);
        if (active) {
          setRoute(navData.route);
          setCurrentStepIndex(0);
        }
      } catch (err) {
        if (active) setError(err.message || 'Failed to calculate route');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchAll();
    return () => { active = false; };
  }, [apiBaseUrl, startLocation, propertyId, hazards]);

  // Measure SVG path length for dash animation
  useEffect(() => {
    if (pathRef.current) {
      setPathTotalLength(pathRef.current.getTotalLength());
    }
  }, [route, mapData]);

  // Update live location when step changes
  useEffect(() => {
    if (route && route.steps) {
      const isComplete = currentStepIndex >= route.steps.length;
      const currentNode = isComplete
        ? route.destination
        : route.steps[currentStepIndex].from;

      const locationRef = ref(rtdb, `liveLocations/${userId}`);
      set(locationRef, {
        property: propertyId || 'UNKNOWN',
        x: currentNode.x,
        y: currentNode.y,
        floor: currentNode.floor || 1,
        status: isComplete ? 'evacuated' : 'evacuating',
        currentNodeId: currentNode.id,
        lastUpdated: Date.now(),
      });
    }
  }, [route, currentStepIndex, userId, propertyId]);

  const handleNext = useCallback(() => {
    if (route && currentStepIndex < route.steps.length) {
      setCurrentStepIndex((i) => i + 1);
    }
  }, [route, currentStepIndex]);

  const handleBack = useCallback(() => {
    setCurrentStepIndex((i) => Math.max(0, i - 1));
  }, []);

  // Calculate progress-based dash offset
  const getProgressDashOffset = () => {
    if (!route || !mapData || pathTotalLength === 0) return pathTotalLength;
    const segLengths = getSegmentLengths(route, mapData);
    const totalLen = segLengths.reduce((a, b) => a + b, 0);
    if (totalLen === 0) return pathTotalLength;

    let traversed = 0;
    for (let i = 0; i < currentStepIndex && i < segLengths.length; i++) {
      traversed += segLengths[i];
    }

    const ratio = traversed / totalLen;
    return pathTotalLength * (1 - ratio);
  };

  // Arrow rotation angle
  const getArrowAngle = () => {
    if (!route || !route.steps || currentStepIndex >= route.steps.length) return 0;
    const step = route.steps[currentStepIndex];
    return angleBetween(step.from, step.to);
  };

  const getCurrentNode = () => {
    if (!route) return null;
    if (currentStepIndex >= route.steps.length) return route.destination;
    return route.steps[currentStepIndex].from;
  };

  const viewBox = mapData?.viewBox || route?.viewBox || '0 0 800 500';

  /* ═══════════════════════════════════════════════
     LOADING STATE
     ═══════════════════════════════════════════════ */
  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center p-8 min-h-[60vh] rounded-2xl bg-[hsl(224,40%,7%)] border border-slate-700/50">
        <div className="relative">
          <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-cyan-400 border-t-transparent" />
          <div className="absolute inset-0 h-12 w-12 animate-ping rounded-full border border-cyan-400/20" />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">
          Loading Floor Plan & Calculating Route...
        </p>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════
     ERROR STATE
     ═══════════════════════════════════════════════ */
  if (error) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center p-8 min-h-[60vh] rounded-2xl bg-[hsl(224,40%,7%)] border border-red-500/30">
        <AlertTriangle className="h-12 w-12 text-red-400 mb-4" />
        <p className="font-bold text-red-300 text-lg">Navigation Error</p>
        <p className="text-sm text-red-200/70 mt-2 text-center max-w-sm">{error}</p>
        <button
          onClick={onCancel}
          className="mt-6 bg-slate-800 hover:bg-slate-700 text-white rounded-xl px-8 py-3 text-xs font-semibold uppercase tracking-wider border border-slate-600 transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  const isComplete = currentStepIndex >= route.steps.length;
  const currentNode = getCurrentNode();
  const arrowAngle = getArrowAngle();
  const dashOffset = getProgressDashOffset();

  /* ═══════════════════════════════════════════════
     DESTINATION REACHED
     ═══════════════════════════════════════════════ */
  if (isComplete) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[60vh] rounded-2xl bg-[hsl(224,40%,7%)] border border-emerald-500/30">
        <div className="relative">
          <CheckCircle2 className="h-20 w-20 text-emerald-400" />
          <div className="absolute inset-0 h-20 w-20 animate-ping rounded-full bg-emerald-400/10" />
        </div>
        <h2 className="mt-6 text-3xl font-bold text-white tracking-tight">You've Reached Safety</h2>
        <p className="text-slate-400 mt-3 text-center max-w-sm leading-relaxed">
          You have arrived at <span className="text-emerald-300 font-semibold">{route.destination.label}</span>. Proceed outside and report to the assembly point.
        </p>
        <button
          onClick={onCancel}
          className="mt-8 bg-emerald-600 hover:bg-emerald-500 text-white px-10 py-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-emerald-600/20"
        >
          Return to Status
        </button>
      </div>
    );
  }

  const currentStep = route.steps[currentStepIndex];
  const progressPercent = Math.round(((currentStepIndex + 1) / route.steps.length) * 100);

  /* ═══════════════════════════════════════════════
     MAIN NAVIGATION VIEW
     ═══════════════════════════════════════════════ */
  return (
    <div className="flex flex-col flex-1 rounded-2xl overflow-hidden bg-[hsl(224,40%,7%)] border border-slate-700/50 shadow-2xl">

      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50 bg-[hsl(222,28%,10%)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-cyan-500/15 border border-cyan-500/30 rounded-full px-3 py-1.5">
            <Locate className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-cyan-300">
              Step {currentStepIndex + 1} / {route.steps.length}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2 bg-slate-800/60 border border-slate-700/50 rounded-full px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              ETA ~{route.estimatedTime}s
            </span>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="text-[10px] font-bold text-slate-500 hover:text-slate-300 uppercase tracking-wider transition-colors"
        >
          Exit Nav
        </button>
      </div>

      {/* ── Progress Bar ── */}
      <div className="h-1 bg-slate-800 relative">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-700 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
        <div
          className="absolute top-0 h-full w-8 bg-gradient-to-r from-transparent to-cyan-400/30 blur-sm transition-all duration-700"
          style={{ left: `${progressPercent - 2}%` }}
        />
      </div>

      {/* ── CAD Floor Plan Map ── */}
      <div className="relative flex-1 min-h-[300px] overflow-hidden bg-[hsl(224,45%,5%)]">
        <svg
          viewBox={viewBox}
          className="w-full h-full"
          style={{ minHeight: '300px' }}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Glow filter for the route path */}
            <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feFlood floodColor="#22d3ee" floodOpacity="0.4" />
              <feComposite in2="blur" operator="in" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Glow for current position */}
            <filter id="posGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feFlood floodColor="#22d3ee" floodOpacity="0.6" />
              <feComposite in2="blur" operator="in" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Arrow marker for direction */}
            <marker id="navArrowHead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto" fill="#22d3ee">
              <polygon points="0 0, 8 3, 0 6" />
            </marker>
          </defs>

          {/* ── Render CAD Floor Plan as background ── */}
          {floorplanSvg && (
            <g dangerouslySetInnerHTML={{ __html: floorplanSvg.replace(/<\/?svg[^>]*>/gi, '') }} />
          )}

          {/* ── Hazard overlays ── */}
          {mapData && hazards.map((nodeId) => {
            const node = mapData.nodes[nodeId];
            if (!node) return null;
            return (
              <g key={`hz-${nodeId}`}>
                <circle cx={node.x} cy={node.y} r="30" fill="rgba(239,68,68,0.08)" stroke="rgba(239,68,68,0.3)" strokeWidth="2" className="animate-pulse" />
                <circle cx={node.x} cy={node.y} r="18" fill="rgba(239,68,68,0.15)" stroke="rgba(239,68,68,0.5)" strokeWidth="1.5" />
                <text x={node.x} y={node.y + 4} fill="#f87171" fontSize="9" textAnchor="middle" fontFamily="monospace" fontWeight="700">⚠</text>
              </g>
            );
          })}

          {/* ── Full route path (dim trail) ── */}
          {mapData && route && (
            <polyline
              points={buildPathPoints(route, mapData)}
              fill="none"
              stroke="#1e3a5f"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.4"
            />
          )}

          {/* ── Animated progress path ── */}
          {mapData && route && (
            <path
              ref={pathRef}
              d={buildPathD(route, mapData)}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#routeGlow)"
              strokeDasharray={pathTotalLength || 1000}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
            />
          )}

          {/* ── Route waypoint dots ── */}
          {mapData && route && route.path.map((nodeId, idx) => {
            const node = mapData.nodes[nodeId];
            if (!node) return null;
            const isVisited = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex;
            const isTarget = idx === currentStepIndex + 1;
            const isExit = node.type === 'exit';

            if (isCurrent || isTarget) return null; // rendered separately

            return (
              <g key={`wp-${nodeId}`}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isExit ? '8' : '5'}
                  fill={isVisited ? '#22d3ee' : isExit ? '#10b981' : '#334155'}
                  opacity={isVisited ? '0.6' : '0.8'}
                />
                {isExit && (
                  <text x={node.x} y={node.y - 14} fill="#10b981" fontSize="9" textAnchor="middle" fontFamily="monospace" fontWeight="700">{node.label}</text>
                )}
              </g>
            );
          })}

          {/* ── Target node (next step destination) ── */}
          {currentStepIndex < route.steps.length && mapData && (() => {
            const targetNode = currentStep.to;
            return (
              <g>
                <circle cx={targetNode.x} cy={targetNode.y} r="14" fill="rgba(34,211,238,0.1)" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="4,3" className="animate-pulse" />
                <circle cx={targetNode.x} cy={targetNode.y} r="6" fill="#22d3ee" opacity="0.5" />
              </g>
            );
          })()}

          {/* ── Direction arrow from current pos to target ── */}
          {currentNode && currentStepIndex < route.steps.length && (() => {
            const target = currentStep.to;
            const midX = (currentNode.x + target.x) / 2;
            const midY = (currentNode.y + target.y) / 2;
            return (
              <line
                x1={currentNode.x}
                y1={currentNode.y}
                x2={midX}
                y2={midY}
                stroke="#22d3ee"
                strokeWidth="2"
                markerEnd="url(#navArrowHead)"
                opacity="0.7"
                style={{ transition: 'all 0.5s ease-out' }}
              />
            );
          })()}

          {/* ── Current position marker (magnetic arrow) ── */}
          {currentNode && (
            <g style={{ transition: 'transform 0.6s ease-out' }}>
              {/* Outer pulse ring */}
              <circle
                cx={currentNode.x}
                cy={currentNode.y}
                r="22"
                fill="rgba(34,211,238,0.06)"
                stroke="rgba(34,211,238,0.2)"
                strokeWidth="1"
                className="animate-ping"
                style={{ animationDuration: '2s' }}
              />
              {/* Glow disc */}
              <circle
                cx={currentNode.x}
                cy={currentNode.y}
                r="16"
                fill="rgba(34,211,238,0.1)"
                filter="url(#posGlow)"
              />
              {/* Navigation arrow (rotates toward next waypoint) */}
              <g transform={`translate(${currentNode.x}, ${currentNode.y}) rotate(${arrowAngle})`} style={{ transition: 'transform 0.5s ease-out' }}>
                <polygon
                  points="12,0 -6,-7 -3,0 -6,7"
                  fill="#22d3ee"
                  stroke="#0e7490"
                  strokeWidth="1"
                />
              </g>
              {/* Center dot */}
              <circle cx={currentNode.x} cy={currentNode.y} r="3" fill="#fff" />
            </g>
          )}
        </svg>

        {/* ── Floor badge overlay ── */}
        <div className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-lg px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">Floor {currentStep.from.floor}</p>
        </div>

        {/* ── Legend overlay ── */}
        <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-lg px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-cyan-400 rounded" />
            <span className="text-[9px] text-slate-400 font-medium">Your Route</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            <span className="text-[9px] text-slate-400 font-medium">Exit</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/60 border border-red-500/40" />
            <span className="text-[9px] text-slate-400 font-medium">Hazard</span>
          </div>
        </div>
      </div>

      {/* ── Instruction Panel (glassmorphic) ── */}
      <div className="border-t border-slate-700/50 bg-[hsl(222,28%,10%)] backdrop-blur-md p-5 sm:p-6">
        {/* Directional arrow + instruction */}
        <div className="flex items-center gap-4 mb-5">
          <div
            className="shrink-0 w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center"
            style={{ transform: `rotate(${arrowAngle}deg)`, transition: 'transform 0.5s ease-out' }}
          >
            <Navigation className="w-7 h-7 text-cyan-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500 mb-1">
              Next Direction
            </p>
            <h2 className="text-lg sm:text-xl font-bold text-white leading-snug tracking-tight">
              {currentStep.instruction}
            </h2>
          </div>
        </div>

        {/* From → To labels */}
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-5">
          <span className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1 font-semibold text-slate-300">
            {currentStep.from.label}
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
          <span className="bg-cyan-500/10 border border-cyan-500/25 rounded-md px-2 py-1 font-semibold text-cyan-300">
            {currentStep.to.label}
          </span>
        </div>

        {/* Navigation buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleBack}
            disabled={currentStepIndex === 0}
            className={cn(
              'flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-sm transition-all duration-200',
              currentStepIndex === 0
                ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed border border-slate-700/30'
                : 'bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700 hover:border-slate-500 active:scale-[0.98]'
            )}
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <button
            onClick={handleNext}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white py-4 rounded-xl font-bold text-sm transition-all duration-200 shadow-lg shadow-cyan-600/20 active:scale-[0.98]"
          >
            {currentStepIndex === route.steps.length - 1 ? (
              <>Arrive at Exit <MapPin className="w-4 h-4" /></>
            ) : (
              <>Next Step <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
