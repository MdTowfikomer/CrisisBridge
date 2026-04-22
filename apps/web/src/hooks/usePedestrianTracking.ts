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

  // Keep stateRef in sync so callbacks never use stale state
  useEffect(() => {
    stateRef.current = state;
  });

  // Anchor tracking for dynamic calibration
  const lastAnchorRef = useRef<{ pos: Position, stepsAtScan: number } | null>(null);

  const lastWriteTimeRef = useRef(0);
  const lastWritePosRef = useRef<Position | null>(null);

  useEffect(() => {
    if (!state.isActive || !state.position) return;

    const syncLocation = async () => {
      const now = Date.now();
      const pos = state.position!;
      
      // Throttle: Only write if 2 seconds passed OR position moved significantly (>5 units)
      const timeSinceLastWrite = now - lastWriteTimeRef.current;
      const movedSignificantly = !lastWritePosRef.current || 
        Math.sqrt(Math.pow(pos.x - lastWritePosRef.current.x, 2) + Math.pow(pos.y - lastWritePosRef.current.y, 2)) > 5;

      if (timeSinceLastWrite > 2000 || movedSignificantly) {
        lastWriteTimeRef.current = now;
        lastWritePosRef.current = pos;
        
        // This logic is usually triggered by a listener in a component, 
        // but we'll add a placeholder for where the throttled sync happens.
      }
    };

    syncLocation();
  }, [state.position, state.isActive]);

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
    let cleanupFn: () => void;

    // Try modern Generic Sensor API first (no deprecation warnings)
    if (typeof (window as any).Accelerometer !== 'undefined') {
      try {
        const accel = new (window as any).Accelerometer({ frequency: 30 });
        accel.addEventListener('reading', () => {
          const { x, y, z } = accel;
          const magnitude = Math.sqrt(x * x + y * y + z * z);
          const stepThreshold = 12.0;
          const now = Date.now();
          if (magnitude > stepThreshold && lastAccelRef.current < stepThreshold) {
            if (now - lastStepTimeRef.current > 300) {
              handleStep();
              lastStepTimeRef.current = now;
            }
          }
          lastAccelRef.current = magnitude;
        });
        accel.start();

        let orientSensor: any = null;
        if (typeof (window as any).AbsoluteOrientationSensor !== 'undefined') {
          try {
            orientSensor = new (window as any).AbsoluteOrientationSensor({ frequency: 10 });
            orientSensor.addEventListener('reading', () => {
              // Convert quaternion to heading (yaw in degrees)
              const [x, y, z, w] = orientSensor.quaternion;
              const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
              const heading = ((yaw * 180) / Math.PI + 360) % 360;
              setState(prev => ({ ...prev, heading }));
            });
            orientSensor.start();
          } catch { /* orientation sensor not available */ }
        }

        cleanupFn = () => {
          accel.stop();
          orientSensor?.stop();
        };
      } catch {
        // Fall through to legacy events
        useLegacyEvents();
      }
    } else {
      useLegacyEvents();
    }

    function useLegacyEvents() {
      const handleDeviceMotion = (event: DeviceMotionEvent) => {
        const acc = event.accelerationIncludingGravity;
        if (!acc || acc.x === null || acc.y === null || acc.z === null) return;
        const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
        const stepThreshold = 12.0;
        const now = Date.now();
        if (magnitude > stepThreshold && lastAccelRef.current < stepThreshold) {
          if (now - lastStepTimeRef.current > 300) {
            handleStep();
            lastStepTimeRef.current = now;
          }
        }
        lastAccelRef.current = magnitude;
      };

      const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
        if (event.alpha !== null) {
          const heading = (event as any).webkitCompassHeading || (360 - event.alpha);
          setState(prev => ({ ...prev, heading }));
        }
      };

      window.addEventListener('devicemotion', handleDeviceMotion);
      window.addEventListener('deviceorientation', handleDeviceOrientation);

      cleanupFn = () => {
        window.removeEventListener('devicemotion', handleDeviceMotion);
        window.removeEventListener('deviceorientation', handleDeviceOrientation);
      };
    }

    return () => cleanupFn?.();
  }, [state.isActive, mapNodes]);

  return {
    ...state,
    calibrateFromQR
  };
}
