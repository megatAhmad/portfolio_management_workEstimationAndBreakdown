import { toPng } from "html-to-image";
import type { TaskNode } from "../types/task";
import type { ScheduleResponse } from "../types/task";

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export { toPng };

/**
 * Build a self-contained interactive HTML file from the task DAG.
 * Uses the same topological-layered layout as the in-app view,
 * includes both dependency and parent-child edges, and measures
 * actual node heights before drawing edges.
 */
export function exportDAGAsHtml(tasks: TaskNode[], filename: string) {
  interface FlatExport {
    id: string;
    title: string;
    description: string;
    hours: number;
    priority: string;
    deps: string[];
    parentId: string | null;
  }

  function flatten(items: TaskNode[], parentId: string | null): FlatExport[] {
    const out: FlatExport[] = [];
    for (const t of items) {
      out.push({
        id: t.id,
        title: t.title,
        description: t.description,
        hours: t.estimated_hours,
        priority: t.priority,
        deps: t.dependencies,
        parentId,
      });
      if (t.children.length > 0) out.push(...flatten(t.children, t.id));
    }
    return out;
  }

  const flatTasks = flatten(tasks, null);
  const depEdges: { from: string; to: string }[] = [];
  const childEdges: { from: string; to: string }[] = [];

  for (const t of flatTasks) {
    for (const dep of t.deps) {
      if (flatTasks.some((ft) => ft.id === dep)) {
        depEdges.push({ from: dep, to: t.id });
      }
    }
    if (t.parentId && flatTasks.some((ft) => ft.id === t.parentId)) {
      childEdges.push({ from: t.parentId, to: t.id });
    }
  }

  const nodesJson = JSON.stringify(
    flatTasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      hours: t.hours,
      priority: t.priority,
    }))
  );

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Task DAG - AI-Ops Task Architect</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; overflow: auto; }
  .header { padding: 1rem 1.5rem; font-size: 1.2rem; font-weight: 700; border-bottom: 1px solid #475569; background: #1e293b; position: sticky; top: 0; z-index: 100; }
  .canvas { position: relative; }
  svg.edges { position: absolute; top: 0; left: 0; pointer-events: none; z-index: 1; }
  .node {
    position: absolute; background: #334155; border: 1px solid #475569;
    border-radius: 8px; padding: 10px 12px; width: 240px;
    font-size: 13px; cursor: move; user-select: none; z-index: 2;
  }
  .node:hover { border-color: #3b82f6; box-shadow: 0 0 8px rgba(59,130,246,0.3); }
  .node-title { font-weight: 600; margin-bottom: 4px; font-size: 13px; }
  .node-desc { color: #94a3b8; font-size: 11px; margin-bottom: 6px; line-height: 1.3; word-wrap: break-word; }
  .node-meta { display: flex; justify-content: space-between; align-items: center; }
  .badge {
    padding: 2px 8px; border-radius: 999px; font-size: 10px;
    text-transform: uppercase; font-weight: 700;
  }
  .badge-critical { background: rgba(239,68,68,.2); color: #fca5a5; }
  .badge-high { background: rgba(245,158,11,.2); color: #fcd34d; }
  .badge-medium { background: rgba(59,130,246,.2); color: #93c5fd; }
  .badge-low { background: rgba(107,114,128,.2); color: #d1d5db; }
  .prio-bar { width: 4px; position: absolute; left: 0; top: 0; bottom: 0; border-radius: 8px 0 0 8px; }
</style>
</head>
<body>
<div class="header">Task DAG - AI-Ops Task Architect</div>
<div class="canvas" id="canvas">
  <svg class="edges" id="edgeSvg"></svg>
</div>
<script>
const TASKS = ${nodesJson};
const DEP_EDGES = ${JSON.stringify(depEdges)};
const CHILD_EDGES = ${JSON.stringify(childEdges)};
const ALL_EDGES = [...DEP_EDGES, ...CHILD_EDGES];
const PRIO_COLORS = { critical:'#ef4444', high:'#f59e0b', medium:'#3b82f6', low:'#6b7280' };

// Layout constants (matching in-app)
const NODE_W = 240;
const X_GAP = 40;
const Y_GAP = 70;
const X_START = 50;
const Y_START = 60;

// 1. Build predecessor map (both dep + child edges)
const predecessors = {};
TASKS.forEach(t => { predecessors[t.id] = []; });
ALL_EDGES.forEach(e => {
  if (predecessors[e.to]) predecessors[e.to].push(e.from);
});

// 2. Longest-path layering
const layerOf = {};
const computing = new Set();
function computeLayer(id) {
  if (layerOf[id] !== undefined) return layerOf[id];
  if (computing.has(id)) return 0;
  computing.add(id);
  const preds = predecessors[id] || [];
  const layer = preds.length === 0 ? 0 : Math.max(...preds.map(computeLayer)) + 1;
  layerOf[id] = layer;
  computing.delete(id);
  return layer;
}
TASKS.forEach(t => computeLayer(t.id));

// 3. Group by layer
const layerGroups = {};
TASKS.forEach(t => {
  const l = layerOf[t.id] || 0;
  if (!layerGroups[l]) layerGroups[l] = [];
  layerGroups[l].push(t.id);
});
const sortedLayers = Object.keys(layerGroups).map(Number).sort((a, b) => a - b);

// 4. Barycentric ordering to reduce edge crossings
const xOrder = {};
sortedLayers.forEach((layerIdx, li) => {
  const layerNodes = layerGroups[layerIdx];
  if (li === 0) {
    layerNodes.forEach((id, i) => { xOrder[id] = i; });
  } else {
    const scored = layerNodes.map(id => {
      const preds = (predecessors[id] || []).filter(p => xOrder[p] !== undefined);
      const avg = preds.length > 0
        ? preds.reduce((s, p) => s + xOrder[p], 0) / preds.length
        : Infinity;
      return { id, avg };
    });
    scored.sort((a, b) => a.avg - b.avg);
    scored.forEach((s, i) => { xOrder[s.id] = i; });
  }
});

// 5. Compute initial positions (y will be adjusted after measuring heights)
const maxLayerSize = Math.max(...sortedLayers.map(l => layerGroups[l].length));
const totalW = maxLayerSize * (NODE_W + X_GAP);
const pos = {};

sortedLayers.forEach(layerIdx => {
  const layerNodes = layerGroups[layerIdx];
  layerNodes.sort((a, b) => (xOrder[a] || 0) - (xOrder[b] || 0));
  const lw = layerNodes.length * (NODE_W + X_GAP) - X_GAP;
  const startX = X_START + Math.max(0, (totalW - lw) / 2);
  layerNodes.forEach((id, i) => {
    pos[id] = {
      x: startX + i * (NODE_W + X_GAP),
      y: 0, // placeholder, set after height measurement
      h: 0, // measured height
      layer: layerIdx
    };
  });
});

// 6. Render nodes into DOM
const canvas = document.getElementById('canvas');
const taskMap = Object.fromEntries(TASKS.map(t => [t.id, t]));
const nodeEls = {};

TASKS.forEach(t => {
  const p = pos[t.id]; if (!p) return;
  const div = document.createElement('div');
  div.className = 'node';
  div.id = 'node-' + t.id;
  div.style.left = p.x + 'px';
  div.style.top = '0px'; // temporary
  div.style.width = NODE_W + 'px';
  div.innerHTML =
    '<div class="prio-bar" style="background:' + (PRIO_COLORS[t.priority] || '#3b82f6') + '"></div>' +
    '<div class="node-title">' + escapeHtml(t.title) + '</div>' +
    '<div class="node-desc">' + escapeHtml(t.description.length > 120 ? t.description.slice(0, 120) + '...' : t.description) + '</div>' +
    '<div class="node-meta"><span>' + t.hours + 'h</span><span class="badge badge-' + t.priority + '">' + t.priority + '</span></div>';
  canvas.appendChild(div);
  nodeEls[t.id] = div;
});

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// 7. Measure heights and assign final Y positions per layer
requestAnimationFrame(() => {
  // Measure
  TASKS.forEach(t => {
    const el = nodeEls[t.id];
    if (el) pos[t.id].h = el.offsetHeight;
  });

  // Compute max height per layer
  const layerMaxH = {};
  sortedLayers.forEach(l => {
    layerMaxH[l] = Math.max(...layerGroups[l].map(id => pos[id].h || 80));
  });

  // Assign Y positions: each layer's Y = sum of previous layers' heights + gaps
  let currentY = Y_START;
  sortedLayers.forEach(l => {
    layerGroups[l].forEach(id => {
      pos[id].y = currentY;
      const el = nodeEls[id];
      if (el) el.style.top = currentY + 'px';
    });
    currentY += layerMaxH[l] + Y_GAP;
  });

  // Resize canvas and SVG
  const allPos = Object.values(pos);
  const maxX = Math.max(...allPos.map(p => p.x)) + NODE_W + 80;
  const maxY = Math.max(...allPos.map(p => p.y + p.h)) + 80;
  canvas.style.width = maxX + 'px';
  canvas.style.height = maxY + 'px';

  const svg = document.getElementById('edgeSvg');
  svg.setAttribute('width', maxX);
  svg.setAttribute('height', maxY);

  // Arrowhead markers
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML =
    '<marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/></marker>' +
    '<marker id="arrow-child" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8"/></marker>';
  svg.appendChild(defs);

  // Draw all edges
  drawAllEdges();

  // Setup drag for each node
  TASKS.forEach(t => {
    const el = nodeEls[t.id];
    if (!el) return;
    let dragging = false, mx = 0, my = 0;
    el.addEventListener('mousedown', e => {
      dragging = true; mx = e.clientX; my = e.clientY;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.clientX - mx, dy = e.clientY - my;
      mx = e.clientX; my = e.clientY;
      pos[t.id].x += dx; pos[t.id].y += dy;
      el.style.left = pos[t.id].x + 'px';
      el.style.top = pos[t.id].y + 'px';
      drawAllEdges();
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  });
});

function drawAllEdges() {
  const svg = document.getElementById('edgeSvg');
  // Remove old paths (keep defs)
  svg.querySelectorAll('path.edge').forEach(p => p.remove());

  function drawEdge(from, to, isDashed) {
    const p1 = pos[from], p2 = pos[to];
    if (!p1 || !p2) return;

    const x1 = p1.x + NODE_W / 2;
    const y1 = p1.y + (p1.h || 80);
    const x2 = p2.x + NODE_W / 2;
    const y2 = p2.y;

    const gap = Math.abs(y2 - y1);
    const cpOffset = Math.max(30, gap * 0.4);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'edge');
    path.setAttribute('d', 'M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + (y1 + cpOffset) + ' ' + x2 + ' ' + (y2 - cpOffset) + ' ' + x2 + ' ' + y2);
    path.setAttribute('stroke', isDashed ? '#94a3b8' : '#64748b');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    if (isDashed) path.setAttribute('stroke-dasharray', '6,4');
    path.setAttribute('marker-end', isDashed ? 'url(#arrow-child)' : 'url(#arrow)');
    svg.appendChild(path);
  }

  DEP_EDGES.forEach(e => drawEdge(e.from, e.to, false));
  CHILD_EDGES.forEach(e => drawEdge(e.from, e.to, true));
}
</script>
</body>
</html>`;

  downloadFile(html, filename, "text/html");
}

/**
 * Export Gantt chart container as PNG.
 */
export async function exportGanttAsPng(
  containerEl: HTMLElement,
  filename: string
) {
  const dataUrl = await toPng(containerEl, {
    backgroundColor: "#0f172a",
    pixelRatio: 2,
  });
  downloadDataUrl(dataUrl, filename);
}

/**
 * Export Gantt as a self-contained HTML file.
 */
export function exportGanttAsHtml(
  schedule: ScheduleResponse,
  filename: string
) {
  const sprintsJson = JSON.stringify(schedule.sprints);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sprint Schedule - AI-Ops Task Architect</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; padding: 1.5rem; }
  h1 { font-size: 1.3rem; margin-bottom: 0.5rem; }
  .summary { color: #94a3b8; font-size: 0.9rem; margin-bottom: 1.5rem; }
  .summary span { background: #334155; padding: 4px 10px; border-radius: 4px; margin-right: 12px; }
  .sprint { background: #334155; border: 1px solid #475569; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .sprint h3 { display: flex; justify-content: space-between; font-size: 0.95rem; margin-bottom: 0.5rem; }
  .sprint h3 span { font-weight: 400; font-size: 0.8rem; color: #94a3b8; }
  .bar-bg { height: 6px; background: #0f172a; border-radius: 3px; margin-bottom: 0.75rem; overflow: hidden; }
  .bar-fill { height: 100%; background: #3b82f6; border-radius: 3px; }
  ul { list-style: none; }
  li { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; padding: 3px 0; color: #94a3b8; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .dot-critical { background: #ef4444; } .dot-high { background: #f59e0b; }
  .dot-medium { background: #3b82f6; } .dot-low { background: #6b7280; }
  .gantt { margin-top: 1.5rem; overflow-x: auto; }
  .gantt table { border-collapse: collapse; min-width: 100%; }
  .gantt th, .gantt td { padding: 6px 4px; font-size: 0.8rem; border-bottom: 1px solid #475569; white-space: nowrap; }
  .gantt th { background: #1e293b; color: #94a3b8; text-align: left; position: sticky; top: 0; }
  .gantt-bar { height: 20px; border-radius: 4px; min-width: 20px; }
  .gantt-bar-critical { background: #ef4444; } .gantt-bar-high { background: #f59e0b; }
  .gantt-bar-medium { background: #3b82f6; } .gantt-bar-low { background: #6b7280; }
</style>
</head>
<body>
<h1>Sprint Schedule</h1>
<div class="summary">
  <span>Total: ${schedule.total_hours}h</span>
  <span>Sprints: ${schedule.total_sprints}</span>
  <span>Capacity/Sprint: ${schedule.capacity_per_sprint.toFixed(1)}h</span>
</div>
<div id="sprints"></div>
<div class="gantt" id="gantt"></div>
<script>
const sprints = ${sprintsJson};
const container = document.getElementById('sprints');
sprints.forEach(s => {
  const pct = ((s.total_hours / s.capacity) * 100).toFixed(0);
  let tasks = '';
  s.tasks.forEach(t => {
    tasks += '<li><span class="dot dot-'+t.priority+'"></span>'+t.title+' &mdash; '+t.estimated_hours+'h</li>';
  });
  container.innerHTML += '<div class="sprint"><h3>Sprint '+s.sprint_number+'<span>'+s.total_hours.toFixed(1)+'h / '+s.capacity.toFixed(1)+'h ('+pct+'%)</span></h3><div class="bar-bg"><div class="bar-fill" style="width:'+Math.min(100,pct)+'%"></div></div><ul>'+tasks+'</ul></div>';
});

const allTasks = sprints.flatMap(s => s.tasks);
if (allTasks.length) {
  const minDay = Math.min(...allTasks.map(t => t.start_day));
  const maxDay = Math.max(...allTasks.map(t => t.end_day));
  let hdr = '<tr><th>Task</th><th>Hours</th>';
  for (let d = minDay; d <= maxDay; d++) hdr += '<th>D'+d+'</th>';
  hdr += '</tr>';
  let rows = '';
  allTasks.forEach(t => {
    rows += '<tr><td>[S'+t.sprint+'] '+t.title+'</td><td>'+t.estimated_hours+'h</td>';
    for (let d = minDay; d <= maxDay; d++) {
      if (d >= t.start_day && d <= t.end_day)
        rows += '<td><div class="gantt-bar gantt-bar-'+t.priority+'">&nbsp;</div></td>';
      else rows += '<td></td>';
    }
    rows += '</tr>';
  });
  document.getElementById('gantt').innerHTML = '<table>'+hdr+rows+'</table>';
}
</script>
</body>
</html>`;

  downloadFile(html, filename, "text/html");
}
