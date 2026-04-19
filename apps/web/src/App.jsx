import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ref, push, set, onValue } from 'firebase/database';
import { AlertCircle, Shield, HeartPulse, CheckCircle2, Flame, Siren } from 'lucide-react';
import { FlareTrigger } from './components/FlareTrigger';
import { ResponderDashboard } from './components/ResponderDashboard';
import { AdminConsole } from './components/AdminConsole';
import { NavigationGuide } from './components/NavigationGuide';
import { GuestMapView } from './components/GuestMapView';
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

  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}

function AlertTypeIcon({ type, className }) {
  if (type === 'FIRE') {
    return <Flame className={className} />;
  }

  if (type === 'SECURITY') {
    return <Siren className={className} />;
  }

  return <HeartPulse className={className} />;
}

function App() {
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const initialProperty = urlParams.get('property')?.toUpperCase() || 'UNKNOWN-PROPERTY';
  const rawRoom = urlParams.get('room') || urlParams.get('area');
  const initialLocation = rawRoom ? (rawRoom.startsWith('Room') ? rawRoom : `Room ${rawRoom}`) : 'Unknown Location';

  const x = urlParams.get('x');
  const y = urlParams.get('y');
  const floor = urlParams.get('floor');
  const initialStartLocation = x && y ? { x: Number(x), y: Number(y), floor: Number(floor) || 1 } : { x: 100, y: 100, floor: 3 };

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
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const [isNavigating, setIsNavigating] = useState(false);
  const [startLocation, setStartLocation] = useState(initialStartLocation);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const params = new URLSearchParams(window.location.search);
    const route = window.location.pathname.replace(/\/+$/, '') || '/';
    const routeParts = route.split('/').filter(Boolean);

    if (routeParts[0] === 'admin') {
      setView('admin');
      setAdminSection(routeParts[1] || 'live-incidents');
    } else if (routeParts[0] === 'responder') {
      setView('responder');
    } else {
      const viewParam = params.get('view');
      if (viewParam === 'responder') {
        setView('responder');
      } else if (viewParam === 'admin') {
        setView('admin');
        setAdminSection('live-incidents');
        window.history.replaceState({}, '', '/admin');
      }
    }

    if (params.get('entry') === 'nfc') {
      setEntryMethod('NFC');
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!activeAlertKey) {
      return undefined;
    }

    const liveAlertRef = ref(rtdb, `alerts/${activeAlertKey}`);
    const unsubscribe = onValue(liveAlertRef, (snapshot) => {
      const alert = snapshot.val();
      if (alert?.status) {
        setLiveStatus(alert.status);
      }
    });

    return () => unsubscribe();
  }, [activeAlertKey]);

  const handleTrigger = async (type) => {
    if (isTriageLoading) {
      return;
    }

    const normalizedDescription = description.trim();
    const alertData = {
      type,
      location,
      description: normalizedDescription || '',
      timestamp: Date.now(),
      status: 'PENDING',
      entryMethod,
      property: propertyId,
    };

    setSubmitError('');
    setTriageData(null);
    setIsSent(true);
    setIsTriageLoading(true);
    setLastAlert(alertData);
    setLiveStatus('PENDING');

    try {
      if (!isOnline) {
        throw new Error('No data connection. Use emergency call or SMS fallback now.');
      }

      const response = await fetch(`${API_BASE_URL}/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertData),
      });

      if (!response.ok) {
        throw new Error('Could not connect to response center. Try again immediately.');
      }

      const result = await response.json();
      if (!result?.success || !result?.triage) {
        throw new Error('Signal reached the server, but triage failed. Retry now.');
      }

      const finalAlertData = {
        ...alertData,
        id: result.alertId,
        triage: result.triage,
      };

      const alertsRef = ref(rtdb, 'alerts');
      const newAlertRef = push(alertsRef);
      await set(newAlertRef, finalAlertData);
      setActiveAlertKey(newAlertRef.key || '');
      setTriageData(result.triage);
      
      // Global Crisis Trigger for Map View
      useAppStore.getState().setCrisisMode(true);
    } catch (error) {
      console.error('Triage/Sync Error:', error);
      setSubmitError(getRequestErrorMessage(error, 'Unable to send emergency alert right now.'));
    } finally {
      setIsTriageLoading(false);
    }
  };

  const resetAlertFlow = () => {
    setIsSent(false);
    setIsTriageLoading(false);
    setLastAlert(null);
    setTriageData(null);
    setSubmitError('');
    setActiveAlertKey('');
    setLiveStatus('PENDING');
    setDescription('');
  };

  if (view === 'responder') {
    return <ResponderDashboard apiBaseUrl={API_BASE_URL} />;
  }

  if (view === 'admin') {
    return <AdminConsole apiBaseUrl={API_BASE_URL} section={adminSection} />;
  }

  // GUEST FLOW
  // If we have sent an alert, we can show the confirmation screen, 
  // but for the map-first experience, GuestMapView handles its own emergency UI.
  // We'll keep the isSent check for cases where navigation is launched from the old trigger if still accessible.
  if (isSent && !isNavigating) {
    const statusLabel =
      liveStatus === 'ACKNOWLEDGED'
        ? 'Acknowledged by responder'
        : liveStatus === 'RESOLVED'
          ? 'Resolved by responder'
          : 'Awaiting acknowledgment';
    const statusTone =
      liveStatus === 'ACKNOWLEDGED'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : liveStatus === 'RESOLVED'
          ? 'border-blue-200 bg-blue-50 text-blue-800'
          : 'border-amber-200 bg-amber-50 text-amber-800';

    return (
      <div className="min-h-screen bg-white text-slate-900">
        <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-5 py-8 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-5 flex items-center justify-center">
              <div className="rounded-full bg-emerald-50 p-4">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              </div>
            </div>

            <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-emerald-600">
              Emergency signal submitted
            </p>
            <h1 className="mt-2 text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{location}</h1>
            <p className="mt-3 text-center text-sm leading-relaxed text-slate-500">
              Our response team is being notified now. Keep this screen open.
            </p>

            <div className={cn('mt-5 rounded-xl border p-3.5 text-center', statusTone)}>
              <p className="text-[10px] font-semibold uppercase tracking-widest">Live Response Status</p>
              <p className="mt-1 text-sm font-semibold">{statusLabel}</p>
            </div>

            {submitError && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 text-red-500" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-red-600">Dispatch error</p>
                    <p className="mt-1 text-sm text-red-700">{submitError}</p>
                  </div>
                </div>
              </div>
            )}

            {!isTriageLoading && triageData && (
              <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
                <div
                  className={cn(
                    'flex items-center justify-between px-4 py-3 text-[10px] font-semibold uppercase tracking-widest',
                    triageData.severity === 'CRITICAL' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                  )}
                >
                  <span>AI Intelligence Report</span>
                  <span className="rounded-full bg-white/20 px-2.5 py-1">{triageData.severity}</span>
                </div>

                <div className="space-y-4 bg-white p-5">
                  <div className="flex items-center gap-3">
                    <AlertTypeIcon type={lastAlert?.type} className="h-7 w-7 shrink-0 text-slate-700" />
                    <p className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{triageData.classification}</p>
                  </div>
                  <p className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm font-medium leading-relaxed text-blue-800">
                    &ldquo;{triageData.immediate_action}&rdquo;
                  </p>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setIsNavigating(true)}
                className="w-full flex items-center justify-center gap-2 cursor-pointer rounded-xl bg-blue-600 px-4 py-4 text-sm font-bold uppercase tracking-wider text-white hover:bg-blue-700 shadow-md"
              >
                Launch Tactical Navigation
              </button>
              <button
                type="button"
                onClick={resetAlertFlow}
                className="w-full cursor-pointer rounded-lg bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isNavigating || (view === 'guest' && !isSent)) {
    return (
      <GuestMapView
        startLocation={startLocation}
        propertyId={propertyId}
        apiBaseUrl={API_BASE_URL}
      />
    );
  }

  // Fallback
  return (
    <div className="min-h-screen bg-[#0c0d12] flex items-center justify-center text-white p-6">
      <div className="text-center">
        <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-[#4ade80]" />
        <p className="text-sm font-bold uppercase tracking-widest text-[#4ade80]/60">Resolving Request...</p>
      </div>
    </div>
  );
}

export default App;
