import React, { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const HOLD_DURATION = 500;

const TRIGGER_THEME = {
  FIRE: {
    surface: 'bg-red-600 hover:bg-red-700',
    ring: 'focus-visible:ring-red-300',
    progressBar: 'bg-white/50',
    helper: 'Flames, smoke, burning smell',
  },
  SECURITY: {
    surface: 'bg-blue-600 hover:bg-blue-700',
    ring: 'focus-visible:ring-blue-300',
    progressBar: 'bg-white/50',
    helper: 'Threats, violence, suspicious activity',
  },
  MEDICAL: {
    surface: 'bg-emerald-600 hover:bg-emerald-700',
    ring: 'focus-visible:ring-emerald-300',
    progressBar: 'bg-white/50',
    helper: 'Injury, chest pain, unconscious person',
  },
};

export const FlareTrigger = ({ type, label, onTrigger, className, disabled = false }) => {
  const [isPressing, setIsPressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  const theme = TRIGGER_THEME[type] || {
    surface: 'bg-slate-600 hover:bg-slate-700',
    ring: 'focus-visible:ring-slate-300',
    progressBar: 'bg-white/50',
    helper: 'Emergency assistance needed',
  };

  const startPress = () => {
    if (disabled || timerRef.current) {
      return;
    }

    setIsPressing(true);
    startTimeRef.current = Date.now();
    
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const newProgress = Math.min((elapsed / HOLD_DURATION) * 100, 100);
      setProgress(newProgress);

      if (elapsed >= HOLD_DURATION) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        onTrigger(type);
        setIsPressing(false);
        setProgress(0);
      }
    }, 10);
  };

  const endPress = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsPressing(false);
    setProgress(0);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleKeyDown = (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && !isPressing) {
      event.preventDefault();
      startPress();
    }
  };

  const handleKeyUp = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      endPress();
    }
  };

  return (
    <button
      type="button"
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onContextMenu={(event) => event.preventDefault()}
      disabled={disabled}
      className={cn(
        'group relative w-full overflow-hidden rounded-xl text-left text-white shadow-md transition-all duration-200 cursor-pointer',
        'min-h-[112px] active:scale-[0.98] select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
        theme.surface,
        theme.ring,
        disabled && 'cursor-not-allowed opacity-60',
        className
      )}
      aria-label={`Hold for half a second to trigger ${label} emergency`}
      aria-busy={disabled}
    >
      <div className="relative z-10 flex h-full flex-col justify-between p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-black/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest">
            {type}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-white/80">
            Hold 0.5s
          </span>
        </div>

        <div className="mt-3">
          <span className="block text-xl font-bold uppercase tracking-tight sm:text-2xl">{label}</span>
          <span className="mt-1 block text-xs font-medium text-white/80 sm:text-sm">{theme.helper}</span>
        </div>
      </div>
      
      {/* Progress Bar Overlay */}
      <div 
        className={cn('pointer-events-none absolute bottom-0 left-0 h-1.5 transition-all duration-75', theme.progressBar)}
        style={{ width: `${progress}%` }}
      />
      
      {/* Active Glow Effect */}
      {isPressing && (
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-white/10" />
      )}

      {disabled && (
        <div className="pointer-events-none absolute inset-0 bg-black/15" />
      )}
    </button>
  );
};
