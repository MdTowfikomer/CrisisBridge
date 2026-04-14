import React, { useMemo, useState } from 'react';
import { Building2, Download, LoaderCircle, Nfc, QrCode, Copy, CheckCircle2, AlertCircle } from 'lucide-react';

const INITIAL_FORM = {
  propertyId: 'HOTEL-001',
  floorStart: 1,
  floorEnd: 2,
  roomsPerFloor: 10,
  baseUrl: window.location.origin,
};

function buildManifestCsv(manifest) {
  const header = ['propertyId', 'roomId', 'roomLabel', 'qrUrl', 'nfcUrl', 'shortCode'];
  const rows = manifest.rooms.map((room) => [
    manifest.propertyId,
    room.roomId,
    room.roomLabel,
    room.qrUrl,
    room.nfcUrl,
    room.shortCode,
  ]);

  const csvRows = [header, ...rows];
  return csvRows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value ?? '');
          if (text.includes(',') || text.includes('"') || text.includes('\n')) {
            return `"${text.replaceAll('"', '""')}"`;
          }
          return text;
        })
        .join(',')
    )
    .join('\n');
}

function getRequestErrorMessage(error, fallbackMessage) {
  if (error instanceof TypeError) {
    return 'Cannot reach provisioning server. Start backend with: pnpm --filter server dev';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}

export const ProvisioningDashboard = ({ apiBaseUrl, embedded = false }) => {
  const [form, setForm] = useState(INITIAL_FORM);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [manifest, setManifest] = useState(null);
  const [activeNfcRoom, setActiveNfcRoom] = useState('');
  const [nfcMessage, setNfcMessage] = useState('');

  const isNfcSupported = useMemo(
    () => window.isSecureContext && typeof window.NDEFReader !== 'undefined',
    []
  );

  const updateField = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const generateManifest = async () => {
    setIsGenerating(true);
    setError('');
    setNfcMessage('');

    try {
      const propertyId = form.propertyId.trim().toUpperCase();
      if (!propertyId) {
        throw new Error('Property ID is required.');
      }

      const response = await fetch(
        `${apiBaseUrl}/b2b/properties/${encodeURIComponent(propertyId)}/provision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseUrl: form.baseUrl.trim(),
            floorStart: Number(form.floorStart),
            floorEnd: Number(form.floorEnd),
            roomsPerFloor: Number(form.roomsPerFloor),
          }),
        }
      );

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to generate room artifacts.');
      }

      setManifest(payload);
    } catch (requestError) {
      console.error('Provisioning request failed:', requestError);
      setError(getRequestErrorMessage(requestError, 'Could not generate room artifacts for this property.'));
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadCsv = () => {
    if (!manifest) {
      return;
    }

    const csv = buildManifestCsv(manifest);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${manifest.propertyId.toLowerCase()}-room-manifest.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copyText = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setNfcMessage('Link copied to clipboard.');
    } catch (clipboardError) {
      console.error('Copy failed:', clipboardError);
      setNfcMessage('Clipboard access failed. Copy manually.');
    }
  };

  const writeNfc = async (room) => {
    if (!isNfcSupported) {
      setNfcMessage('Web NFC unavailable. Use an NFC encoder app with the provided URL.');
      return;
    }

    setActiveNfcRoom(room.roomId);
    setNfcMessage('');

    try {
      const writer = new window.NDEFReader();
      await writer.write({
        records: [{ recordType: 'url', data: room.nfcUrl }],
      });

      setNfcMessage(`NFC tag updated for Room ${room.roomId}.`);
    } catch (nfcError) {
      console.error('NFC write failed:', nfcError);
      setNfcMessage(
        nfcError instanceof Error
          ? `NFC write failed: ${nfcError.message}`
          : 'NFC write failed. Ensure Android Chrome + HTTPS context.'
      );
    } finally {
      setActiveNfcRoom('');
    }
  };

  const content = (
    <>
      <header className="rounded-2xl border border-slate-700/50 bg-[hsl(222,28%,14%)] p-5 shadow-lg sm:p-6">
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-blue-400" />
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500">B2B Operations</p>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Property Room Provisioning</h1>
          </div>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">
          Generate room-specific QR links, export room manifests, and program NFC stickers with one tap payloads.
        </p>
      </header>

      <section className="mt-4 rounded-2xl border border-slate-700/50 bg-[hsl(222,28%,14%)] p-5 shadow-lg sm:p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-2">
            <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Property ID</span>
            <input
              value={form.propertyId}
              onChange={(event) => updateField('propertyId', event.target.value)}
              className="w-full rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors duration-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
            />
          </label>

          <label className="space-y-2">
            <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Floor Start</span>
            <input
              type="number"
              value={form.floorStart}
              onChange={(event) => updateField('floorStart', event.target.value)}
              className="w-full rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors duration-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
            />
          </label>

          <label className="space-y-2">
            <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Floor End</span>
            <input
              type="number"
              value={form.floorEnd}
              onChange={(event) => updateField('floorEnd', event.target.value)}
              className="w-full rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors duration-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
            />
          </label>

          <label className="space-y-2">
            <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Rooms/Floor</span>
            <input
              type="number"
              value={form.roomsPerFloor}
              onChange={(event) => updateField('roomsPerFloor', event.target.value)}
              className="w-full rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors duration-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
            />
          </label>

          <label className="space-y-2 md:col-span-2 xl:col-span-1">
            <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Guest App URL</span>
            <input
              value={form.baseUrl}
              onChange={(event) => updateField('baseUrl', event.target.value)}
              className="w-full rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors duration-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={generateManifest}
            disabled={isGenerating}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold uppercase tracking-wider text-white transition-colors duration-200 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGenerating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
            Generate Room Artifacts
          </button>

          <button
            type="button"
            onClick={downloadCsv}
            disabled={!manifest}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-600/60 bg-slate-800/50 px-4 py-3 text-sm font-semibold uppercase tracking-wider text-slate-200 transition-colors duration-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Download CSV
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-red-400" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-red-300">Provisioning failed</p>
                <p className="mt-1 text-sm text-red-200">{error}</p>
              </div>
            </div>
          </div>
        )}

        {nfcMessage && (
          <div className="mt-4 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-blue-400" />
              <p className="text-sm text-blue-200">{nfcMessage}</p>
            </div>
          </div>
        )}
      </section>

      {manifest && (
        <section className="mt-4 rounded-2xl border border-slate-700/50 bg-[hsl(222,28%,14%)] p-5 shadow-lg sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Generated property</p>
              <h2 className="text-xl font-bold tracking-tight text-white">{manifest.propertyId}</h2>
            </div>
            <p className="text-sm font-medium text-slate-400">{manifest.rooms.length} room artifacts generated</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {manifest.rooms.map((room) => (
              <article key={room.roomId} className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Room</p>
                    <p className="text-lg font-bold tracking-tight text-white">{room.roomLabel}</p>
                  </div>
                  <span className="rounded-full bg-slate-700/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                    {room.shortCode}
                  </span>
                </div>

                <img
                  src={room.qrDataUrl}
                  alt={`QR code for ${room.roomLabel}`}
                  className="mx-auto mt-3 h-36 w-36 rounded-lg bg-white p-2"
                />

                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => copyText(room.qrUrl)}
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-600/50 bg-slate-800/50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-200 transition-colors duration-200 hover:bg-slate-700"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy QR Link
                  </button>

                  <button
                    type="button"
                    onClick={() => writeNfc(room)}
                    disabled={activeNfcRoom === room.roomId}
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white transition-colors duration-200 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {activeNfcRoom === room.roomId ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Nfc className="h-3.5 w-3.5" />
                    )}
                    Write NFC Sticker
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );

  if (embedded) {
    return <div>{content}</div>;
  }

  return (
    <div data-view="admin" className="min-h-screen bg-[hsl(224,40%,7%)] text-slate-100">
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">{content}</div>
    </div>
  );
};
