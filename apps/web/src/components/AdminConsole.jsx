import React, { useEffect, useMemo, useState } from 'react';
import { ref, onValue, update } from 'firebase/database';
import {
  AlertCircle,
  BellRing,
  Building2,
  CheckCircle2,
  Clock,
  DoorOpen,
  FileBarChart2,
  LayoutDashboard,
  MapPin,
  Nfc,
  QrCode,
  Settings,
  ShieldAlert,
  TrendingUp,
  UserCog,
  WifiOff,
  ChevronRight,
  ShieldCheck,
  Activity,
  LogOut,
  AppWindow
} from 'lucide-react';
import { rtdb } from '../lib/firebase';
import { ProvisioningDashboard } from './ProvisioningDashboard';
import { LiveTrackingPanel } from './LiveTrackingPanel';
import { BlueprintManager } from './BlueprintManager';

const NAV_ITEMS = [
  { id: 'live-incidents', label: 'Live Incident Feed', href: '/admin', icon: BellRing, status: 'Critical' },
  { id: 'blueprints', label: 'Blueprints & Mapping', href: '/admin/blueprints', icon: MapPin, status: 'Live' },
  { id: 'live-tracking', label: 'Tactical Oversight', href: '/admin/live-tracking', icon: Activity, status: 'Live' },
  { id: 'overview', label: 'Operations Summary', href: '/admin/overview', icon: LayoutDashboard, status: 'Ready' },
  { id: 'provisioning', label: 'Room Provisioning', href: '/admin/provisioning', icon: QrCode, status: 'Active' },
  { id: 'incident-ledger', label: 'Audit Ledger', href: '/admin/incident-ledger', icon: FileBarChart2, status: 'Beta' },
  { id: 'settings', label: 'System Settings', href: '/admin/settings', icon: Settings, status: 'Config' },
];

const STATUS_THEMES = {
  PENDING: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/40',
    text: 'text-red-400',
    header: 'bg-red-600',
    label: 'Immediate Action Required'
  },
  ACKNOWLEDGED: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    header: 'bg-amber-500',
    label: 'Responder En Route'
  },
  RESOLVED: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
    text: 'text-emerald-400',
    header: 'bg-emerald-600',
    label: 'Incident Resolved'
  },
};

export const AdminConsole = ({ apiBaseUrl, section }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState(section || 'live-incidents');

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
            <p className="font-black uppercase tracking-[0.3em] text-xs">Section Under Maintenance</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#050608] text-slate-100 flex overflow-hidden font-sans">
      
      {/* ── Tactical Sidebar ── */}
      <aside className="w-[300px] border-r border-white/5 bg-[#0c0d12] flex flex-col shrink-0">
        <div className="p-8 border-b border-white/5">
           <div className="flex items-center gap-3 mb-6">
              <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-600/20">
                 <ShieldAlert className="w-5 h-5 text-white" />
              </div>
              <div>
                 <h1 className="font-black uppercase tracking-tighter text-lg leading-none">Admin Console</h1>
                 <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">CrisisBridge Command</p>
              </div>
           </div>
           
           <a href="/responder" className="flex items-center justify-center gap-2 w-full bg-slate-900 border border-white/10 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95">
              <AppWindow className="w-3.5 h-3.5" />
              Switch to Responder Ops
           </a>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all duration-200 group ${
                  isActive 
                    ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/10' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                   <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-blue-400'}`} />
                   <span className="text-xs font-black uppercase tracking-widest">{item.label}</span>
                </div>
                {isActive && <ChevronRight className="w-4 h-4" />}
              </button>
            );
          })}
        </nav>

        <div className="p-4 mt-auto">
           <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                 <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">System Link: Active</span>
              </div>
              <p className="text-[9px] text-slate-600 font-bold leading-tight uppercase">Encryption: AES-256 Verified</p>
           </div>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main className="flex-1 flex flex-col bg-[#050608] relative overflow-hidden">
         <header className="h-20 border-b border-white/5 flex items-center justify-between px-10 bg-[#0c0d12]/50 backdrop-blur-md">
            <div>
               <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Property Management</h2>
               <h3 className="text-2xl font-black tracking-tight text-white uppercase">Hotel Operations</h3>
            </div>
            <div className="flex items-center gap-4">
               <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 leading-none">Security Station</p>
                  <p className="text-xs font-bold text-white uppercase mt-1">Primary North</p>
               </div>
               <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-black text-xs">A</div>
            </div>
         </header>

         <section className="flex-1 overflow-y-auto p-10 custom-scrollbar">
            {renderSection()}
         </section>
      </main>
    </div>
  );
};

/* ── Integrated Tactical Panels ── */

function LiveIncidentsPanel({ alerts, onAction }) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
         <div className="bg-slate-900/50 p-8 rounded-full border border-dashed border-slate-800 mb-6">
            <CheckCircle2 className="w-12 h-12 text-slate-700" />
         </div>
         <p className="text-slate-500 font-black uppercase tracking-[0.3em] text-xs">No Active Alerts In System</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {alerts.map((alert) => {
        const theme = STATUS_THEMES[alert.status] || STATUS_THEMES.PENDING;
        
        return (
          <article 
            key={alert.dbKey} 
            className={`group flex flex-col rounded-[2.5rem] border-2 bg-[#0c0d12] overflow-hidden transition-all duration-300 hover:scale-[1.02] ${theme.border} ${alert.status === 'PENDING' ? 'animate-alert-pulse' : ''}`}
          >
            <div className={`px-6 py-3 flex items-center justify-between ${theme.header}`}>
               <span className="text-[10px] font-black uppercase tracking-widest text-white">{alert.type} Emergency</span>
               <div className="bg-black/20 px-3 py-1 rounded-full text-[9px] font-black text-white uppercase">{alert.status}</div>
            </div>

            <div className="p-8 space-y-6 flex-1 flex flex-col">
               <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-3xl font-black tracking-tighter uppercase mb-1">{alert.location}</h4>
                    <div className="flex items-center gap-2 text-slate-500 font-bold text-xs">
                       <Clock className="w-3.5 h-3.5" />
                       {new Date(alert.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-900 rounded-2xl border border-white/5">
                     <MapPin className="w-5 h-5 text-blue-400" />
                  </div>
               </div>

               <div className="bg-slate-900/80 border border-white/5 rounded-2xl p-4 shadow-inner">
                  <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Guest Narrative</p>
                  <p className="text-sm font-medium text-slate-300 leading-relaxed italic line-clamp-3">
                    "{alert.description || 'No context provided.'}"
                  </p>
               </div>

               <div className="mt-auto pt-6 space-y-3">
                  {alert.status === 'PENDING' && (
                    <button 
                      onClick={() => onAction(alert.dbKey, 'ACKNOWLEDGED')}
                      className="w-full bg-white text-black py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-100 transition-all active:scale-95 shadow-xl shadow-white/5"
                    >
                      Acknowledge Alert
                    </button>
                  )}
                  {alert.status === 'ACKNOWLEDGED' && (
                    <button 
                      onClick={() => onAction(alert.dbKey, 'RESOLVED')}
                      className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-500 transition-all active:scale-95 shadow-xl shadow-emerald-600/10"
                    >
                      Finalize Resolution
                    </button>
                  )}
                  {alert.status === 'RESOLVED' && (
                    <div className="w-full bg-slate-900 border border-emerald-500/20 py-4 rounded-2xl text-emerald-400 flex items-center justify-center gap-2">
                       <ShieldCheck className="w-4 h-4" />
                       <span className="text-[10px] font-black uppercase tracking-widest">Case Archived</span>
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
