import React, { useState } from 'react';
import { Radio, Send, Target, Layout, Circle, X } from 'lucide-react';
import { ref, push, set } from 'firebase/database';
import { rtdb } from '../lib/firebase';

export const SmartBroadcastTool = ({ propertyId, onDismiss }) => {
  const [message, setMessage] = useState('');
  const [zoneType, setZoneType] = useState('GLOBAL');
  const [zoneValue, setZoneValue] = useState('');
  const [severity, setSeverity] = useState('HIGH');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) return;
    setIsSending(true);
    
    try {
      const broadcastRef = ref(rtdb, `broadcasts/${propertyId}`);
      const newBroadcastRef = push(broadcastRef);
      
      await set(newBroadcastRef, {
        id: newBroadcastRef.key,
        propertyId,
        message: message.trim(),
        severity,
        zoneType,
        zoneValue,
        createdAt: Date.now(),
        active: true
      });
      
      onDismiss();
    } catch (err) {
      console.error('Broadcast failed:', err);
      alert('Failed to send broadcast');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-[#0c0d12]/95 backdrop-blur-2xl border-2 border-white/10 p-8 rounded-[2.5rem] shadow-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl">
            <Radio className="w-5 h-5 text-white animate-pulse" />
          </div>
          <h2 className="text-xl font-black uppercase tracking-tighter">Smart Broadcast</h2>
        </div>
        <button onClick={onDismiss} className="text-slate-500 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        <label className="block space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Message</span>
          <textarea 
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. EVACUATE VIA NORTH STAIRS"
            className="w-full bg-black/40 border-2 border-slate-800 rounded-2xl p-4 text-sm font-bold focus:border-blue-600 outline-none min-h-[100px] resize-none"
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          {[
            { id: 'GLOBAL', label: 'Global', icon: Layout },
            { id: 'SEMANTIC', label: 'Wing', icon: Target },
            { id: 'RADIAL', label: 'Radial', icon: Circle }
          ].map(type => (
            <button
              key={type.id}
              onClick={() => setZoneType(type.id)}
              className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${
                zoneType === type.id ? 'border-blue-600 bg-blue-600/10 text-white' : 'border-slate-800 text-slate-500 hover:border-slate-700'
              }`}
            >
              <type.icon className="w-5 h-5 mb-2" />
              <span className="text-[8px] font-black uppercase tracking-widest">{type.label}</span>
            </button>
          ))}
        </div>

        {zoneType === 'SEMANTIC' && (
          <label className="block space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Target Wing Name</span>
            <input 
              value={zoneValue}
              onChange={(e) => setZoneValue(e.target.value)}
              placeholder="e.g. North Wing"
              className="w-full bg-black/40 border-2 border-slate-800 rounded-xl px-4 py-3 text-xs font-bold focus:border-blue-600 outline-none"
            />
          </label>
        )}

        {zoneType === 'RADIAL' && (
          <label className="block space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Parameters (x,y,radius)</span>
            <input 
              value={zoneValue}
              onChange={(e) => setZoneValue(e.target.value)}
              placeholder="500,400,100"
              className="w-full bg-black/40 border-2 border-slate-800 rounded-xl px-4 py-3 text-xs font-bold focus:border-blue-600 outline-none"
            />
          </label>
        )}

        <div className="flex gap-2">
          {['CRITICAL', 'HIGH', 'MEDIUM'].map(s => (
            <button
              key={s}
              onClick={() => setSeverity(s)}
              className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                severity === s 
                  ? (s === 'CRITICAL' ? 'bg-red-600 text-white' : s === 'HIGH' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white')
                  : 'bg-slate-900 text-slate-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleSend}
        disabled={isSending || !message.trim()}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-sm flex items-center justify-center gap-3 shadow-2xl shadow-blue-600/30 transition-all active:scale-95"
      >
        <Send className="w-5 h-5" />
        Initialize Command
      </button>
    </div>
  );
};
