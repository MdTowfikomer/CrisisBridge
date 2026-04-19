import React, { useState, useRef, useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { HeartPulse, Flame, Siren, AlertCircle } from 'lucide-react';

const HOLD_DURATION = 500;

export function FlareTrigger({ type, label, onTrigger }) {
  const [isHolding, setIsHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const controls = useAnimation();

  const handleStart = (e) => {
    e.preventDefault();
    setIsHolding(true);
    setProgress(0);
    
    // Start progress animation
    const startTime = Date.now();
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / HOLD_DURATION) * 100, 100);
      setProgress(newProgress);
      
      if (newProgress >= 100) {
        clearInterval(progressIntervalRef.current);
      }
    }, 16);

    timerRef.current = setTimeout(() => {
      onTrigger(type);
      setIsHolding(false);
      setProgress(0);
      clearInterval(progressIntervalRef.current);
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    }, HOLD_DURATION);

    controls.start({ scale: 0.95 });
    if (navigator.vibrate) navigator.vibrate(30);
  };

  const handleEnd = () => {
    setIsHolding(false);
    setProgress(0);
    clearTimeout(timerRef.current);
    clearInterval(progressIntervalRef.current);
    controls.start({ scale: 1 });
  };

  const colors = {
    MEDICAL: 'bg-blue-600 border-blue-500 text-white',
    FIRE: 'bg-red-600 border-red-500 text-white',
    SECURITY: 'bg-zinc-800 border-slate-700 text-white',
  };

  const icons = {
    MEDICAL: <HeartPulse className="w-12 h-12" />,
    FIRE: <Flame className="w-12 h-12" />,
    SECURITY: <Siren className="w-12 h-12" />,
  };

  return (
    <motion.button
      animate={controls}
      onMouseDown={handleStart}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={handleStart}
      onTouchEnd={handleEnd}
      className={`btn-crisis-trigger w-full border-b-8 active:border-b-0 active:translate-y-1 ${colors[type]}`}
    >
      {/* Circular Progress Ring */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
         <svg className="w-full h-full p-2 -rotate-90">
            <circle
              cx="50%" cy="50%" r="48%"
              fill="none"
              stroke="white"
              strokeWidth="8"
              strokeDasharray="300%"
              strokeDashoffset={`${300 - (progress * 3)}%`}
              className="opacity-20"
            />
         </svg>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-4">
        {icons[type]}
        <span className="text-2xl font-black uppercase tracking-tighter">{label}</span>
      </div>

      {isHolding && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-white/10"
        />
      )}
    </motion.button>
  );
}
