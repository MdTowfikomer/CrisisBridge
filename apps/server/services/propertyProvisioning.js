import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { z } from 'zod';

const DEFAULT_BASE_URL = process.env.GUEST_APP_BASE_URL || 'http://localhost:5173';
const DEFAULT_SIGNING_SECRET =
  process.env.ROOM_LINK_SIGNING_SECRET || 'dev-room-link-signing-secret-change-me';

export const ProvisioningRequestSchema = z
  .object({
    baseUrl: z.string().url().optional(),
    floorStart: z.number().int().min(0).default(1),
    floorEnd: z.number().int().min(0).default(1),
    roomsPerFloor: z.number().int().min(1).max(300).default(20),
    explicitRooms: z.array(
      z.object({
        id: z.string().trim().min(1).max(64),
        label: z.string().trim().max(128).optional()
      })
    ).max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.explicitRooms && value.floorEnd < value.floorStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'floorEnd must be greater than or equal to floorStart',
        path: ['floorEnd'],
      });
    }
  });

function makeSignature(propertyId, roomId, entry, expiresAt) {
  return crypto
    .createHmac('sha256', DEFAULT_SIGNING_SECRET)
    .update(`${propertyId}|${roomId}|${entry}|${expiresAt}`)
    .digest('hex');
}

function signedRoomUrl({ baseUrl, propertyId, roomId, entry }) {
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 365 * 3; // 3 years
  const signature = makeSignature(propertyId, roomId, entry, expiresAt);
  const url = new URL(baseUrl);

  url.searchParams.set('property', propertyId);
  url.searchParams.set('room', roomId);
  url.searchParams.set('entry', entry);
  url.searchParams.set('exp', String(expiresAt));
  url.searchParams.set('sig', signature);

  return url.toString();
}

function buildRoomIds({ floorStart, floorEnd, roomsPerFloor, explicitRooms }) {
  if (explicitRooms?.length) {
    // Return array of objects
    return explicitRooms.map(r => ({ id: r.id, label: r.label }));
  }

  const roomIds = [];
  for (let floor = floorStart; floor <= floorEnd; floor += 1) {
    for (let index = 1; index <= roomsPerFloor; index += 1) {
      const roomSuffix = String(index).padStart(2, '0');
      const id = `${floor}${roomSuffix}`;
      roomIds.push({ id, label: `Room ${id}` });
    }
  }

  return roomIds;
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function buildRoomManifestCsv(manifest) {
  const rows = [
    ['propertyId', 'roomId', 'roomLabel', 'qrUrl', 'nfcUrl', 'shortCode'],
    ...manifest.rooms.map((room) => [
      manifest.propertyId,
      room.roomId,
      room.roomLabel,
      room.qrUrl,
      room.nfcUrl,
      room.shortCode,
    ]),
  ];

  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

export async function provisionPropertyRooms({ propertyId, payload }) {
  const normalizedPropertyId = propertyId.trim().toUpperCase();
  const roomEntries = buildRoomIds(payload);
  const baseUrl = payload.baseUrl || DEFAULT_BASE_URL;

  const rooms = await Promise.all(
    roomEntries.map(async (entryObj) => {
      const normalizedRoom = entryObj.id.trim();
      const qrUrl = signedRoomUrl({
        baseUrl,
        propertyId: normalizedPropertyId,
        roomId: normalizedRoom,
        entry: 'qr',
      });
      const nfcUrl = signedRoomUrl({
        baseUrl,
        propertyId: normalizedPropertyId,
        roomId: normalizedRoom,
        entry: 'nfc',
      });

      const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 260,
        color: {
          dark: '#0f172a',
          light: '#ffffffff',
        },
      });

      return {
        roomId: normalizedRoom,
        roomLabel: entryObj.label || `Room ${normalizedRoom}`,
        shortCode: `${normalizedPropertyId}-${normalizedRoom.slice(0, 6)}`,
        qrUrl,
        nfcUrl,
        nfcNdefRecord: {
          recordType: 'url',
          data: nfcUrl,
        },
        qrDataUrl,
      };
    })
  );

  return {
    propertyId: normalizedPropertyId,
    generatedAt: Date.now(),
    baseUrl,
    rooms,
  };
}
