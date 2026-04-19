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

/* ———————————————————————————————————————— 
   Utility functions
   ———————————————————————————————————————— */     
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

  const pathRef = useRef(null);
  const [pathTotalLength, setPathTotalLength] = useState(0);
  const [userId] = useState(() => `user_${Math.random().toString(36).substr(2, 9)}`);    

  /* ——— Load map from RTDB (Blueprints) ——— */
  useEffect(() => {
    if (!propertyId) return;
    const mapRef = ref(rtdb, `maps/${propertyId}`);
    const unsubscribe = onValue(mapRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setMapData(data);
        setFloorplanSvg(data.svgContent || '');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [propertyId]);

  /* ——— Subscribe to hazards ——— */
  useEffect(() => {
    if (!propertyId) return;
    const hazardsRef = ref(rtdb, `hazards/${propertyId}`);
    const unsub = onValue(hazardsRef, (snap) => {
      const d = snap.val();
      setHazards(d ? Object.keys(d).filter((k) => d[k] === true) : []);
    });
    return () => unsub();
  }, [propertyId]);

  /* ——— Start navigation (Server-side for Dijkstra) ——— */
  const startNavigation = useCallback(async (destination, mode) => {
    setNavLoading(true);
    setShowEmergencyModal(false);
    setShowDirectionsModal(false);
    try {
      // Use existing navigate endpoint which now uses the shared package logic
      const res = await fetch(`${apiBaseUrl}/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          property: propertyId, 
          from: startLocation, 
          to: destination, 
          hazards,
          mapData // Pass the pre-loaded blueprint data
        }),
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

  /* ——— Sync live location ——— */
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

  useEffect(() => {
    if (pathRef.current) setPathTotalLength(pathRef.current.getTotalLength());
  }, [route, mapData]);

  const cancelNavigation = () => {
    setRoute(null); setCurrentStepIndex(0); setNavMode(null);
  };

  const viewBox = mapData?.viewBox || '0 0 1000 800';
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

  const destinations = mapData?.nodes
    ? Object.values(mapData.nodes).filter((n) => n.type !== 'path')
    : [];

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#0c0d12] flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
        <p className="text-blue-500 font-bold uppercase tracking-widest text-xs">Loading Tactical Map...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#0c0d12] overflow-hidden flex flex-col touch-manipulation">
      <div className="relative z-30 flex items-center justify-between px-5 py-4 bg-[hsl(224,40%,7%)] shrink-0">
        <button onClick={() => window.location.reload()} className="text-slate-300 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
        <span className="text-sm font-bold uppercase tracking-[0.15em] text-white">Tactical View</span>
        <div className="w-5" />
      </div>

      <div className="flex-1 relative overflow-hidden bg-[#0c0d12]">
        <div className="absolute inset-0 pointer-events-none opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle, #3b82f6 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

        <svg viewBox={viewBox} className="absolute inset-0 w-full h-full p-4">
          <defs>
            <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>

          {floorplanSvg && <g dangerouslySetInnerHTML={{ __html: floorplanSvg.replace(/<\/?svg[^>]*>/gi, '') }} />}

          {mapData?.edges?.map((e, i) => {
            const from = mapData.nodes[e.from];
            const to = mapData.nodes[e.to];
            if (!from || !to) return null;
            return <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#1e293b" strokeWidth="2" opacity="0.3" />;
          })}

          {isNavigating && (
            <path
              ref={pathRef}
              d={buildPathD(route, mapData)}
              fill="none"
              stroke={navMode === 'emergency' ? '#ef4444' : '#3b82f6'}
              strokeWidth="6"
              strokeLinecap="round"
              filter="url(#glow)"
              strokeDasharray={pathTotalLength}
              strokeDashoffset={getProgressDashOffset()}
              style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
            />
          )}

          {currentNode && (
            <g>
              <circle cx={currentNode.x} cy={currentNode.y} r="12" fill={navMode === 'emergency' ? '#ef4444' : '#3b82f6'} opacity="0.2" className="animate-ping" />
              <circle cx={currentNode.x} cy={currentNode.y} r="6" fill={navMode === 'emergency' ? '#ef4444' : '#3b82f6'} filter="url(#glow)" />
            </g>
          )}
        </svg>

        {isNavigating && currentStep && (
          <div className="absolute bottom-4 left-4 right-4 z-40 bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-2xl">
            <div className="flex items-start gap-4">
              <div className={cn("p-3 rounded-2xl shrink-0", navMode === 'emergency' ? "bg-red-500/20" : "bg-blue-500/20")}>
                <Navigation className={cn("w-6 h-6", navMode === 'emergency' ? "text-red-500" : "text-blue-500")} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Instruction</p>
                <h2 className="text-xl font-bold text-white leading-tight">{currentStep.instruction}</h2>
              </div>
            </div>
            <button onClick={() => setCurrentStepIndex(prev => prev + 1)} 
              className={cn("w-full mt-6 py-4 rounded-2xl font-bold uppercase tracking-widest text-sm transition-all active:scale-95", 
                navMode === 'emergency' ? "bg-red-600 text-white" : "bg-blue-600 text-white")}>
              Next Step
            </button>
          </div>
        )}

        {!isNavigating && (
           <div className="absolute bottom-4 left-4 right-4 z-40 flex flex-col gap-3">
              <button onClick={() => setShowDirectionsModal(true)} className="w-full bg-slate-900 border border-slate-800 py-4 rounded-2xl text-white font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-3">
                 <Compass className="w-5 h-5 text-blue-500" />
                 Find Destination
              </button>
              <button onClick={() => startNavigation('EXIT', 'emergency')} className="w-full bg-red-600/10 border border-red-600/20 py-4 rounded-2xl text-red-500 font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-3">
                 <LogOut className="w-5 h-5" />
                 Emergency Exit
              </button>
           </div>
        )}
      </div>

      {showDirectionsModal && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDirectionsModal(false)} />
          <div className="relative w-full bg-slate-900 rounded-t-3xl p-6 border-t border-slate-800">
            <h3 className="text-lg font-bold mb-4">Where to?</h3>
            <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto">
              {destinations.map(d => (
                <button key={d.id} onClick={() => startNavigation(d.id, 'directions')} className="w-full text-left p-4 bg-slate-800 hover:bg-slate-700 rounded-2xl transition-colors flex items-center justify-between">
                   <span className="font-bold">{d.label}</span>
                   <ArrowRight className="w-4 h-4 text-slate-500" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
