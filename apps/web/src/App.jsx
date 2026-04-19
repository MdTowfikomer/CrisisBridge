import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ref, push, set, onValue } from 'firebase/database';
import { 
  AlertCircle, 
  Shield, 
  HeartPulse, 
  CheckCircle2, 
  Flame, 
  Siren, 
  Loader2, 
  Navigation, 
  MessageSquare,
  Map as MapIcon
} from 'lucide-react';
import { FlareTrigger } from './components/FlareTrigger';
import { ResponderDashboard } from './components/ResponderDashboard';
import { AdminConsole } from './components/AdminConsole';
import { GuestMapView } from './components/GuestMapView';
import { SafetyFooter } from './components/SafetyFooter';
import { rtdb } from './lib/firebase';
import { useAppStore } from './store/useAppStore';

const DESCRIPTION_LIMIT = 240;
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || '/api';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

function getRequestErrorMessage(error, fallbackMessage) {
  if (error instanceof TypeError) {
    return 'Cannot reach response server. Start backend with: pnpm --filter server dev'; 
  }
  if (error instanceof Error) return error.message;
  return fallbackMessage;
}

function AlertTypeIcon({ type, className }) {
  if (type === 'FIRE') return <Flame className={className} />;
  if (type === 'SECURITY') return <Siren className={className} />;
  return <HeartPulse className={className} />;
}

