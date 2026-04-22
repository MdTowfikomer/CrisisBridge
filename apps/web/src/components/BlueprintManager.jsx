import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { 
  Upload, Save, MousePointer2, Plus, Move, 
  Map as MapIcon, Loader2, AlertCircle, Sparkles,
  CheckCircle2, AlertTriangle, Network, Shield, Undo2, Redo2, Trash2
} from 'lucide-react';
import { TacticalCanvas } from './TacticalCanvas';
import { NodePropertiesPanel } from './NodePropertiesPanel';
import { MissionProfileEditor } from './MissionProfileEditor';

export const BlueprintManager = ({ propertyId, apiBaseUrl }) => {
  const [svgContent, setSvgContent] = useState('');
  const [nodes, setNodes] = useState({});
  const [pendingNodes, setPendingNodes] = useState({});
  const [conflicts, setConflicts] = useState([]);
  const [edges, setEdges] = useState([]);
  const [viewBox, setViewBox] = useState('0 0 1000 800');
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [mode, setMode] = useState('select'); // 'select', 'add-node', 'add-edge'
  const [activeTab, setActiveTab] = useState('canvas'); // 'canvas', 'profiles'
  const [edgeStart, setEdgeStart] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [proposedEdges, setProposedEdges] = useState([]);
  const [loading, setLoading] = useState(true);

  // Zoom & History State
  const [zoom, setZoom] = useState(1);
  const [history, setHistory] = useState([{}]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const commitNodes = useCallback((newNodesUpdater) => {
    setNodes(prev => {
      const updated = typeof newNodesUpdater === 'function' ? newNodesUpdater(prev) : newNodesUpdater;
      
      setHistory(h => {
        const newHistory = h.slice(0, historyIndex + 1);
        newHistory.push(updated);
        // Keep last 50 states to prevent memory bloat
        if (newHistory.length > 50) return newHistory.slice(newHistory.length - 50);
        return newHistory;
      });
      setHistoryIndex(i => Math.min(i + 1, 50));
      
      return updated;
    });
  }, [historyIndex]);

  const undoNode = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(i => i - 1);
      setNodes(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);

  const redoNode = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(i => i + 1);
      setNodes(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);

  // Auto-calibrate threshold (OQ1)
  const snapThreshold = React.useMemo(() => {
    const [, , w, h] = viewBox.split(' ').map(Number);
    return Math.min(w || 1000, h || 800) * 0.05;
  }, [viewBox]);

  useEffect(() => {
    if (!propertyId) return;
    const mapRef = ref(rtdb, `maps/${propertyId}`);
    const unsubscribe = onValue(mapRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setNodes(data.nodes || {});
        if (historyIndex === 0) setHistory([data.nodes || {}]); // Only initialize history once
        setEdges(data.edges || []);
        setViewBox(data.viewBox || '0 0 1000 800');
        setSvgContent(data.svgContent || '');
      }
      setLoading(false);
    }, (error) => {
      console.error("Map Fetch Error:", error);
      alert(`Map Access Denied: ${error.message}\n\nPlease check that your Firebase RTDB 'users' node contains your UID with role: 'admin' or 'responder'.`);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [propertyId]);

  const runAutoDetection = useCallback(() => {
    if (!svgContent) return;
    setIsDetecting(true);
    
    // Branch 1: Raster Image (PNG/JPG) pixel scanning
    if (svgContent.includes('data-is-raster="true"')) {
      const matchHref = svgContent.match(/href="([^"]+)"/);
      const matchW = svgContent.match(/width="([^"]+)"/);
      const matchH = svgContent.match(/height="([^"]+)"/);
      
      if (matchHref && matchW && matchH) {
        const worker = new Worker(new URL('../workers/pixelScanner.worker.js', import.meta.url));
        worker.postMessage({ 
          base64: matchHref[1], 
          w: parseInt(matchW[1], 10), 
          h: parseInt(matchH[1], 10) 
        });
        
        worker.onmessage = (e) => {
          if (e.data.type === 'DETECTED') {
            const newNodes = e.data.payload;
            if (newNodes.length === 0) {
               alert("No safety features found. To auto-detect on an image, please place pure Red dots (Extinguisher) or Green dots (Exit) on the image before uploading.");
            } else {
               commitNodes(prev => {
                 const updated = { ...prev };
                 newNodes.forEach(n => updated[n.id] = n);
                 return updated;
               });
            }
            setIsDetecting(false);
            worker.terminate();
          } else if (e.data.type === 'ERROR') {
            console.error("Pixel Scanner Error:", e.data.error);
            setIsDetecting(false);
            worker.terminate();
          }
        };
        worker.onerror = (err) => {
          console.error("Worker Execution Error:", err);
          setIsDetecting(false);
          worker.terminate();
        };
      } else {
        setIsDetecting(false);
      }
      return;
    }

    // Branch 2: Standard SVG Semantic Tag parsing
    const worker = new Worker(new URL('../workers/graphBuilder.worker.js', import.meta.url));       
    worker.postMessage({ 
      svgString: svgContent, 
      threshold: snapThreshold,
      existingNodes: nodes 
    });

    worker.onmessage = ({ data }) => {
      if (data.status === 'success') {
        setPendingNodes(data.nodes);
        setConflicts(data.conflicts);
      }
      setIsDetecting(false);
      worker.terminate();
    };
  }, [svgContent, snapThreshold, nodes]);

  const approveAutoDetected = () => {
    commitNodes(prev => {
      const updatedNodes = { ...prev, ...pendingNodes };
      conflicts.forEach(c => {
        if (updatedNodes[c.manual.id]) {
          updatedNodes[c.manual.id].status = 'archived';
        }
        updatedNodes[c.auto.id] = { ...c.auto, verified: true };
      });
      return updatedNodes;
    });
    setPendingNodes({});
    setConflicts([]);
  };

  const deleteAllNodes = () => {
    if (window.confirm("Are you sure you want to delete all nodes and edges? This action can be undone.")) {
      commitNodes({});
      setEdges([]);
      setSelectedNodeId(null);
    }
  };

  const runAutoLink = useCallback(() => {
    setIsLinking(true);
    
    // Convert edges to a faster lookup
    const existingEdges = new Set(edges.map(e => `${e.from}-${e.to}`));
    
    const worker = new Worker(new URL('../workers/autoLinker.worker.js', import.meta.url));
    worker.postMessage({ 
      nodes,
      threshold: snapThreshold
    });

    worker.onmessage = ({ data }) => {
      if (data.status === 'success') {
        // Filter out edges that already exist
        const newProposals = data.proposedEdges.filter(e => 
          !existingEdges.has(`${e.from}-${e.to}`) && !existingEdges.has(`${e.to}-${e.from}`)
        );
        setProposedEdges(newProposals);
      }
      setIsLinking(false);
      worker.terminate();
    };
  }, [nodes, edges, snapThreshold]);

  const approveProposedEdges = () => {
    const edgesWithoutTempId = proposedEdges.map(({ id, dist, ...rest }) => rest);
    setEdges(prev => [...prev, ...edgesWithoutTempId]);
    setProposedEdges([]);
  };


  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type.startsWith('image/') && !file.type.includes('svg')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result;
        const img = new Image();
        img.onload = () => {
          const w = img.width;
          const h = img.height;
          // Wrap the raster image in a functional SVG so our core map engine keeps working identically
          const wrapperSvg = `<svg viewBox="0 0 ${w} ${h}"><image href="${base64}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" data-is-raster="true" /></svg>`;
          setSvgContent(wrapperSvg);
          setViewBox(`0 0 ${w} ${h}`);
          
          const resetNodes = {};
          Object.entries(nodes).forEach(([id, node]) => {
            resetNodes[id] = { ...node, verified: false };
          });
          setNodes(resetNodes);
          setHistory([resetNodes]);
          setHistoryIndex(0);
        };
        img.src = base64;
      };
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      setSvgContent(content);
      const match = content.match(/viewBox=["']([^"]+)["']/);
      if (match) setViewBox(match[1]);
      
      // Safety: reset verification on re-upload
      const resetNodes = {};
      Object.entries(nodes).forEach(([id, node]) => {
        resetNodes[id] = { ...node, verified: false };
      });
      setNodes(resetNodes);
      setHistory([resetNodes]);
      setHistoryIndex(0);
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
    commitNodes(prev => ({ ...prev, [newNode.id]: newNode }));
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
    <div className="h-full flex flex-col items-center justify-center text-dim">
      <Loader2 className="w-10 h-10 animate-spin mb-4" />
      <p className="font-black uppercase tracking-widest text-xs">Accessing Data Layer...</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-500 pb-20 md:pb-0">
      
      {/* ── Tab Navigation ── */}
      <div className="flex bg-surface border-2 border-tactical p-1 rounded-2xl w-fit shadow-lg shadow-black/5">
        <button 
          onClick={() => setActiveTab('canvas')}
          className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'canvas' ? 'bg-blue-600 text-white shadow-lg' : 'text-dim hover:bg-surface-alt hover:text-main'}`}
        >
          Tactical Canvas
        </button>
        <button 
          onClick={() => setActiveTab('profiles')}
          className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'profiles' ? 'bg-blue-600 text-white shadow-lg' : 'text-dim hover:bg-surface-alt hover:text-main'}`}
        >
          Mission Profiles
        </button>
      </div>

      {activeTab === 'profiles' ? (
        <MissionProfileEditor propertyId={propertyId} />
      ) : (
        <>
          {/* ── Pre-Processing Instructions ── */}
          <div className="bg-surface border-2 border-tactical rounded-[2rem] p-6 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
             <div className="flex items-start gap-4">
                <div className="bg-blue-600/10 p-3 rounded-2xl border border-blue-500/20 shrink-0">
                   <Sparkles className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-dim mb-2">Image Calibration Guide</h4>
                   <p className="text-xs text-main leading-relaxed font-medium">
                      Before uploading your escape plan, process it using <span className="text-main font-black">Nano Banana</span>. 
                      Use pure <strong className="text-red-500">RED</strong> dots to mark Fire Extinguishers and pure <strong className="text-emerald-500">GREEN</strong> dots for Exits. 
                      This ensures the CrisisBridge Pixel Scanner can automatically anchor safety nodes.
                   </p>
                </div>
             </div>
          </div>

          {/* ── Toolbar ── */}
          <div className="flex flex-col md:flex-row md:items-center justify-between bg-surface border-2 border-tactical p-4 rounded-[2rem] shadow-2xl gap-4">
            <div className="flex items-center gap-4">
              <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-2xl flex items-center gap-3 text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-600/20 active:scale-95 text-white">
                <Upload className="w-4 h-4" />
                Import Map
                <input type="file" accept=".svg,.png,.jpg,.jpeg" className="hidden" onChange={handleFileUpload} />
              </label>

              <button 
                onClick={runAutoDetection}
                disabled={!svgContent || isDetecting}
                className="bg-blue-600/10 hover:bg-blue-600 text-blue-500 dark:text-blue-400 hover:text-white border border-blue-500/20 px-6 py-3 rounded-2xl flex items-center gap-3 text-xs font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
                title={svgContent && svgContent.includes('data-is-raster="true"') ? 'Scans the image for Red (Extinguisher) and Green (Exit) color dots.' : 'Scans SVG for semantic safety tags.'}
              >
                {isDetecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Auto-Detect
              </button>
              <button 
                onClick={runAutoLink}
                disabled={Object.keys(nodes).length === 0 || isLinking}
                className="bg-purple-600/10 hover:bg-purple-600 text-purple-600 dark:text-purple-400 hover:text-white border border-purple-500/20 px-6 py-3 rounded-2xl flex items-center gap-3 text-xs font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
              >
                {isLinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Network className="w-4 h-4" />}
                Auto-Link
              </button>
              
              <button 
                onClick={deleteAllNodes}
                disabled={Object.keys(nodes).length === 0}
                className="bg-red-600/10 hover:bg-red-600 text-red-600 dark:text-red-400 hover:text-white border border-red-500/20 px-6 py-3 rounded-2xl flex items-center gap-3 text-xs font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
                title="Delete all nodes"
              >
                <Trash2 className="w-4 h-4" />
                Clear All
              </button>
              
              <div className="flex bg-surface-alt rounded-2xl p-1 border border-tactical shadow-lg">
                <button 
                  onClick={undoNode} disabled={historyIndex === 0}
                  className="p-2 rounded-xl text-dim hover:bg-surface hover:text-main transition-all disabled:opacity-30" title="Undo Node"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={redoNode} disabled={historyIndex === history.length - 1}
                  className="p-2 rounded-xl text-dim hover:bg-surface hover:text-main transition-all disabled:opacity-30" title="Redo Node"
                >
                  <Redo2 className="w-4 h-4" />
                </button>
              </div>

              
              <div className="h-10 w-px bg-tactical hidden md:block" />
              
              <div className="flex bg-surface-alt rounded-2xl p-1 border border-tactical">
                {[
                  { id: 'select', icon: MousePointer2 },
                  { id: 'add-node', icon: Plus },
                  { id: 'add-edge', icon: Move }
                ].map(m => (
                  <button 
                    key={m.id}
                    onClick={() => { setMode(m.id); setEdgeStart(null); }}
                    className={`p-3 rounded-xl transition-all ${mode === m.id ? 'bg-blue-600 text-white shadow-lg' : 'text-dim hover:text-main'}`}
                  >
                    <m.icon className="w-5 h-5" />
                  </button>
                ))}
              </div>
            </div>

            <button 
              onClick={saveMap} 
              disabled={isSaving}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-8 py-3 rounded-2xl flex items-center justify-center gap-3 text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20 active:scale-95 text-white"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Commit Changes
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6 flex-1 min-h-[600px]">
            {/* Drawing Canvas */}
            <div className="relative flex flex-col gap-4">
              {(Object.keys(pendingNodes).length > 0 || conflicts.length > 0) && (
                <div className="bg-blue-600/20 border-2 border-blue-500/40 rounded-[2rem] p-6 flex items-center justify-between shadow-xl backdrop-blur-md animate-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <div className="bg-blue-600 p-2 rounded-lg">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 dark:text-blue-400 leading-none mb-1">Detection Result</p>
                        <p className="text-sm font-bold text-main">{Object.keys(pendingNodes).length} New Nodes found</p>
                      </div>
                    </div>

                    {conflicts.length > 0 && (
                      <div className="flex items-center gap-2 border-l border-tactical pl-6">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 leading-none mb-1">Conflicts</p>
                          <p className="text-sm font-bold text-main">{conflicts.length} Overlaps Resolved</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => { setPendingNodes({}); setConflicts([]); }}
                      className="px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-dim hover:bg-surface-alt transition-all"
                    >
                      Discard
                    </button>
                    <button 
                      onClick={approveAutoDetected}
                      className="bg-blue-600 hover:bg-blue-500 px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approve & Merge
                    </button>
                  </div>
                </div>
              )}

              {proposedEdges.length > 0 && (
                <div className="bg-purple-600/20 border-2 border-purple-500/40 rounded-[2rem] p-6 flex flex-col md:flex-row md:items-center justify-between shadow-xl backdrop-blur-md animate-in slide-in-from-top-4 duration-500 gap-4">
                  <div className="flex items-center gap-6 overflow-x-auto pb-2 md:pb-0 scrollbar-thin">
                    <div className="flex items-center gap-2 min-w-max">
                      <div className="bg-purple-600 p-2 rounded-lg">
                        <Network className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 leading-none mb-1">Proposal Result</p>
                        <p className="text-sm font-bold text-main">{proposedEdges.length} Connections</p>
                      </div>
                    </div>

                    <div className="flex gap-2 flex-nowrap">
                      {proposedEdges.slice(0, 3).map((edge, idx) => (
                        <div key={edge.id || idx} className="bg-surface-alt border border-tactical py-1 px-3 rounded-lg flex items-center gap-2 text-xs font-mono min-w-max shadow-sm">
                          <span className="text-main truncate max-w-[80px]">{nodes[edge.from]?.label || nodes[edge.from]?.type}</span>
                          <span className="text-purple-600 dark:text-purple-400">↔</span>
                          <span className="text-dim truncate max-w-[80px]">{nodes[edge.to]?.label || nodes[edge.to]?.type}</span>
                        </div>
                      ))}
                      {proposedEdges.length > 3 && (
                        <div className="bg-surface-alt py-1 px-3 rounded-lg text-xs font-bold text-dim flex items-center shadow-sm">
                          +{proposedEdges.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setProposedEdges([])}
                      className="px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-dim hover:bg-surface-alt transition-all"
                    >
                      Discard
                    </button>
                    <button 
                      onClick={approveProposedEdges}
                      className="bg-purple-600 hover:bg-purple-500 px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all shadow-lg shadow-purple-600/20 flex items-center gap-2 min-w-max"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Link All
                    </button>
                  </div>
                </div>
              )}

              <TacticalCanvas 
                viewBox={viewBox}
                svgContent={svgContent}
                nodes={nodes}
                pendingNodes={pendingNodes}
                edges={edges}
                proposedEdges={proposedEdges}
                mode={mode}
                selectedNode={nodes[selectedNodeId]}
                edgeStart={edgeStart}
                onSvgClick={onSvgClick}
                onNodeClick={onNodeClick}
                zoom={zoom}
                onZoomIn={() => setZoom(z => Math.min(z + 0.25, 4))}
                onZoomOut={() => setZoom(z => Math.max(z - 0.25, 0.5))}
              />
            </div>

            {/* Properties Sidebar */}
            <div className="space-y-6">
               <NodePropertiesPanel 
                 node={nodes[selectedNodeId]} 
                 onUpdate={(updated) => commitNodes(prev => ({ ...prev, [updated.id]: updated }))}
                 onDelete={(id) => {
                   commitNodes(prev => {
                     const copy = { ...prev };
                     delete copy[id];
                     return copy;
                   });
                   setEdges(prev => prev.filter(e => e.from !== id && e.to !== id));
                   setSelectedNodeId(null);
                 }}
               />

               {/* Quick Stats HUD */}
               <div className="bg-surface border border-tactical rounded-[2rem] p-6 grid grid-cols-2 gap-4 shadow-lg shadow-black/5">
                  <div>
                     <p className="text-[8px] font-black text-dim uppercase tracking-[0.2em] mb-1">Graph Nodes</p>
                     <p className="text-2xl font-black text-main">{Object.keys(nodes).length}</p>
                  </div>
                  <div>
                     <p className="text-[8px] font-black text-dim uppercase tracking-[0.2em] mb-1">Active Edges</p>
                     <p className="text-2xl font-black text-main">{edges.length}</p>
                  </div>
               </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
