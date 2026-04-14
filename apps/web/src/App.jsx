import React, { useState, useEffect } from 'react';
import { FlareTrigger } from './components/FlareTrigger';
import { ResponderDashboard } from './components/ResponderDashboard';
import { rtdb } from './lib/firebase';
import { ref, push, set } from 'firebase/database';
import { AlertCircle, Shield, HeartPulse, CheckCircle2, Flame, Siren } from 'lucide-react';

function cn(...inputs) {
  return inputs.filter(Boolean).join(' ');
}

function App() {
  const [view, setView] = useState('guest');
  const [location, setLocation] = useState('Unknown Location');
  const [entryMethod, setEntryMethod] = useState('QR');
  const [description, setDescription] = useState('');
  const [isSent, setIsSent] = useState(false);
  const [isTriageLoading, setIsTriageLoading] = useState(false);
  const [lastAlert, setLastAlert] = useState(null);
  const [triageData, setTriageData] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const params = new URLSearchParams(window.location.search);
    
    // Simple view switching for demo
    const viewParam = params.get('view');
    if (viewParam === 'responder') {
      setView('responder');
    }

    // NFC Entry Detection
    const entryParam = params.get('entry');
    if (entryParam === 'nfc') {
      setEntryMethod('NFC');
    }

    const room = params.get('room') || params.get('area');
    if (room) {
      setLocation(room.startsWith('Room') ? room : `Room ${room}`);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleTrigger = async (type) => {
    const alertData = {
      type,
      location,
      description,
      timestamp: Date.now(),
      status: 'PENDING',
      entryMethod
    };

    setIsTriageLoading(true);
    setIsSent(true); 
    setLastAlert(alertData);

    try {
      if (!isOnline) {
        throw new Error('Offline mode active');
      }

      // 1. Call Backend for AI Triage
      const response = await fetch('http://localhost:3001/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertData)
      });
      
      const result = await response.json();
      
      // 2. Write to Firebase RTDB for Real-time Dashboard Sync
      const finalAlertData = {
        ...alertData,
        id: result.alertId,
        triage: result.triage
      };

      const alertsRef = ref(rtdb, 'alerts');
      const newAlertRef = push(alertsRef);
      await set(newAlertRef, finalAlertData);

      if (result.success) {
        setTriageData(result.triage);
      }
    } catch (error) {
      console.error('Triage/Sync Error:', error);
    } finally {
      setIsTriageLoading(false);
    }
  };

  if (view === 'responder') {
    return <ResponderDashboard />;
  }

  if (isSent) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center text-white relative">
        {!isOnline && (
          <div className="absolute top-10 px-4 py-2 bg-amber-500/20 border border-amber-500 rounded-full flex items-center gap-2">
            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Offline: Alert Queued</span>
          </div>
        )}
        
        <CheckCircle2 className="w-24 h-24 text-green-500 mb-6 animate-bounce" />
        <h1 className="text-4xl font-bold mb-2 uppercase tracking-tighter">Signal Received</h1>
        <p className="text-xl text-slate-300 mb-8">
          Help is being dispatched to <br />
          <span className="text-white font-black text-2xl">{location}</span>.
        </p>

        {isTriageLoading ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm font-medium animate-pulse uppercase tracking-widest">AI Triaging Emergency...</p>
          </div>
        ) : triageData ? (
          <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="bg-slate-800 rounded-3xl border-2 border-slate-700 overflow-hidden shadow-2xl">
              <div className={cn(
                "px-6 py-3 text-[10px] font-black uppercase tracking-[0.3em] flex justify-between items-center",
                triageData.severity === 'CRITICAL' ? 'bg-red-600' : 'bg-blue-600'
              )}>
                <span>AI Intelligence Report</span>
                <span className="bg-white/20 px-2 py-0.5 rounded-full">{triageData.severity}</span>
              </div>
              
              <div className="p-6">
                <div className="flex items-center justify-center gap-3 mb-4">
                  {lastAlert?.type === 'FIRE' && <Flame className="w-10 h-10 text-red-500" />}
                  {lastAlert?.type === 'SECURITY' && <Siren className="w-10 h-10 text-blue-500" />}
                  {lastAlert?.type === 'MEDICAL' && <HeartPulse className="w-10 h-10 text-green-500" />}
                  <p className="text-3xl font-black text-white">{triageData.classification}</p>
                </div>
                
                <p className="text-slate-300 text-lg font-medium italic border-l-4 border-blue-500 pl-4 py-2 bg-blue-500/10 rounded-r-lg">
                  "{triageData.immediate_action}"
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-8 p-6 bg-slate-800 rounded-2xl border-2 border-slate-700 w-full max-w-md shadow-2xl">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Active Emergency</p>
            <div className="flex items-center justify-center gap-3">
              {lastAlert?.type === 'FIRE' && <Flame className="w-8 h-8 text-red-500" />}
              {lastAlert?.type === 'SECURITY' && <Siren className="w-8 h-8 text-blue-500" />}
              {lastAlert?.type === 'MEDICAL' && <HeartPulse className="w-8 h-8 text-green-500" />}
              <p className="text-3xl font-black text-white">{lastAlert?.type}</p>
            </div>
          </div>
        )}

        <button 
          onClick={() => setIsSent(false)}
          className="mt-12 text-slate-500 hover:text-slate-300 transition-colors uppercase text-[10px] font-bold tracking-[0.2em]"
        >
          Cancel or Submit New Alert
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col p-6 font-sans">
      {entryMethod === 'NFC' && (
        <div className="mb-6 p-3 bg-blue-600 rounded-2xl flex items-center justify-center gap-3 animate-in slide-in-from-top duration-500 shadow-lg border-2 border-blue-400">
          <div className="w-2 h-2 bg-white rounded-full animate-ping" />
          <p className="text-[10px] font-black text-white uppercase tracking-[0.2em]">NFC Proximity Link Active</p>
        </div>
      )}

      {!isOnline && (
        <div className="mb-6 p-4 bg-amber-100 border-2 border-amber-500 rounded-2xl">
          <div className="flex items-center gap-3 mb-3">
            <AlertCircle className="w-6 h-6 text-amber-600" />
            <p className="text-sm font-black text-amber-900 uppercase tracking-tighter">No Data Connection</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <a 
              href="tel:911" 
              className="bg-amber-600 text-white font-bold py-3 rounded-xl text-center text-xs uppercase"
            >
              Call 911
            </a>
            <a 
              href={`sms:123456789?body=HELP: ${location} - Data is Offline.`} 
              className="bg-slate-900 text-white font-bold py-3 rounded-xl text-center text-xs uppercase"
            >
              Send SMS
            </a>
          </div>
        </div>
      )}

      <header className="mb-8 pt-6">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-4 bg-red-600 rounded-full animate-ping" />
          <span className="text-xs font-black tracking-[0.3em] text-slate-900 uppercase">CrisisBridge</span>
        </div>
        <h1 className="text-5xl font-black text-slate-900 leading-[0.9] tracking-tighter">
          SIGNAL <br />FLARE
        </h1>
        <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-slate-900 rounded-xl text-white text-sm font-bold shadow-lg">
          <Shield className="w-4 h-4 text-blue-400" />
          {location}
        </div>
      </header>

      <main className="flex-1 flex flex-col gap-6">
        <section>
          <label className="text-slate-500 text-[10px] font-black mb-2 block uppercase tracking-[0.2em]">
            Optional: Describe the emergency
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Someone is unresponsive, kitchen grease fire, suspicious person near elevator..."
            className="w-full h-24 p-4 bg-white border-2 border-slate-200 rounded-2xl focus:border-blue-500 outline-none transition-colors resize-none text-slate-900 font-medium placeholder:text-slate-300"
          />
        </section>

        <section className="flex-1 flex flex-col">
          <p className="text-slate-500 text-[10px] font-black mb-4 uppercase tracking-[0.2em]">
            Select type and hold for 0.5s
          </p>
          
          <div className="flex-1 grid grid-cols-1 gap-4">
            <FlareTrigger 
              type="FIRE" 
              label="Fire" 
              onTrigger={handleTrigger} 
              className="h-full min-h-[100px]"
            />
            <FlareTrigger 
              type="SECURITY" 
              label="Security" 
              onTrigger={handleTrigger} 
              className="h-full min-h-[100px]"
            />
            <FlareTrigger 
              type="MEDICAL" 
              label="Medical" 
              onTrigger={handleTrigger} 
              className="h-full min-h-[100px]"
            />
          </div>
        </section>
      </main>

      <footer className="mt-8 pb-4">
        <div className="h-[1px] w-full bg-slate-200 mb-4" />
        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest text-center">
          Prototype v1.0 &middot; Secure &middot; Encrypted
        </p>
      </footer>
    </div>
  );
}

export default App;
