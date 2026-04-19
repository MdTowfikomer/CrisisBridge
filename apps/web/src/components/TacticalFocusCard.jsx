import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Radio, Navigation, CheckCircle2, X as CloseIcon, FileDown } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const STATUS_CONFIG = {
  PENDING: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/40',
    text: 'text-red-400',
    accent: 'bg-red-500',
    label: 'Critical Alert'
  },
  ACKNOWLEDGED: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    accent: 'bg-amber-500',
    label: 'Responding'
  },
  RESOLVED: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
    text: 'text-emerald-400',
    accent: 'bg-emerald-500',
    label: 'Case Closed'
  }
};

export const TacticalFocusCard = ({ alert, onAction, onDismiss }) => {
  if (!alert) return null;
  const config = STATUS_CONFIG[alert.status];

  return (
    <motion.div
      drag
      dragMomentum={false}
      initial={{ opacity: 0, x: -20, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      className="absolute top-4 left-4 right-4 md:left-6 md:top-6 md:w-96 z-30 pointer-events-none"
    >
      <div className="bg-[#0c0d12]/95 backdrop-blur-2xl border-2 border-white/10 p-6 rounded-[2.5rem] shadow-2xl pointer-events-auto transition-all cursor-grab active:cursor-grabbing relative group/card">
        {/* Dismiss Button */}
        <button
          onClick={onDismiss}
          className="absolute top-5 right-5 p-2 rounded-full bg-white/5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all opacity-0 group-hover/card:opacity-100"
        >
          <CloseIcon className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-4 mb-6 pr-8">
          <div className={cn("p-4 rounded-2xl", config.bg)}>
            <AlertCircle className={cn("w-7 h-7", config.text)} />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-black tracking-tighter uppercase truncate leading-none mb-1">{alert.location}</h2>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{alert.type} MISSION</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Tactical Directive */}
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 -mt-2 shadow-inner">
            <p className="text-[8px] font-black text-blue-400 uppercase tracking-[0.3em] mb-1.5 flex items-center gap-1.5">
              <Radio className="w-2.5 h-2.5" /> AI Command Directive
            </p>
            <p className="text-sm font-bold text-slate-100 leading-tight italic">
              "{alert.triage?.immediate_action || 'Standby for mission parameters...'}"
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {alert.status === 'RESOLVED' && (
              <a
                href={`${import.meta.env.VITE_BACKEND_URL}/audit/${alert.id || alert.dbKey}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="w-full bg-slate-800 hover:bg-slate-700 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95"
              >
                <FileDown className="w-4 h-4 text-blue-400" />
                Download Formal Report
              </a>
            )}

            {alert.status === 'PENDING' && (
              <button
                onClick={() => onAction(alert.dbKey, 'ACKNOWLEDGED')}
                className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-2xl shadow-blue-600/30 transition-all active:scale-95 group"
              >
                <Navigation className="w-4 h-4 group-hover:animate-bounce" />
                Begin Response
              </button>
            )}

            {alert.status === 'ACKNOWLEDGED' && (
              <button
                onClick={() => onAction(alert.dbKey, 'RESOLVED')}
                className="w-full bg-emerald-600 hover:bg-emerald-500 py-5 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-2xl shadow-emerald-600/20 transition-all active:scale-95 group"
              >
                <CheckCircle2 className="w-4 h-4 group-hover:scale-125 transition-transform" />
                Incident Resolved
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
