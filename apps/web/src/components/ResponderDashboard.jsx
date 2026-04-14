import React, { useState, useEffect } from 'react';
import { rtdb } from '../lib/firebase';
import { ref, onValue, update } from 'firebase/database';
import { Shield, CheckCircle2, Clock, MapPin, AlertTriangle, ChevronRight } from 'lucide-react';

function cn(...inputs) {
  return inputs.filter(Boolean).join(' ');
}

export const ResponderDashboard = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [finalizedRecord, setFinalizedRecord] = useState(null);

  useEffect(() => {
    const alertsRef = ref(rtdb, 'alerts');
    const unsubscribe = onValue(alertsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, value]) => ({
          id,
          ...value,
        })).sort((a, b) => b.timestamp - a.timestamp);
        setAlerts(list);
      } else {
        setAlerts([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAction = async (alertId, newStatus) => {
    try {
      // Update RTDB status
      await update(ref(rtdb, `alerts/${alertId}`), { status: newStatus });
      
      // Stop escalation timer if acknowledged
      if (newStatus === 'ACKNOWLEDGED') {
        await fetch('http://localhost:3001/acknowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alertId })
        });
      }

      // Finalize audit log if resolved
      if (newStatus === 'RESOLVED') {
        const response = await fetch('http://localhost:3001/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            alertId, 
            summary: 'Incident resolved by responder.',
            actions: ['On-site assessment', 'Verbal confirmation of safety']
          })
        });
        const result = await response.json();
        if (result.success) {
          setFinalizedRecord(result.record);
        }
      }
    } catch (error) {
      console.error('Failed to update alert:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans relative">
      {/* Finalized Record Modal */}
      {finalizedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 w-full max-w-2xl rounded-3xl border-2 border-slate-700 shadow-2xl overflow-hidden">
            <div className="bg-green-600 px-8 py-4 flex justify-between items-center">
              <h2 className="text-xl font-black uppercase tracking-tighter text-white">Incident Finalized</h2>
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div className="p-8">
              <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-500 mb-1 tracking-widest">Location</p>
                  <p className="text-2xl font-bold">{finalizedRecord.alert.location}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-500 mb-1 tracking-widest">Incident Type</p>
                  <p className="text-2xl font-bold">{finalizedRecord.alert.type}</p>
                </div>
              </div>
              
              <div className="bg-blue-500/10 border-l-4 border-blue-500 p-6 rounded-r-2xl mb-8">
                <p className="text-[10px] font-black uppercase text-blue-400 mb-2 tracking-widest">AI Automated Report</p>
                <p className="text-lg text-blue-100 leading-relaxed italic">
                  "{finalizedRecord.ai_report}"
                </p>
              </div>

              <button 
                onClick={() => setFinalizedRecord(null)}
                className="w-full bg-white text-black font-black py-4 rounded-2xl uppercase tracking-widest hover:bg-slate-200 transition-colors"
              >
                Close and Return to Ops
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="flex justify-between items-center mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Live Command Center</span>
          </div>
          <h1 className="text-3xl font-black tracking-tighter">RESPONDER OPS</h1>
        </div>
        <div className="px-4 py-2 bg-slate-800 rounded-xl border border-slate-700 flex items-center gap-3">
          <Shield className="w-5 h-5 text-blue-400" />
          <span className="font-bold text-sm">Security Station Alpha</span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {alerts.length === 0 ? (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-800 rounded-3xl">
            <CheckCircle2 className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No Active Emergencies</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div 
              key={alert.id}
              className={cn(
                "group relative bg-slate-900 rounded-3xl border-2 transition-all duration-300 overflow-hidden shadow-2xl",
                alert.status === 'PENDING' ? 'border-red-500/50 animate-pulse' : 'border-slate-800'
              )}
            >
              {/* Header */}
              <div className={cn(
                "px-6 py-3 flex justify-between items-center",
                alert.status === 'PENDING' ? 'bg-red-600' : 'bg-slate-800'
              )}>
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                  {alert.type} Alert
                </span>
                <span className="text-[10px] font-bold bg-black/20 px-2 py-0.5 rounded-full uppercase">
                  {alert.status}
                </span>
              </div>

              <div className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-3xl font-black tracking-tighter mb-1">{alert.location}</h3>
                    <div className="flex items-center gap-2 text-slate-500 text-xs font-bold">
                      <Clock className="w-3 h-3" />
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-800 rounded-2xl">
                    <MapPin className="w-6 h-6 text-blue-400" />
                  </div>
                </div>

                {alert.triage && (
                  <div className="mb-6 space-y-4">
                    <div className="bg-blue-500/10 border-l-4 border-blue-500 p-4 rounded-r-xl">
                      <p className="text-[10px] font-black uppercase text-blue-400 mb-1 tracking-widest">AI Action Card</p>
                      <p className="text-sm font-bold text-blue-100 leading-relaxed">
                        {alert.triage.task_card?.action_item || alert.triage.immediate_action}
                      </p>
                    </div>
                  </div>
                )}

                <p className="text-slate-400 text-sm mb-8 line-clamp-2 italic">
                  "{alert.description || 'No description provided by guest.'}"
                </p>

                <div className="flex gap-3 mt-auto">
                  {alert.status === 'PENDING' && (
                    <button 
                      onClick={() => handleAction(alert.id, 'ACKNOWLEDGED')}
                      className="flex-1 bg-white text-black font-black py-4 rounded-2xl uppercase text-xs tracking-widest hover:bg-blue-400 transition-colors shadow-lg"
                    >
                      Acknowledge
                    </button>
                  )}
                  {alert.status === 'ACKNOWLEDGED' && (
                    <button 
                      onClick={() => handleAction(alert.id, 'RESOLVED')}
                      className="flex-1 bg-green-600 text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest hover:bg-green-500 transition-colors shadow-lg"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
