import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map, Layers, Navigation, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

interface Position {
  x: number;
  y: number;
  floor: number;
}

interface MapNode {
  id: string;
  x: number;
  y: number;
  floor: number;
  label: string;
  type: string;
}

interface RouteStep {
  from: MapNode;
  to: MapNode;
  instruction: string;
}

interface IndoorMapViewProps {
  currentFloor: number;
  userPosition: Position | null;
  route: { steps: RouteStep[], path: string[] } | null;
}

export function IndoorMapView({ currentFloor, userPosition, route }: IndoorMapViewProps) {
  const isCrisisMode = useAppStore((state: any) => state.isCrisisMode);
  const [activeFloor, setActiveFloor] = useState(currentFloor);
  const [preSwapPreview, setPreSwapPreview] = useState<{ upcomingFloor: number, distance: number } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Keep active floor in sync unless user manually overridden (left as an exercise)
  // Auto-floor-swap proximity logic
  useEffect(() => {
    setActiveFloor(currentFloor);
  }, [currentFloor]);

  useEffect(() => {
    // Proximity to Transition Logic
    if (!userPosition || !route) return;

    // Find the next vertical transition node in the route
    let nextTransitionStep = route.steps.find(step => step.from.floor === userPosition.floor && step.to.floor !== userPosition.floor);
    
    if (nextTransitionStep) {
      const transNode = nextTransitionStep.from;
      const dx = userPosition.x - transNode.x;
      const dy = userPosition.y - transNode.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Distances are in SVG grid units. If stride is ~0.75, let's say 30 units is ~close to the elevator
      const PROXIMITY_PREVIEW_THRESHOLD = 50.0;
      const AUTO_SWAP_THRESHOLD = 5.0;

      if (distance < AUTO_SWAP_THRESHOLD) {
        // Auto-swap handoff seamlessly
        setActiveFloor(nextTransitionStep.to.floor);
        setPreSwapPreview(null);
      } else if (distance < PROXIMITY_PREVIEW_THRESHOLD) {
        // Pre-swap preview overlay
        setPreSwapPreview({ upcomingFloor: nextTransitionStep.to.floor, distance });
      } else {
        setPreSwapPreview(null);
      }
    } else {
      setPreSwapPreview(null);
    }
  }, [userPosition, route]);

  const mapUrl = `/maps/floor${activeFloor}.svg`;

  // Draw the route path for the active floor
  const floorPathCommands = useMemo(() => {
    if (!route || route.steps.length === 0) return '';
    
    const validSteps = route.steps.filter(s => s.from.floor === activeFloor && s.to.floor === activeFloor);
    if (validSteps.length === 0) return '';

    let d = `M ${validSteps[0].from.x} ${validSteps[0].from.y}`;
    validSteps.forEach(step => {
      d += ` L ${step.to.x} ${step.to.y}`;
    });
    return d;
  }, [route, activeFloor]);

  return (
    <div ref={mapContainerRef} className="relative w-full h-[600px] overflow-hidden bg-black/90 rounded-xl border border-white/10 shadow-2xl">
      {/* Crisis Vignette */}
      <AnimatePresence>
        {isCrisisMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle,transparent_30%,rgba(185,28,28,0.5)_100%)] mix-blend-multiply"
          />
        )}
      </AnimatePresence>

      {/* Slippy Map Container */}
      <motion.div
        drag={!isCrisisMode} // Lock drag during panic so they don't get lost
        dragConstraints={mapContainerRef}
        dragElastic={0.2}
        className={`absolute inset-0 w-[1000px] h-[800px] origin-center ${isCrisisMode ? '' : 'cursor-grab active:cursor-grabbing'}`}
        initial={{ scale: 0.8 }}
        animate={
          isCrisisMode && route && route.steps.length > 0
            ? {
                scale: 1.5,
                // Center the destination (Exit node)
                x: 500 - route.steps[route.steps.length - 1].to.x,
                y: 400 - route.steps[route.steps.length - 1].to.y
              }
            : { scale: 1, x: 0, y: 0 }
        }
        transition={{ type: 'spring', damping: 20 }}
      >
        {/* Floor SVG Backdrop */}
        <div style={{ backgroundImage: `url(${mapUrl})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat' }} className="w-full h-full relative">
          
          <svg viewBox="0 0 1000 800" className="absolute inset-0 w-full h-full pointer-events-none">
            {/* Route Overlay */}
            {floorPathCommands && (
              <>
                {/* Dim background path */}
                <motion.path
                  d={floorPathCommands}
                  fill="none"
                  stroke="#1e3a8a"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="opacity-40"
                />
                {/* Animated dash array flowing to destination */}
                <motion.path
                  d={floorPathCommands}
                  fill="none"
                  stroke="#4dabf7"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="15 15"
                  initial={{ strokeDashoffset: 0 }}
                  animate={{ strokeDashoffset: -30 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="drop-shadow-[0_0_8px_rgba(77,171,247,0.8)]"
                />
              </>
            )}
            
            {/* Blue Dot representing user position */}
            {userPosition && userPosition.floor === activeFloor && (
              <motion.circle
                cx={userPosition.x}
                cy={userPosition.y}
                r={8}
                fill="#4dabf7"
                className="drop-shadow-[0_0_12px_rgba(77,171,247,1)]"
                animate={{ scale: [1, 1.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
            
            {/* Route Target Marker */}
            {route && route.steps.length > 0 && route.steps[route.steps.length - 1].to.floor === activeFloor && (
               <circle
                 cx={route.steps[route.steps.length - 1].to.x}
                 cy={route.steps[route.steps.length - 1].to.y}
                 r={10}
                 fill="#f03e3e"
                 className="drop-shadow-[0_0_8px_rgba(240,62,62,0.8)]"
               />
            )}
          </svg>
        </div>
      </motion.div>

      {/* Pre-Swap UI Overlay */}
      <AnimatePresence>
        {preSwapPreview && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900/90 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/20 shadow-2xl flex items-center space-x-4"
          >
             {preSwapPreview.upcomingFloor > activeFloor ? (
               <ArrowUpCircle className="text-[#4dabf7] w-8 h-8" />
             ) : (
               <ArrowDownCircle className="text-[#4dabf7] w-8 h-8" />
             )}
             <div>
               <p className="text-sm text-gray-400 font-semibold mb-1">Approaching Transition</p>
               <p className="text-white font-bold leading-none">
                 Incoming: Floor {preSwapPreview.upcomingFloor} 
               </p>
               <p className="text-xs text-[#4dabf7] mt-2">
                 {(preSwapPreview.distance / 10).toFixed(1)}m away
               </p>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* HUD Layer */}
      <div className="absolute top-4 left-4 flex space-x-2">
         <div className="bg-black/60 backdrop-blur border border-white/10 px-4 py-2 rounded-lg flex items-center space-x-2">
            <Layers className="w-5 h-5 text-gray-400" />
            <span className="text-white font-bold">FL {activeFloor}</span>
         </div>
      </div>
    </div>
  );
}
