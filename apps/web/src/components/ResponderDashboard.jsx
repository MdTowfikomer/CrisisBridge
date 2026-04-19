import React, { useState, useEffect, useMemo } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { rtdb } from '../lib/firebase';
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
  Maximize2,
  X as CloseIcon,
  List as ListIcon
} from 'lucide-react';
import { LiveTrackingPanel } from './LiveTrackingPanel';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const STATUS_CONFIG = {
  PENDING: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/40',
    text: 'text-red-400',
    accent: 'bg-red-500',
    label: 'Critical Alert'
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
    label: 'Case Closed'
  }
};

export const ResponderDashboard = ({ apiBaseUrl }) => {
  const [alerts, setAlerts] = useState([]);
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const alertsRef = ref(rtdb, 'alerts');
    const unsubscribe = onValue(alertsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data)
          .map(([dbKey, value]) => ({ dbKey, ...value }))
          .sort((a, b) => b.timestamp - a.timestamp);
        setAlerts(list);
        
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
          summary: status === 'RESOLVED' ? 'Incident handled and resolved via mobile responder.' : undefined,
          actions: ['Unit Dispatched']
        }),
      });
    } catch (err) {
      console.error('Action failed:', err);
    }
  };

  return (
    <div className="h-screen bg-[#050608] text-slate-100 flex flex-col overflow-hidden font-sans selection:bg-blue-500/30">
      
      {/* ── Top Tactical Header ── */}
      <header className="h-16 border-b border-white/5 bg-[#0c0d12] flex items-center justify-between px-4 md:px-8 shrink-0 z-50 shadow-2xl">
         <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-slate-400 hover:text-white transition-colors md:hidden"
            >
              {isSidebarOpen ? <CloseIcon className="w-6 h-6" /> : <ListIcon className="w-6 h-6" />}
            </button>
            <div className="flex items-center gap-3">
               <div className="bg-red-600 p-1.5 rounded-lg shadow-lg shadow-red-600/20">
                 <ShieldAlert className="w-5 h-5 text-white" />
               </div>
               <div>
                 <h1 className="font-black uppercase tracking-tighter text-sm md:text-lg leading-none">Responder Ops</h1>
                 <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1 hidden md:block">Real-Time Crisis Coordination</p>
               </div>
            </div>
         </div>
         
         <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-3 mr-4">
               <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
               <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tactical Link Established</span>
            </div>
            <a href="/admin" className="text-[10px] font-black uppercase tracking-widest bg-slate-900 border border-white/5 px-4 py-2 rounded-lg hover:bg-slate-800 transition-all">HQ Admin</a>
         </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        
        {/* ── Incident Feed ── */}
        <aside className={cn(
          "fixed inset-0 z-40 md:relative md:flex md:w-[380px] border-r border-white/5 bg-[#0c0d12] flex-col shrink-0 transition-all duration-500",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full md:-ml-[380px]",
          isMobileView && !isSidebarOpen && "pointer-events-none"
        )}>
          <div className="p-6 border-b border-white/5 flex items-center justify-between mt-16 md:mt-0">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Live Incident Queue</h2>
            <div className="flex items-center gap-2">
               <span className="flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
               <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">
                 {alerts.filter(a => a.status === 'PENDING').length} Unacknowledged
               </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 pb-20 md:pb-4">
            {alerts.map((alert) => {
              const config = STATUS_CONFIG[alert.status];
              const isActive = selectedAlertId === alert.dbKey;
              
              return (
                <div 
                  key={alert.dbKey}
                  onClick={() => {
                    setSelectedAlertId(alert.dbKey);
                    if (isMobileView) setIsSidebarOpen(false);
                  }}
                  className={cn(
                    "group relative cursor-pointer rounded-3xl border-2 p-5 transition-all duration-300",
                    isActive ? `${config.border} ${config.bg} scale-[1.02] shadow-2xl` : 'border-transparent bg-white/5 hover:bg-white/10',
                    alert.status === 'PENDING' && !isActive && 'animate-alert-pulse'
                  )}
                >
                  <div className="flex items-start justify-between mb-4">
                     <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", config.accent, alert.status === 'PENDING' && "animate-ping")} />
                        <span className={cn("text-[9px] font-black uppercase tracking-[0.2em]", config.text)}>{config.label}</span>
                     </div>
                     <span className="text-[10px] font-bold text-slate-600">{new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  
                  <h3 className="font-black text-xl leading-tight mb-2 tracking-tighter uppercase">{alert.location}</h3>
                  <p className="text-xs text-slate-400 font-medium line-clamp-2 italic mb-1">"{alert.description || 'No situational details provided.'}"</p>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ── Main Tactical View ── */}
        <main className="flex-1 flex flex-col relative bg-black overflow-hidden">
          {selectedAlert ? (
            <>
               {/* Tactical Focus Overlay (Draggable & Dismissible) */}
               <motion.div 
                  drag
                  dragMomentum={false}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="absolute top-6 left-6 z-30 w-96 pointer-events-none"
               >
                  <div className="bg-[#0c0d12]/95 backdrop-blur-2xl border-2 border-white/10 p-6 rounded-[2.5rem] shadow-2xl pointer-events-auto transition-all cursor-grab active:cursor-grabbing relative group/card">
                     {/* Dismiss Button */}
                     <button 
                        onClick={() => setSelectedAlertId(null)}
                        className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all opacity-0 group-hover/card:opacity-100"
                     >
                        <CloseIcon className="w-4 h-4" />
                     </button>

                     <div className="flex items-center gap-4 mb-6 pr-8">
                        <div className={cn("p-4 rounded-2xl", STATUS_CONFIG[selectedAlert.status].bg)}>
                           <AlertCircle className={cn("w-7 h-7", STATUS_CONFIG[selectedAlert.status].text)} />
                        </div>
                        <div className="min-w-0">
                           <h2 className="text-2xl font-black tracking-tighter uppercase truncate leading-none mb-1">{selectedAlert.location}</h2>
                           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{selectedAlert.type} MISSION</p>
                        </div>
                     </div>

                    <div className="space-y-6">
                       {/* Tactical Directive (Restored & Compacted) */}
                       <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 -mt-2 shadow-inner">
                          <p className="text-[8px] font-black text-blue-400 uppercase tracking-[0.3em] mb-1.5 flex items-center gap-1.5">
                             <Radio className="w-2.5 h-2.5" /> AI Command Directive
                          </p>
                          <p className="text-sm font-bold text-slate-100 leading-tight italic">
                            "{selectedAlert.triage?.immediate_action || 'Standby for mission parameters...'}"
                          </p>
                       </div>

                       {selectedAlert.status !== 'RESOLVED' && (
                          <div className="grid grid-cols-1 gap-3">
                             {selectedAlert.status === 'PENDING' ? (
                               <button 
                                 onClick={() => handleAction(selectedAlert.dbKey, 'ACKNOWLEDGED')}
                                 className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-2xl shadow-blue-600/30 transition-all active:scale-95 group"
                               >
                                 <Navigation className="w-4 h-4 group-hover:animate-bounce" />
                                 Begin Response
                               </button>
                             ) : (
                               <button 
                                 onClick={() => handleAction(selectedAlert.dbKey, 'RESOLVED')}
                                 className="w-full bg-emerald-600 hover:bg-emerald-500 py-5 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-2xl shadow-emerald-600/20 transition-all active:scale-95 group"
                               >
                                 <CheckCircle2 className="w-4 h-4 group-hover:scale-125 transition-transform" />
                                 Incident Resolved
                               </button>
                             )}
                          </div>
                       )}
                    </div>
                 </div>
              </div>

              {/* Dynamic Map Component */}
              <div className="flex-1 w-full h-full">
                 <LiveTrackingPanel apiBaseUrl={apiBaseUrl} />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-700 bg-[#050608]">
               <div className="relative mb-6">
                  <Radio className="w-16 h-16 opacity-10 animate-pulse" />
                  <div className="absolute inset-0 bg-blue-500/5 blur-3xl rounded-full" />
               </div>
               <p className="font-black uppercase tracking-[0.4em] text-xs">Scanning for Distress Signals...</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
