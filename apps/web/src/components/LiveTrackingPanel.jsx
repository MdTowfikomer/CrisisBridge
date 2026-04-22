import React, { useEffect, useState, useMemo } from 'react';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { MapPin, Users, Flame, Shield, Radio, Eye, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const UserGroupMarker = ({ x, y, count, status, type, isSelected, onClick }) => {
  const isEmergency = status === 'evacuating';
  const isResponder = type === 'RESPONDER';
  
  return (
    <motion.g 
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      onClick={onClick}
      className="cursor-pointer group"
    >
      <motion.circle
        cx={x} cy={y} r={isResponder ? 18 : (count > 1 ? 16 : 12)}
        fill={isResponder ? '#10b981' : (isEmergency ? '#ef4444' : '#3b82f6')}
        initial={{ opacity: 0.2 }}
        animate={{ opacity: isResponder ? [0.2, 0.5, 0.2] : [0.1, 0.3, 0.1] }}
        transition={{ repeat: Infinity, duration: 2 }}
      />
      <circle
        cx={x} cy={y} r={isResponder ? 12 : (count > 1 ? 10 : 8)}
        fill={isResponder ? '#10b981' : (isEmergency ? '#ef4444' : '#3b82f6')}
        className={isSelected ? "stroke-white stroke-[3px]" : "stroke-transparent"}
      />
      {isResponder ? (
        <Shield x={x - 6} y={y - 6} className="w-3 h-3 text-white pointer-events-none" />
      ) : count > 1 && (
        <text 
          x={x} y={y + 4} 
          fontSize="10" fill="white" textAnchor="middle" 
          className="font-black pointer-events-none"
        >
          {count}
        </text>
      )}
    </motion.g>
  );
};

export function LiveTrackingPanel({ apiBaseUrl }) {
  const [locations, setLocations] = useState({});
  const [mapData, setMapData] = useState(null);
  const [floorplanSvg, setFloorplanSvg] = useState('');
  const [loading, setLoading] = useState(true);
  const [hazards, setHazards] = useState({});
  const [selectedGroupId, setSelectedGroupId] = useState(null);

  const [propertyId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('property') || 'HOTEL-101';
  });

  useEffect(() => {
    if (!propertyId) return;
    
    // Load Map
    const mapRef = ref(rtdb, `maps/${propertyId}`);
    const unsubMap = onValue(mapRef, (snap) => {
      if (snap.exists()) {
        setMapData(snap.val());
        if (snap.val().svgContent) {
          setFloorplanSvg(snap.val().svgContent);
        }
      }
      setLoading(false);
    }, (err) => {
      console.error("Failed to load map data:", err);
      setLoading(false);
    });

    // Load Live Data
    const locRef = ref(rtdb, `tracking/${propertyId}`);
    const unsubLoc = onValue(locRef, (snap) => {
      const data = snap.val() || {};
      setLocations(data);
      setLoading(false);
    });

    const hazRef = ref(rtdb, `hazards/${propertyId}`);
    const unsubHaz = onValue(hazRef, (snap) => setHazards(snap.val() || {}));

    return () => { unsubMap(); unsubLoc(); unsubHaz(); };
  }, [propertyId]);

  // Spatial Grouping Logic
  const groupedUsers = useMemo(() => {
    const groups = {};

    Object.entries(locations).forEach(([id, loc]) => {
      // Skip stale entries (older than 60 seconds)
      if (loc.lastSeen && (Date.now() - loc.lastSeen) > 60000) return;

      let coordX, coordY, label;

      // Case 1: User has a nodeId — look up coordinates from map data
      if (loc.nodeId && mapData?.nodes) {
        const node = mapData.nodes[loc.nodeId];
        if (!node) return;
        coordX = node.x;
        coordY = node.y;
        label = node.label || node.type?.toUpperCase() || 'ZONE';
      }
      // Case 2: User has direct x/y coordinates (responders + pedestrian tracking)
      else if (typeof loc.x === 'number' && typeof loc.y === 'number') {
        coordX = loc.x;
        coordY = loc.y;
        label = loc.type === 'RESPONDER' ? 'RESPONDER' : 'FIELD';
      } else {
        return; // skip if no usable position
      }

      const key = `${Math.round(coordX)},${Math.round(coordY)}`;
      if (!groups[key]) {
        groups[key] = { 
          x: coordX, 
          y: coordY, 
          name: label,
          users: [], 
          status: loc.status,
          type: loc.type
        };
      }
      groups[key].users.push({ id, ...loc });
      if (loc.status === 'evacuating') groups[key].status = 'evacuating';
      if (loc.type === 'RESPONDER') groups[key].type = 'RESPONDER';
    });
    return groups;
  }, [locations, mapData]);

  if (loading) return (
    <div className="h-full flex flex-col items-center justify-center text-slate-500">
      <Loader2 className="w-10 h-10 animate-spin mb-4" />
      <p className="font-black uppercase tracking-widest text-xs">Establishing Tactical Link...</p>
    </div>
  );

  const viewBox = mapData?.viewBox || "0 0 1000 800";

  return (
    <div className="h-full flex flex-col md:flex-row gap-6 p-6 animate-in fade-in duration-500">
      
      {/* ── Tactical Map ── */}
      <div className="flex-1 bg-slate-950 rounded-[2.5rem] border-2 border-white/5 overflow-hidden relative shadow-2xl">
        <svg viewBox={viewBox} className="w-full h-full p-10">
          <defs>
            <filter id="radar-glow"><feGaussianBlur stdDeviation="15" result="blur"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>

          {/* Radar Sweep Animation */}
          <motion.circle 
            cx="50%" cy="50%" r="40%" 
            fill="none" stroke="#3b82f6" strokeWidth="2" 
            initial={{ scale: 0, opacity: 0.5 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
          />

          {floorplanSvg && <g dangerouslySetInnerHTML={{ __html: floorplanSvg.replace(/<\/?svg[^>]*>/gi, '') }} className="opacity-20" />}

          {/* Render Spatial Groups */}
          {Object.entries(groupedUsers).map(([key, group]) => (
            <UserGroupMarker 
              key={key}
              x={group.x} y={group.y}
              count={group.users.length}
              status={group.status}
              type={group.type}
              isSelected={selectedGroupId === key}
              onClick={() => setSelectedGroupId(key)}
            />
          ))}

          {/* Hazards */}
          {Object.entries(hazards).map(([nodeId, active]) => {
            const node = mapData?.nodes[nodeId];
            if (!node || !active) return null;
            return (
              <g key={nodeId}>
                <motion.circle 
                  cx={node.x} cy={node.y} r="20" 
                  fill="#ef4444" opacity="0.1" 
                  animate={{ r: [20, 30, 20] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                />
                <Flame className="w-4 h-4 text-red-500" x={node.x - 8} y={node.y - 8} />
              </g>
            );
          })}
        </svg>

        {/* Map HUD */}
        <div className="absolute top-6 left-6 flex items-center gap-3">
           <div className="bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl flex items-center gap-3">
              <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest">Active Tracking: {Object.keys(locations).length} Souls</span>
           </div>
        </div>
      </div>

      {/* ── Group Detail Sidebar ── */}
      <aside className="w-full md:w-80 flex flex-col gap-6">
        <div className="bg-slate-900 border-2 border-white/5 rounded-[2rem] p-6 shadow-xl flex-1 overflow-hidden flex flex-col">
           <div className="flex items-center gap-3 border-b border-white/5 pb-4 mb-6">
              <Users className="w-5 h-5 text-blue-400" />
              <h3 className="font-black uppercase tracking-tighter text-white">Zone Inventory</h3>
           </div>
           
           <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
              {Object.entries(groupedUsers).map(([key, group]) => (
                <button 
                  key={key}
                  onClick={() => setSelectedGroupId(key)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                    selectedGroupId === key ? "bg-blue-600/10 border-blue-500" : "bg-white/5 border-transparent hover:bg-white/10"
                  }`}
                >
                   <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{group.name}</span>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${group.status === 'evacuating' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>
                        {group.status}
                      </span>
                   </div>
                   <p className="font-black text-white">{group.users.length} Guest{group.users.length > 1 ? 's' : ''}</p>
                </button>
              ))}
              
              {Object.keys(groupedUsers).length === 0 && (
                <div className="text-center py-20 opacity-20">
                   <Users className="w-12 h-12 mx-auto mb-4" />
                   <p className="text-[10px] font-black uppercase tracking-[0.3em]">No Active Transmissions</p>
                </div>
              )}
           </div>
        </div>
      </aside>
    </div>
  );
}
