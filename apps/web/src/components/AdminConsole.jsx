import React, { useEffect, useMemo, useState } from 'react';
import { ref, onValue, update } from 'firebase/database';
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Clock,
  FileBarChart2,
  LayoutDashboard,
  MapPin,
  QrCode,
  Radio,
  Settings,
  ShieldAlert,
  Activity,
  ChevronRight,
  ShieldCheck,
  AppWindow,
  Menu,
  X as CloseIcon
} from 'lucide-react';
import { rtdb } from '../lib/firebase';
import { ProvisioningDashboard } from './ProvisioningDashboard';
import { LiveTrackingPanel } from './LiveTrackingPanel';
import { BlueprintManager } from './BlueprintManager';
import { SmartBroadcastTool } from './SmartBroadcastTool';

const NAV_ITEMS = [
  { id: 'live-incidents', label: 'Incidents', icon: BellRing },
  { id: 'blueprints', label: 'Maps', icon: MapPin },
  { id: 'live-tracking', label: 'Tactical', icon: Activity },
  { id: 'provisioning', label: 'QR Ops', icon: QrCode },
];

const STATUS_THEMES = {
  PENDING: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/40',
    text: 'text-red-400',
    header: 'bg-red-600',
    label: 'URGENT'
  },
  ACKNOWLEDGED: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    header: 'bg-amber-500',
    label: 'ACTIVE'
  },
  RESOLVED: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
    text: 'text-emerald-400',
    header: 'bg-emerald-600',
    label: 'CLOSED'
  },
};

export const AdminConsole = ({ apiBaseUrl, section }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState(section || 'live-incidents');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);

  useEffect(() => {
    const alertsRef = ref(rtdb, 'alerts');
    const unsubscribe = onValue(alertsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data)
          .map(([dbKey, value]) => ({ dbKey, ...value }))
          .sort((a, b) => b.timestamp - a.timestamp);
        setAlerts(list);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAction = async (dbKey, newStatus) => {
    try {
      await update(ref(rtdb, `alerts/${dbKey}`), { 
        status: newStatus, 
        updatedAt: Date.now() 
      });
    } catch (error) {
      console.error('Admin action failed:', error);
    }
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'live-incidents':
        return <LiveIncidentsPanel alerts={alerts} onAction={handleAction} />;
      case 'blueprints':
        return <BlueprintManager propertyId="HOTEL-101" apiBaseUrl={apiBaseUrl} />;
      case 'live-tracking':
        return <LiveTrackingPanel apiBaseUrl={apiBaseUrl} />;
      case 'provisioning':
        return <ProvisioningDashboard apiBaseUrl={apiBaseUrl} embedded />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 py-20">
            <ShieldCheck className="w-16 h-16 mb-4 opacity-10" />
            <p className="font-black uppercase tracking-[0.3em] text-xs text-center">Data Layer Secure</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#050608] text-slate-100 flex flex-col md:flex-row overflow-hidden font-sans">
      
      {/* ── Mobile Top Nav ── */}
      <header className="md:hidden h-16 border-b border-white/5 bg-[#0c0d12] flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-blue-500" />
          <span className="font-black uppercase tracking-tighter text-sm">CrisisBridge Admin</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-slate-400">
          {isMobileMenuOpen ? <CloseIcon className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* ── Adaptive Sidebar (Desktop) / Fullscreen Overlay (Mobile) ── */}
      <aside className={`
        fixed inset-0 z-40 md:relative md:flex md:w-[280px] border-r border-white/5 bg-[#0c0d12] flex-col shrink-0 transition-transform duration-300
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="hidden md:block p-8 border-b border-white/5">
           <div className="flex items-center gap-3 mb-6">
              <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-600/20">
                 <ShieldAlert className="w-5 h-5 text-white" />
              </div>
              <div>
                 <h1 className="font-black uppercase tracking-tighter text-lg leading-none">Admin</h1>
                 <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Tactical Ops</p>
              </div>
           </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 md:p-4 pt-20 md:pt-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveSection(item.id);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all duration-200 group ${
                  isActive 
                    ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/10' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-4">
                   <Icon className={`w-6 h-6 md:w-5 md:h-5 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-blue-400'}`} />
                   <span className="text-sm md:text-xs font-black uppercase tracking-widest">{item.label}</span>
                </div>
                {isActive && <ChevronRight className="w-4 h-4 hidden md:block" />}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5">
           <a href="/responder" className="flex items-center justify-center gap-2 w-full bg-slate-900 border border-white/10 py-4 md:py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all">
              <AppWindow className="w-4 h-4 md:w-3.5 md:h-3.5" />
              Responder Mode
           </a>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main className="flex-1 flex flex-col bg-[#050608] relative overflow-hidden">
         {/* Desktop Header */}
         <header className="hidden md:flex h-20 border-b border-white/5 items-center justify-between px-10 bg-[#0c0d12]/50 backdrop-blur-md">
            <div className="flex items-center gap-8">
               <div>
                  <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 leading-none mb-1">HQ Command</h2>
                  <h3 className="text-xl font-black tracking-tight text-white uppercase">{NAV_ITEMS.find(n => n.id === activeSection)?.label || 'System'}</h3>
               </div>
               <button 
                  onClick={() => setIsBroadcastOpen(true)}
                  className="flex items-center gap-2 bg-blue-600/10 border border-blue-500/20 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-blue-400 hover:bg-blue-600 hover:text-white transition-all shadow-lg shadow-blue-600/10"
               >
                  <Radio className="w-3.5 h-3.5" />
                  New Broadcast
               </button>
            </div>
            <div className="flex items-center gap-4">
               <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 leading-none">Status</p>
                  <p className="text-xs font-bold text-emerald-500 uppercase mt-1">Link Encrypted</p>
               </div>
               <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-black text-xs">A</div>
            </div>
         </header>

         {/* Content Scroll Area */}
         <section className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar pb-24 md:pb-10">
            {renderSection()}
         </section>

         {/* ── Mobile Bottom Bar (Thumb Zone) ── */}
         <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0c0d12] border-t border-white/5 flex items-center justify-around px-2 z-30">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-colors ${isActive ? 'text-blue-500' : 'text-slate-500'}`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[8px] font-black uppercase tracking-tighter">{item.label}</span>
                </button>
              );
            })}
            <button
               onClick={() => setIsBroadcastOpen(true)}
               className="flex flex-col items-center justify-center gap-1 w-full h-full text-blue-400"
            >
               <Radio className="w-5 h-5 animate-pulse" />
               <span className="text-[8px] font-black uppercase tracking-tighter text-blue-500">Signal</span>
            </button>
         </div>

         {/* ── Overlays ── */}
         <AnimatePresence>
            {isBroadcastOpen && (
               <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                  <motion.div 
                     initial={{ scale: 0.9, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     exit={{ scale: 0.9, opacity: 0 }}
                     className="w-full max-w-lg"
                  >
                     <SmartBroadcastTool 
                        propertyId="HOTEL-101" 
                        onDismiss={() => setIsBroadcastOpen(false)} 
                     />
                  </motion.div>
               </div>
            )}
         </AnimatePresence>
      </main>
    </div>
  );
};

