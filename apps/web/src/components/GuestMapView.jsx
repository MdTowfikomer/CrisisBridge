import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ref, set, push, onValue } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Navigation,
  X,
  Compass,
  LogOut,
  Loader2,
  ArrowRight,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';

/* ── Pure Tactical Sub-Components ── */

const MapPath = ({ route, mapData, totalLength, progressOffset, navMode }) => {
  if (!route || !mapData || route.path.length < 2) return null;
  
  const points = route.path.map((id) => mapData.nodes[id]).filter(Boolean);
  if (points.length < 2) return null;
  
  const d = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');

  return (
    <>
      <path d={d} fill="none" stroke="#1e293b" strokeWidth="12" strokeLinecap="round" className="opacity-20" />
      <motion.path
        d={d}
        fill="none"
        stroke={navMode === 'emergency' ? '#ef4444' : '#3b82f6'}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={totalLength}
        animate={{ strokeDashoffset: progressOffset }}
        transition={{ type: 'spring', damping: 20, stiffness: 50 }}
        style={{ filter: 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.5))' }}
      />
    </>
  );
};

const UserIndicator = ({ pos, navMode }) => (
  <g>
    <motion.circle 
      cx={pos.x} cy={pos.y} r="16" 
      fill={navMode === 'emergency' ? '#ef4444' : '#3b82f6'} 
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 0.2, scale: 1.5 }}
      transition={{ repeat: Infinity, duration: 1.5 }}
    />
    <circle 
      cx={pos.x} cy={pos.y} r="8" 
      fill={navMode === 'emergency' ? '#ef4444' : '#3b82f6'} 
      className="shadow-xl"
    />
  </g>
);

