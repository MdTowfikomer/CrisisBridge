import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, MessageSquare, WifiOff, AlertTriangle, Loader2 } from 'lucide-react';

export function SafetyFooter() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineSeconds, setOfflineSeconds] = useState(0);
  
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setOfflineSeconds(0);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    let timer;
    if (!isOnline) {
      timer = setInterval(() => {
        setOfflineSeconds(prev => prev + 1);
      }, 1000);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (timer) clearInterval(timer);
    };
  }, [isOnline]);

  // Proportional Response Logic
  const showWarning = !isOnline;
  const isCritical = offlineSeconds >= 5;

  return (
    <AnimatePresence>
      {showWarning && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          exit={{ y: 100 }}
          className="fixed bottom-0 left-0 right-0 z-[100] p-4"
        >
          <div className={`mx-auto max-w-lg overflow-hidden rounded-3xl border shadow-2xl transition-all duration-500 ${
            isCritical ? 'border-red-500 bg-red-950' : 'border-amber-500 bg-amber-950'
          }`}>
            
            {/* Header / Reconnecting Bar */}
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                {isCritical ? (
                   <AlertTriangle className="w-6 h-6 text-red-400 animate-pulse" />
                ) : (
                   <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                )}
                <div>
                  <p className={`text-xs font-black uppercase tracking-widest ${isCritical ? 'text-red-300' : 'text-amber-300'}`}>
                    {isCritical ? 'Connection Lost' : 'Reconnecting...'}
                  </p>
                  <p className="text-[10px] text-white/60 font-medium">
                    {isCritical ? 'Use cellular fallback for immediate help' : 'Attempting to restore emergency link'}
                  </p>
                </div>
              </div>
              <WifiOff className={`w-5 h-5 ${isCritical ? 'text-red-400' : 'text-amber-400'}`} />
            </div>

            {/* Critical Actions (Expands after 5s) */}
            <motion.div
              initial={false}
              animate={{ height: isCritical ? 'auto' : 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                <a 
                  href="tel:911"
                  className="flex items-center justify-center gap-3 bg-red-600 hover:bg-red-500 text-white py-4 rounded-2xl transition-colors shadow-lg active:scale-95"
                >
                  <Phone className="w-5 h-5 fill-current" />
                  <span className="font-black uppercase tracking-widest text-sm">Call 911</span>
                </a>
                <a 
                  href="sms:911?body=EMERGENCY! I need help at HOTEL-101."
                  className="flex items-center justify-center gap-3 bg-white text-red-900 py-4 rounded-2xl transition-colors shadow-lg active:scale-95"
                >
                  <MessageSquare className="w-5 h-5 fill-current" />
                  <span className="font-black uppercase tracking-widest text-sm">SMS Flare</span>
                </a>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
