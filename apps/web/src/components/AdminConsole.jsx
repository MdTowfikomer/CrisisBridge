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
  UserCog,
  WifiOff,
} from 'lucide-react';
import { rtdb } from '../lib/firebase';
import { ProvisioningDashboard } from './ProvisioningDashboard';

const NAV_ITEMS = [
  { id: 'live-incidents', label: 'Live Incidents', href: '/admin', icon: BellRing, status: 'Live' },
  { id: 'overview', label: 'Overview', href: '/admin/overview', icon: LayoutDashboard, status: 'Live' },
  { id: 'provisioning', label: 'Room Provisioning', href: '/admin/provisioning', icon: QrCode, status: 'Live' },
  { id: 'nfc', label: 'NFC Stickers', href: '/admin/nfc', icon: Nfc, status: 'Live' },
  { id: 'incident-ledger', label: 'Incident Ledger', href: '/admin/incident-ledger', icon: FileBarChart2, status: 'Beta' },
  { id: 'escalation', label: 'Escalation Rules', href: '/admin/escalation', icon: ShieldAlert, status: 'Planned' },
  { id: 'rooms', label: 'Room Directory', href: '/admin/rooms', icon: DoorOpen, status: 'Planned' },
  { id: 'staff', label: 'Staff & Stations', href: '/admin/staff', icon: UserCog, status: 'Planned' },
  { id: 'offline', label: 'Offline Readiness', href: '/admin/offline', icon: WifiOff, status: 'Planned' },
  { id: 'settings', label: 'Property Settings', href: '/admin/settings', icon: Settings, status: 'Planned' },
];

const STATUS_STYLES = {
  PENDING: {
    card: 'border-red-500/40',
    header: 'bg-red-600 text-white',
    badge: 'bg-red-500/20 text-red-200 border border-red-500/40',
  },
  ACKNOWLEDGED: {
    card: 'border-amber-500/30',
    header: 'bg-amber-500 text-slate-950',
    badge: 'bg-amber-500/20 text-amber-200 border border-amber-500/40',
  },
  RESOLVED: {
    card: 'border-emerald-500/25',
    header: 'bg-emerald-600 text-white',
    badge: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40',
  },
};

function normalizeSection(section) {
  if (!section) {
    return 'live-incidents';
  }

  const match = NAV_ITEMS.find((item) => item.id === section);
  return match ? match.id : 'live-incidents';
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

function SectionPlaceholder({ title, description }) {
  return (
    <div className="rounded-2xl border border-slate-700/50 bg-[hsl(222,28%,14%)] p-6 shadow-lg">
      <h2 className="text-xl font-bold tracking-tight text-white">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">{description}</p>
      <p className="mt-5 text-[10px] font-medium uppercase tracking-widest text-slate-600">Coming next</p>
    </div>
  );
}

function OverviewPanel({ pendingCount, acknowledgedCount, resolvedCount }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-700/50 bg-[hsl(222,28%,14%)] p-5 shadow-lg sm:p-6">
        <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Hospitality Admin Console</p>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">Property Operations Dashboard</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">
          Live incident visibility is pinned to this admin console so operations teams can respond immediately.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-red-500/25 bg-red-500/8 p-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-red-300">Pending</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-white">{pendingCount}</p>
        </div>
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-amber-300">Acknowledged</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-white">{acknowledgedCount}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-emerald-300">Resolved</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-white">{resolvedCount}</p>
        </div>
      </div>
    </div>
  );
}

