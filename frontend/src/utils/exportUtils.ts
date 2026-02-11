import { toPng } from "html-to-image";
import type { TaskNode } from "../types/task";
import type { ScheduleResponse } from "../types/task";

/**
 * Download a data URL or blob as a file.
 */
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

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Export a DOM element as PNG using html-to-image.
 */
export async function exportElementAsPng(
  element: HTMLElement,
  filename: string
) {
  const dataUrl = await toPng(element, {
    backgroundColor: "#0f172a",
    pixelRatio: 2,
  });
  downloadDataUrl(dataUrl, filename);
}

/**
 * Export the React Flow viewport as PNG.
 * We target the .react-flow__viewport inside the container.
 */
export async function exportReactFlowAsPng(
  containerEl: HTMLElement,
  filename: string
) {
  const viewport =
    containerEl.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport) return;

  // Temporarily expand viewport to fit all content
  const rf = containerEl.querySelector<HTMLElement>(".react-flow");
  if (!rf) return;

  const dataUrl = await toPng(rf, {
    backgroundColor: "#0f172a",
    pixelRatio: 2,
    filter: (node) => {
      // Exclude minimap and controls from the export
      const cls = (node as HTMLElement).className || "";
      if (typeof cls === "string") {
        if (cls.includes("react-flow__minimap")) return false;
        if (cls.includes("react-flow__controls")) return false;
      }
      return true;
    },
  });
  downloadDataUrl(dataUrl, filename);
}

/**
 * Build a self-contained interactive HTML file from the task DAG.
 */