/* ── Integrated Tactical Panels (Refactored for Grid/Stack) ── */

function LiveIncidentsPanel({ alerts, onAction }) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center">
         <div className="bg-slate-900/50 p-8 rounded-full border border-dashed border-slate-800 mb-6">
            <CheckCircle2 className="w-12 h-12 text-slate-700" />
         </div>
         <p className="text-slate-500 font-black uppercase tracking-[0.3em] text-xs">Awaiting Distress Signals</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
      {alerts.map((alert) => {
        const theme = STATUS_THEMES[alert.status] || STATUS_THEMES.PENDING;
        
        return (
          <article 
            key={alert.dbKey} 
            className={`group flex flex-col rounded-[2rem] md:rounded-[2.5rem] border-2 bg-[#0c0d12] overflow-hidden transition-all duration-300 ${theme.border} ${alert.status === 'PENDING' ? 'animate-alert-pulse' : ''}`}
          >
            <div className={`px-5 md:px-6 py-3 flex items-center justify-between ${theme.header}`}>
               <span className="text-[10px] font-black uppercase tracking-widest text-white">{alert.type} SIGNAL</span>
               <div className="bg-black/20 px-3 py-1 rounded-full text-[8px] font-black text-white uppercase">{theme.label}</div>
            </div>

            <div className="p-6 md:p-8 space-y-5 md:space-y-6 flex-1 flex flex-col">
               <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <h4 className="text-2xl md:text-3xl font-black tracking-tighter uppercase mb-1 truncate">{alert.location}</h4>
                    <div className="flex items-center gap-2 text-slate-500 font-bold text-[10px] md:text-xs">
                       <Clock className="w-3 h-3" />
                       {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className="p-2 md:p-3 bg-slate-900 rounded-xl md:rounded-2xl border border-white/5 shrink-0">
                     <MapPin className="w-5 h-5 text-blue-400" />
                  </div>
               </div>

               <div className="bg-slate-900/80 border border-white/5 rounded-xl md:rounded-2xl p-4 shadow-inner">
                  <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Situational Data</p>
                  <p className="text-sm font-medium text-slate-300 leading-relaxed italic line-clamp-3">
                    "{alert.description || 'No descriptive context available.'}"
                  </p>
               </div>

               <div className="mt-auto pt-4 md:pt-6 space-y-3">
                  {alert.status === 'PENDING' && (
                    <button 
                      onClick={() => onAction(alert.dbKey, 'ACKNOWLEDGED')}
                      className="w-full bg-white text-black py-4 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-xl"
                    >
                      Acknowledge
                    </button>
                  )}
                  {alert.status === 'ACKNOWLEDGED' && (
                    <button 
                      onClick={() => onAction(alert.dbKey, 'RESOLVED')}
                      className="w-full bg-emerald-600 text-white py-4 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-xl shadow-emerald-600/10"
                    >
                      Close Case
                    </button>
                  )}
                  {alert.status === 'RESOLVED' && (
                    <div className="w-full bg-slate-900 border border-emerald-500/20 py-4 rounded-xl md:rounded-2xl text-emerald-400 flex items-center justify-center gap-2">
                       <ShieldCheck className="w-4 h-4" />
                       <span className="text-[9px] font-black uppercase tracking-widest">Incident Archived</span>
                    </div>
                  )}
               </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
