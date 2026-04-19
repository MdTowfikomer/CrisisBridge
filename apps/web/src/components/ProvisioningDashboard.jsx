import React, { useMemo, useState } from 'react';
import { Building2, Download, LoaderCircle, Nfc, QrCode, Copy, CheckCircle2, AlertCircle, LayoutGrid, List } from 'lucide-react';

const INITIAL_FORM = {
  propertyId: 'HOTEL-101',
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

export const ProvisioningDashboard = ({ apiBaseUrl, embedded = false }) => {
  const [form, setForm] = useState(INITIAL_FORM);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [manifest, setManifest] = useState(null);
  const [activeNfcRoom, setActiveNfcRoom] = useState('');
  const [nfcMessage, setNfcMessage] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'

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
      if (!propertyId) throw new Error('Property ID is required.');

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
      if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Generation failed.');
      setManifest(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadCsv = () => {
    if (!manifest) return;
    const csv = buildManifestCsv(manifest);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${manifest.propertyId.toLowerCase()}-manifest.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const content = (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* ── Industrial Header ── */}
      <div className="rounded-[2rem] border-2 border-white/5 bg-[#0c0d12] p-8 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
             <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-600/20">
               <Building2 className="h-6 w-6 text-white" />
             </div>
             <div>
               <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Infrastructure Layer</p>
               <h1 className="text-2xl md:text-3xl font-black tracking-tighter text-white uppercase">Room Provisioning</h1>
             </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-900/50 p-1.5 rounded-xl border border-white/5">
             <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                <LayoutGrid className="w-4 h-4" />
             </button>
             <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                <List className="w-4 h-4" />
             </button>
          </div>
        </div>
      </div>

      {/* ── Configuration Grid ── */}
      <div className="rounded-[2rem] border-2 border-white/5 bg-[#0c0d12] p-8 shadow-2xl">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Property ID', key: 'propertyId', type: 'text' },
            { label: 'Floor Start', key: 'floorStart', type: 'number' },
            { label: 'Floor End', key: 'floorEnd', type: 'number' },
            { label: 'Rooms/Floor', key: 'roomsPerFloor', type: 'number' },
          ].map(field => (
            <label key={field.key} className="block space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">{field.label}</span>
              <input
                type={field.type}
                value={form[field.key]}
                onChange={(e) => updateField(field.key, e.target.value)}
                className="w-full rounded-2xl border-2 border-slate-800 bg-slate-900/50 px-5 py-4 text-sm font-bold text-white outline-none transition-all focus:border-blue-600 focus:bg-slate-900"
              />
            </label>
          ))}
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <button
            onClick={generateManifest}
            disabled={isGenerating}
            className="flex-1 inline-flex items-center justify-center gap-3 rounded-2xl bg-blue-600 py-5 text-xs font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-blue-500 active:scale-95 disabled:opacity-50"       
          >
            {isGenerating ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <QrCode className="h-5 w-5" />}
            Initialize Artifacts
          </button>

          <button
            onClick={downloadCsv}
            disabled={!manifest}
            className="inline-flex items-center justify-center gap-3 rounded-2xl border-2 border-slate-800 bg-slate-900/50 px-8 py-5 text-xs font-black uppercase tracking-[0.2em] text-slate-400 transition-all hover:bg-slate-800 active:scale-95 disabled:opacity-20"
          >
            <Download className="h-5 w-5" />
            CSV Export
          </button>
        </div>
      </div>

      {/* ── Generated Manifest ── */}
      {manifest && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
          <div className="flex items-center justify-between px-4">
             <h2 className="text-sm font-black uppercase tracking-[0.3em] text-slate-500">Generated Assets: {manifest.propertyId}</h2>
             <span className="text-[10px] font-bold text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full">{manifest.rooms.length} Units</span>
          </div>

          <div className={viewMode === 'grid' 
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" 
            : "flex flex-col gap-3"
          }>
            {manifest.rooms.map((room) => (
              <div key={room.roomId} className={`rounded-[2rem] border-2 border-white/5 bg-[#0c0d12] p-6 transition-all hover:border-blue-600/30 ${viewMode === 'list' ? 'flex items-center justify-between' : ''}`}>
                <div className={viewMode === 'list' ? 'flex items-center gap-6' : ''}>
                  <div className="mb-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Secure Node</p>
                    <h3 className="text-xl font-black tracking-tighter text-white uppercase">{room.roomLabel}</h3>
                  </div>
                  <img src={room.qrDataUrl} className={`bg-white p-3 rounded-2xl shadow-inner ${viewMode === 'list' ? 'h-16 w-16 mb-0' : 'h-40 w-40 mx-auto mb-6'}`} />
                </div>

                <div className={`space-y-2 ${viewMode === 'list' ? 'w-48' : ''}`}>
                  <button onClick={() => navigator.clipboard.writeText(room.qrUrl)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 border border-white/5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-800">
                    <Copy className="h-3.5 w-3.5" />
                    Copy Link
                  </button>
                  <button onClick={() => {/* NFC Write logic */}} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600/10 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/20">
                    <Nfc className="h-3.5 w-3.5" />
                    Write Tag
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return embedded ? <div>{content}</div> : (
    <div className="min-h-screen bg-[#050608] p-6 md:p-10">{content}</div>
  );
};
