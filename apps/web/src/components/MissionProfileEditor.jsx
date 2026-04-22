import React, { useState, useEffect } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { 
  Shield, Flame, Lock, Activity, 
  Settings2, Save, Info, CheckCircle2 
} from 'lucide-react';

const DEFAULT_PROFILES = [
  {
    id: 'standard',
    name: 'Standard Operations',
    weights: { exit: 1, safety: 1, path: 1, transition: 1 },
    highlightTypes: [],
    guidanceText: 'Proceed to your destination.'
  },
  {
    id: 'fire',
    name: 'Fire Evacuation',
    weights: { exit: 0.1, safety: 0.5, path: 1, transition: 1.5 },
    highlightTypes: ['exit', 'safety'],
    guidanceText: 'Evacuate immediately via nearest exit.'
  },
  {
    id: 'lockdown',
    name: 'Active Threat / Lockdown',
    weights: { exit: 10, safety: 1, path: 0.5, transition: 5 },
    highlightTypes: ['room'],
    guidanceText: 'Shelter in place. Avoid transit halls.'
  }
];

export const MissionProfileEditor = ({ propertyId }) => {
  const [profiles, setProfiles] = useState([]);
  const [selectedId, setSelectedId] = useState('standard');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    const profilesRef = ref(rtdb, `properties/${propertyId}/missionProfiles`);
    const unsubscribe = onValue(profilesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setProfiles(Object.values(data));
      } else {
        setProfiles(DEFAULT_PROFILES);
      }
    });
    return () => unsubscribe();
  }, [propertyId]);

  const activeProfile = profiles.find(p => p.id === selectedId) || DEFAULT_PROFILES[0];

  const updateProfile = (updates) => {
    setProfiles(prev => prev.map(p => 
      p.id === selectedId ? { ...p, ...updates } : p
    ));
  };

  const saveProfiles = async () => {
    setIsSaving(true);
    try {
      const profilesMap = {};
      profiles.forEach(p => profilesMap[p.id] = p);
      await set(ref(rtdb, `properties/${propertyId}/missionProfiles`), profilesMap);
    } catch (err) {
      console.error(err);
      alert('Failed to save profiles');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-slate-900 border-2 border-white/5 rounded-[2.5rem] p-8 space-y-8 shadow-2xl overflow-hidden relative">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-3 rounded-2xl">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-tighter text-white">Mission Profiles</h2>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Tactical Guidance Rules</p>
          </div>
        </div>
        <button 
          onClick={saveProfiles}
          disabled={isSaving}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-6 py-3 rounded-2xl flex items-center gap-3 text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
        >
          {isSaving ? <Settings2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Sync Profiles
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[250px_1fr] gap-8">
        {/* Profile List */}
        <div className="space-y-2">
          {profiles.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
                selectedId === p.id 
                ? 'bg-blue-600/10 border-blue-600 text-white' 
                : 'bg-black/20 border-white/5 text-slate-500 hover:border-white/10'
              }`}
            >
              {p.id === 'fire' ? <Flame className="w-5 h-5" /> : p.id === 'lockdown' ? <Lock className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
              <span className="text-xs font-black uppercase tracking-widest">{p.name}</span>
            </button>
          ))}
        </div>

        {/* Editor Area */}
        <div className="bg-black/40 rounded-[2rem] border border-white/5 p-8 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Pathfinding Weights</h3>
              {Object.entries(activeProfile.weights).map(([type, weight]) => (
                <div key={type} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">{type} Node</span>
                    <span className="text-xs font-mono font-bold text-blue-400">x{weight}</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="10" step="0.1"
                    value={weight}
                    onChange={(e) => updateProfile({ 
                      weights: { ...activeProfile.weights, [type]: parseFloat(e.target.value) } 
                    })}
                    className="w-full accent-blue-600 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Visual Directives</h3>
              <div className="space-y-3">
                {['exit', 'safety', 'room', 'transition'].map(type => (
                  <button
                    key={type}
                    onClick={() => {
                      const current = activeProfile.highlightTypes || [];
                      const next = current.includes(type) 
                        ? current.filter(t => t !== type)
                        : [...current, type];
                      updateProfile({ highlightTypes: next });
                    }}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                      activeProfile.highlightTypes?.includes(type)
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                      : 'bg-slate-900 border-white/5 text-slate-600'
                    }`}
                  >
                    <span className="text-[10px] font-black uppercase tracking-widest">{type} highlights</span>
                    {activeProfile.highlightTypes?.includes(type) && <CheckCircle2 className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-white/5">
             <label className="block space-y-2">
               <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Guest Instruction Text</span>
               <textarea 
                 value={activeProfile.guidanceText}
                 onChange={(e) => updateProfile({ guidanceText: e.target.value })}
                 className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl p-4 text-sm font-medium text-slate-300 min-h-[80px] focus:border-blue-600 outline-none"
               />
             </label>
          </div>

          <div className="bg-blue-600/5 border border-blue-500/20 rounded-2xl p-4 flex gap-4">
             <Info className="w-5 h-5 text-blue-400 shrink-0" />
             <p className="text-[10px] text-slate-400 leading-relaxed italic">
               Lower weights (0.1) prioritize paths through those nodes. Higher weights (10.0) discourage routing through them.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};
