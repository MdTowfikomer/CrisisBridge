import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ref, set, push, onValue } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import {
  Navigation,
  AlertTriangle,
  Flame,
  Shield,
  HeartPulse,
  MapPin,
  ArrowRight,
  ArrowLeft,
  X,
  Compass,
  Siren,
  LogOut,
  CheckCircle2,
  Locate,
  Loader2,
  Search,
  SlidersHorizontal,
  Wifi,
  Layers,
  TrendingUp,
  CornerUpLeft,
} from 'lucide-react';

/* ═══════════════════════════════════════
   Utility functions
   ═══════════════════════════════════════ */
function angleBetween(from, to) {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

function buildPathD(route, mapData) {
  if (!route || !mapData || route.path.length < 2) return '';
  const points = route.path.map((id) => mapData.nodes[id]).filter(Boolean);
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) d += ` L ${points[i].x} ${points[i].y}`;
  return d;
}

function buildPathPoints(route, mapData) {
  if (!route || !mapData) return '';
  return route.path
    .map((id) => {
      const n = mapData.nodes[id];
      return n ? `${n.x},${n.y}` : '';
    })
    .filter(Boolean)
    .join(' ');
}

function getSegmentLengths(route, mapData) {
  if (!route || !mapData) return [];
  const out = [];
  for (let i = 0; i < route.path.length - 1; i++) {
    const a = mapData.nodes[route.path[i]];
    const b = mapData.nodes[route.path[i + 1]];
    if (a && b) out.push(Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2));
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════
   GuestMapView — Mobile-first, map-first landing
   ═══════════════════════════════════════════════════════════ */
export function GuestMapView({ startLocation, propertyId, apiBaseUrl }) {
  const [mapData, setMapData] = useState(null);
  const [floorplanSvg, setFloorplanSvg] = useState('');
  const [loading, setLoading] = useState(true);
  const [hazards, setHazards] = useState([]);

  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [showDirectionsModal, setShowDirectionsModal] = useState(false);

  const [route, setRoute] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [navMode, setNavMode] = useState(null);
  const [navLoading, setNavLoading] = useState(false);

  const [triageLoading, setTriageLoading] = useState(false);
  const [triageData, setTriageData] = useState(null);
  const [triageError, setTriageError] = useState('');

  const pathRef = useRef(null);
  const [pathTotalLength, setPathTotalLength] = useState(0);

  const [userId] = useState(() => `user_${Math.random().toString(36).substr(2, 9)}`);

  /* ─── Load map + floorplan ─── */
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [mapRes, svgRes] = await Promise.all([
          fetch(`${apiBaseUrl}/map/${propertyId || 'UNKNOWN'}`),
          fetch(`${apiBaseUrl}/floorplan/${propertyId || 'UNKNOWN'}`),
        ]);
        const mapResult = await mapRes.json();
        if (mapResult.success && active) setMapData(mapResult.map);
        if (svgRes.ok) {
          const txt = await svgRes.text();
          if (active) setFloorplanSvg(txt);
        }
      } catch (err) {
        console.error('Map load failed:', err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [apiBaseUrl, propertyId]);

  /* ─── Subscribe to hazards ─── */
  useEffect(() => {
    if (!propertyId) return;
    const hazardsRef = ref(rtdb, `hazards/${propertyId}`);
    const unsub = onValue(hazardsRef, (snap) => {
      const d = snap.val();
      setHazards(d ? Object.keys(d).filter((k) => d[k] === true) : []);
    });
    return () => unsub();
  }, [propertyId]);

  /* ─── Sync live location ─── */
  useEffect(() => {
    if (!route || !route.steps) return;
    const isComplete = currentStepIndex >= route.steps.length;
    const node = isComplete ? route.destination : route.steps[currentStepIndex].from;
    set(ref(rtdb, `liveLocations/${userId}`), {
      property: propertyId || 'UNKNOWN',
      x: node.x, y: node.y, floor: node.floor || 1,
      status: isComplete ? 'evacuated' : 'evacuating',
      currentNodeId: node.id,
      lastUpdated: Date.now(),
    });
  }, [route, currentStepIndex, userId, propertyId]);

  /* ─── Measure path length ─── */
  useEffect(() => {
    if (pathRef.current) setPathTotalLength(pathRef.current.getTotalLength());
  }, [route, mapData]);

  /* ─── Start navigation ─── */
  const startNavigation = useCallback(async (destination, mode) => {
    setNavLoading(true);
    setShowEmergencyModal(false);
    setShowDirectionsModal(false);
    try {
      const res = await fetch(`${apiBaseUrl}/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property: propertyId, from: startLocation, to: destination, hazards }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setRoute(data.route);
      setCurrentStepIndex(0);
      setNavMode(mode);
    } catch (err) {
      console.error('Navigation failed:', err);
      alert(`Navigation failed: ${err.message}`);
    } finally {
      setNavLoading(false);
    }
  }, [apiBaseUrl, propertyId, startLocation, hazards]);

  /* ─── Emergency trigger ─── */
  const handleEmergencyTrigger = useCallback(async (type) => {
    setTriageLoading(true);
    setTriageError('');
    setTriageData(null);
    const alertData = {
      type,
      location: `Room ${new URLSearchParams(window.location.search).get('room') || 'Unknown'}`,
      description: '', timestamp: Date.now(), status: 'PENDING', entryMethod: 'QR', property: propertyId,
    };
    try {
      const triageRes = await fetch(`${apiBaseUrl}/triage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertData),
      });
      const triageResult = await triageRes.json();
      if (triageResult?.success && triageResult?.triage) {
        setTriageData(triageResult.triage);
        const alertsRef = ref(rtdb, 'alerts');
        const newAlertRef = push(alertsRef);
        await set(newAlertRef, { ...alertData, id: triageResult.alertId, triage: triageResult.triage });
      }
      await startNavigation('EXIT', 'emergency');
    } catch (err) {
      setTriageError(err.message || 'Emergency dispatch failed');
    } finally {
      setTriageLoading(false);
    }
  }, [apiBaseUrl, propertyId, startNavigation]);

  const cancelNavigation = () => {
    setRoute(null); setCurrentStepIndex(0); setNavMode(null);
    setTriageData(null); setTriageError('');
  };

  /* ─── Computed ─── */
  const viewBox = mapData?.viewBox || '0 0 800 500';
  const isNavigating = route && navMode;
  const isComplete = isNavigating && currentStepIndex >= route.steps.length;
  const currentStep = isNavigating && !isComplete ? route.steps[currentStepIndex] : null;
  const currentNode = (() => {
    if (!route) return startLocation ? { x: startLocation.x, y: startLocation.y } : null;
    if (isComplete) return route.destination;
    return route.steps[currentStepIndex].from;
  })();
  const arrowAngle = currentStep ? angleBetween(currentStep.from, currentStep.to) : 0;

  const getProgressDashOffset = () => {
    if (!route || !mapData || pathTotalLength === 0) return pathTotalLength;
    const segs = getSegmentLengths(route, mapData);
    const total = segs.reduce((a, b) => a + b, 0);
    if (total === 0) return pathTotalLength;
    let traversed = 0;
    for (let i = 0; i < currentStepIndex && i < segs.length; i++) traversed += segs[i];
    return pathTotalLength * (1 - traversed / total);
  };

  const destinations = mapData
    ? Object.values(mapData.nodes).filter((n) => n.type !== 'path')
    : [];

  const [hasCheckedIn, setHasCheckedIn] = useState(false);

  /* ═══ LOADING ═══ */
  if (loading || !hasCheckedIn) {
    return (
      <div className="fixed inset-0 bg-[#0c0d12] flex flex-col items-center justify-center text-center px-6">
        {/* Splash / Check In Overlay */}
        <div className="mb-8">
          <div className="w-16 h-16 rounded-3xl bg-[#1b332b] flex items-center justify-center mx-auto mb-4 border border-[#4ade80]/30 shadow-[0_0_30px_rgba(74,222,128,0.2)]">
            <Layers className="w-8 h-8 text-[#4ade80]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white uppercase mt-4">CrisisBridge</h1>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mt-2">
            Tactical Navigation Engined
          </p>
        </div>

        {!hasCheckedIn ? (
          <div className="max-w-xs w-full space-y-4">
            <p className="text-sm text-slate-400 mb-8 leading-relaxed">
              This interactive map utilizes your device's internal gyroscope and haptic motor for precise dead-reckoning.
            </p>
            <button
onClick={async () => {
  // Request iOS 13+ DeviceOrientation permission if required
  // We use bracket notation to check for the permission function safely in JS
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      await DeviceOrientationEvent.requestPermission();
    } catch (e) {
      console.warn("Permission logic not available", e);
    }
  }
  setHasCheckedIn(true);
}}
              className="w-full bg-gradient-to-r from-[#4ade80] to-[#22c55e] text-[#064e3b] font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-xl shadow-[#4ade80]/20"
            >
              <CheckCircle2 className="w-5 h-5" />
              Check In to Property
            </button>
          </div>
        ) : (
          <div>
            <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[#4ade80] border-t-transparent mx-auto" />
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#4ade80]/60">
              Synchronizing Blueprints...
            </p>
          </div>
        )}
      </div>
    );
  }

  /* ═════════════════════════════════════════════════════
     RENDER — Full mobile-first layout
     ═════════════════════════════════════════════════════ */
  return (
    <div className="fixed inset-0 bg-[#0c0d12] overflow-hidden flex flex-col touch-manipulation">

      {/* ── Top bar ── */}
      <div className="relative z-30 flex items-center justify-between px-5 py-4 bg-[hsl(224,40%,7%)] shrink-0">
        <button className="text-slate-300 hover:text-white transition-colors" aria-label="Search">
          <Search className="w-5 h-5" />
        </button>
        <span className="text-sm font-bold uppercase tracking-[0.15em] text-white">BLUEPRINT_NAV</span>
        <button className="text-slate-300 hover:text-white transition-colors" aria-label="Settings">
          <SlidersHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* ── MAP AREA ── */}
      <div className="flex-1 relative overflow-hidden min-h-0 bg-[#0c0d12]">
        {/* Grid Background */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{ 
            backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.15) 1px, transparent 1px)', 
            backgroundSize: '40px 40px' 
          }} 
        />
        
        {/* Top Floating Overlays */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-start justify-between pointer-events-none">
          <div>
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-0.5">CURRENT ZONE</p>
            <p className="text-sm font-bold text-white tracking-wide">Sector 4, Level 2</p>
          </div>
          <div className="text-right">
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-0.5">SIGNAL</p>
            <div className="flex items-center justify-end gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-white">Strong</span>
            </div>
          </div>
        </div>

        <svg
          viewBox={viewBox}
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feFlood floodColor="#22d3ee" floodOpacity="0.35" />
              <feComposite in2="blur" operator="in" />
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="emergGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feFlood floodColor="#ef4444" floodOpacity="0.35" />
              <feComposite in2="blur" operator="in" />
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="posGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feFlood floodColor="#22d3ee" floodOpacity="0.5" />
              <feComposite in2="blur" operator="in" />
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <marker id="navArrow" markerWidth="10" markerHeight="8" refX="10" refY="4" orient="auto" fill="#22d3ee">
              <polygon points="0 0, 10 4, 0 8" />
            </marker>
            <marker id="emergArrow" markerWidth="10" markerHeight="8" refX="10" refY="4" orient="auto" fill="#f87171">
              <polygon points="0 0, 10 4, 0 8" />
            </marker>
          </defs>

          {/* CAD Floor Plan background */}
          {floorplanSvg && (
            <g dangerouslySetInnerHTML={{ __html: floorplanSvg.replace(/<\/?svg[^>]*>/gi, '') }} />
          )}

          {/* Graph edges (always visible as dim layout lines) */}
          {mapData && mapData.edges.map((e, idx) => {
            const from = mapData.nodes[e.from];
            const to = mapData.nodes[e.to];
            if (!from || !to) return null;
            const isHazard = hazards.includes(e.from) || hazards.includes(e.to);
            return (
              <line key={`edge-${idx}`}
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={isHazard ? '#ef4444' : '#1e3a5f'}
                strokeWidth={isHazard ? '5' : '2'}
                strokeLinecap="round"
                opacity={isHazard ? '0.5' : '0.15'}
                strokeDasharray={isHazard ? '6,4' : 'none'}
              />
            );
          })}

          {/* Hazard overlays */}
          {mapData && hazards.map((nodeId) => {
            const node = mapData.nodes[nodeId];
            if (!node) return null;
            return (
              <g key={`hz-${nodeId}`}>
                <circle cx={node.x} cy={node.y} r="28" fill="rgba(239,68,68,0.06)" stroke="rgba(239,68,68,0.25)" strokeWidth="1.5" className="animate-pulse" />
                <circle cx={node.x} cy={node.y} r="14" fill="rgba(239,68,68,0.2)" stroke="rgba(239,68,68,0.4)" strokeWidth="1" />
              </g>
            );
          })}

          {/* ══ ROUTE LINES ══ */}

          {/* Trail (dim full route) */}
          {isNavigating && mapData && (
            <polyline
              points={buildPathPoints(route, mapData)}
              fill="none"
              stroke={navMode === 'emergency' ? '#7f1d1d' : '#164e63'}
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.35"
            />
          )}

          {/* Animated progress path — thick line drawn on the map */}
          {isNavigating && mapData && (
            <path
              ref={pathRef}
              d={buildPathD(route, mapData)}
              fill="none"
              stroke={navMode === 'emergency' ? '#f87171' : '#22d3ee'}
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={navMode === 'emergency' ? 'url(#emergGlow)' : 'url(#routeGlow)'}
              strokeDasharray={pathTotalLength || 1000}
              strokeDashoffset={getProgressDashOffset()}
              style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
            />
          )}

          {/* Route waypoint dots */}
          {isNavigating && mapData && route.path.map((nodeId, idx) => {
            const node = mapData.nodes[nodeId];
            if (!node) return null;
            const isVisited = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex;
            const isExit = node.type === 'exit';
            if (isCurrent) return null;
            return (
              <g key={`wp-${nodeId}`}>
                <circle cx={node.x} cy={node.y}
                  r={isExit ? '9' : '6'}
                  fill={isVisited ? (navMode === 'emergency' ? '#f87171' : '#22d3ee') : isExit ? '#10b981' : '#475569'}
                  opacity={isVisited ? 0.7 : 0.9}
                  stroke={isExit ? '#10b981' : 'none'}
                  strokeWidth={isExit ? '2' : '0'}
                />
                {isExit && (
                  <text x={node.x} y={node.y - 16} fill="#10b981" fontSize="10" textAnchor="middle" fontFamily="monospace" fontWeight="700">{node.label}</text>
                )}
              </g>
            );
          })}

          {/* Direction arrow line from current to next */}
          {isNavigating && !isComplete && currentStep && currentNode && (() => {
            const t = currentStep.to;
            return (
              <line x1={currentNode.x} y1={currentNode.y}
                x2={(currentNode.x + t.x) / 2} y2={(currentNode.y + t.y) / 2}
                stroke={navMode === 'emergency' ? '#f87171' : '#22d3ee'}
                strokeWidth="3"
                markerEnd={navMode === 'emergency' ? 'url(#emergArrow)' : 'url(#navArrow)'}
                opacity="0.8"
                style={{ transition: 'all 0.5s ease-out' }}
              />
            );
          })()}

          {/* Target node ring */}
          {isNavigating && !isComplete && currentStep && (
            <g>
              <circle cx={currentStep.to.x} cy={currentStep.to.y} r="16"
                fill="none" stroke={navMode === 'emergency' ? '#f87171' : '#22d3ee'}
                strokeWidth="2" strokeDasharray="5,3" className="animate-pulse" opacity="0.6" />
            </g>
          )}

          {/* ══ CURRENT POSITION MARKER ══ */}
          {currentNode && (
            <g>
              <circle cx={currentNode.x} cy={currentNode.y} r="24"
                fill="rgba(34,211,238,0.05)" stroke="rgba(34,211,238,0.15)" strokeWidth="1"
                className="animate-ping" style={{ animationDuration: '2.5s' }} />
              <circle cx={currentNode.x} cy={currentNode.y} r="14"
                fill="rgba(34,211,238,0.08)" filter="url(#posGlow)" />
              {isNavigating && !isComplete ? (
                <g transform={`translate(${currentNode.x}, ${currentNode.y}) rotate(${arrowAngle})`}
                  style={{ transition: 'transform 0.5s ease-out' }}>
                  <polygon points="14,0 -7,-8 -3,0 -7,8" fill="#22d3ee" stroke="#0e7490" strokeWidth="1" />
                </g>
              ) : (
                <circle cx={currentNode.x} cy={currentNode.y} r="9" fill="#22d3ee" />
              )}
              <circle cx={currentNode.x} cy={currentNode.y} r="3.5" fill="#fff" />
            </g>
          )}

          {/* Non-route node labels (when not navigating) */}
          {!isNavigating && mapData && Object.values(mapData.nodes).map((node) => {
            const isExit = node.type === 'exit';
            return (
              <g key={`lbl-${node.id}`}>
                <circle cx={node.x} cy={node.y}
                  r={isExit ? '8' : '5'}
                  fill={isExit ? '#10b981' : '#334155'}
                  opacity="0.7" />
                <text x={node.x} y={node.y + 18}
                  fill={isExit ? '#10b981' : '#64748b'}
                  fontSize="9" textAnchor="middle" fontFamily="monospace" fontWeight="600">
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* "You are here" floating label */}
        {!isNavigating && currentNode && (
          <div className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none"
            style={{ bottom: 'max(7rem, 30%)' }}>
            <div className="bg-slate-900/90 backdrop-blur border border-cyan-500/30 rounded-xl px-4 py-2.5 text-center shadow-lg shadow-cyan-500/10">
              <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-cyan-400 mb-0.5">You Are Here</p>
              <p className="text-xs font-bold text-white">
                {mapData?.nodes && Object.values(mapData.nodes).find(n =>
                  Math.abs(n.x - currentNode.x) < 20 && Math.abs(n.y - currentNode.y) < 20
                )?.label || `Floor ${startLocation?.floor || 1}`}
              </p>
            </div>
          </div>
        )}

        {/* Compact legend */}
        <div className="absolute bottom-2 left-2 z-20 bg-slate-900/70 backdrop-blur border border-slate-700/40 rounded-lg px-2 py-1.5 pointer-events-none">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-[8px] text-slate-500">You</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[8px] text-slate-500">Exit</span>
            </div>
            {hazards.length > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-[8px] text-slate-500">Hazard</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
         NAVIGATION STEP PANEL
         ══════════════════════════════════════════ */}
      {isNavigating && !isComplete && currentStep && (
        <div className="absolute bottom-[80px] left-4 right-4 z-30">
          <div className="bg-[#1c1d21] rounded-2xl p-5 shadow-2xl border border-slate-700/50">
            {/* Top row info */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5 text-slate-400">
                <ArrowRight className="w-3.5 h-3.5 -rotate-45" />
                <span className="text-[10px] font-bold uppercase tracking-[0.1em]">
                  {Math.max(0, Math.round(pathTotalLength - getProgressDashOffset())) || '50'}M AHEAD
                </span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                ETA {Math.max(1, Math.round((pathTotalLength - getProgressDashOffset()) / 80))} MIN
              </span>
            </div>

            {/* Instruction block */}
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-[#232429] flex items-center justify-center shrink-0">
                <CornerUpLeft className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white leading-tight">
                  {currentStep.instruction || `Turn Left at ${currentStep.to.label}`}
                </h2>
                <p className="text-sm text-slate-400 mt-1 cursor-pointer hover:text-white transition-colors" onClick={() => setCurrentStepIndex(Math.max(0, currentStepIndex - 1))}>
                  Proceed towards the main atrium. (Tap to go back)
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button 
                onClick={() => setCurrentStepIndex(currentStepIndex + 1)}
                className="flex-1 bg-[#4ade80] hover:bg-[#22c55e] text-[#064e3b] font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
              >
                <CheckCircle2 className="w-5 h-5" />
                Acknowledge
              </button>
              <button 
                onClick={cancelNavigation}
                className="w-14 shrink-0 bg-[#232429] hover:bg-slate-800 border border-slate-700/50 text-white rounded-xl flex items-center justify-center transition-colors active:scale-[0.98]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Arrived ── */}
      {isNavigating && isComplete && (
        <div className="absolute bottom-[80px] left-4 right-4 z-30">
          <div className="bg-[#1c1d21] border border-emerald-500/30 rounded-2xl px-4 py-6 text-center shadow-2xl">
            <CheckCircle2 className="w-12 h-12 text-[#4ade80] mx-auto mb-3" />
            <h2 className="text-xl font-bold text-white">
              {navMode === 'emergency' ? "You've Reached Safety" : 'Destination Reached'}
            </h2>
            <p className="text-sm text-slate-400 mt-2 mb-5">
              Arrived at <span className="text-emerald-400 font-semibold">{route.destination.label}</span>
            </p>
            <button onClick={cancelNavigation}
              className="bg-[#4ade80] hover:bg-[#22c55e] text-[#064e3b] px-8 py-3.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-colors active:scale-[0.98] w-full max-w-[200px] mx-auto">
              Done
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
         BOTTOM NAVIGATION BAR
         ══════════════════════════════════════════ */}
      <div className="relative z-40 bg-[#16171b] border-t border-[#232429] safe-area-bottom w-full">
        <div className="flex items-center justify-around px-2 py-2">
          {/* Explore */}
          <button 
            onClick={() => { setShowDirectionsModal(true); setShowEmergencyModal(false); }}
            className="flex flex-col items-center gap-1.5 p-2 min-w-[72px]"
          >
            <div className="w-10 h-8 rounded-full flex items-center justify-center">
              <Compass className="w-5 h-5 text-slate-400" />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Explore</span>
          </button>

          {/* Directory */}
          <button 
            onClick={() => { setShowDirectionsModal(true); setShowEmergencyModal(false); }}
            className="flex flex-col items-center gap-1.5 p-2 min-w-[72px]"
          >
            <div className="w-10 h-8 rounded-full flex items-center justify-center">
              <Layers className="w-5 h-5 text-slate-400" />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Directory</span>
          </button>

          {/* Paths (Active) */}
          <button 
            className="flex flex-col items-center gap-1.5 p-2 min-w-[72px]"
          >
            <div className="w-14 h-8 rounded-full bg-[#1b332b] flex items-center justify-center transition-transform active:scale-95">
              <TrendingUp className="w-5 h-5 text-[#4ade80]" />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-[#4ade80]">Paths</span>
          </button>

          {/* Emergency (Replacing Settings) */}
          <button 
            onClick={() => { setShowEmergencyModal(true); setShowDirectionsModal(false); }}
            className="flex flex-col items-center gap-1.5 p-2 min-w-[72px]"
          >
            <div className="w-10 h-8 rounded-full flex items-center justify-center transition-transform active:scale-95">
              <AlertTriangle className="w-5 h-5 text-slate-400" />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Emergency</span>
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════
         EMERGENCY MODAL (bottom sheet style)
         ══════════════════════════════════════════ */}
      {showEmergencyModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowEmergencyModal(false)} />
          <div className="relative w-full max-w-md bg-[hsl(222,28%,12%)] border-t border-red-500/30 rounded-t-3xl shadow-2xl safe-area-bottom"
            style={{ maxHeight: '85vh' }}>
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-600" />
            </div>
            {/* Header */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-red-400">Emergency Alert</p>
                <h3 className="text-lg font-bold text-white mt-0.5">What's happening?</h3>
              </div>
              <button onClick={() => setShowEmergencyModal(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 active:bg-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 pb-5 space-y-2.5 overflow-y-auto" style={{ maxHeight: '60vh' }}>
              {(triageLoading || navLoading) ? (
                <div className="py-10 text-center">
                  <Loader2 className="w-8 h-8 text-red-400 animate-spin mx-auto" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-3">
                    Dispatching & Routing...
                  </p>
                </div>
              ) : (
                <>
                  <button onClick={() => handleEmergencyTrigger('FIRE')}
                    className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all active:scale-[0.98]"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(239,68,68,0.15)' }}>
                      <Flame className="w-5 h-5 text-red-400" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-white">Fire</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Smoke, flames, or fire alarm</p>
                    </div>
                  </button>

                  <button onClick={() => handleEmergencyTrigger('SECURITY')}
                    className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all active:scale-[0.98]"
                    style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(245,158,11,0.15)' }}>
                      <Siren className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-white">Security</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Suspicious activity or threat</p>
                    </div>
                  </button>

                  <button onClick={() => handleEmergencyTrigger('MEDICAL')}
                    className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all active:scale-[0.98]"
                    style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(59,130,246,0.15)' }}>
                      <HeartPulse className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-white">Medical</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Injury, illness, or medical need</p>
                    </div>
                  </button>

                  <div className="h-px bg-slate-700/40 my-1" />

                  <button onClick={() => startNavigation('EXIT', 'emergency')}
                    className="w-full flex items-center gap-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 rounded-2xl px-4 py-3.5 transition-all active:scale-[0.98]">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <LogOut className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-white">Find Nearest Exit</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Quick route without reporting</p>
                    </div>
                  </button>
                </>
              )}

              {triageError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center">
                  <p className="text-xs text-red-300">{triageError}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
         DIRECTIONS MODAL (bottom sheet style)
         ══════════════════════════════════════════ */}
      {showDirectionsModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDirectionsModal(false)} />
          <div className="relative w-full max-w-md bg-[hsl(222,28%,12%)] border-t border-cyan-500/25 rounded-t-3xl shadow-2xl safe-area-bottom"
            style={{ maxHeight: '85vh' }}>
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-600" />
            </div>
            {/* Header */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-400">Wayfinding</p>
                <h3 className="text-lg font-bold text-white mt-0.5">Where to?</h3>
              </div>
              <button onClick={() => setShowDirectionsModal(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 active:bg-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 pb-5 space-y-2 overflow-y-auto" style={{ maxHeight: '60vh' }}>
              {navLoading ? (
                <div className="py-10 text-center">
                  <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-3">Calculating Route...</p>
                </div>
              ) : (
                destinations.map((node) => {
                  const iconMap = { exit: LogOut, room: MapPin, checkpoint: Locate };
                  const colorMap = {
                    exit: { accent: 'emerald', iconClr: '#34d399', bgClr: 'rgba(16,185,129,0.1)', borderClr: 'rgba(16,185,129,0.2)' },
                    room: { accent: 'blue', iconClr: '#60a5fa', bgClr: 'rgba(59,130,246,0.1)', borderClr: 'rgba(59,130,246,0.2)' },
                    checkpoint: { accent: 'amber', iconClr: '#fbbf24', bgClr: 'rgba(245,158,11,0.1)', borderClr: 'rgba(245,158,11,0.2)' },
                  };
                  const Icon = iconMap[node.type] || MapPin;
                  const c = colorMap[node.type] || colorMap.checkpoint;
                  return (
                    <button key={node.id}
                      onClick={() => startNavigation(node.id, 'directions')}
                      className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 transition-all active:scale-[0.98] hover:opacity-90"
                      style={{ background: c.bgClr, border: `1px solid ${c.borderClr}` }}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: c.bgClr }}>
                        <Icon className="w-4.5 h-4.5" style={{ color: c.iconClr }} />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{node.label}</p>
                        <p className="text-[10px] text-slate-500 capitalize">{node.type} · Floor {node.floor}</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