function App() {
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const initialProperty = urlParams.get('property')?.toUpperCase() || 'HOTEL-101';
  const rawRoom = urlParams.get('room') || urlParams.get('area');
  const initialLocation = rawRoom ? (rawRoom.startsWith('Room') ? rawRoom : `Room ${rawRoom}`) : 'Lobby / General';

  const x = urlParams.get('x');
  const y = urlParams.get('y');
  const floor = urlParams.get('floor');
  const initialStartLocation = x && y ? { x: Number(x), y: Number(y), floor: Number(floor) || 1 } : { x: 500, y: 400, floor: 1 };

  const [view, setView] = useState('guest');
  const [adminSection, setAdminSection] = useState('live-incidents');
  const [location, setLocation] = useState(initialLocation);
  const [propertyId, setPropertyId] = useState(initialProperty);
  const [entryMethod, setEntryMethod] = useState('QR');
  const [description, setDescription] = useState('');
  const [isSent, setIsSent] = useState(false);
  const [isTriageLoading, setIsTriageLoading] = useState(false);
  const [lastAlert, setLastAlert] = useState(null);
  const [triageData, setTriageData] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [activeAlertKey, setActiveAlertKey] = useState('');
  const [liveStatus, setLiveStatus] = useState('PENDING');
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    const route = window.location.pathname.replace(/\/+$/, '') || '/';
    const routeParts = route.split('/').filter(Boolean);

    if (routeParts[0] === 'admin') {
      setView('admin');
      setAdminSection(routeParts[1] || 'live-incidents');
    } else if (routeParts[0] === 'responder') {
      setView('responder');
    }

    if (urlParams.get('entry') === 'nfc') setEntryMethod('NFC');
  }, []);

  useEffect(() => {
    if (!activeAlertKey) return undefined;
    const liveAlertRef = ref(rtdb, `alerts/${activeAlertKey}`);
    const unsubscribe = onValue(liveAlertRef, (snapshot) => {
      const alert = snapshot.val();
      if (alert?.status) setLiveStatus(alert.status);
    });
    return () => unsubscribe();
  }, [activeAlertKey]);

  const handleTrigger = async (type) => {
    if (isTriageLoading) return;

    const alertData = {
      type,
      location,
      description: description.trim(),
      timestamp: Date.now(),
      status: 'PENDING',
      entryMethod,
      property: propertyId,
    };

    setSubmitError('');
    setIsSent(true);
    setIsTriageLoading(true);
    setLastAlert(alertData);

    try {
      const response = await fetch(`${API_BASE_URL}/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertData),
      });

      if (!response.ok) throw new Error('Connection failed. Alert queued for retry.');

      const result = await response.json();
      const finalAlertData = { ...alertData, id: result.alertId, triage: result.triage };

      const alertsRef = ref(rtdb, 'alerts');
      const newAlertRef = push(alertsRef);
      await set(newAlertRef, finalAlertData);
      setActiveAlertKey(newAlertRef.key || '');
      setTriageData(result.triage);
      useAppStore.getState().setCrisisMode(true);
    } catch (error) {
      setSubmitError(getRequestErrorMessage(error, 'Offline Mode: Signal queued. Please use safety buttons below.'));
    } finally {
      setIsTriageLoading(false);
    }
  };

  if (view === 'responder') return <ResponderDashboard apiBaseUrl={API_BASE_URL} />;
  if (view === 'admin') return <AdminConsole apiBaseUrl={API_BASE_URL} section={adminSection} />;

  return (
    <div className="min-h-screen bg-[#0c0d12] text-white flex flex-col font-sans selection:bg-blue-500/30">
      
      {/* ── Main Guest View ── */}
      {isNavigating ? (
        <GuestMapView
          startLocation={initialStartLocation}
          propertyId={propertyId}
          apiBaseUrl={API_BASE_URL}
        />
      ) : (
        <main className="flex-1 flex flex-col p-6 max-w-lg mx-auto w-full">
          
          {/* Header */}
          <header className="mb-10 pt-8">
            <div className="flex items-center gap-2 mb-4">
               <div className="bg-blue-600 p-1.5 rounded-lg shadow-lg shadow-blue-600/20">
                 <Shield className="w-4 h-4 text-white" />
               </div>
               <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">CrisisBridge Verified</span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white mb-2 leading-none">{location}</h1>
            <p className="text-slate-400 font-medium">Hold a button to signal for help immediately.</p>
          </header>

          {!isSent ? (
            /* Distress-First Interaction */
            <div className="flex-1 flex flex-col">
              <div className="grid grid-cols-1 gap-4">
                <FlareTrigger type="MEDICAL" label="Medical Help" onTrigger={handleTrigger} />
                <FlareTrigger type="FIRE" label="Fire / Smoke" onTrigger={handleTrigger} />
                <FlareTrigger type="SECURITY" label="Security" onTrigger={handleTrigger} />
              </div>

              <div className="mt-10 space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <MessageSquare className="w-4 h-4 text-slate-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Emergency Details (Optional)</span>
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_LIMIT))}
                  placeholder="Example: Chest pain, smoke in hallway, intruder..."
                  className="w-full bg-slate-900/80 border-2 border-slate-800 rounded-[1.5rem] p-5 text-base font-medium focus:outline-none focus:border-blue-500/50 transition-all min-h-[120px] shadow-inner"
                />
                <div className="flex justify-between items-center px-2">
                   <button 
                     onClick={() => setIsNavigating(true)}
                     className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors"
                   >
                     <MapIcon className="w-4 h-4" />
                     <span className="text-[10px] font-black uppercase tracking-widest">Explore Map First</span>
                   </button>
                   <span className="text-[10px] font-black text-slate-700 tracking-widest">
                     {description.length} / {DESCRIPTION_LIMIT}
                   </span>
                </div>
              </div>
            </div>
          ) : (
            /* Post-Trigger Confirmation */
            <div className="flex-1 flex flex-col justify-center animate-in fade-in zoom-in duration-500">
               <div className="bg-slate-900/50 border-2 border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
                  
                  {/* Status Progress Bar */}
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-800">
                    <div className={cn(
                      "h-full transition-all duration-1000 ease-out", 
                      liveStatus === 'ACKNOWLEDGED' ? 'w-2/3 bg-emerald-500' : 
                      liveStatus === 'RESOLVED' ? 'w-full bg-blue-500' : 
                      'w-1/3 bg-amber-500 animate-pulse'
                    )} />
                  </div>

                  <div className="mb-8 flex justify-center">
                    {isTriageLoading ? (
                      <div className="relative">
                        <div className="w-20 h-20 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                        <Shield className="w-8 h-8 text-blue-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      </div>
                    ) : (
                      <div className={cn(
                        "p-6 rounded-full shadow-2xl", 
                        liveStatus === 'RESOLVED' ? 'bg-blue-500/10' : 'bg-emerald-500/10'
                      )}>
                        <CheckCircle2 className={cn("w-14 h-14", liveStatus === 'RESOLVED' ? 'text-blue-500' : 'text-emerald-500')} />
                      </div>
                    )}
                  </div>

                  <h2 className="text-center text-xs font-black uppercase tracking-[0.4em] text-slate-500 mb-2">Emergency Transmitted</h2>
                  <h1 className="text-center text-3xl font-black mb-8 leading-tight">{location}</h1>

                  <div className="bg-black/60 rounded-3xl p-5 border border-white/5 mb-8 shadow-inner">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center mb-1.5">Staff Status</p>
                    <p className={cn(
                      "text-center text-lg font-black uppercase tracking-wider", 
                      liveStatus === 'ACKNOWLEDGED' ? 'text-emerald-400' : 
                      liveStatus === 'RESOLVED' ? 'text-blue-400' : 
                      'text-amber-400'
                    )}>
                      {liveStatus === 'ACKNOWLEDGED' ? 'Help is Moving' : 
                       liveStatus === 'RESOLVED' ? 'Incident Closed' : 
                       'Awaiting Response'}
                    </p>
                  </div>

                  {!isTriageLoading && triageData && (
                    <div className="space-y-4 mb-10">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-600/20 p-2 rounded-xl">
                          <AlertTypeIcon type={lastAlert?.type} className="w-6 h-6 text-blue-400" />
                        </div>
                        <span className="font-black text-xl tracking-tight">{triageData.classification}</span>
                      </div>
                      <div className="relative">
                         <div className="absolute -left-4 top-0 bottom-0 w-1 bg-blue-600/40 rounded-full" />
                         <p className="text-lg font-medium leading-relaxed text-blue-100 italic">
                           "{triageData.immediate_action}"
                         </p>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setIsNavigating(true)}
                    className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-base flex items-center justify-center gap-4 shadow-2xl shadow-blue-600/30 transition-all active:scale-95 group"
                  >
                    <Navigation className="w-6 h-6 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                    Open Tactical Map
                  </button>
               </div>

               {submitError && (
                 <div className="mt-8 p-5 bg-red-600/10 border-2 border-red-600/20 rounded-[1.5rem] flex items-start gap-4">
                    <AlertCircle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm font-bold text-red-200">{submitError}</p>
                 </div>
               )}
            </div>
          )}
        </main>
      )}

      {/* Persistent Safety Overlay */}
      <SafetyFooter />
    </div>
  );
}

export default App;
