import React, { useEffect, useState, useRef } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { MapPin, Users, Flame, Shield, Radio, Eye } from 'lucide-react';

export function LiveTrackingPanel({ apiBaseUrl }) {
  const [locations, setLocations] = useState({});
  const [mapData, setMapData] = useState(null);
  const [floorplanSvg, setFloorplanSvg] = useState('');
  const [loading, setLoading] = useState(true);
  const [hazards, setHazards] = useState({});
  const [propertyId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('property') || 'HOTEL-101';
  });
  const [selectedUser, setSelectedUser] = useState(null);

  // Fetch map + floorplan from RTDB
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

  // Subscribe to live locations & hazards
  useEffect(() => {
    const locationsRef = ref(rtdb, 'liveLocations');
    const unsubLoc = onValue(locationsRef, (snapshot) => {
      setLocations(snapshot.val() || {});
      setLoading(false);
    });

    const hazardsRef = ref(rtdb, `hazards/${propertyId}`);
    const unsubHaz = onValue(hazardsRef, (snapshot) => {
      setHazards(snapshot.val() || {});
    });

    return () => {
      unsubLoc();
      unsubHaz();
    };
  }, [propertyId]);

  const toggleHazard = async (nodeId) => {
    const isCurrentHazard = hazards[nodeId] === true;
    const hazardRef = ref(rtdb, `hazards/${propertyId}/${nodeId}`);
    await set(hazardRef, !isCurrentHazard);
  };

  const activeUsers = Object.entries(locations).filter(([, l]) => l.status === 'evacuating');
  const evacuatedUsers = Object.entries(locations).filter(([, l]) => l.status === 'evacuated');
  const hazardCount = Object.keys(hazards).filter((k) => hazards[k]).length;

  const viewBox = mapData?.viewBox || '0 0 800 500';

  return (
    <div className="space-y-4">
      {/* ── Header Panel ── */}
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-[hsl(222,28%,14%)] to-[hsl(224,35%,10%)] p-5 shadow-lg sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
                Tactical Oversight — Live
              </p>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              CAD Floor Plan — Real-Time Tracking
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Click any node to toggle hazard status. Guest positions update in real-time as they navigate.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-[11px] font-bold uppercase tracking-wider">
              <Flame className="w-3.5 h-3.5 text-red-400" />
              <span className="text-red-300">{hazardCount} Hazard{hazardCount !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] font-bold uppercase tracking-wider">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-amber-300">{activeUsers.length} Evacuating</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-bold uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-300">{evacuatedUsers.length} Safe</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Map Container ── */}
      <div className="rounded-2xl border border-slate-700/50 bg-[hsl(224,45%,5%)] shadow-2xl relative overflow-hidden">
        {/* Legend */}
        <div className="absolute top-4 left-4 z-10 bg-slate-900/90 backdrop-blur-md rounded-lg border border-slate-700/50 px-3 py-3 space-y-2 pointer-events-none">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1.5">Legend</p>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500/80 shadow-[0_0_6px_rgba(16,185,129,0.4)]" />
            <span className="text-[9px] text-slate-400 font-medium">Exit</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-600" />
            <span className="text-[9px] text-slate-400 font-medium">Room / Checkpoint</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/60 border border-red-500/40 animate-pulse" />
            <span className="text-[9px] text-slate-400 font-medium">Hazard Zone</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
            <span className="text-[9px] text-slate-400 font-medium">Guest (Evacuating)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-400" />
            <span className="text-[9px] text-slate-400 font-medium">Guest (Safe)</span>
          </div>
        </div>

        {(!mapData || loading) ? (
          <div className="py-28 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-cyan-400 border-t-transparent mb-4" />
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Loading CAD Floor Plan...
            </p>
          </div>
        ) : (
          <div className="relative w-full overflow-hidden" style={{ minHeight: '550px' }}>
            <svg
              viewBox={viewBox}
              className="w-full h-full"
              style={{ minHeight: '550px' }}
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                {/* Glow filters */}
                <filter id="adminNodeGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="adminUserGlow" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feFlood floodColor="#f59e0b" floodOpacity="0.5" />
                  <feComposite in2="blur" operator="in" />
                  <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="adminSafeGlow" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feFlood floodColor="#10b981" floodOpacity="0.4" />
                  <feComposite in2="blur" operator="in" />
                  <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* ── CAD Floor Plan Background ── */}
              {floorplanSvg && (
                <g dangerouslySetInnerHTML={{ __html: floorplanSvg.replace(/<\/?svg[^>]*>/gi, '') }} />
              )}

              {/* ── Map Edges (corridors / connections) ── */}
              {mapData.edges.map((e, idx) => {
                const from = mapData.nodes[e.from];
                const to = mapData.nodes[e.to];
                const isHazard = hazards[e.from] || hazards[e.to];
                return (
                  <line
                    key={`e-${idx}`}
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke={isHazard ? '#ef4444' : '#1e3a5f'}
                    strokeWidth={isHazard ? '6' : '3'}
                    opacity={isHazard ? '0.6' : '0.25'}
                    strokeLinecap="round"
                  />
                );
              })}

              {/* ── Map Nodes (interactive) ── */}
              {Object.values(mapData.nodes).map((node) => {
                const isExit = node.type === 'exit';
                const isHazard = hazards[node.id];
                return (
                  <g
                    key={node.id}
                    className="cursor-pointer"
                    onClick={() => toggleHazard(node.id)}
                  >
                    {/* Hazard ring */}
                    {isHazard && (
                      <>
                        <circle cx={node.x} cy={node.y} r="28" fill="rgba(239,68,68,0.06)" stroke="rgba(239,68,68,0.2)" strokeWidth="1.5" className="animate-pulse" />
                        <circle cx={node.x} cy={node.y} r="18" fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.4)" strokeWidth="1" />
                      </>
                    )}
                    {/* Exit glow */}
                    {isExit && !isHazard && (
                      <circle cx={node.x} cy={node.y} r="16" fill="rgba(16,185,129,0.06)" stroke="rgba(16,185,129,0.2)" strokeWidth="1" />
                    )}
                    {/* Node */}
                    <circle
                      cx={node.x} cy={node.y}
                      r={isExit ? '9' : '7'}
                      fill={isHazard ? '#ef4444' : isExit ? '#10b981' : '#475569'}
                      filter={isExit ? 'url(#adminNodeGlow)' : undefined}
                      className="hover:opacity-80 transition-opacity"
                    />
                    {/* Label */}
                    <text
                      x={node.x} y={node.y + (isExit ? 22 : 20)}
                      fill={isHazard ? '#f87171' : isExit ? '#10b981' : '#64748b'}
                      fontSize="9"
                      textAnchor="middle"
                      fontFamily="monospace"
                      fontWeight="600"
                    >
                      {node.label}
                    </text>
                  </g>
                );
              })}

              {/* ── Live Tracking — Guest Markers ── */}
              {Object.entries(locations).map(([uid, loc]) => {
                const isSafe = loc.status === 'evacuated';
                const isSelected = selectedUser === uid;
                return (
                  <g
                    key={uid}
                    className="cursor-pointer"
                    onClick={() => setSelectedUser(isSelected ? null : uid)}
                    style={{ transition: 'all 0.8s ease-out' }}
                  >
                    {/* Outer pulse */}
                    <circle
                      cx={loc.x} cy={loc.y}
                      r={isSelected ? '24' : '18'}
                      fill={isSafe ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)'}
                      stroke={isSafe ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}
                      strokeWidth="1"
                      className={isSafe ? '' : 'animate-ping'}
                      style={isSafe ? {} : { animationDuration: '2s' }}
                    />
                    {/* Glow disc */}
                    <circle
                      cx={loc.x} cy={loc.y}
                      r="12"
                      fill={isSafe ? '#10b981' : '#f59e0b'}
                      filter={isSafe ? 'url(#adminSafeGlow)' : 'url(#adminUserGlow)'}
                      opacity="0.9"
                    />
                    {/* Inner dot */}
                    <circle
                      cx={loc.x} cy={loc.y}
                      r="5"
                      fill="#fff"
                    />
                    {/* Label */}
                    <text
                      x={loc.x} y={loc.y - 18}
                      fill={isSafe ? '#10b981' : '#f59e0b'}
                      fontSize="9"
                      textAnchor="middle"
                      fontFamily="monospace"
                      fontWeight="700"
                    >
                      {isSafe ? '✓ Safe' : '● Guest'}
                    </text>
                    {/* User ID on selection */}
                    {isSelected && (
                      <>
                        <rect
                          x={loc.x - 45} y={loc.y + 18}
                          width="90" height="22" rx="4"
                          fill="rgba(15,23,42,0.9)"
                          stroke={isSafe ? '#10b981' : '#f59e0b'}
                          strokeWidth="1"
                        />
                        <text
                          x={loc.x} y={loc.y + 33}
                          fill="#94a3b8"
                          fontSize="8"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          {uid.substring(0, 16)}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </div>

      {/* ── Guest Table ── */}
      {Object.keys(locations).length > 0 && (
        <div className="rounded-2xl border border-slate-700/50 bg-[hsl(222,28%,14%)] p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-4 h-4 text-slate-500" />
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Active Guest Sessions
            </p>
          </div>
          <div className="grid gap-2">
            {Object.entries(locations).map(([uid, loc]) => {
              const isSafe = loc.status === 'evacuated';
              const nodeLabel = mapData?.nodes?.[loc.currentNodeId]?.label || 'Unknown';
              const timeAgo = Math.round((Date.now() - (loc.lastUpdated || 0)) / 1000);
              return (
                <div
                  key={uid}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                    isSafe
                      ? 'border-emerald-500/20 bg-emerald-500/5'
                      : 'border-amber-500/20 bg-amber-500/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${isSafe ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                    <div>
                      <p className="text-xs font-semibold text-white">{uid.substring(0, 16)}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        At: <span className="text-slate-300">{nodeLabel}</span> · Floor {loc.floor}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider ${
                      isSafe
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
                    }`}>
                      {isSafe ? 'Evacuated' : 'In Progress'}
                    </span>
                    <p className="text-[9px] text-slate-600 mt-1">{timeAgo}s ago</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
