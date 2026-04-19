import React, { useState, useEffect, useMemo } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { rtdb } from '../lib/firebase';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

import { 
  Bell, 
  Map as MapIcon, 
  ShieldAlert, 
  Clock, 
  ChevronRight, 
  CheckCircle2, 
  Navigation,
  AlertCircle,
  Radio,
  Users,
  Search,
  Maximize2
} from 'lucide-react';
import { LiveTrackingPanel } from './LiveTrackingPanel';

const STATUS_CONFIG = {
  PENDING: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/40',
    text: 'text-red-400',
    accent: 'bg-red-500',
    label: 'Critical'
  },
  ACKNOWLEDGED: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    accent: 'bg-amber-500',
    label: 'Responding'
  },
  RESOLVED: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
    text: 'text-emerald-400',
    accent: 'bg-emerald-500',
    label: 'Closed'
  }
};

export const ResponderDashboard = ({ apiBaseUrl }) => {
  const [alerts, setAlerts] = useState([]);
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    const alertsRef = ref(rtdb, 'alerts');
    const unsubscribe = onValue(alertsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data)
          .map(([dbKey, value]) => ({ dbKey, ...value }))
          .sort((a, b) => b.timestamp - a.timestamp);
        setAlerts(list);
        
        // Auto-select first pending alert if nothing selected
        if (!selectedAlertId && list.length > 0) {
          const firstPending = list.find(a => a.status === 'PENDING');
          setSelectedAlertId(firstPending ? firstPending.dbKey : list[0].dbKey);
        }
      }
    });
    return () => unsubscribe();
  }, [selectedAlertId]);

  const selectedAlert = useMemo(() => 
    alerts.find(a => a.dbKey === selectedAlertId), 
  [alerts, selectedAlertId]);

  const handleAction = async (dbKey, status) => {
    try {
      await update(ref(rtdb, `alerts/${dbKey}`), { 
        status, 
        updatedAt: Date.now() 
      });
      
      const endpoint = status === 'ACKNOWLEDGED' ? 'acknowledge' : 'resolve';
      await fetch(`${apiBaseUrl}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          alertId: alerts.find(a => a.dbKey === dbKey).id || dbKey,
          summary: status === 'RESOLVED' ? 'Resolved via Command Center.' : undefined,
          actions: ['Responder Dispatched']
        }),
      });
    } catch (err) {
      console.error('Action failed:', err);
    }
  };

  return (
    <div className="h-screen bg-[#050608] flex overflow-hidden font-sans">
      
      {/* ── Left Feed: Incident Queue ── */}
      <aside className={`flex flex-col border-r border-white/5 bg-[#0c0d12] transition-all duration-300 ${isSidebarCollapsed ? 'w-0' : 'w-[400px]'}`}>
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="bg-red-600 p-2 rounded-xl shadow-lg shadow-red-600/20">
               <ShieldAlert className="w-5 h-5 text-white" />
             </div>
             <div>
               <h1 className="font-black uppercase tracking-tighter text-lg">Incident Feed</h1>
               <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">Live Ops Oversight</p>
             </div>
          </div>
          <div className="flex items-center gap-2">
             <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
             <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">{alerts.filter(a => a.status === 'PENDING').length} Active</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
          {alerts.map((alert) => {
            const config = STATUS_CONFIG[alert.status];
            const isActive = selectedAlertId === alert.dbKey;
            
            return (
              <div 
                key={alert.dbKey}
                onClick={() => setSelectedAlertId(alert.dbKey)}
                className={`group relative cursor-pointer rounded-2xl border-2 p-4 transition-all duration-200 ${
                  isActive ? `${config.border} ${config.bg} scale-[1.02] shadow-xl` : 'border-transparent bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                   <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${config.accent} ${alert.status === 'PENDING' ? 'animate-pulse' : ''}`} />
                      <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${config.text}`}>{config.label}</span>
                   </div>
                   <span className="text-[10px] font-bold text-slate-500">{new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                
                <h3 className="font-black text-lg leading-tight mb-1 group-hover:translate-x-1 transition-transform">{alert.location}</h3>
                <p className="text-xs text-slate-400 font-medium line-clamp-2 mb-4">{alert.description || 'No description provided.'}</p>
                
                <div className="flex items-center justify-between">
                   <div className="flex -space-x-2">
                      <div className="w-6 h-6 rounded-full border-2 border-[#0c0d12] bg-slate-800 flex items-center justify-center">
                         <Users className="w-3 h-3 text-slate-400" />
                      </div>
                   </div>
                   <ChevronRight className={`w-4 h-4 transition-transform ${isActive ? 'translate-x-1 text-white' : 'text-slate-600'}`} />
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Right Column: Tactical Map & Coordination ── */}
      <main className="flex-1 flex flex-col relative">
        
        {/* Top Toolstrip */}
        <div className="h-16 border-b border-white/5 bg-[#0c0d12]/50 backdrop-blur-md flex items-center justify-between px-8">
           <div className="flex items-center gap-6">
              <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="text-slate-400 hover:text-white transition-colors">
                 <Maximize2 className="w-5 h-5" />
              </button>
              <div className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-3">
                 <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
                 <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">System Ready / Encrypted Link</span>
              </div>
           </div>
           
           <div className="flex items-center gap-4">
              <div className="bg-slate-900 border border-white/5 rounded-full px-4 py-1.5 flex items-center gap-3">
                 <Search className="w-3.5 h-3.5 text-slate-500" />
                 <input placeholder="Search Property..." className="bg-transparent border-none text-[10px] font-bold uppercase tracking-widest focus:outline-none w-32" />
              </div>
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-black text-[10px]">JD</div>
           </div>
        </div>

        {/* Dynamic Context Area */}
        <div className="flex-1 relative flex flex-col">
           {selectedAlert ? (
             <>
               {/* Tactical Overlay (Floating Alert Detail) */}
               <div className="absolute top-6 left-6 z-30 w-96 space-y-4 pointer-events-none">
                  <div className="bg-slate-900/90 backdrop-blur-xl border-2 border-white/10 p-6 rounded-[2rem] shadow-2xl pointer-events-auto">
                     <div className="flex items-center gap-3 mb-6">
                        <div className={cn("p-3 rounded-2xl", STATUS_CONFIG[selectedAlert.status].bg)}>
                           <AlertCircle className={cn("w-6 h-6", STATUS_CONFIG[selectedAlert.status].text)} />
                        </div>
                        <div>
                           <h2 className="text-2xl font-black tracking-tight">{selectedAlert.location}</h2>
                           <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{selectedAlert.type} Emergency</p>
                        </div>
                     </div>

                     <div className="space-y-6">
                        <div className="bg-black/40 border border-white/5 rounded-2xl p-4">
                           <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">AI Triage Summary</p>
                           <p className="text-sm font-medium leading-relaxed italic text-blue-100">
                             "{selectedAlert.triage?.immediate_action || 'Pending analysis...'}"
                           </p>
                        </div>

                        {selectedAlert.status !== 'RESOLVED' && (
                           <div className="grid grid-cols-1 gap-3">
                              {selectedAlert.status === 'PENDING' ? (
                                <button 
                                  onClick={() => handleAction(selectedAlert.dbKey, 'ACKNOWLEDGED')}
                                  className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-xl shadow-blue-600/20 transition-all active:scale-95"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  Acknowledge
                                </button>
                              ) : (
                                <button 
                                  onClick={() => handleAction(selectedAlert.dbKey, 'RESOLVED')}
                                  className="w-full bg-emerald-600 hover:bg-emerald-500 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-xl shadow-emerald-600/20 transition-all active:scale-95"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  Mark Resolved
                                </button>
                              )}
                           </div>
                        )}
                     </div>
                  </div>
               </div>

               {/* Large Tactical Map */}
               <div className="flex-1 bg-black overflow-hidden">
                  <LiveTrackingPanel apiBaseUrl={apiBaseUrl} />
               </div>
             </>
           ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                <Radio className="w-12 h-12 mb-4 opacity-20" />
                <p className="font-black uppercase tracking-[0.3em] text-xs">Awaiting Incident Data</p>
             </div>
           )}
        </div>
      </main>
    </div>
  );
};
