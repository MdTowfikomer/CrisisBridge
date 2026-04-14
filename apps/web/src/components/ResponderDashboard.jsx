import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ref, onValue, update } from 'firebase/database';
import { Shield, CheckCircle2, Clock, MapPin, AlertCircle } from 'lucide-react';
import { rtdb } from '../lib/firebase';

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

const STATUS_STYLES = {
  PENDING: {
    header: 'bg-red-600 text-white',
    badge: 'bg-red-500/20 text-red-200 border border-red-500/40',
    card: 'border-red-500/40',
  },
  ACKNOWLEDGED: {
    header: 'bg-amber-500 text-slate-950',
    badge: 'bg-amber-500/20 text-amber-200 border border-amber-500/40',
    card: 'border-amber-500/30',
  },
  RESOLVED: {
    header: 'bg-emerald-600 text-white',
    badge: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40',
    card: 'border-emerald-500/25',
  },
};

export const ResponderDashboard = ({ apiBaseUrl = 'http://localhost:3001' }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [finalizedRecord, setFinalizedRecord] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState('');

  useEffect(() => {
    const alertsRef = ref(rtdb, 'alerts');
    const unsubscribe = onValue(
      alertsRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const list = Object.entries(data)
            .map(([dbKey, value]) => ({
              dbKey,
              incidentId: value.id || dbKey,
              ...value,
            }))
            .sort((a, b) => b.timestamp - a.timestamp);
          setAlerts(list);
        } else {
          setAlerts([]);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Failed to subscribe to alerts:', error);
        setActionError('Real-time feed disconnected. Refresh this page and confirm network status.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleAction = async (dbKey, incidentId, newStatus) => {
    if (actionLoadingId) {
      return;
    }

    setActionError('');
    setActionLoadingId(dbKey);

    try {
      await update(ref(rtdb, `alerts/${dbKey}`), {
        status: newStatus,
        updatedAt: Date.now(),
      });

      if (newStatus === 'ACKNOWLEDGED') {
        const acknowledgeResponse = await fetch(`${apiBaseUrl}/acknowledge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alertId: incidentId }),
        });

        if (!acknowledgeResponse.ok) {
          throw new Error('Escalation service was not notified. Please retry acknowledgement.');
        }
      }

      if (newStatus === 'RESOLVED') {
        const response = await fetch(`${apiBaseUrl}/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alertId: incidentId,
            summary: 'Incident resolved by responder.',
            actions: ['On-site assessment', 'Verbal confirmation of safety'],
          }),
        });

        if (!response.ok) {
          throw new Error('Incident could not be finalized. Retry resolve.');
        }

        const result = await response.json();
        if (!result?.success || !result?.record) {
          throw new Error('Incident finalized response was invalid. Retry resolve.');
        }

        setFinalizedRecord(result.record);
      }
    } catch (error) {
      console.error('Failed to update alert:', error);
      setActionError(getRequestErrorMessage(error, 'Status update failed. Try again now.'));
    } finally {
      setActionLoadingId('');
    }
  };

  const pendingCount = alerts.filter((alert) => alert.status === 'PENDING').length;
  const acknowledgedCount = alerts.filter((alert) => alert.status === 'ACKNOWLEDGED').length;
  const activeCount = alerts.filter((alert) => alert.status !== 'RESOLVED').length;

  if (loading && alerts.length === 0) {
    return (
      <div data-view="responder" className="min-h-screen bg-[hsl(224,40%,7%)] text-slate-100">
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-[3px] border-blue-500 border-t-transparent" />
            <p className="mt-3 text-xs font-medium uppercase tracking-widest text-slate-500">Loading command feed...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-view="responder" className="min-h-screen bg-[hsl(224,40%,7%)] text-slate-100">
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        {finalizedRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm sm:p-6">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700/50 bg-[hsl(222,28%,14%)] shadow-2xl">
              <div className="flex items-center justify-between bg-emerald-600 px-5 py-4 sm:px-7">
                <h2 className="text-base font-bold uppercase tracking-wider text-white sm:text-lg">Incident Finalized</h2>
                <CheckCircle2 className="h-5 w-5 text-white" />
              </div>

              <div className="max-h-[76vh] overflow-y-auto p-5 sm:p-7">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Location</p>
                    <p className="mt-1 text-lg font-bold tracking-tight text-white">{finalizedRecord.alert.location}</p>
                  </div>
                  <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Incident Type</p>
                    <p className="mt-1 text-lg font-bold tracking-tight text-white">{finalizedRecord.alert.type}</p>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-blue-500/25 bg-blue-500/10 p-4 sm:p-5">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-blue-300">AI Automated Report</p>
                  <p className="mt-2 text-sm leading-relaxed text-blue-50 sm:text-base">&ldquo;{finalizedRecord.ai_report}&rdquo;</p>
                </div>

                <button
                  type="button"
                  onClick={() => setFinalizedRecord(null)}
                  className="mt-5 w-full cursor-pointer rounded-xl bg-white px-4 py-3 text-sm font-semibold uppercase tracking-wider text-slate-900 transition-colors duration-200 hover:bg-slate-200"
                >
                  Close and Return to Ops
                </button>
              </div>
            </div>
          </div>
        )}

        <header className="rounded-2xl border border-slate-700/50 bg-[hsl(222,28%,14%)] p-5 shadow-lg sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Live Command Center</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Responder Ops</h1>
            </div>
            <div className="inline-flex items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/50 px-4 py-3">
              <Shield className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-medium text-slate-200">Security Station Alpha</span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
              <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Active Alerts</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-white">{activeCount}</p>
            </div>
            <div className="rounded-xl border border-red-500/25 bg-red-500/8 p-4">
              <p className="text-[10px] font-medium uppercase tracking-widest text-red-300">Pending</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-white">{pendingCount}</p>
            </div>
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-4">
              <p className="text-[10px] font-medium uppercase tracking-widest text-amber-300">Acknowledged</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-white">{acknowledgedCount}</p>
            </div>
          </div>
        </header>

        {actionError && (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-red-400" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-red-300">Action failed</p>
                <p className="mt-1 text-sm text-red-200">{actionError}</p>
              </div>
            </div>
          </div>
        )}

        <section className="mt-5">
          {alerts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700/50 bg-[hsl(222,28%,14%)] px-4 py-14 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-slate-700" />
              <p className="mt-4 text-xs font-medium uppercase tracking-widest text-slate-600">No Active Emergencies</p>
              <p className="mt-2 text-sm text-slate-500">Stand by for incoming alerts.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {alerts.map((alert) => {
                const styles = STATUS_STYLES[alert.status] || STATUS_STYLES.PENDING;
                const isBusy = actionLoadingId === alert.dbKey;

                return (
                  <article
                    key={alert.dbKey}
                    className={cn(
                      'overflow-hidden rounded-2xl border bg-[hsl(222,28%,14%)] shadow-lg transition-colors duration-200',
                      styles.card,
                      alert.status === 'PENDING' && 'animate-alert-pulse'
                    )}
                  >
                    <div className={cn('flex items-center justify-between px-4 py-3', styles.header)}>
                      <span className="text-[10px] font-semibold uppercase tracking-widest">{alert.type} Alert</span>
                      <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider', styles.badge)}>
                        {alert.status}
                      </span>
                    </div>

                    <div className="space-y-4 p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-bold tracking-tight text-white">{alert.location}</h3>
                          <div className="mt-1 flex items-center gap-2 text-xs font-medium text-slate-500">
                            <Clock className="h-3.5 w-3.5" />
                            {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div className="rounded-lg bg-slate-800/60 p-2.5">
                          <MapPin className="h-4 w-4 text-blue-400" />
                        </div>
                      </div>

                      {alert.triage && (
                        <div className="rounded-xl border border-blue-500/25 bg-blue-500/8 p-3">
                          <p className="text-[10px] font-medium uppercase tracking-widest text-blue-300">AI Action Card</p>
                          <p className="mt-1 text-sm font-medium leading-relaxed text-blue-100">
                            {alert.triage.task_card?.action_item || alert.triage.immediate_action}
                          </p>
                        </div>
                      )}

                      <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3">
                        <p className="text-[10px] font-medium uppercase tracking-widest text-slate-600">Guest context</p>
                        <p className="mt-1 text-sm text-slate-300">
                          {alert.description ? `"${alert.description}"` : 'No description provided by guest.'}
                        </p>
                      </div>

                      <div className="pt-1">
                        {alert.status === 'PENDING' && (
                          <button
                            type="button"
                            onClick={() => handleAction(alert.dbKey, alert.incidentId, 'ACKNOWLEDGED')}
                            disabled={isBusy}
                            className="w-full cursor-pointer rounded-xl bg-white px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-900 transition-colors duration-200 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? 'Acknowledging...' : 'Acknowledge'}
                          </button>
                        )}

                        {alert.status === 'ACKNOWLEDGED' && (
                          <button
                            type="button"
                            onClick={() => handleAction(alert.dbKey, alert.incidentId, 'RESOLVED')}
                            disabled={isBusy}
                            className="w-full cursor-pointer rounded-xl bg-emerald-600 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white transition-colors duration-200 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? 'Resolving...' : 'Resolve'}
                          </button>
                        )}

                        {alert.status === 'RESOLVED' && (
                          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-emerald-300">
                            Resolved
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
