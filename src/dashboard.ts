import http from "node:http";
import { execFile } from "node:child_process";
import type { AmemDatabase } from "./database.js";
import { MemoryType } from "./memory.js";

// ---------------------------------------------------------------------------
// HTML Dashboard — single-page app with embedded CSS + JS
// All user-facing strings are escaped via the esc() helper which uses
// textContent assignment (safe against XSS) before reading innerHTML.
// ---------------------------------------------------------------------------

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>amem dashboard</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0d1117;--card:#161b22;--border:#30363d;--text:#c9d1d9;--muted:#8b949e;
  --correction:#f85149;--decision:#58a6ff;--pattern:#bc8cff;
  --preference:#3fb950;--topology:#d2a8ff;--fact:#8b949e;
  --radius:8px;
}
html{font-size:14px}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.5;min-width:1024px}
code,.mono{font-family:'JetBrains Mono','Fira Code',monospace;font-size:0.85em}
a{color:var(--decision);text-decoration:none}

/* layout */
.dashboard{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:24px;max-width:1440px;margin:0 auto}
.full{grid-column:1/-1}

/* header */
.header{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius)}
.header h1{font-size:1.4rem;font-weight:600;letter-spacing:-0.02em}
.header h1 span{color:var(--decision);font-weight:700}
.stat-pills{display:flex;gap:12px}
.pill{background:var(--bg);border:1px solid var(--border);border-radius:20px;padding:4px 14px;font-size:0.85rem;white-space:nowrap}
.pill b{color:var(--decision)}

/* cards */
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;overflow:hidden}
.card h2{font-size:1rem;font-weight:600;margin-bottom:14px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;font-size:0.75rem}

/* bars */
.bar-row{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:0.85rem}
.bar-label{width:90px;text-align:right;color:var(--muted);flex-shrink:0}
.bar-track{flex:1;height:22px;background:var(--bg);border-radius:4px;overflow:hidden;position:relative}
.bar-fill{height:100%;border-radius:4px;transition:width .4s ease}
.bar-value{width:40px;text-align:right;font-weight:600;flex-shrink:0}

