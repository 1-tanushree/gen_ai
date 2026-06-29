import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Loader2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { OverruledResult, Severity, severityConfig } from '../utils/overruledCheck';

// ── Types ────────────────────────────────────────────────────────────────────
interface CitationInput {
  title: string;
  reference: string;
  ikDocId?: number;
  link?: string;
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  shortLabel: string;
  type: 'center' | 'primary' | 'secondary';
  severity: Severity | null;
  docId?: number;
  url?: string;
  court?: string;
  date?: string;
}

interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  weight: number;   // 2 = direct citation, 1 = cross-reference
}

interface TooltipState {
  x: number;
  y: number;
  node: GraphNode;
}

// ── Colour helpers ───────────────────────────────────────────────────────────
const NODE_COLOR: Record<string, string> = {
  center:    '#92400e',   // amber-800 — app theme
  HIGH:      '#ef4444',   // red-500
  MEDIUM:    '#f97316',   // orange-500
  LOW:       '#eab308',   // yellow-500
  SAFE:      '#22c55e',   // green-500
  UNKNOWN:   '#94a3b8',   // slate-400
  secondary: '#60a5fa',   // blue-400
};

function nodeColor(n: GraphNode): string {
  if (n.type === 'center')    return NODE_COLOR.center;
  if (n.type === 'secondary') return NODE_COLOR.secondary;
  return NODE_COLOR[n.severity ?? 'UNKNOWN'] ?? NODE_COLOR.UNKNOWN;
}

