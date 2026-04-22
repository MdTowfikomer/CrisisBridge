import React from 'react';
import { Trash2, Tag, Box, Info } from 'lucide-react';

export const NodePropertiesPanel = ({ node, onUpdate, onDelete }) => {
  if (!node) {
    return (
      <div className="bg-surface border border-tactical rounded-[2rem] p-8 flex flex-col items-center justify-center text-center space-y-4">
        <div className="p-4 bg-surface-alt rounded-full">
           <Info className="w-8 h-8 text-dim" />
        </div>
        <div>
           <p className="text-sm font-bold text-main">Tactical Editor</p>
           <p className="text-[10px] uppercase tracking-widest text-dim mt-1">Select a node to edit properties</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface border-2 border-tactical rounded-[2rem] p-6 space-y-6 shadow-2xl animate-in fade-in zoom-in duration-300">
      <div className="flex items-center gap-3 border-b border-tactical pb-4">
         <div className="bg-blue-600 p-2 rounded-xl">
           <Tag className="w-4 h-4 text-white" />
         </div>
         <h3 className="font-black uppercase tracking-tighter text-main">Node Identity</h3>
      </div>

      <div className="space-y-4">
        <label className="block space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-dim ml-1">Physical Label</span>
          <input
            value={node.label || ''}
            onChange={(e) => onUpdate({ ...node, label: e.target.value })}
            placeholder="e.g. Room 305"
            className="w-full bg-surface-alt border-2 border-tactical rounded-2xl px-5 py-4 text-sm font-bold text-main focus:border-blue-600 outline-none transition-all"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-dim ml-1">Zone Mapping</span>
          <input
            value={node.zone || ''}
            onChange={(e) => onUpdate({ ...node, zone: e.target.value })}
            placeholder="e.g. North Wing"
            className="w-full bg-surface-alt border-2 border-tactical rounded-2xl px-5 py-4 text-sm font-bold text-main focus:border-blue-600 outline-none transition-all"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-dim ml-1">Classification</span>
          <select
            value={node.type}
            onChange={(e) => onUpdate({ ...node, type: e.target.value })}
            className="w-full bg-surface-alt border-2 border-tactical rounded-2xl px-5 py-4 text-sm font-bold text-main focus:border-blue-600 outline-none appearance-none"
          >
            <option value="path">Transit Path</option>
            <option value="room">Secure Room</option>
            <option value="exit">Emergency Exit</option>
            <option value="transition">Floor Link (Stairs/Lift)</option>
          </select>
        </label>

        <div className="pt-4 grid grid-cols-2 gap-3">
           <div className="bg-surface-alt p-4 rounded-2xl border border-tactical">
              <p className="text-[8px] font-black text-dim uppercase mb-1">X-COORD</p>
              <p className="text-xs font-mono font-bold text-blue-500">{node.x}</p>
           </div>
           <div className="bg-surface-alt p-4 rounded-2xl border border-tactical">
              <p className="text-[8px] font-black text-dim uppercase mb-1">Y-COORD</p>
              <p className="text-xs font-mono font-bold text-blue-500">{node.y}</p>
           </div>
        </div>

        <button
          onClick={() => onDelete(node.id)}
          className="w-full mt-6 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border-2 border-red-600/20 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-3 group"
        >
          <Trash2 className="w-4 h-4 group-hover:animate-bounce" />
          Purge Node
        </button>
      </div>
    </div>
  );
};
