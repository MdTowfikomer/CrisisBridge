import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, CheckCircle2, Navigation, AlertTriangle } from 'lucide-react';
import { ref, onValue, set } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { isUserInBroadcastZone } from '@crisisbridge/maps/src/broadcastUtils';

export function BroadcastTakeover({ propertyId, userPosition, guestId }) {
  const [activeBroadcast, setActiveBroadcast] = useState(null);
  const [isAcknowledged, setIsAcknowledged] = useState(false);

  useEffect(() => {
    if (!propertyId) return;

    const broadcastsRef = ref(rtdb, `broadcasts/${propertyId}`);
    const unsubscribe = onValue(broadcastsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setActiveBroadcast(null);
        return;
      }

      // Find the most recent active broadcast that applies to this user
      const list = Object.values(data)
        .filter(b => b.active)
        .sort((a, b) => b.createdAt - a.createdAt);

      const relevant = list.find(b => {
        if (b.zoneType === 'GLOBAL') return true;
        if (!userPosition) return false;
        return isUserInBroadcastZone(userPosition, b);
      });
      
      if (relevant) {
        setActiveBroadcast(relevant);
        // Check if already acknowledged locally or in DB
        const ackRef = ref(rtdb, `broadcast_acks/${relevant.id}/${guestId}`);
        onValue(ackRef, (ackSnap) => {
          setIsAcknowledged(ackSnap.exists());
        }, { onlyOnce: true });
      } else {
        setActiveBroadcast(null);
      }
    });

    return () => unsubscribe();
  }, [propertyId, userPosition, guestId]);

  const handleAcknowledge = async () => {
    if (!activeBroadcast) return;
    
    try {
      await set(ref(rtdb, `broadcast_acks/${activeBroadcast.id}/${guestId}`), {
        acknowledgedAt: Date.now(),
        userPosition
      });
      setIsAcknowledged(true);
      if (navigator.vibrate) navigator.vibrate(100);
    } catch (err) {
      console.error('Ack failed:', err);
    }
  };

  if (!activeBroadcast || isAcknowledged) return null;

  const severityColors = {
    CRITICAL: 'bg-red-600',
    HIGH: 'bg-amber-500',
    MEDIUM: 'bg-blue-600'
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`fixed inset-0 z-[200] flex flex-col items-center justify-center p-8 text-white ${severityColors[activeBroadcast.severity] || 'bg-slate-900'}`}
      >
        <div className="max-w-md w-full text-center space-y-12">
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="flex justify-center"
          >
            <div className="bg-white/20 p-8 rounded-full backdrop-blur-xl">
              <Radio className="w-20 h-20 text-white" />
            </div>
          </motion.div>

          <div className="space-y-4">
            <h2 className="text-sm font-black uppercase tracking-[0.5em] opacity-80">Command Directive</h2>
            <h1 className="text-5xl font-black tracking-tighter leading-none uppercase">
              {activeBroadcast.message}
            </h1>
          </div>

          <div className="space-y-4 pt-12">
            <button
              onClick={handleAcknowledge}
              className="w-full bg-white text-black py-6 rounded-[2rem] font-black uppercase tracking-[0.2em] text-lg shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-4"
            >
              <CheckCircle2 className="w-6 h-6" />
              I Understand
            </button>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">
              Acknowledging will restore your tactical map
            </p>
          </div>
        </div>

        {/* Tactical Background Detail */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-10">
           <AlertTriangle className="absolute -top-20 -left-20 w-96 h-96 rotate-12" />
           <AlertTriangle className="absolute -bottom-20 -right-20 w-96 h-96 -rotate-12" />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