function nodeRadius(n: GraphNode): number {
  if (n.type === 'center')    return 22;
  if (n.type === 'primary')   return 16;
  return 11;
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// ── Fetch citation relationships ──────────────────────────────────────────────
async function fetchCites(docId: number): Promise<Array<{ tid: number; title: string; docsource?: string; publishdate?: string }>> {
  try {
    const res  = await fetch(`/api/doc/${docId}?maxcites=5`);
    const data = await res.json();
    return (data.cites ?? []).slice(0, 5);
  } catch {
    return [];
  }
}

// ── Component ────────────────────────────────────────────────────────────────
interface CitationGraphProps {
  centerLabel: string;
  citations: CitationInput[];
  overruledMap: Record<number, OverruledResult>;
  lang: 'en' | 'hi';
}

export function CitationGraph({ centerLabel, citations, overruledMap, lang }: CitationGraphProps) {
  const svgRef      = useRef<SVGSVGElement>(null);
  const zoomRef     = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [loading, setLoading]   = useState(true);
  const [tooltip, setTooltip]   = useState<TooltipState | null>(null);
  const [nodes,   setNodes]     = useState<GraphNode[]>([]);
  const [edges,   setEdges]     = useState<GraphEdge[]>([]);

  // ── Build graph data ────────────────────────────────────────────────────────
  useEffect(() => {
    if (citations.length === 0) { setLoading(false); return; }

    const CENTER_ID = '__center__';

    const initialNodes: GraphNode[] = [
      {
        id: CENTER_ID,
        label: centerLabel,
        shortLabel: truncate(centerLabel, 18),
        type: 'center',
        severity: null,
      },
      ...citations.map((c, i): GraphNode => ({
        id: c.ikDocId ? `doc_${c.ikDocId}` : `cite_${i}`,
        label: c.title,
        shortLabel: truncate(c.title, 22),
        type: 'primary',
        severity: c.ikDocId ? (overruledMap[c.ikDocId]?.severity ?? 'UNKNOWN') : 'UNKNOWN',
        docId: c.ikDocId,
        url: c.link,
      })),
    ];

    const initialEdges: GraphEdge[] = citations.map((c, i) => ({
      source: CENTER_ID,
      target: c.ikDocId ? `doc_${c.ikDocId}` : `cite_${i}`,
      weight: 2,
    }));

    setNodes(initialNodes);
    setEdges(initialEdges);

    // Fetch cross-citation edges for citations that have IK doc IDs
    const docsWithIds = citations.filter(c => c.ikDocId);
    if (docsWithIds.length === 0) { setLoading(false); return; }

    const primaryIds = new Set(docsWithIds.map(c => c.ikDocId!));

    Promise.all(docsWithIds.slice(0, 4).map(c => fetchCites(c.ikDocId!).then(cites => ({ parentId: c.ikDocId!, cites }))))
      .then(results => {
        const extraNodes: GraphNode[] = [];
        const extraEdges: GraphEdge[] = [];
        const seen = new Set<number>(primaryIds);
        seen.add(0); // sentinel

        results.forEach(({ parentId, cites }) => {
          cites.forEach(cited => {
            const targetId = `doc_${cited.tid}`;
            // Cross-edge between two primary nodes
            if (primaryIds.has(cited.tid)) {
              extraEdges.push({ source: `doc_${parentId}`, target: targetId, weight: 1 });
            } else if (!seen.has(cited.tid)) {
              // Secondary (external) node
              seen.add(cited.tid);
              extraNodes.push({
                id: targetId,
                label: cited.title,
                shortLabel: truncate(cited.title, 18),
                type: 'secondary',
                severity: null,
                docId: cited.tid,
                url: `https://indiankanoon.org/doc/${cited.tid}/`,
                court: cited.docsource,
                date: cited.publishdate,
              });
              extraEdges.push({ source: `doc_${parentId}`, target: targetId, weight: 1 });
            }
          });
        });

        setNodes(prev => [...prev, ...extraNodes]);
        setEdges(prev => [...prev, ...extraEdges]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [citations, overruledMap, centerLabel]);

  // ── D3 render ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const el     = svgRef.current;
    const width  = el.clientWidth  || 700;
    const height = el.clientHeight || 420;
    const svg    = d3.select(el);
    svg.selectAll('*').remove();

    // Defs — arrowhead marker
    const defs = svg.append('defs');
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 22).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', '#cbd5e1');

    // Zoom container
    const g = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4])
      .on('zoom', e => g.attr('transform', e.transform));
    svg.call(zoom);
    zoomRef.current = zoom;

    // Deep-copy nodes/edges so D3 can mutate them
    const simNodes: GraphNode[] = nodes.map(n => ({ ...n }));
    const idToIdx  = new Map(simNodes.map((n, i) => [n.id, i]));

    const simEdges = edges
      .map(e => ({
        source: idToIdx.get(typeof e.source === 'string' ? e.source : (e.source as GraphNode).id) ?? 0,
        target: idToIdx.get(typeof e.target === 'string' ? e.target : (e.target as GraphNode).id) ?? 0,
        weight: e.weight,
      }))
      .filter(e => e.source !== e.target);

    // Force simulation
    const sim = d3.forceSimulation<GraphNode>(simNodes)
      .force('link',    d3.forceLink(simEdges).distance((e: any) => e.weight === 2 ? 130 : 90).strength(0.6))
      .force('charge',  d3.forceManyBody().strength(-280))
      .force('center',  d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('collide', d3.forceCollide<GraphNode>(n => nodeRadius(n) + 18));

    // Edges
    const link = g.append('g').selectAll<SVGLineElement, typeof simEdges[0]>('line')
      .data(simEdges).join('line')
      .attr('stroke', d => d.weight === 2 ? '#94a3b8' : '#cbd5e1')
      .attr('stroke-width', d => d.weight === 2 ? 1.8 : 1.2)
      .attr('stroke-dasharray', d => d.weight === 1 ? '5,3' : null)
      .attr('marker-end', 'url(#arrow)');

    // Node groups
    const node = g.append('g').selectAll<SVGGElement, GraphNode>('g')
      .data(simNodes).join('g')
      .style('cursor', d => d.url ? 'pointer' : 'default')
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
          .on('end',   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      )
      .on('mouseenter', (e, d) => {
        const rect = el.getBoundingClientRect();
        setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, node: d });
      })
      .on('mouseleave', () => setTooltip(null))
      .on('click', (_, d) => { if (d.url) window.open(d.url, '_blank'); });

    // Glow filter for HIGH nodes
    const filter = defs.append('filter').attr('id', 'glow');
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
    filter.append('feMerge').selectAll('feMergeNode').data(['blur', 'SourceGraphic']).join('feMergeNode')
      .attr('in', d => d);

    node.append('circle')
      .attr('r', d => nodeRadius(d))
      .attr('fill', d => nodeColor(d))
      .attr('stroke', '#fff').attr('stroke-width', 2.5)
      .attr('filter', d => d.severity === 'HIGH' ? 'url(#glow)' : null);

    node.append('text')
      .text(d => d.shortLabel)
      .attr('text-anchor', 'middle')
      .attr('dy', d => nodeRadius(d) + 13)
      .attr('font-size', d => d.type === 'secondary' ? 9 : 10)
      .attr('fill', '#374151')
      .attr('font-family', 'system-ui, sans-serif');

    sim.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Initial zoom-to-fit after simulation settles
    sim.on('end', () => {
      const bounds = (g.node() as SVGGElement).getBBox();
      const scale  = Math.min(0.9, Math.min(width / (bounds.width + 60), height / (bounds.height + 60)));
      const tx = width  / 2 - scale * (bounds.x + bounds.width  / 2);
      const ty = height / 2 - scale * (bounds.y + bounds.height / 2);
      svg.transition().duration(600)
        .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    });

    return () => { sim.stop(); };
  }, [nodes, edges]);

  // ── Zoom controls ─────────────────────────────────────────────────────────
  const doZoom = (factor: number) => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(300)
      .call(zoomRef.current.scaleBy, factor);
  };
  const doReset = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(400)
      .call(zoomRef.current.transform, d3.zoomIdentity);
  };

  // ── Legend items ───────────────────────────────────────────────────────────
  const legend: { color: string; label: string; labelHi: string }[] = [
    { color: NODE_COLOR.center,    label: 'Your Case',         labelHi: 'आपका मामला' },
    { color: NODE_COLOR.HIGH,      label: 'Overruled',         labelHi: 'खारिज' },
    { color: NODE_COLOR.MEDIUM,    label: 'Possibly Overruled',labelHi: 'संभवतः खारिज' },
    { color: NODE_COLOR.SAFE,      label: 'Valid Law',         labelHi: 'वैध कानून' },
    { color: NODE_COLOR.UNKNOWN,   label: 'Unknown',           labelHi: 'अज्ञात' },
    { color: NODE_COLOR.secondary, label: 'Related Case',      labelHi: 'संबंधित मामला' },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
        <div>
          <h2 className="font-semibold text-gray-900">
            {lang === 'hi' ? 'उद्धरण नेटवर्क ग्राफ' : 'Citation Network Graph'}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {lang === 'hi'
              ? 'नोड पर होवर करें या क्लिक करें • स्क्रॉल करके ज़ूम करें • खींचकर पैन करें'
              : 'Hover or click a node · Scroll to zoom · Drag to pan'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => doZoom(1.3)} title="Zoom in"
            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600 transition-colors">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={() => doZoom(0.77)} title="Zoom out"
            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600 transition-colors">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={doReset} title="Reset view"
            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600 transition-colors">
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Graph area */}
      <div className="relative" style={{ height: 420 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              {lang === 'hi' ? 'ग्राफ बन रहा है...' : 'Building citation network...'}
            </div>
          </div>
        )}

        <svg ref={svgRef} className="w-full h-full bg-slate-50" />

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-20 bg-white rounded-xl shadow-lg border border-gray-200 p-3 text-xs w-56 pointer-events-none"
            style={{
              left: Math.min(tooltip.x + 12, (svgRef.current?.clientWidth ?? 700) - 240),
              top:  Math.max(tooltip.y - 80, 8),
            }}
          >
            <p className="font-semibold text-gray-900 mb-1 leading-snug">{tooltip.node.label}</p>
            {tooltip.node.court && <p className="text-gray-500">{tooltip.node.court}</p>}
            {tooltip.node.date  && <p className="text-gray-400">{tooltip.node.date}</p>}
            {tooltip.node.severity && (
              <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${severityConfig[tooltip.node.severity].bg} ${severityConfig[tooltip.node.severity].border} ${severityConfig[tooltip.node.severity].text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${severityConfig[tooltip.node.severity].dot}`} />
                {lang === 'hi' ? severityConfig[tooltip.node.severity].labelHi : severityConfig[tooltip.node.severity].label}
              </span>
            )}
            {tooltip.node.url && (
              <p className="mt-2 text-blue-500">{lang === 'hi' ? 'क्लिक करें →' : 'Click to open →'}</p>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1.5">
        {legend.map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
            <span className="text-xs text-gray-600">{lang === 'hi' ? l.labelHi : l.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#94a3b8" strokeWidth="1.8" /></svg>
          <span className="text-xs text-gray-500">{lang === 'hi' ? 'प्रत्यक्ष' : 'Direct'}</span>
          <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#cbd5e1" strokeWidth="1.2" strokeDasharray="5,3" /></svg>
          <span className="text-xs text-gray-500">{lang === 'hi' ? 'क्रॉस-संदर्भ' : 'Cross-ref'}</span>
        </div>
      </div>
    </div>
  );
}
