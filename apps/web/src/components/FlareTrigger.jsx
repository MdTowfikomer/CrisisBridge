import React, { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const FlareTrigger = ({ type, label, onTrigger, className }) => {
  const [isPressing, setIsPressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  const HOLD_DURATION = 500; // 0.5s

  const startPress = () => {
    setIsPressing(true);
    startTimeRef.current = Date.now();
    
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const newProgress = Math.min((elapsed / HOLD_DURATION) * 100, 100);
      setProgress(newProgress);

      if (elapsed >= HOLD_DURATION) {
        clearInterval(timerRef.current);
        onTrigger(type);
        setIsPressing(false);
        setProgress(0);
      }
    }, 10);
  };

  const endPress = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setIsPressing(false);
    setProgress(0);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const getThemeClasses = () => {
    switch (type) {
      case 'FIRE': return 'bg-red-600 hover:bg-red-700 text-white';
      case 'SECURITY': return 'bg-blue-600 hover:bg-blue-700 text-white';
      case 'MEDICAL': return 'bg-green-600 hover:bg-green-700 text-white';
      default: return 'bg-gray-600 hover:bg-gray-700 text-white';
    }
  };

  return (
    <button
      onMouseDown={startPress}
      onMouseUp={endPress}
      onMouseLeave={endPress}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      className={cn(
        "relative w-full h-32 rounded-2xl font-bold text-2xl uppercase tracking-wider overflow-hidden transition-transform active:scale-95 select-none",
        getThemeClasses(),
        className
      )}
    >
      <span className="relative z-10">{label}</span>
      
      {/* Progress Bar Overlay */}
      <div 
        className="absolute bottom-0 left-0 h-2 bg-white/30 transition-all duration-75"
        style={{ width: `${progress}%` }}
      />
      
      {/* Active Glow Effect */}
      {isPressing && (
        <div className="absolute inset-0 bg-white/10 animate-pulse" />
      )}
    </button>
  );
};
