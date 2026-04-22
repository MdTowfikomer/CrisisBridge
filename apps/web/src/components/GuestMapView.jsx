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
  AlertTriangle,
  Flame,
  ShieldAlert
} from 'lucide-react';
import { Pathfinder } from '../lib/pathfinder';

/* ── Pure Tactical Sub-Components ── */

const MapPath = ({ path, mapData, totalLength, progressOffset, missionColor }) => {
  if (!path || !mapData || path.length < 2) return null;

  const points = path.map((id) => mapData.nodes[id]).filter(Boolean);
  if (points.length < 2) return null;

  const d = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');

  return (
    <>
      <path d={d} fill="none" stroke="#1e293b" strokeWidth="12" strokeLinecap="round" className="opacity-20" />
      <motion.path
        d={d}
        fill="none"
        stroke={missionColor}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={totalLength}
        animate={{ strokeDashoffset: progressOffset }}
        transition={{ type: 'spring', damping: 20, stiffness: 50 }}
        style={{ filter: `drop-shadow(0 0 8px ${missionColor}80)` }}
      />
    </>
  );
};

const UserIndicator = ({ pos, color }) => (
  <g>
    <motion.circle
      cx={pos.x} cy={pos.y} r="36"
      fill={color}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 0.2, scale: 1.5 }}
      transition={{ repeat: Infinity, duration: 1.5 }}
    />
    <circle
      cx={pos.x} cy={pos.y} r="20"
      fill={color}
      className="shadow-xl"
    />
  </g>
);

