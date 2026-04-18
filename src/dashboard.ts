import http from "node:http";
import { execFile } from "node:child_process";
import type { AmemDatabase } from "@aman_asmuei/amem-core";
import { MemoryType, generateCopilotInstructions } from "@aman_asmuei/amem-core";

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
.graph-container{position:relative;overflow:hidden;border-radius:6px;background:var(--bg);height:600px}
#graph-svg{width:100%;height:100%;cursor:grab}
#graph-svg:active{cursor:grabbing}
#graph-svg .node-circle{cursor:pointer;transition:opacity 0.3s,r 0.15s}
#graph-svg .node-circle:hover{filter:brightness(1.3)}
#graph-svg .edge-line{transition:opacity 0.3s}
#graph-svg .node-label{transition:opacity 0.3s;pointer-events:none}
#graph-svg .edge-label{transition:opacity 0.3s;pointer-events:none}
.graph-dimmed{opacity:0.12!important}
.graph-tooltip{position:absolute;background:var(--card);border:1px solid var(--border);border-radius:6px;padding:10px 14px;font-size:0.8rem;max-width:300px;pointer-events:none;z-index:10;box-shadow:0 4px 12px rgba(0,0,0,0.4)}
.graph-controls{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center}
.graph-controls input,.graph-controls select{background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 10px;font-size:0.8rem;outline:none}
.graph-controls input:focus,.graph-controls select:focus{border-color:var(--decision)}
.graph-controls input{flex:1;min-width:140px}
.graph-controls button{background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 12px;font-size:0.8rem;cursor:pointer}
.graph-controls button:hover{border-color:var(--decision);color:var(--decision)}
.graph-controls button.active{background:var(--decision);color:#fff;border-color:var(--decision)}
.graph-legend{display:flex;gap:14px;flex-wrap:wrap;padding:8px 0}
.graph-legend-item{display:flex;align-items:center;gap:5px;font-size:0.75rem;color:var(--muted);cursor:pointer}
.graph-legend-item:hover{color:var(--text)}
.graph-legend-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.graph-stats{display:flex;gap:14px;font-size:0.75rem;color:var(--muted);padding:4px 0}
.graph-stats b{color:var(--text)}
.graph-detail{position:absolute;top:10px;right:10px;width:280px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;z-index:20;box-shadow:0 8px 24px rgba(0,0,0,0.5);max-height:calc(100% - 20px);overflow-y:auto;display:none}
.graph-detail h3{font-size:0.9rem;margin-bottom:8px;display:flex;align-items:center;gap:8px}
.graph-detail .close{margin-left:auto;cursor:pointer;color:var(--muted);font-size:1rem;line-height:1}
.graph-detail .close:hover{color:var(--text)}
.graph-detail .detail-content{font-size:0.85rem;line-height:1.6;margin-bottom:10px;word-break:break-word}
.graph-detail .detail-meta{font-size:0.75rem;color:var(--muted);display:flex;flex-direction:column;gap:4px}
.graph-detail .detail-relations{margin-top:10px;border-top:1px solid var(--border);padding-top:10px}
.graph-detail .relation-item{display:flex;align-items:center;gap:6px;font-size:0.8rem;padding:4px 0;cursor:pointer;color:var(--text)}
.graph-detail .relation-item:hover{color:var(--decision)}
.graph-detail .relation-arrow{color:var(--muted);font-size:0.7rem}

/* memory actions */
.mem-actions{display:flex;gap:6px;margin-top:6px}
.mem-actions button{background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:3px 10px;font-size:0.7rem;cursor:pointer;transition:all 0.15s}
.mem-actions button:hover{background:var(--border);color:#fff}
.mem-actions .btn-core{border-color:var(--correction)}
.mem-actions .btn-expire{border-color:var(--muted)}

/* export bar */
.export-bar{display:flex;gap:10px;justify-content:flex-end;margin-bottom:10px}
.export-bar button{background:var(--decision);color:#fff;border:none;border-radius:6px;padding:6px 16px;font-size:0.8rem;cursor:pointer;font-weight:600;transition:opacity 0.15s}
.export-bar button:hover{opacity:0.85}

/* highlight */
.highlight{background:rgba(88,166,255,0.2);border-radius:2px;padding:0 2px}

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

.timeline{position:relative;padding-left:30px;max-height:500px;overflow-y:auto}
.timeline::before{content:'';position:absolute;left:12px;top:0;bottom:0;width:2px;background:var(--border)}
.timeline-item{position:relative;margin-bottom:16px;padding:12px 14px;background:var(--bg);border:1px solid var(--border);border-radius:6px}
.timeline-dot{position:absolute;left:-24px;top:16px;width:12px;height:12px;border-radius:50%;border:2px solid var(--bg)}
.timeline-date{font-size:0.75rem;color:var(--muted);margin-bottom:4px}
.timeline-group{font-size:0.8rem;font-weight:600;color:var(--decision);margin:20px 0 10px;padding-left:10px}
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
    <div class="export-bar">
      <button onclick="exportMemories('json')">Export JSON</button>
      <button onclick="exportMemories('markdown')">Export Markdown</button>
    </div>
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
      <select id="mem-tier">
        <option value="">All tiers</option>
        <option value="core">core</option>
        <option value="working">working</option>
        <option value="archival">archival</option>
      </select>
      <select id="mem-source">
        <option value="">All sources</option>
        <option value="conversation">conversation</option>
        <option value="claude-auto-memory">claude sync</option>
        <option value="copilot">copilot</option>
        <option value="hook:PostToolUse">hook (tool)</option>
        <option value="hook:SessionEnd">hook (session)</option>
        <option value="team-sync">team sync</option>
      </select>
    </div>
    <div class="mem-list" id="mem-list"></div>
  </div>

  <!-- Copilot Instructions Preview -->
  <div class="card full" id="copilot-card">
    <h2>Copilot Instructions Preview</h2>
    <div style="display:flex;gap:10px;margin-bottom:14px;align-items:center">
      <span style="font-size:0.85rem;color:var(--muted)">Preview of what <code>amem sync --to copilot</code> would export to <code>.github/copilot-instructions.md</code></span>
      <button onclick="copyCopilotPreview()" style="background:var(--decision);color:#fff;border:none;border-radius:6px;padding:6px 16px;font-size:0.8rem;cursor:pointer;font-weight:600;margin-left:auto">Copy to Clipboard</button>
    </div>
    <pre id="copilot-preview" style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:16px;font-size:0.82rem;max-height:400px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;color:var(--text);line-height:1.6"></pre>
  </div>

  <!-- Knowledge graph -->
  <div class="card full" id="graph-card">
    <h2>Knowledge Graph</h2>
    <div class="graph-controls">
      <input type="text" id="graph-search" placeholder="Search nodes..."/>
      <select id="graph-type-filter">
        <option value="">All types</option>
        <option value="correction">correction</option>
        <option value="decision">decision</option>
        <option value="pattern">pattern</option>
        <option value="preference">preference</option>
        <option value="topology">topology</option>
        <option value="fact">fact</option>
      </select>
      <button id="graph-reset" title="Reset view">Reset</button>
      <button id="graph-fit" title="Fit all nodes">Fit All</button>
    </div>
    <div class="graph-stats" id="graph-stats"></div>
    <div class="graph-legend" id="graph-legend"></div>
    <div class="graph-container" id="graph-container">
      <div id="graph-tooltip" class="graph-tooltip" style="display:none"></div>
      <svg id="graph-svg"></svg>
      <div class="graph-detail" id="graph-detail"></div>
    </div>
  </div>

  <!-- Reminders -->
  <div class="card" id="reminder-card">
    <h2>Reminders</h2>
    <div class="reminder-list" id="reminder-list"></div>
  </div>

  <!-- Session summaries -->
  <div class="card full" id="summary-card">
    <h2>Session Summaries</h2>
    <div class="summary-list" id="summary-list"></div>
  </div>

  <!-- Timeline -->
  <div class="card full" id="timeline-card">
    <h2>Memory Timeline</h2>
    <div class="timeline" id="timeline"></div>
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

  var currentSearchQuery='';

  function highlightText(text,query){
    if(!query) return esc(text);
    var escaped=esc(text);
    try{
      var q=query.replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g,'\\\\$&');
      return escaped.replace(new RegExp('('+q+')','gi'),'<span class="highlight">$1</span>');
    }catch(e){return escaped}
  }

  function renderMemories(memories){
    var el=$('mem-list');
    if(!memories.length){setHTML(el,'<div class="empty">No memories found</div>');return}
    setHTML(el, memories.slice(0,50).map(function(m){
      var color=TYPE_COLORS[m.type]||'#8b949e';
      var tags=(m.tags||[]).map(function(t){return '<span class="tag">#'+esc(t)+'</span>'}).join(' ');
      var tierBadge = m.tier && m.tier !== 'archival' ? '<span class="type-badge" style="background:'+(m.tier==='core'?'#f0883e':'#58a6ff')+'">'+esc(m.tier)+'</span>' : '';
      var expiredBadge = m.validUntil ? '<span class="type-badge" style="background:#f85149;opacity:0.7">expired</span>' : '';
      var validInfo = m.validFrom ? '<span>Valid: '+new Date(m.validFrom).toISOString().slice(0,10)+(m.validUntil?' → '+new Date(m.validUntil).toISOString().slice(0,10):' → now')+'</span>' : '';
      var contentHtml = highlightText(m.content, currentSearchQuery);
      var sid=esc(m.id.slice(0,8));
      var tierLabel=m.tier||'archival';
      return '<div class="mem-card"'+(m.validUntil?' style="opacity:0.6"':'')+'>'+
        '<div class="mem-head">'+
          '<span class="type-badge" style="background:'+color+'">'+esc(m.type)+'</span>'+
          tierBadge+expiredBadge+
          '<code class="mono" style="color:var(--muted);font-size:0.7rem">'+sid+'</code>'+
        '</div>'+
        '<div class="mem-content">'+contentHtml+'</div>'+
        '<div class="mem-meta">'+
          '<span>Confidence: '+Math.round(m.confidence*100)+'%</span>'+
          '<span>'+timeAgo(m.createdAt)+'</span>'+
          '<span>Accessed '+m.accessCount+'x</span>'+
          (m.scope?'<span>Scope: '+esc(m.scope)+'</span>':'')+
          validInfo+
          (tags?' '+tags:'')+
        '</div>'+
        '<div class="mem-actions">'+
          (tierLabel!=='core'?'<button class="btn-core" data-action="tier:core:'+sid+'">Promote to Core</button>':
            '<button data-action="tier:archival:'+sid+'">Demote</button>')+
          (!m.validUntil?'<button class="btn-expire" data-action="expire::'+sid+'">Expire</button>':'')+
        '</div></div>';
    }).join(''));
  }

  function filterMemories(){
    var q=($('mem-search').value||'').toLowerCase();
    var t=$('mem-type').value;
    var tier=$('mem-tier')?$('mem-tier').value:'';
    var src=$('mem-source')?$('mem-source').value:'';
    currentSearchQuery=q;
    var list=allMemories;
    if(q) list=list.filter(function(m){return m.content.toLowerCase().indexOf(q)!==-1});
    if(t) list=list.filter(function(m){return m.type===t});
    if(tier) list=list.filter(function(m){return m.tier===tier});
    if(src) list=list.filter(function(m){return (m.source||'').indexOf(src)!==-1});
    renderMemories(list);
  }

  // -- Knowledge Graph (enhanced force-directed with zoom/pan/focus) --
  var graphNodes=[], graphEdges=[], graphNodeMap={}, graphAllNodes=[], graphAllEdges=[];
  var graphZoom={x:0,y:0,scale:1};
  var graphFocusId=null;
  var graphDragNode=null, graphDragBg=false, graphDragStart={x:0,y:0}, graphPanStart={x:0,y:0};

  function computeNodeDegrees(){
    for(var i=0;i<graphAllNodes.length;i++) graphAllNodes[i].degree=0;
    for(var i=0;i<graphAllEdges.length;i++){
      var a=graphNodeMap[graphAllEdges[i].from];
      var b=graphNodeMap[graphAllEdges[i].to];
      if(a) a.degree=(a.degree||0)+1;
      if(b) b.degree=(b.degree||0)+1;
    }
  }

  function nodeRadius(n){return Math.max(6,Math.min(20,6+(n.degree||0)*2))}

  function getNeighborIds(nodeId){
    var ids={};ids[nodeId]=true;
    for(var i=0;i<graphAllEdges.length;i++){
      if(graphAllEdges[i].from===nodeId) ids[graphAllEdges[i].to]=true;
      if(graphAllEdges[i].to===nodeId) ids[graphAllEdges[i].from]=true;
    }
    return ids;
  }

  function getNodeEdges(nodeId){
    var result=[];
    for(var i=0;i<graphAllEdges.length;i++){
      if(graphAllEdges[i].from===nodeId||graphAllEdges[i].to===nodeId) result.push(graphAllEdges[i]);
    }
    return result;
  }

  function forceLayout(nodes,edges,W,H){
    var i,j;
    var nodeMap={};
    for(i=0;i<nodes.length;i++){
      // Use stable seeded positions based on node id hash
      var h=0;for(var c=0;c<nodes[i].id.length;c++){h=((h<<5)-h)+nodes[i].id.charCodeAt(c);h|=0}
      nodes[i].x=W*0.15+Math.abs(h%1000)/1000*W*0.7;
      nodes[i].y=H*0.15+Math.abs((h*31)%1000)/1000*H*0.7;
      nodes[i].vx=0;nodes[i].vy=0;
      nodeMap[nodes[i].id]=nodes[i];
    }

    var REPULSION=5000,SPRING=0.04,DAMPING=0.82,DT=1;
    var ITERS=nodes.length>200?60:nodes.length>50?100:150;

    for(var iter=0;iter<ITERS;iter++){
      // Barnes-Hut approximation for large graphs: skip distant pairs
      for(i=0;i<nodes.length;i++){
        for(j=i+1;j<nodes.length;j++){
          var dx=nodes[j].x-nodes[i].x,dy=nodes[j].y-nodes[i].y;
          var dist2=dx*dx+dy*dy+1;
          if(dist2>400000) continue; // skip very distant pairs
          var f=REPULSION/dist2;
          var d=Math.sqrt(dist2);
          var fx=f*dx/d,fy=f*dy/d;
          nodes[i].vx-=fx;nodes[i].vy-=fy;
          nodes[j].vx+=fx;nodes[j].vy+=fy;
        }
      }
      for(i=0;i<edges.length;i++){
        var a=nodeMap[edges[i].from],b=nodeMap[edges[i].to];
        if(!a||!b) continue;
        var edx=b.x-a.x,edy=b.y-a.y;
        var strength=edges[i].strength||0.8;
        var efx=SPRING*strength*edx,efy=SPRING*strength*edy;
        a.vx+=efx;a.vy+=efy;b.vx-=efx;b.vy-=efy;
      }
      for(i=0;i<nodes.length;i++){
        nodes[i].vx+=(W/2-nodes[i].x)*0.002;
        nodes[i].vy+=(H/2-nodes[i].y)*0.002;
        nodes[i].vx*=DAMPING;nodes[i].vy*=DAMPING;
        nodes[i].x+=nodes[i].vx*DT;nodes[i].y+=nodes[i].vy*DT;
        nodes[i].x=Math.max(40,Math.min(W-40,nodes[i].x));
        nodes[i].y=Math.max(40,Math.min(H-40,nodes[i].y));
      }
    }
    return nodeMap;
  }

  function renderGraphSvg(){
    var svg=$('graph-svg');
    if(!svg) return;
    var focusNeighbors=graphFocusId?getNeighborIds(graphFocusId):null;

    var defs='<defs><marker id="arrow" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,3 L0,6z" fill="#58a6ff" fill-opacity="0.6"/></marker></defs>';
    var html=defs+'<g id="graph-pan" transform="translate('+graphZoom.x+','+graphZoom.y+') scale('+graphZoom.scale+')">';

    // Edges
    for(var i=0;i<graphEdges.length;i++){
      var e=graphEdges[i];
      var ea=graphNodeMap[e.from],eb=graphNodeMap[e.to];
      if(!ea||!eb) continue;
      var dim=focusNeighbors&&(!focusNeighbors[e.from]||!focusNeighbors[e.to]);
      var cls='edge-line'+(dim?' graph-dimmed':'');
      var sw=1.5+(e.strength||0.8)*2;
      var opacity=dim?0.1:0.5;
      // Shorten line to avoid overlapping node circles
      var edx=eb.x-ea.x,edy=eb.y-ea.y;
      var elen=Math.sqrt(edx*edx+edy*edy)||1;
      var rA=nodeRadius(ea),rB=nodeRadius(eb);
      var x1=ea.x+edx/elen*(rA+2),y1=ea.y+edy/elen*(rA+2);
      var x2=eb.x-edx/elen*(rB+2),y2=eb.y-edy/elen*(rB+2);
      html+='<line class="'+cls+'" x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="#58a6ff" stroke-opacity="'+opacity+'" stroke-width="'+sw+'" marker-end="url(#arrow)"/>';
      if(e.type){
        var mx=(ea.x+eb.x)/2,my=(ea.y+eb.y)/2;
        html+='<text class="edge-label'+(dim?' graph-dimmed':'')+'" x="'+mx+'" y="'+(my-6)+'" fill="#c9d1d9" font-size="9" text-anchor="middle" font-weight="600" opacity="'+(dim?0.1:0.8)+'">'+esc(e.type)+'</text>';
      }
    }

    // Nodes
    for(var i=0;i<graphNodes.length;i++){
      var n=graphNodes[i];
      var color=TYPE_COLORS[n.type]||'#8b949e';
      var r=nodeRadius(n);
      var dim=focusNeighbors&&!focusNeighbors[n.id];
      var cls='node-circle'+(dim?' graph-dimmed':'');
      var focused=graphFocusId===n.id;
      var sw=focused?3:2;
      var stroke=focused?'#fff':'#0d1117';
      html+='<circle class="'+cls+'" data-nid="'+esc(n.id)+'" cx="'+n.x+'" cy="'+n.y+'" r="'+r+'" fill="'+color+'" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
      var labelOpacity=dim?0.1:(r>8?1:0.7);
      html+='<text class="node-label'+(dim?' graph-dimmed':'')+'" x="'+n.x+'" y="'+(n.y+r+14)+'" fill="'+color+'" font-size="'+(r>12?'11':'10')+'" text-anchor="middle" font-family="-apple-system,sans-serif" opacity="'+labelOpacity+'">'+esc(n.label.slice(0,28))+'</text>';
    }

    html+='</g>';
    setHTML(svg,html);
  }

  function renderGraphLegend(){
    var el=$('graph-legend');
    if(!el) return;
    var types=['correction','decision','pattern','preference','topology','fact'];
    setHTML(el, types.map(function(t){
      return '<div class="graph-legend-item" data-type="'+t+'"><div class="graph-legend-dot" style="background:'+(TYPE_COLORS[t]||'#8b949e')+'"></div>'+t+'</div>';
    }).join(''));
  }

  function renderGraphStats(){
    var el=$('graph-stats');
    if(!el) return;
    var connected=0;
    var connectedSet={};
    for(var i=0;i<graphAllEdges.length;i++){
      connectedSet[graphAllEdges[i].from]=true;
      connectedSet[graphAllEdges[i].to]=true;
    }
    connected=Object.keys(connectedSet).length;
    setHTML(el,'<b>'+graphNodes.length+'</b> nodes · <b>'+graphEdges.length+'</b> edges · <b>'+connected+'</b> connected');
  }

  function showNodeDetail(nodeId){
    var panel=$('graph-detail');
    if(!panel) return;
    var n=graphNodeMap[nodeId];
    if(!n){panel.style.display='none';return}

    var color=TYPE_COLORS[n.type]||'#8b949e';
    var edges=getNodeEdges(nodeId);
    var html='<h3><span class="type-badge" style="background:'+color+'">'+esc(n.type)+'</span><code class="mono" style="font-size:0.7rem;color:var(--muted)">'+esc(n.id.slice(0,8))+'</code><span class="close" id="detail-close">&times;</span></h3>';
    html+='<div class="detail-content">'+esc(n.fullContent||n.label)+'</div>';
    html+='<div class="detail-meta">';
    html+='<span>Tier: '+(n.tier||'archival')+'</span>';
    html+='<span>Connections: '+(n.degree||0)+'</span>';
    html+='</div>';

    if(edges.length){
      html+='<div class="detail-relations"><div style="font-size:0.75rem;color:var(--muted);margin-bottom:6px;font-weight:600">RELATIONS</div>';
      for(var i=0;i<edges.length;i++){
        var e=edges[i];
        var otherId=e.from===nodeId?e.to:e.from;
        var other=graphNodeMap[otherId];
        var otherLabel=other?(other.label.slice(0,30)):otherId.slice(0,8);
        var dir=e.from===nodeId?'→':'←';
        html+='<div class="relation-item" data-nid="'+esc(otherId)+'">';
        html+='<span class="relation-arrow">'+dir+'</span>';
        html+='<span style="color:var(--muted);font-size:0.7rem">'+esc(e.type||'related')+'</span> ';
        html+=esc(otherLabel);
        html+='</div>';
      }
      html+='</div>';
    }

    setHTML(panel,html);
    panel.style.display='block';

    // Close button
    var closeBtn=$('detail-close');
    if(closeBtn) closeBtn.addEventListener('click',function(){
      panel.style.display='none';
      graphFocusId=null;
      renderGraphSvg();
    });

    // Click relation to navigate
    var items=panel.querySelectorAll('.relation-item[data-nid]');
    for(var i=0;i<items.length;i++){
      items[i].addEventListener('click',function(){
        var nid=this.dataset.nid;
        if(nid){
          graphFocusId=nid;
          renderGraphSvg();
          showNodeDetail(nid);
        }
      });
    }
  }

  function filterGraphNodes(){
    var search=($('graph-search')||{}).value||'';
    var typeFilter=($('graph-type-filter')||{}).value||'';
    search=search.toLowerCase();

    if(!search&&!typeFilter){
      graphNodes=graphAllNodes;
      graphEdges=graphAllEdges;
    } else {
      var visibleIds={};
      graphNodes=graphAllNodes.filter(function(n){
        var matchSearch=!search||n.label.toLowerCase().indexOf(search)!==-1||(n.fullContent||'').toLowerCase().indexOf(search)!==-1;
        var matchType=!typeFilter||n.type===typeFilter;
        if(matchSearch&&matchType){visibleIds[n.id]=true;return true}
        return false;
      });
      graphEdges=graphAllEdges.filter(function(e){return visibleIds[e.from]&&visibleIds[e.to]});
    }
    renderGraphSvg();
    renderGraphStats();
  }

  function renderGraph(data){
    var svg=$('graph-svg');
    var container=$('graph-container');
    if(!svg||!container) return;
    var W=container.clientWidth||900,H=container.clientHeight||600;
    svg.setAttribute('viewBox','0 0 '+W+' '+H);

    graphAllNodes=data.nodes;graphAllEdges=data.edges;
    graphNodes=data.nodes;graphEdges=data.edges;
    graphZoom={x:0,y:0,scale:1};
    graphFocusId=null;

    if(!data.nodes.length){
      setHTML(svg,'<text x="'+W/2+'" y="'+H/2+'" fill="#8b949e" text-anchor="middle" font-size="14">No graph data — use memory_relate to connect memories</text>');
      renderGraphStats();
      renderGraphLegend();
      return;
    }

    graphNodeMap=forceLayout(data.nodes,data.edges,W,H);
    computeNodeDegrees();
    renderGraphSvg();
    renderGraphStats();
    renderGraphLegend();
  }

  function setupGraphInteraction(){
    var svg=$('graph-svg');
    var container=$('graph-container');
    var tooltip=$('graph-tooltip');
    if(!svg||!container) return;

    // Zoom with mouse wheel
    container.addEventListener('wheel',function(e){
      e.preventDefault();
      var rect=container.getBoundingClientRect();
      var mx=e.clientX-rect.left;
      var my=e.clientY-rect.top;
      var delta=e.deltaY>0?0.9:1.1;
      var newScale=Math.max(0.2,Math.min(5,graphZoom.scale*delta));
      // Zoom toward mouse position
      graphZoom.x=mx-(mx-graphZoom.x)*newScale/graphZoom.scale;
      graphZoom.y=my-(my-graphZoom.y)*newScale/graphZoom.scale;
      graphZoom.scale=newScale;
      renderGraphSvg();
    },{passive:false});

    // Pan with mouse drag on background
    svg.addEventListener('mousedown',function(e){
      if(e.target.tagName==='circle'){
        // Node drag
        var nid=e.target.dataset.nid;
        if(nid) graphDragNode=graphNodeMap[nid];
        if(graphDragNode){
          var rect=container.getBoundingClientRect();
          graphDragStart.x=(e.clientX-rect.left-graphZoom.x)/graphZoom.scale-graphDragNode.x;
          graphDragStart.y=(e.clientY-rect.top-graphZoom.y)/graphZoom.scale-graphDragNode.y;
        }
        return;
      }
      // Background pan
      graphDragBg=true;
      graphPanStart.x=e.clientX-graphZoom.x;
      graphPanStart.y=e.clientY-graphZoom.y;
      svg.style.cursor='grabbing';
    });

    svg.addEventListener('mousemove',function(e){
      if(graphDragNode){
        var rect=container.getBoundingClientRect();
        graphDragNode.x=(e.clientX-rect.left-graphZoom.x)/graphZoom.scale-graphDragStart.x;
        graphDragNode.y=(e.clientY-rect.top-graphZoom.y)/graphZoom.scale-graphDragStart.y;
        renderGraphSvg();
      } else if(graphDragBg){
        graphZoom.x=e.clientX-graphPanStart.x;
        graphZoom.y=e.clientY-graphPanStart.y;
        renderGraphSvg();
      }
    });

    document.addEventListener('mouseup',function(){
      graphDragNode=null;
      graphDragBg=false;
      svg.style.cursor='grab';
    });

    // Click node to focus
    svg.addEventListener('click',function(e){
      var circle=e.target;
      if(circle.tagName!=='circle') {
        // Click background to unfocus
        if(graphFocusId){graphFocusId=null;renderGraphSvg();$('graph-detail').style.display='none'}
        if(tooltip) tooltip.style.display='none';
        return;
      }
      var nid=circle.dataset.nid;
      if(!nid) return;

      graphFocusId=graphFocusId===nid?null:nid;
      renderGraphSvg();
      if(graphFocusId) showNodeDetail(nid);
      else $('graph-detail').style.display='none';
    });

    // Hover tooltip
    svg.addEventListener('mouseover',function(e){
      if(e.target.tagName!=='circle'||!tooltip) return;
      var nid=e.target.dataset.nid;
      var n=graphNodeMap[nid];
      if(!n) return;
      var rect=container.getBoundingClientRect();
      tooltip.style.display='block';
      tooltip.style.left=(e.clientX-rect.left+15)+'px';
      tooltip.style.top=(e.clientY-rect.top-10)+'px';
      var color=TYPE_COLORS[n.type]||'#8b949e';
      setHTML(tooltip,
        '<div style="margin-bottom:4px"><span class="type-badge" style="background:'+color+'">'+esc(n.type)+'</span> <code class="mono">'+esc(n.id.slice(0,8))+'</code></div>'+
        '<div style="font-size:0.85rem;margin-bottom:4px">'+esc((n.fullContent||n.label).slice(0,120))+'</div>'+
        '<div style="font-size:0.75rem;color:var(--muted)">Connections: '+(n.degree||0)+' · Tier: '+(n.tier||'archival')+'</div>'
      );
    });
    svg.addEventListener('mouseout',function(e){
      if(e.target.tagName==='circle'&&tooltip) tooltip.style.display='none';
    });

    // Graph search/filter
    var gsDebounce;
    var gs=$('graph-search');
    if(gs) gs.addEventListener('input',function(){clearTimeout(gsDebounce);gsDebounce=setTimeout(filterGraphNodes,300)});
    var gf=$('graph-type-filter');
    if(gf) gf.addEventListener('change',filterGraphNodes);

    // Reset button
    var resetBtn=$('graph-reset');
    if(resetBtn) resetBtn.addEventListener('click',function(){
      graphZoom={x:0,y:0,scale:1};
      graphFocusId=null;
      if(gs) gs.value='';
      if(gf) gf.value='';
      graphNodes=graphAllNodes;graphEdges=graphAllEdges;
      $('graph-detail').style.display='none';
      renderGraphSvg();renderGraphStats();
    });

    // Fit all button
    var fitBtn=$('graph-fit');
    if(fitBtn) fitBtn.addEventListener('click',function(){
      if(!graphNodes.length) return;
      var minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(var i=0;i<graphNodes.length;i++){
        minX=Math.min(minX,graphNodes[i].x);maxX=Math.max(maxX,graphNodes[i].x);
        minY=Math.min(minY,graphNodes[i].y);maxY=Math.max(maxY,graphNodes[i].y);
      }
      var container=$('graph-container');
      var cw=container.clientWidth,ch=container.clientHeight;
      var gw=maxX-minX+80,gh=maxY-minY+80;
      var scale=Math.min(cw/gw,ch/gh,2);
      graphZoom.scale=scale;
      graphZoom.x=cw/2-((minX+maxX)/2)*scale;
      graphZoom.y=ch/2-((minY+maxY)/2)*scale;
      renderGraphSvg();
    });

    // Legend click to filter
    var legend=$('graph-legend');
    if(legend) legend.addEventListener('click',function(e){
      var item=e.target.closest('.graph-legend-item');
      if(!item) return;
      var type=item.dataset.type;
      var gf=$('graph-type-filter');
      if(gf){gf.value=gf.value===type?'':type;filterGraphNodes()}
    });
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
    }).catch(function(e){ console.error('[amem] Dashboard fetch error:', e); });

    fetchJSON('/api/memories?limit=200').then(function(m){
      allMemories=m;
      filterMemories();
      renderTimeline(allMemories);
    }).catch(function(e){ console.error('[amem] Dashboard fetch error:', e); });

    fetchJSON('/api/graph').then(renderGraph).catch(function(e){ console.error('[amem] Dashboard fetch error:', e); });
    fetchJSON('/api/reminders').then(renderReminders).catch(function(e){ console.error('[amem] Dashboard fetch error:', e); });
    fetchJSON('/api/log?limit=30').then(renderLog).catch(function(e){ console.error('[amem] Dashboard fetch error:', e); });
    fetchJSON('/api/summaries?limit=10').then(renderSummaries).catch(function(e){ console.error('[amem] Dashboard fetch error:', e); });
    fetchJSON('/api/copilot-preview').then(function(d){
      var el=$('copilot-preview');
      if(el) el.textContent=d.markdown||'No memories to export.';
    }).catch(function(e){ console.error('[amem] Dashboard fetch error:', e); });
  }

  window.copyCopilotPreview=function(){
    var el=$('copilot-preview');
    if(el&&el.textContent){
      navigator.clipboard.writeText(el.textContent).then(function(){
        var btn=document.querySelector('#copilot-card button');
        if(btn){var orig=btn.textContent;btn.textContent='Copied!';setTimeout(function(){btn.textContent=orig},2000)}
      });
    }
  }

  function renderSummaries(summaries){
    var el=$('summary-list');
    if(!el) return;
    if(!summaries||!summaries.length){setHTML(el,'<div class="empty">No session summaries yet. Use memory_summarize at session end.</div>');return}
    setHTML(el, summaries.map(function(s){
      var decisions=(s.keyDecisions||[]).map(function(d){return '<li>'+esc(d)+'</li>'}).join('');
      var corrections=(s.keyCorrections||[]).map(function(c){return '<li style="color:var(--correction)">'+esc(c)+'</li>'}).join('');
      return '<div class="mem-card">'+
        '<div class="mem-head">'+
          '<span class="type-badge" style="background:var(--decision)">session</span>'+
          '<code class="mono" style="color:var(--muted);font-size:0.7rem">'+esc(s.sessionId.slice(0,16))+'</code>'+
          '<span style="color:var(--muted);font-size:0.75rem;margin-left:auto">'+timeAgo(s.createdAt)+' | '+s.memoriesExtracted+' memories extracted</span>'+
        '</div>'+
        '<div class="mem-content">'+esc(s.summary)+'</div>'+
        (decisions?'<div class="mem-meta"><strong>Decisions:</strong></div><ul style="margin:4px 0 8px 20px;font-size:0.85rem">'+decisions+'</ul>':'')+
        (corrections?'<div class="mem-meta"><strong>Corrections:</strong></div><ul style="margin:4px 0 8px 20px;font-size:0.85rem">'+corrections+'</ul>':'')+
      '</div>';
    }).join(''));
  }

  function renderTimeline(memories){
    var el=$('timeline');
    if(!el) return;
    if(!memories.length){setHTML(el,'<div class="empty">No memories to display</div>');return}
    var sorted=memories.slice().sort(function(a,b){return b.createdAt-a.createdAt});
    var html='';
    var lastDay='';
    for(var i=0;i<Math.min(sorted.length,100);i++){
      var m=sorted[i];
      var d=new Date(m.createdAt);
      var dayKey=d.toISOString().slice(0,10);
      if(dayKey!==lastDay){
        html+='<div class="timeline-group">'+esc(dayKey)+'</div>';
        lastDay=dayKey;
      }
      var color=TYPE_COLORS[m.type]||'#8b949e';
      html+='<div class="timeline-item">'+
        '<div class="timeline-dot" style="background:'+color+'"></div>'+
        '<div class="timeline-date">'+esc(d.toLocaleTimeString())+'</div>'+
        '<div class="mem-content" style="font-size:0.85rem;margin-bottom:4px">'+esc(m.content)+'</div>'+
        '<span class="type-badge" style="background:'+color+'">'+esc(m.type)+'</span>'+
      '</div>';
    }
    setHTML(el,html);
  }

  // -- Event listeners --
  var debounce;
  $('mem-search').addEventListener('input',function(){
    clearTimeout(debounce);
    debounce=setTimeout(filterMemories,300);
  });
  $('mem-type').addEventListener('change',filterMemories);
  if($('mem-tier')) $('mem-tier').addEventListener('change',filterMemories);
  if($('mem-source')) $('mem-source').addEventListener('change',filterMemories);

  // -- Memory actions (delegated) --
  document.addEventListener('click',function(e){
    var btn=e.target;
    if(!btn||!btn.dataset||!btn.dataset.action) return;
    var parts=btn.dataset.action.split(':');
    var action=parts[0],val=parts[1],id=parts[2];
    if(!id) return;

    var url='';
    if(action==='tier') url='/api/action/tier?id='+encodeURIComponent(id)+'&tier='+encodeURIComponent(val);
    else if(action==='expire') url='/api/action/expire?id='+encodeURIComponent(id);
    else return;

    fetch(url,{method:'POST'}).then(function(r){
      if(r.ok) loadAll();
      else r.text().then(function(t){alert('Error: '+t)});
    }).catch(function(err){alert('Error: '+err.message)});
  });

  // -- Export --
  window.exportMemories=function(format){
    fetch('/api/memories?limit=10000').then(function(r){return r.json()}).then(function(data){
      var content,filename,mime;
      if(format==='json'){
        content=JSON.stringify(data,null,2);
        filename='amem-export.json';
        mime='application/json';
      } else {
        var lines=['# amem Memory Export\\n','*Exported: '+new Date().toISOString()+'*','*Total: '+data.length+' memories*\\n'];
        var types=['correction','decision','pattern','preference','topology','fact'];
        for(var ti=0;ti<types.length;ti++){
          var type=types[ti];
          var mems=data.filter(function(m){return m.type===type});
          if(!mems.length) continue;
          lines.push('## '+type.charAt(0).toUpperCase()+type.slice(1)+'s\\n');
          for(var mi=0;mi<mems.length;mi++){
            lines.push('- **'+mems[mi].content+'** ('+Math.round(mems[mi].confidence*100)+'% confidence)');
            if(mems[mi].tags&&mems[mi].tags.length) lines.push('  Tags: '+mems[mi].tags.join(', '));
            lines.push('');
          }
        }
        content=lines.join('\\n');
        filename='amem-export.md';
        mime='text/markdown';
      }
      var blob=new Blob([content],{type:mime});
      var a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=filename;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };

  // -- Init --
  setupGraphInteraction();
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
    tier: m.tier,
    validFrom: m.validFrom,
    validUntil: m.validUntil,
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
    fullContent: m.content,
    type: m.type,
    tier: m.tier,
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

function handleActionTier(
  db: AmemDatabase,
  res: http.ServerResponse,
  query: Record<string, string>,
): void {
  const id = query.id;
  const tier = query.tier;
  if (!id || !tier) { errorResponse(res, "Missing id or tier parameter", 400); return; }

  const fullId = db.resolveId(id);
  if (!fullId) { errorResponse(res, `Memory "${id}" not found`, 404); return; }

  db.updateTier(fullId, tier);
  jsonResponse(res, { ok: true, id: fullId, tier });
}

function handleActionExpire(
  db: AmemDatabase,
  res: http.ServerResponse,
  query: Record<string, string>,
): void {
  const id = query.id;
  if (!id) { errorResponse(res, "Missing id parameter", 400); return; }

  const fullId = db.resolveId(id);
  if (!fullId) { errorResponse(res, `Memory "${id}" not found`, 404); return; }

  db.expireMemory(fullId);
  jsonResponse(res, { ok: true, id: fullId, expired: true });
}

function handleSummaries(
  db: AmemDatabase,
  res: http.ServerResponse,
  query: Record<string, string>,
): void {
  const limit = Math.min(50, Math.max(1, parseInt(query.limit || "10", 10) || 10));
  const project = query.project || "global";
  const summaries = db.getRecentSummaries(project, limit);
  jsonResponse(
    res,
    summaries.map((s) => ({
      id: s.id,
      sessionId: s.sessionId,
      summary: s.summary,
      keyDecisions: s.keyDecisions,
      keyCorrections: s.keyCorrections,
      memoriesExtracted: s.memoriesExtracted,
      createdAt: s.createdAt,
    })),
  );
}

function handleTimeline(
  db: AmemDatabase,
  res: http.ServerResponse,
  query: Record<string, string>,
): void {
  const limit = Math.min(
    500,
    Math.max(1, parseInt(query.limit || "100", 10) || 100),
  );
  const memories = db.getAll();
  memories.sort((a, b) => b.createdAt - a.createdAt);

  const result = memories.slice(0, limit).map((m) => {
    const dayGroup = new Date(m.createdAt).toISOString().slice(0, 10);
    return {
      id: m.id,
      content: m.content,
      type: m.type,
      confidence: m.confidence,
      createdAt: m.createdAt,
      tier: m.tier,
      tags: m.tags,
      source: m.source,
      dayGroup,
    };
  });

  jsonResponse(res, result);
}

function handleCopilotPreview(
  db: AmemDatabase,
  res: http.ServerResponse,
): void {
  const { markdown, counts } = generateCopilotInstructions(db);
  jsonResponse(res, { markdown, counts });
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
        case "/api/summaries":
          handleSummaries(db, res, query);
          break;
        case "/api/timeline":
          handleTimeline(db, res, query);
          break;
        case "/api/copilot-preview":
          handleCopilotPreview(db, res);
          break;
        case "/api/action/tier":
          handleActionTier(db, res, query);
          break;
        case "/api/action/expire":
          handleActionExpire(db, res, query);
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
