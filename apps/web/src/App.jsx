import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ref, push, set, onValue } from 'firebase/database';
import { AlertCircle, Shield, HeartPulse, CheckCircle2, Flame, Siren } from 'lucide-react';
import { FlareTrigger } from './components/FlareTrigger';
import { ResponderDashboard } from './components/ResponderDashboard';
import { AdminConsole } from './components/AdminConsole';
import { rtdb } from './lib/firebase';

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
  const [view, setView] = useState('guest');
  const [adminSection, setAdminSection] = useState('live-incidents');
  const [location, setLocation] = useState('Unknown Location');
  const [propertyId, setPropertyId] = useState('UNKNOWN-PROPERTY');
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

    const property = params.get('property');
    if (property) {
      setPropertyId(property.toUpperCase());
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
      description: normalizedDescription || undefined,
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

  /* ═══════════════════════════════════════════════════════
     GUEST CONFIRMATION SCREEN (After trigger)
     Clean white background with semantic status colors
     ═══════════════════════════════════════════════════════ */
  if (isSent) {
    const canRetry = Boolean(submitError && isOnline && lastAlert?.type);
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

            {!isOnline && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
                  <p className="text-sm font-medium text-amber-800">
                    Data is offline. Use direct call or SMS while retrying alert delivery.
                  </p>
                </div>
              </div>
            )}

            {isTriageLoading && !triageData && (
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-blue-500 border-t-transparent" />
                <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
                  AI triaging emergency...
                </p>
              </div>
            )}

            {submitError && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 text-red-500" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-red-600">Dispatch error</p>
                    <p className="mt-1 text-sm text-red-700">{submitError}</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <a
                    href="tel:911"
                    className="cursor-pointer rounded-lg bg-red-600 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white transition-colors duration-200 hover:bg-red-700"
                  >
                    Call Emergency
                  </a>
                  <a
                    href={`sms:123456789?body=HELP: ${location} - ${lastAlert?.type || 'Emergency'}.`}
                    className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-700 transition-colors duration-200 hover:bg-slate-50"
                  >
                    Send SMS Fallback
                  </a>
                </div>
              </div>
            )}

            {!isTriageLoading && !submitError && triageData && (
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

            {!isTriageLoading && !submitError && !triageData && (
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Active emergency</p>
                <div className="mt-2 flex items-center gap-3">
                  <AlertTypeIcon type={lastAlert?.type} className="h-6 w-6 text-slate-700" />
                  <p className="text-xl font-bold uppercase tracking-tight text-slate-900">{lastAlert?.type}</p>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {canRetry && (
                <button
                  type="button"
                  onClick={() => handleTrigger(lastAlert.type)}
                  disabled={isTriageLoading}
                  className="w-full cursor-pointer rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-blue-700 transition-colors duration-200 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Retry Alert
                </button>
              )}
              <button
                type="button"
                onClick={resetAlertFlow}
                className="w-full cursor-pointer rounded-lg bg-slate-900 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white transition-colors duration-200 hover:bg-slate-800"
              >
                Send Another Alert
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════
     GUEST MAIN SCREEN (Before trigger)
     Clean, minimal white with medical-grade trust signals
     ═══════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-5 sm:px-6 sm:py-6">
        {entryMethod === 'NFC' && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <div className="flex items-center justify-center gap-3">
              <div className="h-2 w-2 animate-ping rounded-full bg-blue-500" />
              <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-700">NFC Proximity Link Active</p>
            </div>
          </div>
        )}

        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">CrisisBridge</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
              <Shield className="h-4 w-4 text-blue-500" />
              {location}
            </div>
          </div>
          <p className="mt-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Property: {propertyId}
          </p>

          <h1 className="mt-4 text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">
            Emergency Signal Flare
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Press and hold one emergency type for 0.5 seconds. This reduces accidental alerts during high-stress moments.
          </p>
        </header>

        {!isOnline && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">No Data Connection</p>
                <p className="mt-1 text-sm text-amber-600">Use call or SMS fallback immediately if this issue continues.</p>
              </div>
            </div>
          </div>
        )}

        <main className="mt-4 grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Quick Fallback</p>
            <h2 className="mt-2 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Use if data fails</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Keep these direct channels ready for total network outages.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <a
                href="tel:911"
                className="cursor-pointer rounded-lg bg-red-600 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white transition-colors duration-200 hover:bg-red-700"
              >
                Call Emergency Services
              </a>
              <a
                href={`sms:123456789?body=HELP: ${location} - Data is Offline.`}
                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-700 transition-colors duration-200 hover:bg-slate-50"
              >
                Send Pre-Filled SMS
              </a>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Current location</p>
              <p className="mt-1 text-base font-bold tracking-tight text-slate-900">{location}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <label
              htmlFor="description"
              className="text-[10px] font-semibold uppercase tracking-widest text-slate-400"
            >
              Optional details
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={DESCRIPTION_LIMIT}
              rows={4}
              placeholder="e.g. Chest pain with numb left arm, smoke from corridor, suspicious person near elevator."
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition-colors duration-200 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <span>Share short facts only. Responders see this instantly.</span>
              <span className="font-semibold text-slate-500">{description.length}/{DESCRIPTION_LIMIT}</span>
            </div>

            <div className="mt-6">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Choose category and hold for 0.5 seconds
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <FlareTrigger type="FIRE" label="Fire" onTrigger={handleTrigger} disabled={isTriageLoading} />
                <FlareTrigger type="SECURITY" label="Security" onTrigger={handleTrigger} disabled={isTriageLoading} />
                <FlareTrigger type="MEDICAL" label="Medical" onTrigger={handleTrigger} disabled={isTriageLoading} />
              </div>
            </div>
          </section>
        </main>

        <footer className="mt-5 pb-2">
          <div className="h-px w-full bg-slate-200" />
          <p className="mt-3 text-center text-[10px] font-medium uppercase tracking-widest text-slate-400">
            CrisisBridge Prototype v1.0 &middot; Emergency Response UI
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