function LiveIncidentsPanel({
  alerts,
  loading,
  feedError,
  actionError,
  actionLoadingId,
  onAction,
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-red-500/30 bg-red-500/8 p-5 shadow-lg sm:p-6">
        <p className="text-[10px] font-medium uppercase tracking-widest text-red-300">Top Priority</p>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">Live Guest Alert Feed</h2>
        <p className="mt-2 text-sm leading-relaxed text-red-200/80">
          Every incoming guest alert appears here in real-time for immediate operational action.
        </p>
      </div>

      {feedError && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-400" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-red-300">Feed disconnected</p>
              <p className="mt-1 text-sm text-red-200">{feedError}</p>
            </div>
          </div>
        </div>
      )}

      {actionError && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-400" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-red-300">Action failed</p>
              <p className="mt-1 text-sm text-red-200">{actionError}</p>
            </div>
          </div>
        </div>
      )}

      {loading && alerts.length === 0 ? (
        <div className="rounded-2xl border border-slate-700/50 bg-[hsl(222,28%,14%)] px-4 py-14 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Loading live incident feed...</p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700/50 bg-[hsl(222,28%,14%)] px-4 py-14 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-slate-700" />
          <p className="mt-4 text-xs font-medium uppercase tracking-widest text-slate-600">No Active Guest Alerts</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {alerts.map((alert) => {
            const styles = STATUS_STYLES[alert.status] || STATUS_STYLES.PENDING;
            const isBusy = actionLoadingId === alert.dbKey;

            return (
              <article
                key={alert.dbKey}
                className={`overflow-hidden rounded-2xl border bg-[hsl(222,28%,14%)] shadow-lg transition-colors duration-200 ${styles.card} ${
                  alert.status === 'PENDING' ? 'animate-alert-pulse' : ''
                }`}
              >
                <div className={`flex items-center justify-between px-4 py-3 ${styles.header}`}>
                  <span className="text-[10px] font-semibold uppercase tracking-widest">{alert.type} Alert</span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${styles.badge}`}>
                    {alert.status}
                  </span>
                </div>

                <div className="space-y-4 p-4">
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

                  <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-slate-600">Guest context</p>
                    <p className="mt-1 text-sm text-slate-300">{alert.description || 'No guest description provided.'}</p>
                  </div>

                  <div className="pt-1">
                    {alert.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => onAction(alert.dbKey, alert.incidentId, 'ACKNOWLEDGED')}
                        disabled={isBusy}
                        className="w-full cursor-pointer rounded-xl bg-white px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-900 transition-colors duration-200 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isBusy ? 'Acknowledging...' : 'Acknowledge'}
                      </button>
                    )}

                    {alert.status === 'ACKNOWLEDGED' && (
                      <button
                        type="button"
                        onClick={() => onAction(alert.dbKey, alert.incidentId, 'RESOLVED')}
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
    </div>
  );
}

export const AdminConsole = ({ apiBaseUrl, section }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState('');
  const [activeSection, setActiveSection] = useState(normalizeSection(section));

  const navigateTo = (sectionId, href) => {
    setActiveSection(sectionId);
    window.history.pushState({ section: sectionId }, '', href);
  };

  useEffect(() => {
    const handlePopState = (event) => {
      if (event.state?.section) {
        setActiveSection(event.state.section);
      } else {
        const path = window.location.pathname.replace(/\/+$/, '');
        const parts = path.split('/').filter(Boolean);
        setActiveSection(normalizeSection(parts[1] || 'live-incidents'));
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
        setFeedError('');
        setLoading(false);
      },
      (error) => {
        console.error('Admin live feed subscription failed:', error);
        setFeedError('Unable to subscribe to incident feed. Check Firebase connectivity.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const pendingCount = useMemo(
    () => alerts.filter((alert) => alert.status === 'PENDING').length,
    [alerts]
  );
  const acknowledgedCount = useMemo(
    () => alerts.filter((alert) => alert.status === 'ACKNOWLEDGED').length,
    [alerts]
  );
  const resolvedCount = useMemo(
    () => alerts.filter((alert) => alert.status === 'RESOLVED').length,
    [alerts]
  );

  const handleAction = async (dbKey, incidentId, newStatus) => {
    if (actionLoadingId) {
      return;
    }

    setActionLoadingId(dbKey);
    setActionError('');

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
          throw new Error('Escalation service was not notified. Retry acknowledgment.');
        }
      }

      if (newStatus === 'RESOLVED') {
        const resolveResponse = await fetch(`${apiBaseUrl}/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alertId: incidentId,
            summary: 'Resolved by hospitality admin console.',
            actions: ['Admin acknowledgment', 'On-site response confirmed', 'Incident closed'],
          }),
        });

        if (!resolveResponse.ok) {
          throw new Error('Incident finalization failed. Retry resolve.');
        }
      }
    } catch (error) {
      console.error('Admin incident action failed:', error);
      setActionError(getRequestErrorMessage(error, 'Unable to update incident status.'));
    } finally {
      setActionLoadingId('');
    }
  };

  const renderSection = () => {
    if (activeSection === 'live-incidents') {
      return (
        <LiveIncidentsPanel
          alerts={alerts}
          loading={loading}
          feedError={feedError}
          actionError={actionError}
          actionLoadingId={actionLoadingId}
          onAction={handleAction}
        />
      );
    }

    if (activeSection === 'overview') {
      return (
        <OverviewPanel
          pendingCount={pendingCount}
          acknowledgedCount={acknowledgedCount}
          resolvedCount={resolvedCount}
        />
      );
    }

    if (activeSection === 'provisioning' || activeSection === 'nfc') {
      return <ProvisioningDashboard apiBaseUrl={apiBaseUrl} embedded />;
    }

    if (activeSection === 'incident-ledger') {
      return (
        <SectionPlaceholder
          title="Incident Ledger"
          description="Use /audit/:alertId verification to validate tamper-evident event chains while this full admin explorer is being finalized."
        />
      );
    }

    if (activeSection === 'escalation') {
      return (
        <SectionPlaceholder
          title="Escalation Rules"
          description="Configure per-property escalation chains, timeout profiles, and notification targets for emergency workflows."
        />
      );
    }

    if (activeSection === 'rooms') {
      return (
        <SectionPlaceholder
          title="Room Directory"
          description="Manage room metadata, floor maps, and physical artifact rollout status for every room in each property."
        />
      );
    }

    if (activeSection === 'staff') {
      return (
        <SectionPlaceholder
          title="Staff & Stations"
          description="Assign responders to coverage zones and security stations with shift-level operational visibility."
        />
      );
    }

    if (activeSection === 'offline') {
      return (
        <SectionPlaceholder
          title="Offline Readiness"
          description="Track queue replay health, fallback readiness, and service worker status across deployed properties."
        />
      );
    }

    return (
      <SectionPlaceholder
        title="Property Settings"
        description="Set property branding, emergency contact defaults, and deployment-specific runtime configuration."
      />
    );
  };

  return (
    <div data-view="admin" className="min-h-screen bg-[hsl(224,40%,7%)] text-slate-100">
      <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-slate-700/50 bg-[hsl(222,28%,14%)] p-4 shadow-lg lg:sticky lg:top-4">
            <div className="mb-4 flex items-center gap-3 border-b border-slate-700/40 pb-4">
              <Building2 className="h-5 w-5 text-blue-400" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500">CrisisBridge</p>
                <p className="text-sm font-semibold text-white">Hospitality Admin</p>
              </div>
            </div>

            <a
              href="/responder"
              className="mb-4 inline-flex w-full cursor-pointer items-center justify-center rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-blue-200 transition-colors duration-200 hover:bg-blue-500/20"
            >
              Open Responder Ops
            </a>

            <nav className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                const dynamicStatus =
                  item.id === 'live-incidents' && pendingCount > 0 ? `${pendingCount} pending` : item.status;

                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => navigateTo(item.id, item.href)}
                    className={`cursor-pointer rounded-lg border px-3 py-3 text-left transition-colors duration-200 ${
                      active
                        ? 'border-blue-500/50 bg-blue-500/15 text-blue-100'
                        : 'border-slate-700/40 bg-slate-800/30 text-slate-300 hover:border-slate-600 hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[10px] font-medium uppercase tracking-widest text-slate-500">{dynamicStatus}</p>
                  </button>
                );
              })}
            </nav>
          </aside>

          <main className="min-w-0">{renderSection()}</main>
        </div>
      </div>
    </div>
  );
};
