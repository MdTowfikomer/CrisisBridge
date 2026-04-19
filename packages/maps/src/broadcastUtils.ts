import { Broadcast, Position } from '@crisisbridge/types';

/**
 * High-integrity utility to check if a user position falls within a broadcast zone.
 */
export function isUserInBroadcastZone(userPos: Position & { zone?: string }, broadcast: Broadcast): boolean {
  switch (broadcast.zoneType) {
    case 'GLOBAL':
      return true;

    case 'SEMANTIC':
      // Matches the wing name (e.g., "North Wing")
      return userPos.zone === broadcast.zoneValue;

    case 'RADIAL': {
      // zoneValue format: "x,y,radius"
      const [bx, by, radius] = broadcast.zoneValue.split(',').map(Number);
      if (isNaN(bx) || isNaN(by) || isNaN(radius)) return false;

      const distance = Math.sqrt(
        Math.pow(userPos.x - bx, 2) + Math.pow(userPos.y - by, 2)
      );
      return distance <= radius;
    }

    default:
      return false;
  }
}
