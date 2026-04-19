import React, { useState, useRef, useEffect } from 'react';
import { Upload, Map as MapIcon, Plus, Save, Trash2, Crosshair, Move, MousePointer2 } from 'lucide-react';
import { ref, set, push, onValue } from 'firebase/database';
import { rtdb } from '../lib/firebase';

export const BlueprintManager = ({ propertyId, apiBaseUrl }) => {
  const [svgContent, setSvgContent] = useState('');
  const [nodes, setNodes] = useState({});
  const [edges, setEdges] = useState([]);
  const [viewBox, setViewBox] = useState('0 0 1000 800');
  const [selectedNode, setSelectedNode] = useState(null);
  const [mode, setMode] = useState('select'); // 'select', 'add-node', 'add-edge'
  const [edgeStart, setEdgeStart] = useState(null);
  const svgRef = useRef(null);

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
      // Try to extract viewBox
      const match = content.match(/viewBox=["']([^"]+)["']/);
      if (match) setViewBox(match[1]);
    };
    reader.readAsText(file);
  };

  const handleSvgClick = (e) => {
    if (mode !== 'add-node') return;

    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursorpt = pt.matrixTransform(svg.getScreenCTM().inverse());

    const newNode = {
      id: `node_${Math.random().toString(36).substr(2, 9)}`,
      x: Math.round(cursorpt.x),
      y: Math.round(cursorpt.y),
      label: 'New Point',
      type: 'path',
      floor: 1
    };

    setNodes(prev => ({ ...prev, [newNode.id]: newNode }));
  };

  const handleNodeClick = (node, e) => {
    e.stopPropagation();
    if (mode === 'select') {
      setSelectedNode(node);
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
    try {
      await set(ref(rtdb, `maps/${propertyId}`), {
        propertyId,
        nodes,
        edges,
        viewBox,
        svgContent,
        updatedAt: Date.now()
      });
      alert('Map saved successfully');
    } catch (err) {
      console.error(err);
      alert('Failed to save map');
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex items-center justify-between bg-slate-800 p-4 rounded-xl border border-slate-700">
        <div className="flex items-center gap-4">
          <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-bold transition-colors">
            <Upload className="w-4 h-4" />
            Upload SVG
            <input type="file" accept=".svg" className="hidden" onChange={handleFileUpload} />
          </label>
          <div className="h-8 w-px bg-slate-700" />
          <div className="flex bg-slate-900 rounded-lg p-1">
            <button 
              onClick={() => setMode('select')}
              className={`p-2 rounded-md ${mode === 'select' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <MousePointer2 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setMode('add-node')}
              className={`p-2 rounded-md ${mode === 'add-node' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <Plus className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setMode('add-edge')}
              className={`p-2 rounded-md ${mode === 'add-edge' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <Move className="w-4 h-4" />
            </button>
          </div>
        </div>
        <button onClick={saveMap} className="bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded-lg flex items-center gap-2 text-sm font-bold transition-colors">
          <Save className="w-4 h-4" />
          Save Changes
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 flex-1 min-h-0">
        <div className="bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden relative">
          <svg
            ref={svgRef}
            viewBox={viewBox}
            onClick={handleSvgClick}
            className="w-full h-full cursor-crosshair"
          >
            {svgContent && (
              <g dangerouslySetInnerHTML={{ __html: svgContent.replace(/<\/?svg[^>]*>/gi, '') }} />
            )}
            
            {/* Edges */}
            {edges.map((edge, i) => {
              const from = nodes[edge.from];
              const to = nodes[edge.to];
              if (!from || !to) return null;
              return (
                <line 
                  key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y} 
                  stroke="#3b82f6" strokeWidth="3" opacity="0.6" 
                />
              );
            })}

            {/* Nodes */}
            {Object.values(nodes).map(node => (
              <g key={node.id} onClick={(e) => handleNodeClick(node, e)} className="cursor-pointer">
                <circle 
                  cx={node.x} cy={node.y} r="8" 
                  fill={selectedNode?.id === node.id ? '#f59e0b' : node.type === 'exit' ? '#10b981' : '#3b82f6'} 
                />
                {node.label && (
                  <text x={node.x} y={node.y - 12} fontSize="10" fill="white" textAnchor="middle" className="pointer-events-none font-bold">
                    {node.label}
                  </text>
                )}
              </g>
            ))}

            {edgeStart && nodes[edgeStart] && (
               <line x1={nodes[edgeStart].x} y1={nodes[edgeStart].y} x2={nodes[edgeStart].x} y2={nodes[edgeStart].y} stroke="#f59e0b" strokeWidth="2" strokeDasharray="4" />
            )}
          </svg>
        </div>

        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4 space-y-4 overflow-y-auto">
          <h3 className="font-bold text-lg text-white">Properties</h3>
          {selectedNode ? (
            <div className="space-y-4">
              <label className="block space-y-1">
                <span className="text-xs text-slate-400 uppercase font-bold">Label</span>
                <input 
                  value={selectedNode.label}
                  onChange={(e) => {
                    const updated = { ...selectedNode, label: e.target.value };
                    setSelectedNode(updated);
                    setNodes(prev => ({ ...prev, [updated.id]: updated }));
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white" 
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-400 uppercase font-bold">Type</span>
                <select 
                  value={selectedNode.type}
                  onChange={(e) => {
                    const updated = { ...selectedNode, type: e.target.value };
                    setSelectedNode(updated);
                    setNodes(prev => ({ ...prev, [updated.id]: updated }));
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="path">Path Node</option>
                  <option value="room">Room</option>
                  <option value="exit">Exit</option>
                  <option value="transition">Elevator/Stairs</option>
                </select>
              </label>
              <button 
                onClick={() => {
                  const updatedNodes = { ...nodes };
                  delete updatedNodes[selectedNode.id];
                  setNodes(updatedNodes);
                  setEdges(prev => prev.filter(e => e.from !== selectedNode.id && e.to !== selectedNode.id));
                  setSelectedNode(null);
                }}
                className="w-full bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/40 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Node
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">Select a node to edit its properties</p>
          )}

          <div className="pt-4 border-t border-slate-700">
             <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Instructions</h4>
             <ul className="text-xs text-slate-500 space-y-2">
                <li>â€¢ <b>Select Mode:</b> Click nodes to edit.</li>
                <li>â€¢ <b>Add Node:</b> Click anywhere on map to drop a node.</li>
                <li>â€¢ <b>Add Edge:</b> Click two nodes to connect them.</li>
             </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
