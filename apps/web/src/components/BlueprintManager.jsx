import React, { useState, useEffect } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { 
  Upload, Save, MousePointer2, Plus, Move, 
  Map as MapIcon, Loader2, AlertCircle 
} from 'lucide-react';
import { TacticalCanvas } from './TacticalCanvas';
import { NodePropertiesPanel } from './NodePropertiesPanel';

export const BlueprintManager = ({ propertyId, apiBaseUrl }) => {
  const [svgContent, setSvgContent] = useState('');
  const [nodes, setNodes] = useState({});
  const [edges, setEdges] = useState([]);
  const [viewBox, setViewBox] = useState('0 0 1000 800');
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [mode, setMode] = useState('select'); // 'select', 'add-node', 'add-edge'
  const [edgeStart, setEdgeStart] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) return;
    const mapRef = ref(rtdb, `maps/${propertyId}`);
    const unsubscribe = onValue(mapRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setNodes(data.nodes || {});
        setEdges(data.edges || []);
        setViewBox(data.viewBox || '0 0 1000 800');
        setSvgContent(data.svgContent || '');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [propertyId]);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      setSvgContent(content);
      const match = content.match(/viewBox=["']([^"]+)["']/);
      if (match) setViewBox(match[1]);
    };
    reader.readAsText(file);
  };

  const onSvgClick = (coords) => {
    if (mode !== 'add-node') return;
    const newNode = {
      id: `node_${Math.random().toString(36).substr(2, 9)}`,
      x: coords.x,
      y: coords.y,
      label: '',
      type: 'path',
      floor: 1
    };
    setNodes(prev => ({ ...prev, [newNode.id]: newNode }));
  };

  const onNodeClick = (node) => {
    if (mode === 'select') {
      setSelectedNodeId(node.id);
    } else if (mode === 'add-edge') {
      if (!edgeStart) {
        setEdgeStart(node.id);
      } else if (edgeStart !== node.id) {
        setEdges(prev => [...prev, { 
          from: edgeStart, 
          to: node.id, 
          weight: 10, 
          instruction: 'Proceed forward' 
        }]);
        setEdgeStart(null);
      }
    }
  };

  const saveMap = async () => {
    if (!propertyId) return;
    setIsSaving(true);
    try {
      await set(ref(rtdb, `maps/${propertyId}`), {
        propertyId,
        nodes,
        edges,
        viewBox,
        svgContent,
        updatedAt: Date.now()
      });
    } catch (err) {
      console.error(err);
      alert('Sync Failed');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return (
    <div className="h-full flex flex-col items-center justify-center text-slate-500">
      <Loader2 className="w-10 h-10 animate-spin mb-4" />
      <p className="font-black uppercase tracking-widest text-xs">Accessing Data Layer...</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-500 pb-20 md:pb-0">
      
      {/* ── Toolbar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-slate-900 border-2 border-white/5 p-4 rounded-[2rem] shadow-2xl gap-4">
        <div className="flex items-center gap-4">
          <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-2xl flex items-center gap-3 text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-600/20 active:scale-95">
            <Upload className="w-4 h-4" />
            Import SVG
            <input type="file" accept=".svg" className="hidden" onChange={handleFileUpload} />
          </label>
          
          <div className="h-10 w-px bg-white/10 hidden md:block" />
          
          <div className="flex bg-black/40 rounded-2xl p-1 border border-white/5">
            {[
              { id: 'select', icon: MousePointer2 },
              { id: 'add-node', icon: Plus },
              { id: 'add-edge', icon: Move }
            ].map(m => (
              <button 
                key={m.id}
                onClick={() => { setMode(m.id); setEdgeStart(null); }}
                className={`p-3 rounded-xl transition-all ${mode === m.id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <m.icon className="w-5 h-5" />
              </button>
            ))}
          </div>
        </div>

        <button 
          onClick={saveMap} 
          disabled={isSaving}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-8 py-3 rounded-2xl flex items-center justify-center gap-3 text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Commit Changes
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6 flex-1 min-h-[600px]">
        {/* Drawing Canvas */}
        <TacticalCanvas 
          viewBox={viewBox}
          svgContent={svgContent}
          nodes={nodes}
          edges={edges}
          mode={mode}
          selectedNode={nodes[selectedNodeId]}
          edgeStart={edgeStart}
          onSvgClick={onSvgClick}
          onNodeClick={onNodeClick}
        />

        {/* Properties Sidebar */}
        <div className="space-y-6">
           <NodePropertiesPanel 
             node={nodes[selectedNodeId]} 
             onUpdate={(updated) => setNodes(prev => ({ ...prev, [updated.id]: updated }))}
             onDelete={(id) => {
               const copy = { ...nodes };
               delete copy[id];
               setNodes(copy);
               setEdges(prev => prev.filter(e => e.from !== id && e.to !== id));
               setSelectedNodeId(null);
             }}
           />

           {/* Quick Stats HUD */}
           <div className="bg-slate-900/50 border border-white/5 rounded-[2rem] p-6 grid grid-cols-2 gap-4">
              <div>
                 <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1">Graph Nodes</p>
                 <p className="text-2xl font-black text-white">{Object.keys(nodes).length}</p>
              </div>
              <div>
                 <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1">Active Edges</p>
                 <p className="text-2xl font-black text-white">{edges.length}</p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