export function exportDAGAsHtml(tasks: TaskNode[], filename: string) {
  const flatTasks = flattenAll(tasks);
  const edges: { from: string; to: string }[] = [];
  for (const t of flatTasks) {
    for (const dep of t.dependencies) {
      edges.push({ from: dep, to: t.id });
    }
  }

  const nodesJson = JSON.stringify(
    flatTasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      hours: t.estimated_hours,
      priority: t.priority,
      deps: t.dependencies,
    }))
  );
  const edgesJson = JSON.stringify(edges);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Task DAG - AI-Ops Task Architect</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; overflow: auto; }
  h1 { padding: 1rem 1.5rem; font-size: 1.2rem; border-bottom: 1px solid #475569; background: #1e293b; }
  .canvas { position: relative; min-width: 100vw; min-height: 100vh; }
  svg.edges { position: absolute; top: 0; left: 0; pointer-events: none; }
  .node {
    position: absolute; background: #334155; border: 1px solid #475569;
    border-radius: 8px; padding: 10px 12px; min-width: 200px; max-width: 260px;
    font-size: 13px; cursor: move; user-select: none;
  }
  .node:hover { border-color: #3b82f6; }
  .node-title { font-weight: 600; margin-bottom: 4px; }
  .node-desc { color: #94a3b8; font-size: 11px; margin-bottom: 6px; line-height: 1.3; }
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
<h1>Task DAG - AI-Ops Task Architect</h1>
<div class="canvas" id="canvas">
  <svg class="edges" id="edgeSvg"></svg>
</div>
<script>
const TASKS = ${nodesJson};
const EDGES = ${edgesJson};
const PRIO_COLORS = { critical:'#ef4444', high:'#f59e0b', medium:'#3b82f6', low:'#6b7280' };
const W = 240, H = 120, XGAP = 60, YGAP = 60;

// Layered layout
const taskMap = Object.fromEntries(TASKS.map(t => [t.id, t]));
const inDeg = {}; const adj = {};
TASKS.forEach(t => { inDeg[t.id] = 0; adj[t.id] = []; });
EDGES.forEach(e => { inDeg[e.to] = (inDeg[e.to]||0) + 1; adj[e.from] = adj[e.from] || []; adj[e.from].push(e.to); });
const layers = []; const assigned = new Set(); const queue = TASKS.filter(t => (inDeg[t.id]||0) === 0).map(t => t.id);
while (queue.length) {
  const layer = [...queue]; layers.push(layer); layer.forEach(id => assigned.add(id));
  const next = [];
  layer.forEach(id => { (adj[id]||[]).forEach(to => { inDeg[to]--; if(inDeg[to]===0 && !assigned.has(to)) next.push(to); }); });
  queue.length = 0; queue.push(...next);
}
TASKS.forEach(t => { if (!assigned.has(t.id)) { layers.push([t.id]); assigned.add(t.id); } });

const pos = {};
layers.forEach((layer, li) => {
  const totalW = layer.length * W + (layer.length - 1) * XGAP;
  const startX = Math.max(40, (Math.max(totalW, 600) - totalW) / 2);
  layer.forEach((id, i) => { pos[id] = { x: startX + i * (W + XGAP), y: 60 + li * (H + YGAP) }; });
});

const canvas = document.getElementById('canvas');
const maxX = Math.max(...Object.values(pos).map(p => p.x)) + W + 80;
const maxY = Math.max(...Object.values(pos).map(p => p.y)) + H + 80;
canvas.style.width = maxX + 'px'; canvas.style.height = maxY + 'px';

const svg = document.getElementById('edgeSvg');
svg.setAttribute('width', maxX); svg.setAttribute('height', maxY);

// Draw edges
EDGES.forEach(e => {
  if (!pos[e.from] || !pos[e.to]) return;
  const x1 = pos[e.from].x + W/2, y1 = pos[e.from].y + H;
  const x2 = pos[e.to].x + W/2, y2 = pos[e.to].y;
  const my = (y1+y2)/2;
  const path = document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d', 'M'+x1+' '+y1+' C'+x1+' '+my+' '+x2+' '+my+' '+x2+' '+y2);
  path.setAttribute('stroke','#64748b'); path.setAttribute('stroke-width','2');
  path.setAttribute('fill','none'); path.setAttribute('marker-end','url(#arrow)');
  svg.appendChild(path);
});
// Arrowhead
const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
defs.innerHTML = '<marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/></marker>';
svg.prepend(defs);

// Draw nodes (draggable)
TASKS.forEach(t => {
  const p = pos[t.id]; if(!p) return;
  const div = document.createElement('div'); div.className = 'node'; div.id = 'node-'+t.id;
  div.style.left = p.x+'px'; div.style.top = p.y+'px';
  div.innerHTML = '<div class="prio-bar" style="background:'+PRIO_COLORS[t.priority]+'"></div>'
    + '<div class="node-title">'+t.title+'</div>'
    + '<div class="node-desc">'+t.description.slice(0,80)+'</div>'
    + '<div class="node-meta"><span>'+t.hours+'h</span><span class="badge badge-'+t.priority+'">'+t.priority+'</span></div>';
  // Drag
  let dx=0,dy=0,mx=0,my=0,dragging=false;
  div.onmousedown = e => { dragging=true; mx=e.clientX; my=e.clientY; };
  document.addEventListener('mousemove', e => {
    if(!dragging) return; dx=e.clientX-mx; dy=e.clientY-my; mx=e.clientX; my=e.clientY;
    p.x+=dx; p.y+=dy; div.style.left=p.x+'px'; div.style.top=p.y+'px'; redrawEdges();
  });
  document.addEventListener('mouseup', () => { dragging=false; });
  canvas.appendChild(div);
});

function redrawEdges() {
  svg.querySelectorAll('path').forEach(p => p.remove());
  EDGES.forEach(e => {
    if(!pos[e.from]||!pos[e.to]) return;
    const x1=pos[e.from].x+W/2,y1=pos[e.from].y+H,x2=pos[e.to].x+W/2,y2=pos[e.to].y;
    const my=(y1+y2)/2;
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d','M'+x1+' '+y1+' C'+x1+' '+my+' '+x2+' '+my+' '+x2+' '+y2);
    path.setAttribute('stroke','#64748b');path.setAttribute('stroke-width','2');
    path.setAttribute('fill','none');path.setAttribute('marker-end','url(#arrow)');
    svg.appendChild(path);
  });
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
  /* Gantt bars */
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

// Simple Gantt table
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

function flattenAll(tasks: TaskNode[]): TaskNode[] {
  const result: TaskNode[] = [];
  for (const t of tasks) {
    result.push(t);
    if (t.children.length > 0) result.push(...flattenAll(t.children));
  }
  return result;
}
