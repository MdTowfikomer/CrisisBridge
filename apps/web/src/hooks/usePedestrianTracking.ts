import { useState, useEffect, useRef, useCallback } from 'react';
import { Position, TrackingState } from '@crisisbridge/types';

export function usePedestrianTracking(initialStrideLength = 0.75, mapNodes?: Position[]) {
  const [state, setState] = useState<TrackingState>({
    position: null,
    heading: 0,
    strideLength: initialStrideLength,
    stepCount: 0,
    isActive: false,
  });

  const stateRef = useRef(state);
  const lastAccelRef = useRef(0);
  const lastStepTimeRef = useRef(0);

  // Anchor tracking for dynamic calibration
  const lastAnchorRef = useRef<{ pos: Position, stepsAtScan: number } | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const calibrateFromQR = useCallback((qrX: number, qrY: number, qrFloor: number) => {
    const current = stateRef.current;

    // Dynamic Calibration Loop
    if (lastAnchorRef.current) {
      const { pos: lastPos, stepsAtScan: prevSteps } = lastAnchorRef.current;
      
      // Assume physically same floor for 2D distance calculation
      if (lastPos.floor === qrFloor) {
        const physicalDistanceX = qrX - lastPos.x;
        const physicalDistanceY = qrY - lastPos.y;

        // This is actual ground truth physical distance in the grid unit equivalent
        const actualDistance = Math.sqrt(
          Math.pow(physicalDistanceX, 2) + Math.pow(physicalDistanceY, 2)  
        );

        const stepsTaken = current.stepCount - prevSteps;

        if (stepsTaken > 0) {
          // New calibrated stride length (grid units per step)
          const newStrideLength = actualDistance / stepsTaken;

          // Smoothed moving average to avoid jarring shifts
          const alpha = 0.4;
          const smoothedStride = (alpha * newStrideLength) + ((1 - alpha) * current.strideLength);

          setState(prev => ({
            ...prev,
            strideLength: smoothedStride,
            position: { x: qrX, y: qrY, floor: qrFloor }
          }));

          lastAnchorRef.current = {
            pos: { x: qrX, y: qrY, floor: qrFloor },
            stepsAtScan: current.stepCount
          };
          return;
        }
      }
    }

    // First scan or cross-floor jump
    setState(prev => ({
      ...prev,
      position: { x: qrX, y: qrY, floor: qrFloor },
      isActive: true
    }));

    lastAnchorRef.current = {
      pos: { x: qrX, y: qrY, floor: qrFloor },
      stepsAtScan: current.stepCount
    };
  }, []);

  useEffect(() => {
    if (!state.isActive) return;

    const handleStep = () => {
      const current = stateRef.current;
      if (!current.position) return;

      // Calculate dx, dy based on heading and dynamically calibrated strideLength
      const headingRad = current.heading * (Math.PI / 180);

      // Y is usually inverted in SVG grid vs standard Cartesian mapping:  
      const dx = Math.sin(headingRad) * current.strideLength;
      const dy = -Math.cos(headingRad) * current.strideLength;

      let newX = current.position.x + dx;
      let newY = current.position.y + dy;
      let snapped = false;

      // Haptic Snap Logic to Graph Nodes
      if (mapNodes && mapNodes.length > 0) {
        for (const node of mapNodes) {
          if (node.floor === current.position.floor) {
             const dist = Math.sqrt(Math.pow(node.x - newX, 2) + Math.pow(node.y - newY, 2));
             if (dist < 15) { // Snapping threshold
               newX = node.x;
               newY = node.y;
               snapped = true;
               break;
             }
          }
        }
      }

      if (snapped && typeof window !== 'undefined' && 'navigator' in window && window.navigator.vibrate) {
        window.navigator.vibrate(50); // 50ms pulse
      }

      setState(prev => ({
        ...prev,
        stepCount: prev.stepCount + 1,
        position: prev.position ? {
           ...prev.position,
           x: newX,
           y: newY
        } : null
      }));
    };

    const handleDeviceMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      // Simple magnitude calculation
      const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);

      // Thresholds for step detection
      const stepThreshold = 12.0;
      const now = Date.now();

      if (magnitude > stepThreshold && lastAccelRef.current < stepThreshold) {
        if (now - lastStepTimeRef.current > 300) { // Debounce 300ms       
           handleStep();
           lastStepTimeRef.current = now;
        }
      }
      lastAccelRef.current = magnitude;
    };

    const handleDeviceOrientation = (event: DeviceOrientationEvent) => {   
       if (event.alpha !== null) {
          // Alpha is rotation around z axis
          // For actual compass, we'd use webkitCompassHeading if available
          const heading = (event as any).webkitCompassHeading || (360 - event.alpha);
          setState(prev => ({ ...prev, heading }));
       }
    };

    window.addEventListener('devicemotion', handleDeviceMotion);
    window.addEventListener('deviceorientation', handleDeviceOrientation); 

    return () => {
      window.removeEventListener('devicemotion', handleDeviceMotion);      
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
    };
  }, [state.isActive, mapNodes]);

  return {
    ...state,
    calibrateFromQR
  };
}