export function GuestMapView({ startLocation, propertyId, apiBaseUrl }) {
  const [mapData, setMapData] = useState(null);
  const [floorplanSvg, setFloorplanSvg] = useState('');
  const [loading, setLoading] = useState(true);
  const [hazards, setHazards] = useState([]);
  const [showDirectionsModal, setShowDirectionsModal] = useState(false);
  const [route, setRoute] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [navMode, setNavMode] = useState(null);
  const [navLoading, setNavLoading] = useState(false);

  const pathRef = useRef(null);
  const [pathTotalLength, setPathTotalLength] = useState(0);
  const [userId] = useState(() => `user_${Math.random().toString(36).substr(2, 9)}`);

  // Load Map
  useEffect(() => {
    if (!propertyId) return;
    const unsubscribe = onValue(ref(rtdb, `maps/${propertyId}`), (snap) => {
      const data = snap.val();
      if (data) {
        setMapData(data);
        setFloorplanSvg(data.svgContent || '');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [propertyId]);

  // Load Hazards
  useEffect(() => {
    if (!propertyId) return;
    const unsub = onValue(ref(rtdb, `hazards/${propertyId}`), (snap) => {
      const d = snap.val();
      setHazards(d ? Object.keys(d).filter((k) => d[k] === true) : []);
    });
    return () => unsub();
  }, [propertyId]);

  const startNavigation = useCallback(async (destination, mode) => {
    setNavLoading(true);
    setShowDirectionsModal(false);
    try {
      const res = await fetch(`${apiBaseUrl}/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property: propertyId, from: startLocation, to: destination, hazards, mapData }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setRoute(data.route);
      setCurrentStepIndex(0);
      setNavMode(mode);
      
      // Calculate path length for animation
      const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const points = data.route.path.map((id) => mapData.nodes[id]).filter(Boolean);
      const d = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
      tempPath.setAttribute('d', d);
      setPathTotalLength(tempPath.getTotalLength());
    } catch (err) {
      alert(`Navigation failed: ${err.message}`);
    } finally {
      setNavLoading(false);
    }
  }, [apiBaseUrl, propertyId, startLocation, hazards, mapData]);

  // Sync Live Location with Throttling Placeholder
  useEffect(() => {
    if (!route || !route.steps) return;
    const isComplete = currentStepIndex >= route.steps.length;
    const node = isComplete ? route.destination : route.steps[currentStepIndex].from;
    set(ref(rtdb, `liveLocations/${userId}`), {
      property: propertyId || 'UNKNOWN',
      x: node.x, y: node.y, floor: node.floor || 1,
      status: isComplete ? 'evacuated' : 'evacuating',
      lastUpdated: Date.now(),
    });
  }, [route, currentStepIndex, userId, propertyId]);

  const progressOffset = useMemo(() => {
    if (!route || pathTotalLength === 0) return 0;
    const ratio = currentStepIndex / route.steps.length;
    return pathTotalLength * (1 - ratio);
  }, [currentStepIndex, route, pathTotalLength]);

  const currentNode = route ? (currentStepIndex >= route.steps.length ? route.destination : route.steps[currentStepIndex].from) : startLocation;
  const currentStep = route?.steps[currentStepIndex];

  if (loading) return (
    <div className="fixed inset-0 bg-[#0c0d12] flex flex-col items-center justify-center p-12 text-center">
      <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-6" />
      <h2 className="text-xl font-black uppercase tracking-widest text-white">Initializing Tactical Grid</h2>
      <p className="text-slate-500 text-sm mt-2 font-bold uppercase tracking-tight">Syncing Property Blueprints...</p>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black overflow-hidden flex flex-col font-sans">
      
      {/* ── Compact Tactical Header ── */}
      <div className="absolute top-0 left-0 right-0 z-50 p-4 pointer-events-none">
         <div className="max-w-lg mx-auto flex items-center justify-between pointer-events-auto">
            <button onClick={() => window.location.reload()} className="bg-slate-900/80 backdrop-blur-xl border border-white/10 p-3 rounded-2xl text-white shadow-2xl active:scale-90 transition-all">
              <X className="w-6 h-6" />
            </button>
            <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 px-6 py-3 rounded-2xl shadow-2xl">
               <span className="text-xs font-black uppercase tracking-[0.3em] text-blue-400">Tactical View</span>
            </div>
            <div className="w-12" />
         </div>
      </div>

      {/* ── Map Canvas ── */}
      <div className="flex-1 relative overflow-hidden bg-[#0c0d12]">
        <motion.div 
          className="w-full h-full"
          animate={{ x: 500 - (currentNode?.x || 500), y: 400 - (currentNode?.y || 400) }}
          transition={{ type: 'spring', damping: 25, stiffness: 40 }}
        >
          <svg viewBox={mapData?.viewBox || '0 0 1000 800'} className="w-full h-full p-8">
            <defs>
               <filter id="tactical-glow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            </defs>

            {floorplanSvg && <g dangerouslySetInnerHTML={{ __html: floorplanSvg.replace(/<\/?svg[^>]*>/gi, '') }} className="opacity-40" />}

            <MapPath 
              route={route} mapData={mapData} totalLength={pathTotalLength} 
              progressOffset={progressOffset} navMode={navMode} 
            />

            {currentNode && <UserIndicator pos={currentNode} navMode={navMode} />}
            
            {route && (
              <circle 
                cx={route.destination.x} cy={route.destination.y} r="12" 
                fill="#10b981" className="shadow-2xl" style={{ filter: 'url(#tactical-glow)' }}
              />
            )}
          </svg>
        </motion.div>
      </div>

      {/* ── Active Instruction Layer ── */}
      <AnimatePresence>
        {route && currentStep && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 left-4 right-4 z-50 max-w-lg mx-auto"
          >
            <div className="bg-slate-900/95 backdrop-blur-2xl border-2 border-white/10 p-6 rounded-[2.5rem] shadow-2xl">
               <div className="flex items-start gap-5 mb-8">
                  <div className={cn("p-4 rounded-[1.5rem] shadow-inner shrink-0", navMode === 'emergency' ? 'bg-red-500/20' : 'bg-blue-500/20')}>
                    <Navigation className={cn("w-8 h-8", navMode === 'emergency' ? 'text-red-500' : 'text-blue-500')} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-1">Target Instruction</p>
                    <h2 className="text-2xl font-black text-white leading-none tracking-tight uppercase">{currentStep.instruction}</h2>
                  </div>
               </div>
               <button 
                 onClick={() => {
                   setCurrentStepIndex(prev => prev + 1);
                   if (navigator.vibrate) navigator.vibrate(40);
                 }}
                 className={cn(
                   "w-full py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-sm flex items-center justify-center gap-3 shadow-2xl transition-all active:scale-95",
                   navMode === 'emergency' ? 'bg-red-600 text-white shadow-red-600/20' : 'bg-blue-600 text-white shadow-blue-600/20'
                 )}
               >
                 Acknowledge & Proceed
                 <ChevronRight className="w-5 h-5" />
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Resting State Controls ── */}
      {!route && (
        <div className="fixed bottom-8 left-6 right-6 z-40 flex flex-col gap-4 max-w-lg mx-auto">
           <button 
             onClick={() => setShowDirectionsModal(true)}
             className="w-full bg-slate-900/80 backdrop-blur-xl border-2 border-slate-800 py-5 rounded-[2rem] text-white font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 shadow-2xl active:scale-95 transition-all"
           >
              <Compass className="w-5 h-5 text-blue-500" />
              Find Destination
           </button>
           <button 
             onClick={() => startNavigation('EXIT', 'emergency')}
             className="w-full bg-red-600/10 backdrop-blur-xl border-2 border-red-600/20 py-5 rounded-[2rem] text-red-500 font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 shadow-2xl active:scale-95 transition-all"
           >
              <AlertTriangle className="w-5 h-5" />
              Emergency Evacuation
           </button>
        </div>
      )}

      {/* ── Search Modal ── */}
      <AnimatePresence>
        {showDirectionsModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
             <motion.div 
               initial={{ y: 50 }} animate={{ y: 0 }}
               className="w-full max-w-md bg-slate-900 rounded-[2.5rem] p-8 border border-white/10 shadow-2xl"
             >
                <div className="flex items-center justify-between mb-8">
                   <h3 className="text-xl font-black uppercase tracking-tighter">Tactical Search</h3>
                   <button onClick={() => setShowDirectionsModal(false)} className="p-2 text-slate-500"><X className="w-6 h-6"/></button>
                </div>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                   {Object.values(mapData?.nodes || {}).filter(n => n.type !== 'path').map(node => (
                     <button 
                       key={node.id} 
                       onClick={() => startNavigation(node.id, 'standard')}
                       className="w-full text-left p-5 bg-white/5 hover:bg-blue-600/20 rounded-2xl flex items-center justify-between group transition-all"
                     >
                        <span className="font-bold text-slate-200 group-hover:text-white">{node.label}</span>
                        <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                     </button>
                   ))}
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
