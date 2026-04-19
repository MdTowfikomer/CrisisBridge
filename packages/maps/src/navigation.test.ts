import { describe, it, expect } from 'vitest';
import { NavigationService } from './navigation.js';
import { GraphData, Position } from '@crisisbridge/types';

const mockMapData: GraphData = {
  propertyId: 'TEST-HOTEL',
  name: 'Test Hotel',
  viewBox: '0 0 100 100',
  nodes: {
    'start': { id: 'start', x: 10, y: 10, floor: 1, label: 'Room 101', type: 'room' },
    'hallway': { id: 'hallway', x: 50, y: 10, floor: 1, label: 'Hallway', type: 'path' },
    'hazard': { id: 'hazard', x: 50, y: 50, floor: 1, label: 'Fire Zone', type: 'path' },
    'exit': { id: 'exit', x: 90, y: 10, floor: 1, label: 'Main Exit', type: 'exit' },
    'safe_path': { id: 'safe_path', x: 50, y: 0, floor: 1, label: 'Safe Path', type: 'path' }
  },
  edges: [
    { from: 'start', to: 'hallway', weight: 10, instruction: 'Go to hallway' },
    { from: 'hallway', to: 'hazard', weight: 10, instruction: 'Avoid this' },
    { from: 'hazard', to: 'exit', weight: 10, instruction: 'Danger' },
    { from: 'hallway', to: 'safe_path', weight: 5, instruction: 'Safe detour' },
    { from: 'safe_path', to: 'exit', weight: 5, instruction: 'Reach exit' }
  ]
};

describe('Navigation Logic', () => {
  it('should avoid nodes marked as hazards', () => {
    const from: Position = { x: 10, y: 10, floor: 1 };
    
    // RED: We expect the path to NOT contain the 'hazard' node when it is in the hazard list
    const result = NavigationService.calculateRouteFromData(mockMapData, {
      from,
      to: 'exit',
      hazards: ['hazard']
    });

    expect(result.path).not.toContain('hazard');
    expect(result.path).toContain('safe_path');
  });

  it('should find the nearest exit when no destination is specified', () => {
    const from: Position = { x: 10, y: 10, floor: 1 };
    
    const result = NavigationService.calculateRouteFromData(mockMapData, {
      from,
      to: 'EXIT'
    });

    expect(result.destination.type).toBe('exit');
    expect(result.path).toContain('exit');
  });
});