export function GuestMapView({ startLocation, roomId, propertyId, apiBaseUrl, onNodeUpdate }) {
  const [mapData, setMapData] = useState(null);
  const [floorplanSvg, setFloorplanSvg] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeMode, setActiveMode] = useState(null);
  const [missionProfile, setMissionProfile] = useState(null);

  const [showDirectionsModal, setShowDirectionsModal] = useState(false);
  const [currentPath, setCurrentPath] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [pathTotalLength, setPathTotalLength] = useState(0);

  // 0. Persistence Layer (Survival Mode)
  useEffect(() => {
    if (currentPath) {
      localStorage.setItem(`cb_path_${propertyId}`, JSON.stringify(currentPath));
      localStorage.setItem(`cb_step_${propertyId}`, currentStepIndex.toString());
    }
    else {
      localStorage.removeItem(`cb_path_${propertyId}`);
      localStorage.removeItem(`cb_step_${propertyId}`);
    }
  }, [currentPath, currentStepIndex, propertyId]);

  useEffect(() => {
    const savedPath = localStorage.getItem(`cb_path_${propertyId}`);
    const savedStep = localStorage.getItem(`cb_step_${propertyId}`);
    if (savedPath && !currentPath) {
      try {
        setCurrentPath(JSON.parse(savedPath));
        setCurrentStepIndex(parseInt(savedStep || '0', 10));
      } catch (e) {
        console.error("Failed to restore tactical state");
      }
    }
  }, [propertyId]);

  // Report current node back to App.jsx for unified telemetry
  useEffect(() => {
    const currentNodeId = currentPath ? currentPath[currentStepIndex] : roomId;
    if (onNodeUpdate && currentNodeId) {
      onNodeUpdate(currentNodeId);
    }
    // Cleanup: clear node when leaving tactical map
    return () => {
      if (onNodeUpdate) onNodeUpdate(null);
    };
  }, [currentPath, currentStepIndex, roomId, onNodeUpdate]);

  // 1. Load Map
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

  // 2. Listen for Mission Profile Activation (Real-time Sync)
  useEffect(() => {
    if (!propertyId) return;
    const modeRef = ref(rtdb, `properties/${propertyId}/activeMode`);
    return onValue(modeRef, (snap) => {
      const mode = snap.val();
      if (mode) {
        setActiveMode(mode);
        // Fetch the full profile details (Weights/Highlights)
        onValue(ref(rtdb, `properties/${propertyId}/missionProfiles/${mode.profileId}`), (pSnap) => {
          setMissionProfile(pSnap.val());
        }, { onlyOnce: true });
      } else {
        setActiveMode(null);
        setMissionProfile(null);
      }
    });
  }, [propertyId]);

  // 3. Automated Path Calculation when Mission Changes
  useEffect(() => {
    if (!mapData || !missionProfile || !startLocation) return;

    const finder = new Pathfinder(mapData.nodes, mapData.edges, missionProfile);
    // Automatically find path to nearest Exit for Emergency modes
    const targetType = missionProfile.id === 'lockdown' ? 'room' : 'exit';

    // Find nearest start node from coordinates, or just use roomId if provided!
    let startNodeId = roomId;
    if (!startNodeId && startLocation) {
      startNodeId = Object.values(mapData.nodes).sort((a, b) => {
        const d1 = Math.hypot(a.x - startLocation.x, a.y - startLocation.y);
        const d2 = Math.hypot(b.x - startLocation.x, b.y - startLocation.y);
        return d1 - d2;
      })[0]?.id;
    }

    if (startNodeId) {
      const path = finder.findPath(startNodeId, targetType);
      if (path) {
        setCurrentPath(path);
        setCurrentStepIndex(0);

        // Calculate path length for animation
        const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const points = path.map((id) => mapData.nodes[id]).filter(Boolean);
        const d = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
        tempPath.setAttribute('d', d);
        setPathTotalLength(tempPath.getTotalLength());
      }
    }
  }, [mapData, missionProfile, startLocation]);

  const startNavigation = (targetIdOrType) => {
    if (!mapData || !startLocation) return;

    // Fallback to standard weighting if no active mission
    const profile = missionProfile || { weights: { exit: 1, safety: 1, path: 1, transition: 1 } };
    const finder = new Pathfinder(mapData.nodes, mapData.edges, profile);

    // Find nearest start node from coordinates or roomId
    let startNodeId = roomId;
    if (!startNodeId && startLocation) {
      startNodeId = Object.values(mapData.nodes).sort((a, b) => {
        const d1 = Math.hypot(a.x - startLocation.x, a.y - startLocation.y);
        const d2 = Math.hypot(b.x - startLocation.x, b.y - startLocation.y);
        return d1 - d2;
      })[0]?.id;
    }

    if (startNodeId) {
      const path = finder.findPath(startNodeId, targetIdOrType);
      if (path) {
        setCurrentPath(path);
        setCurrentStepIndex(0);
        setShowDirectionsModal(false);

        // Calculate path length for animation
        const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const points = path.map((id) => mapData.nodes[id]).filter(Boolean);
        const d = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
        tempPath.setAttribute('d', d);
        setPathTotalLength(tempPath.getTotalLength());
      }
    }
  };

  const missionColor = activeMode?.profileId === 'fire' ? '#ef4444' : activeMode?.profileId === 'lockdown' ? '#f59e0b' : '#3b82f6';

  const progressOffset = useMemo(() => {
    if (!currentPath || pathTotalLength === 0) return 0;
    const ratio = currentStepIndex / currentPath.length;
    return pathTotalLength * (1 - ratio);
  }, [currentStepIndex, currentPath, pathTotalLength]);

  const currentNode = useMemo(() => {
    if (!mapData) return startLocation;
    if (currentPath && mapData.nodes[currentPath[currentStepIndex]]) {
      return mapData.nodes[currentPath[currentStepIndex]];
    }
    if (roomId && mapData.nodes[roomId]) {
      return mapData.nodes[roomId];
    }
    return startLocation;
  }, [mapData, currentPath, currentStepIndex, roomId, startLocation]);

  if (loading) return (
    <div className="fixed inset-0 bg-[#0c0d12] flex flex-col items-center justify-center p-12 text-center">
      <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-6" />
      <h2 className="text-xl font-black uppercase tracking-widest text-white">Initializing Tactical Grid</h2>
      <p className="text-slate-500 text-sm mt-2 font-bold uppercase tracking-tight">Syncing Property Blueprints...</p>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black overflow-hidden flex flex-col font-sans">

      {/* ── Mission Overlay HUD ── */}
      {missionProfile && (
        <div className="absolute top-20 left-4 right-4 z-50 animate-in slide-in-from-top-4 duration-500">
          <div className={`bg-black/80 backdrop-blur-xl border-2 p-4 rounded-2xl shadow-2xl flex items-center gap-4 ${activeMode?.profileId === 'fire' ? 'border-red-500/50' : 'border-amber-500/50'}`}>
            <div className={`p-3 rounded-xl ${activeMode?.profileId === 'fire' ? 'bg-red-500' : 'bg-amber-500'}`}>
              {activeMode?.profileId === 'fire' ? <Flame className="w-5 h-5 text-white animate-pulse" /> : <ShieldAlert className="w-5 h-5 text-white animate-pulse" />}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 leading-none mb-1">Active Mission</p>
              <h2 className="text-sm font-black text-white uppercase">{missionProfile.name}</h2>
            </div>
          </div>
        </div>
      )}

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
          className="w-full h-full flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <svg viewBox={mapData?.viewBox || '0 0 1000 800'} className="w-full h-full max-h-screen p-2 md:p-8">
            <defs>
              <filter id="tactical-glow"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>

            {floorplanSvg && <g dangerouslySetInnerHTML={{ __html: floorplanSvg.replace(/<\/?svg[^>]*>/gi, '') }} className="opacity-40" />}

            {/* Render Strategic Highlights (Exits, Extinguishers) based on Profile */}
            {missionProfile?.highlightTypes?.map(type =>
              Object.values(mapData.nodes).filter(n => n.type === type).map(n => (
                <g key={n.id} className="animate-pulse">
                  <circle cx={n.x} cy={n.y} r="30" className="fill-emerald-500/20" />
                  <circle cx={n.x} cy={n.y} r="15" className="fill-emerald-500" />
                </g>
              ))
            )}

            <MapPath
              path={currentPath} mapData={mapData} totalLength={pathTotalLength}
              progressOffset={progressOffset} missionColor={missionColor}
            />

            {currentNode && <UserIndicator pos={currentNode} color={missionColor} />}

            {currentPath && (
              <circle
                cx={mapData.nodes[currentPath[currentPath.length - 1]].x}
                cy={mapData.nodes[currentPath[currentPath.length - 1]].y}
                r="20"
                fill="#10b981" className="shadow-2xl" style={{ filter: 'url(#tactical-glow)' }}
              />
            )}
          </svg>
        </motion.div>
      </div>

      {/* ── Active Instruction Layer ── */}
      <AnimatePresence>
        {currentPath && missionProfile && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 left-4 right-4 z-50 max-w-lg mx-auto"
          >
            <div className="bg-slate-900/95 backdrop-blur-2xl border-2 border-white/10 p-6 rounded-[2.5rem] shadow-2xl">
              <div className="flex items-start gap-5 mb-8">
                <div className={`p-4 rounded-[1.5rem] shadow-inner shrink-0 ${activeMode?.profileId === 'fire' ? 'bg-red-500/20' : 'bg-blue-500/20'}`}>
                  <Navigation className={`w-8 h-8 ${activeMode?.profileId === 'fire' ? 'text-red-500' : 'text-blue-500'}`} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-1">Tactical Directive</p>
                  <h2 className="text-2xl font-black text-white leading-none tracking-tight uppercase">
                    {currentStepIndex >= currentPath.length - 1 ? 'Destination Reached' : missionProfile.guidanceText}
                  </h2>
                </div>
              </div>
              <button
                onClick={() => {
                  if (currentStepIndex < currentPath.length - 1) {
                    setCurrentStepIndex(prev => prev + 1);
                  } else {
                    setCurrentPath(null);
                  }
                  if (navigator.vibrate) navigator.vibrate(40);
                }}
                className={`w-full py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-sm flex items-center justify-center gap-3 shadow-2xl transition-all active:scale-95 ${activeMode?.profileId === 'fire' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}
              >
                {currentStepIndex >= currentPath.length - 1 ? 'Clear Mission' : 'Acknowledge & Proceed'}
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Resting State Controls ── */}
      {!currentPath && (
        <div className="fixed bottom-8 left-6 right-6 z-40 flex flex-col gap-4 max-w-lg mx-auto">
          <button
            onClick={() => setShowDirectionsModal(true)}
            className="w-full bg-slate-900/80 backdrop-blur-xl border-2 border-slate-800 py-5 rounded-[2rem] text-white font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 shadow-2xl active:scale-95 transition-all"
          >
            <Compass className="w-5 h-5 text-blue-500" />
            Find Destination
          </button>
          <button
            onClick={() => startNavigation('exit')}
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
                <button onClick={() => setShowDirectionsModal(false)} className="p-2 text-slate-500"><X className="w-6 h-6" /></button>
              </div>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {Object.values(mapData?.nodes || {}).filter(n => n.type !== 'path').map(node => (
                  <button
                    key={node.id}
                    onClick={() => startNavigation(node.id)}
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
