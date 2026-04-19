import { describe, it, expect } from 'vitest';
import { isUserInBroadcastZone } from './broadcastUtils.js';
import { Broadcast, Position } from '@crisisbridge/types';

describe('Broadcast Zone Filtering', () => {
  const userPos: Position = { x: 50, y: 50, floor: 1 };
  
  it('should include user in GLOBAL broadcast', () => {
    const broadcast: Partial<Broadcast> = {
      zoneType: 'GLOBAL',
      zoneValue: ''
    };
    expect(isUserInBroadcastZone(userPos, broadcast as Broadcast)).toBe(true);
  });

  it('should include user in matching SEMANTIC zone', () => {
    const broadcast: Partial<Broadcast> = {
      zoneType: 'SEMANTIC',
      zoneValue: 'North Wing'
    };
    const userWithZone = { ...userPos, zone: 'North Wing' };
    expect(isUserInBroadcastZone(userWithZone as any, broadcast as Broadcast)).toBe(true);
  });

  it('should exclude user from non-matching SEMANTIC zone', () => {
    const broadcast: Partial<Broadcast> = {
      zoneType: 'SEMANTIC',
      zoneValue: 'South Wing'
    };
    const userWithZone = { ...userPos, zone: 'North Wing' };
    expect(isUserInBroadcastZone(userWithZone as any, broadcast as Broadcast)).toBe(false);
  });

  it('should include user within RADIAL distance', () => {
    const broadcast: Partial<Broadcast> = {
      zoneType: 'RADIAL',
      zoneValue: '50,50,20' // x,y,radius
    };
    expect(isUserInBroadcastZone(userPos, broadcast as Broadcast)).toBe(true);
  });

  it('should exclude user outside RADIAL distance', () => {
    const broadcast: Partial<Broadcast> = {
      zoneType: 'RADIAL',
      zoneValue: '100,100,20'
    };
    expect(isUserInBroadcastZone(userPos, broadcast as Broadcast)).toBe(false);
  });
});