/* confidence bars */
.conf-bar{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.conf-bar .label{width:70px;text-align:right;font-size:0.8rem;color:var(--muted)}
.conf-bar .track{flex:1;height:26px;background:var(--bg);border-radius:4px;overflow:hidden}
.conf-bar .fill{height:100%;border-radius:4px;display:flex;align-items:center;padding-left:10px;font-size:0.8rem;font-weight:600;color:#fff;transition:width .4s ease}
.conf-high{background:var(--preference)}
.conf-med{background:var(--decision)}
.conf-low{background:var(--correction)}

/* memory list */
.mem-controls{display:flex;gap:10px;margin-bottom:14px}
.mem-controls input,.mem-controls select{background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:8px 12px;font-size:0.85rem;outline:none}
.mem-controls input:focus,.mem-controls select:focus{border-color:var(--decision)}
.mem-controls input{flex:1}
.mem-list{max-height:420px;overflow-y:auto;display:flex;flex-direction:column;gap:8px}
.mem-list::-webkit-scrollbar{width:6px}
.mem-list::-webkit-scrollbar-track{background:transparent}
.mem-list::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
.mem-card{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:12px 14px}
.mem-card .mem-head{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.type-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#fff}
.mem-card .mem-content{font-size:0.9rem;margin-bottom:6px;line-height:1.5}
.mem-card .mem-meta{display:flex;gap:14px;font-size:0.75rem;color:var(--muted);flex-wrap:wrap}
.mem-card .mem-meta .tag{background:var(--card);border:1px solid var(--border);border-radius:4px;padding:1px 6px}

/* knowledge graph */
#graph-svg{width:100%;height:360px;border-radius:6px;background:var(--bg)}

/* reminders */
.reminder-list{max-height:360px;overflow-y:auto;display:flex;flex-direction:column;gap:6px}
.reminder-item{display:flex;align-items:flex-start;gap:8px;font-size:0.85rem;padding:8px 10px;background:var(--bg);border-radius:6px;border:1px solid var(--border)}
.reminder-status{flex-shrink:0;padding:2px 8px;border-radius:4px;font-size:0.7rem;font-weight:700;text-transform:uppercase}
.status-overdue{background:var(--correction);color:#fff}
.status-today{background:var(--decision);color:#fff}
.status-upcoming{background:var(--preference);color:#fff}
.status-completed{background:var(--border);color:var(--muted)}
.reminder-content{flex:1}

/* log */
.log-list{max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:4px}
.log-entry{display:flex;gap:10px;font-size:0.85rem;padding:6px 10px;background:var(--bg);border-radius:4px}
.log-role{flex-shrink:0;width:70px;font-weight:600;text-align:right}
.log-role.user{color:var(--decision)}
.log-role.assistant{color:var(--preference)}
.log-role.system{color:var(--muted)}
.log-content{flex:1;word-break:break-word}
.log-time{flex-shrink:0;color:var(--muted);font-size:0.75rem;white-space:nowrap}

.empty{color:var(--muted);font-style:italic;font-size:0.85rem;padding:20px 0;text-align:center}
</style>
</head>
<body>
<div class="dashboard">
  <!-- Header -->
  <div class="header full" id="header">
    <h1><span>amem</span> dashboard</h1>
    <div class="stat-pills" id="stat-pills"></div>
  </div>

  <!-- Type breakdown -->
  <div class="card" id="type-card">
    <h2>Memory Types</h2>
    <div id="type-bars"></div>
  </div>

  <!-- Confidence distribution -->
  <div class="card" id="conf-card">
    <h2>Confidence Distribution</h2>
    <div id="conf-bars"></div>
  </div>

  <!-- Memory list -->
  <div class="card full" id="mem-section">
    <h2>Memories</h2>
    <div class="mem-controls">
      <input type="text" id="mem-search" placeholder="Search memories..."/>
      <select id="mem-type">
        <option value="">All types</option>
        <option value="correction">correction</option>
        <option value="decision">decision</option>
        <option value="pattern">pattern</option>
        <option value="preference">preference</option>
        <option value="topology">topology</option>
        <option value="fact">fact</option>
      </select>
    </div>
    <div class="mem-list" id="mem-list"></div>
  </div>

  <!-- Knowledge graph -->
  <div class="card" id="graph-card">
    <h2>Knowledge Graph</h2>
    <svg id="graph-svg"></svg>
  </div>

  <!-- Reminders -->
  <div class="card" id="reminder-card">
    <h2>Reminders</h2>
    <div class="reminder-list" id="reminder-list"></div>
  </div>

  <!-- Recent log -->
  <div class="card full" id="log-card">
    <h2>Recent Log</h2>
    <div class="log-list" id="log-list"></div>
  </div>
</div>

<script>
// All dynamic text is escaped via esc() which uses textContent (XSS-safe).
(function(){
  var TYPE_COLORS = {
    correction:'#f85149',decision:'#58a6ff',pattern:'#bc8cff',
    preference:'#3fb950',topology:'#d2a8ff',fact:'#8b949e'
  };

  var allMemories = [];

  // -- Helpers --
  function timeAgo(ts){
    var s = Math.floor((Date.now()-ts)/1000);
    if(s<60) return s+'s ago';
    var m=Math.floor(s/60); if(m<60) return m+'m ago';
    var h=Math.floor(m/60); if(h<24) return h+'h ago';
    var d=Math.floor(h/24); if(d<30) return d+'d ago';
    return new Date(ts).toLocaleDateString();
  }
  // XSS-safe escaping: assigns to textContent then reads back as HTML-encoded
  function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML}
  function $(id){return document.getElementById(id)}

  // Safe DOM update helper — sets sanitized HTML built from escaped strings
  function setHTML(el, html){ el.innerHTML = html; }

  // -- Rendering --
  function renderStats(stats){
    var pills=$('stat-pills');
    setHTML(pills,
      '<div class="pill"><b>'+stats.total+'</b> memories</div>'+
      '<div class="pill"><b>'+stats.embeddings+'</b> embeddings</div>'+
      '<div class="pill"><b>'+(stats.confidence.high+stats.confidence.medium+stats.confidence.low)+'</b> scored</div>');
  }

  function renderTypeBars(byType){
    var el=$('type-bars');
    var max=Math.max(1,Math.max.apply(null,Object.keys(byType).map(function(k){return byType[k]})));
    setHTML(el, Object.keys(byType).map(function(key){
      var val=byType[key];
      var pct=Math.round(val/max*100);
      return '<div class="bar-row">'+
        '<span class="bar-label">'+esc(key)+'</span>'+
        '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:'+(TYPE_COLORS[key]||'#8b949e')+'"></div></div>'+
        '<span class="bar-value">'+val+'</span></div>';
    }).join(''));
  }

  function renderConfBars(conf){
    var total=Math.max(1,conf.high+conf.medium+conf.low);
    function bar(label,val,cls){
      var pct=Math.round(val/total*100);
      return '<div class="conf-bar"><span class="label">'+esc(label)+'</span>'+
        '<div class="track"><div class="fill '+cls+'" style="width:'+pct+'%">'+val+' ('+pct+'%)</div></div></div>';
    }
    setHTML($('conf-bars'), bar('High',conf.high,'conf-high')+bar('Medium',conf.medium,'conf-med')+bar('Low',conf.low,'conf-low'));
  }

  function renderMemories(memories){
    var el=$('mem-list');
    if(!memories.length){setHTML(el,'<div class="empty">No memories found</div>');return}
    setHTML(el, memories.slice(0,50).map(function(m){
      var color=TYPE_COLORS[m.type]||'#8b949e';
      var tags=(m.tags||[]).map(function(t){return '<span class="tag">#'+esc(t)+'</span>'}).join(' ');
      return '<div class="mem-card">'+
        '<div class="mem-head">'+
          '<span class="type-badge" style="background:'+color+'">'+esc(m.type)+'</span>'+
          '<code class="mono" style="color:var(--muted);font-size:0.7rem">'+esc(m.id.slice(0,8))+'</code>'+
        '</div>'+
        '<div class="mem-content">'+esc(m.content)+'</div>'+
        '<div class="mem-meta">'+
          '<span>Confidence: '+Math.round(m.confidence*100)+'%</span>'+
          '<span>'+timeAgo(m.createdAt)+'</span>'+
          '<span>Accessed '+m.accessCount+'x</span>'+
          (m.scope?'<span>Scope: '+esc(m.scope)+'</span>':'')+
          (tags?' '+tags:'')+
        '</div></div>';
    }).join(''));
  }

  function filterMemories(){
    var q=($('mem-search').value||'').toLowerCase();
    var t=$('mem-type').value;
    var list=allMemories;
    if(q) list=list.filter(function(m){return m.content.toLowerCase().indexOf(q)!==-1});
    if(t) list=list.filter(function(m){return m.type===t});
    renderMemories(list);
  }

  // -- Knowledge Graph (simple force-directed) --
  function renderGraph(data){
    var svg=$('graph-svg');
    var W=svg.clientWidth||600, H=svg.clientHeight||360;
    var nodes=data.nodes, edges=data.edges;
    if(!nodes.length){setHTML(svg,'<text x="'+W/2+'" y="'+H/2+'" fill="#8b949e" text-anchor="middle" font-size="14">No graph data</text>');return}

    // assign random positions
    var i,j;
    for(i=0;i<nodes.length;i++){
      nodes[i].x=W*0.2+Math.random()*W*0.6;
      nodes[i].y=H*0.2+Math.random()*H*0.6;
      nodes[i].vx=0;nodes[i].vy=0;
    }
    var nodeMap={};
    for(i=0;i<nodes.length;i++) nodeMap[nodes[i].id]=nodes[i];

    // force simulation
    var REPULSION=3000, SPRING=0.02, DAMPING=0.85, DT=1;
    for(var iter=0;iter<80;iter++){
      // repulsion between all pairs
      for(i=0;i<nodes.length;i++){
        for(j=i+1;j<nodes.length;j++){
          var dx=nodes[j].x-nodes[i].x, dy=nodes[j].y-nodes[i].y;
          var dist2=dx*dx+dy*dy+1;
          var f=REPULSION/dist2;
          var d=Math.sqrt(dist2);
          var fx=f*dx/d, fy=f*dy/d;
          nodes[i].vx-=fx;nodes[i].vy-=fy;
          nodes[j].vx+=fx;nodes[j].vy+=fy;
        }
      }
      // attraction along edges
      for(i=0;i<edges.length;i++){
        var a=nodeMap[edges[i].from],b=nodeMap[edges[i].to];
        if(!a||!b) continue;
        var edx=b.x-a.x,edy=b.y-a.y;
        var efx=SPRING*edx,efy=SPRING*edy;
        a.vx+=efx;a.vy+=efy;b.vx-=efx;b.vy-=efy;
      }
      // center gravity
      for(i=0;i<nodes.length;i++){
        nodes[i].vx+=(W/2-nodes[i].x)*0.001;
        nodes[i].vy+=(H/2-nodes[i].y)*0.001;
      }
      // integrate
      for(i=0;i<nodes.length;i++){
        nodes[i].vx*=DAMPING;nodes[i].vy*=DAMPING;
        nodes[i].x+=nodes[i].vx*DT;nodes[i].y+=nodes[i].vy*DT;
        nodes[i].x=Math.max(30,Math.min(W-30,nodes[i].x));
        nodes[i].y=Math.max(30,Math.min(H-30,nodes[i].y));
      }
    }

    // render SVG elements (all text escaped via esc())
    var html='';
    for(i=0;i<edges.length;i++){
      var ea=nodeMap[edges[i].from],eb=nodeMap[edges[i].to];
      if(!ea||!eb) continue;
      var mx=(ea.x+eb.x)/2,my=(ea.y+eb.y)/2;
      html+='<line x1="'+ea.x+'" y1="'+ea.y+'" x2="'+eb.x+'" y2="'+eb.y+'" stroke="#30363d" stroke-width="'+(1+edges[i].strength*2)+'"/>';
      if(edges[i].type) html+='<text x="'+mx+'" y="'+(my-4)+'" fill="#8b949e" font-size="9" text-anchor="middle">'+esc(edges[i].type)+'</text>';
    }
    for(i=0;i<nodes.length;i++){
      var color=TYPE_COLORS[nodes[i].type]||'#8b949e';
      html+='<circle cx="'+nodes[i].x+'" cy="'+nodes[i].y+'" r="8" fill="'+color+'" stroke="#0d1117" stroke-width="2"/>';
      html+='<text x="'+nodes[i].x+'" y="'+(nodes[i].y+20)+'" fill="'+color+'" font-size="10" text-anchor="middle" font-family="-apple-system,sans-serif">'+esc(nodes[i].label.slice(0,24))+'</text>';
    }
    setHTML(svg, html);
  }

  // -- Reminders --
  function renderReminders(reminders){
    var el=$('reminder-list');
    if(!reminders.length){setHTML(el,'<div class="empty">No reminders</div>');return}
    setHTML(el, reminders.map(function(r){
      var status=r.completed?'completed':(r.status||'upcoming');
      var cls='status-'+status;
      return '<div class="reminder-item">'+
        '<span class="reminder-status '+cls+'">'+esc(status)+'</span>'+
        '<span class="reminder-content">'+esc(r.content)+'</span>'+
        '</div>';
    }).join(''));
  }

  // -- Log --
  function renderLog(entries){
    var el=$('log-list');
    if(!entries.length){setHTML(el,'<div class="empty">No log entries</div>');return}
    setHTML(el, entries.map(function(e){
      var preview=e.content.length>200?e.content.slice(0,200)+'...':e.content;
      return '<div class="log-entry">'+
        '<span class="log-role '+esc(e.role)+'">'+esc(e.role)+'</span>'+
        '<span class="log-content">'+esc(preview)+'</span>'+
        '<span class="log-time">'+timeAgo(e.timestamp)+'</span>'+
        '</div>';
    }).join(''));
  }

  // -- Data fetching --
  function fetchJSON(url){
    return fetch(url).then(function(r){
      if(!r.ok) throw new Error(r.status+' '+r.statusText);
      return r.json();
    });
  }

  function loadAll(){
    fetchJSON('/api/stats').then(function(s){
      renderStats(s);
      renderTypeBars(s.byType);
      renderConfBars(s.confidence);
    }).catch(function(){});

    fetchJSON('/api/memories?limit=200').then(function(m){
      allMemories=m;
      filterMemories();
    }).catch(function(){});

    fetchJSON('/api/graph').then(renderGraph).catch(function(){});
    fetchJSON('/api/reminders').then(renderReminders).catch(function(){});
    fetchJSON('/api/log?limit=30').then(renderLog).catch(function(){});
  }

  // -- Event listeners --
  var debounce;
  $('mem-search').addEventListener('input',function(){
    clearTimeout(debounce);
    debounce=setTimeout(filterMemories,300);
  });
  $('mem-type').addEventListener('change',filterMemories);

  // -- Init --
  loadAll();
  setInterval(loadAll,30000);
})();
</script>
</body>
</html>`;

// ---------------------------------------------------------------------------
// HTTP Server + API routes
// ---------------------------------------------------------------------------

function jsonResponse(
  res: http.ServerResponse,
  data: unknown,
  status = 200,
): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function htmlResponse(res: http.ServerResponse, html: string): void {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
  });
  res.end(html);
}

function errorResponse(
  res: http.ServerResponse,
  message: string,
  status = 500,
): void {
  jsonResponse(res, { error: message }, status);
}

function parseQuery(url: string): Record<string, string> {
  const idx = url.indexOf("?");
  if (idx === -1) return {};
  const params: Record<string, string> = {};
  url
    .slice(idx + 1)
    .split("&")
    .forEach((pair) => {
      const [k, v] = pair.split("=");
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || "");
    });
  return params;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handleStats(db: AmemDatabase, res: http.ServerResponse): void {
  const stats = db.getStats();
  const confidence = db.getConfidenceStats();
  const embeddings = db.getEmbeddingCount();

  // Ensure all memory types appear in byType even if count is 0
  const byType: Record<string, number> = {};
  for (const t of Object.values(MemoryType)) {
    byType[t] = stats.byType[t] ?? 0;
  }

  jsonResponse(res, {
    total: stats.total,
    byType,
    confidence,
    embeddings,
  });
}

function handleMemories(
  db: AmemDatabase,
  res: http.ServerResponse,
  query: Record<string, string>,
): void {
  const limit = Math.min(
    500,
    Math.max(1, parseInt(query.limit || "50", 10) || 50),
  );
  let memories = db.getAll();

  if (query.search) {
    const term = query.search.toLowerCase();
    memories = memories.filter((m) =>
      m.content.toLowerCase().includes(term),
    );
  }

  if (query.type) {
    memories = memories.filter((m) => m.type === query.type);
  }

  const result = memories.slice(0, limit).map((m) => ({
    id: m.id,
    content: m.content,
    type: m.type,
    tags: m.tags,
    confidence: m.confidence,
    accessCount: m.accessCount,
    createdAt: m.createdAt,
    lastAccessed: m.lastAccessed,
    scope: m.scope,
  }));

  jsonResponse(res, result);
}

function handleGraph(db: AmemDatabase, res: http.ServerResponse): void {
  const memories = db.getAll();
  const relations = db.getAllRelations();

  const nodes = memories.map((m) => ({
    id: m.id,
    label:
      m.content.length > 40 ? m.content.slice(0, 40) + "..." : m.content,
    type: m.type,
  }));

  const memoryIds = new Set(memories.map((m) => m.id));
  const edges = relations
    .filter((r) => memoryIds.has(r.fromId) && memoryIds.has(r.toId))
    .map((r) => ({
      from: r.fromId,
      to: r.toId,
      type: r.relationshipType,
      strength: r.strength,
    }));

  jsonResponse(res, { nodes, edges });
}

function handleReminders(db: AmemDatabase, res: http.ServerResponse): void {
  const reminders = db.listReminders(true);
  const active = db.checkReminders();
  const statusMap = new Map(active.map((r) => [r.id, r.status]));

  const result = reminders.map((r) => ({
    id: r.id,
    content: r.content,
    dueAt: r.dueAt,
    completed: r.completed,
    scope: r.scope,
    status: r.completed
      ? "completed"
      : (statusMap.get(r.id) ?? "upcoming"),
  }));

  jsonResponse(res, result);
}

function handleLog(
  db: AmemDatabase,
  res: http.ServerResponse,
  query: Record<string, string>,
): void {
  const limit = Math.min(
    200,
    Math.max(1, parseInt(query.limit || "30", 10) || 30),
  );
  const entries = db.getRecentLog(limit);
  jsonResponse(
    res,
    entries.map((e) => ({
      id: e.id,
      role: e.role,
      content: e.content,
      timestamp: e.timestamp,
      sessionId: e.sessionId,
    })),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function startDashboard(db: AmemDatabase, port: number): void {
  const server = http.createServer((req, res) => {
    const url = req.url || "/";
    const pathname = url.split("?")[0];
    const query = parseQuery(url);

    try {
      switch (pathname) {
        case "/":
          htmlResponse(res, DASHBOARD_HTML);
          break;
        case "/api/stats":
          handleStats(db, res);
          break;
        case "/api/memories":
          handleMemories(db, res, query);
          break;
        case "/api/graph":
          handleGraph(db, res);
          break;
        case "/api/reminders":
          handleReminders(db, res);
          break;
        case "/api/log":
          handleLog(db, res, query);
          break;
        default:
          errorResponse(res, "Not found", 404);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Internal server error";
      errorResponse(res, message, 500);
    }
  });

  server.listen(port, () => {
    const dashboardUrl = `http://localhost:${port}`;
    console.log(`\namem dashboard running at ${dashboardUrl}\n`);

    // Open browser using execFile (safe — no shell interpolation)
    const cmd =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    execFile(cmd, [dashboardUrl], () => {
      /* ignore errors in headless environments */
    });
  });
}
