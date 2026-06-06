"""
Vantageo PCB Visualizer — Server specs rendered as a motherboard circuit board.
Products = large processor chips. Components = SMD modules. Edges = copper traces.
No CDN. Works on file:// directly.
"""

import json
from pathlib import Path
from falkordb import FalkorDB

OUTPUT_HTML = Path(__file__).resolve().parent.parent / "output" / "vantageo_graph.html"

# PCB color palette — solder mask greens, copper golds, silkscreen whites
PCB_GREEN = "#0a2e15"
PCB_GREEN_DARK = "#061c0d"
COPPER = "#c8a96e"
COPPER_DIM = "rgba(200,169,110,0.35)"
COPPER_BRIGHT = "#e8c87a"
SILKSCREEN = "#d4e8c2"
GOLD = "#d4a843"
GOLD_PAD = "#e8c444"

# Component type trace colors
TRACE_COLORS = {
    "SUPPORTS_PROCESSOR":  "#e8a338",
    "SUPPORTS_FAMILY":     "#e8a338",
    "USES":                "#c870d0",
    "HAS_MEMORY":          "#3888e8",
    "SUPPORTS_DIMM":       "#3888e8",
    "HAS_STORAGE":         "#38c870",
    "HAS_INTERNAL_STORAGE":"#38c870",
    "SUPPORTS_RAID":       "#e87838",
    "SUPPORTS_RAID_CONTROLLER":"#e87838",
    "HAS_SLOT":            "#38d0b8",
    "SOURCED_FROM":        "#888888",
    "HAS_NETWORKING":      "#d0c838",
    "SUPPORTS_NIC":        "#d0c838",
    "HAS_VIDEO":           "#8858c8",
    "HAS_FRONT_IO":        "#5888d0",
    "HAS_REAR_IO":         "#5868e8",
    "HAS_PSU":             "#e85888",
    "HAS_COOLING":         "#38c8d0",
    "HAS_MANAGEMENT":      "#a08870",
    "HAS_FIRMWARE":        "#888888",
    "HAS_SECURITY":        "#e85858",
    "HAS_TPM":             "#688088",
    "HAS_BIOS":            "#586878",
    "SUPPORTS_OS":         "#38d0a8",
    "TARGETS":             "#d0c838",
    "HAS_FEATURE":         "#b858d0",
    "HAS_FORM_FACTOR":     "#38c870",
    "HAS_INTERCONNECT":    "#d0c838",
    "HAS_INTERNAL_STORAGE":"#38c870",
}


def export():
    db = FalkorDB(host="localhost", port=6380)
    g = db.select_graph("vantageo")

    nr = g.query("MATCH (n) RETURN id(n) AS id, labels(n) AS labels, properties(n) AS props")
    er = g.query("MATCH ()-[r]->() RETURN id(startNode(r)) AS from, id(endNode(r)) AS to, type(r) AS label")

    nodes = []
    node_map = {}
    for row in nr.result_set:
        nid = int(row[0])
        labels = row[1]
        props = dict(row[2]) if row[2] else {}
        lt = labels[0] if labels else "Unknown"
        display = (props.get("model") or props.get("product") or props.get("name")
                   or props.get("id") or props.get("controller") or lt)[:25]
        title = [f"{', '.join(labels)}"]
        for k, v in props.items():
            if k not in ("product", "model") and v:
                title.append(f"{k}: {v}")
        nodes.append({"id": nid, "label": display, "title": "\\n".join(title),
                       "type": lt, "props": props})
        node_map[nid] = len(nodes) - 1

    edges = []
    for row in er.result_set:
        f = int(row[0]); t = int(row[1])
        if f in node_map and t in node_map:
            edges.append({"from": node_map[f], "to": node_map[t], "label": row[2]})

    # ---- PCB LAYOUT ENGINE v2: wide-spaced, no overlap ----
    # Identify product nodes and build adjacency
    product_nodes = [n for n in nodes if n["type"] == "Product"]
    num_products = len(product_nodes)
    product_ids = set()
    for i, pn in enumerate(product_nodes):
        pn["_productIdx"] = i
        product_ids.add(pn["id"])

    # Product spacing: 400px apart with their own vertical zones
    PRODUCT_SPACING = 400
    PRODUCT_Y = -350
    COLUMN_SPACING = 90
    ROW_SPACING = 40
    COMPONENT_START_Y = PRODUCT_Y + 160  # start components well below product chip

    # Build adjacency: which components belong to which product
    product_adj = {i: {"comps": set(), "edges": []} for i in range(num_products)}
    comp_products = {}  # component_idx -> set of product indices
    for e in edges:
        src = nodes[e["from"]]
        dst = nodes[e["to"]]
        sid = src["id"]
        did = dst["id"]
        if sid in product_ids and not dst.get("is_product"):
            pi = src["_productIdx"]
            product_adj[pi]["comps"].add(e["to"])
            product_adj[pi]["edges"].append(e)
            comp_products.setdefault(e["to"], set()).add(sid)
        elif did in product_ids and not src.get("is_product"):
            pi = dst["_productIdx"]
            product_adj[pi]["comps"].add(e["from"])
            product_adj[pi]["edges"].append(e)
            comp_products.setdefault(e["from"], set()).add(did)

    # Shared components: used by 2+ products
    shared_set = set(ci for ci, pids in comp_products.items() if len(pids) > 1)
    exclusive = {i: set(ci for ci in comps if ci not in shared_set)
                  for i, comps in ((i, d["comps"]) for i, d in product_adj.items())}

    layout = {}
    product_start_x = -((num_products - 1) * PRODUCT_SPACING) // 2

    # Place products
    for i, pn in enumerate(product_nodes):
        layout[pn["id"]] = {"x": product_start_x + i * PRODUCT_SPACING, "y": PRODUCT_Y, "is_product": True}

    # Place exclusive components in their product's vertical zone
    for pi in range(num_products):
        px = product_start_x + pi * PRODUCT_SPACING
        comps = sorted(exclusive[pi])
        cols = max(1, min(4, (len(comps) + 7) // 8))
        col = 0
        row = 0
        for ci in comps:
            if ci in layout:
                continue
            cx = px - (cols - 1) * COLUMN_SPACING // 2 + col * COLUMN_SPACING
            cy = COMPONENT_START_Y + row * ROW_SPACING
            layout[ci] = {"x": cx, "y": cy, "is_product": False}
            col += 1
            if col >= cols:
                col = 0
                row += 1

    # Place shared components in a wide row between product row and component rows
    shared_y = PRODUCT_Y - 180
    shared_list = sorted(shared_set)
    shared_spacing = max(45, min(60, PRODUCT_SPACING * num_products // max(len(shared_list), 1)))
    shared_start_x = -((len(shared_list) - 1) * shared_spacing) // 2
    for si, ci in enumerate(shared_list):
        if ci in layout:
            continue
        layout[ci] = {"x": shared_start_x + si * shared_spacing, "y": shared_y, "is_product": False}

    # Any remaining components — spread them in a row below the exclusive zones
    remaining = [n for n in nodes if n["id"] not in layout and not n.get("is_product")]
    rem_y = COMPONENT_START_Y + 300
    rem_spacing = 70
    rem_start_x = -((len(remaining) - 1) * rem_spacing) // 2 if remaining else 0
    for ri, n in enumerate(remaining):
        layout[n["id"]] = {"x": rem_start_x + ri * rem_spacing, "y": rem_y, "is_product": False}

    # Merge layout into nodes, add product flag
    for n in nodes:
        pos = layout.get(n["id"], {"x": (hash(n.get("label", "")) % 600 - 300), "y": 100 + (hash(n.get("type", "")) % 200), "is_product": False})
        n["x"] = pos["x"]
        n["y"] = pos["y"]
        n["is_product"] = n.get("is_product") or pos.get("is_product") or False

    nodes_json = json.dumps(nodes, ensure_ascii=False)
    edges_json = json.dumps(edges, ensure_ascii=False)
    trace_colors_json = json.dumps(TRACE_COLORS, ensure_ascii=False)

    html = """<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>VANTAGEO // PCB LAYOUT</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:""" + PCB_GREEN_DARK + """;color:""" + SILKSCREEN + """;overflow:hidden;display:flex;height:100vh;
  font-family:'Segoe UI',system-ui,sans-serif;}
canvas{flex:1;cursor:crosshair}
#panel{width:300px;background:#061408;border-left:2px solid #1a4a2a;padding:0;display:flex;flex-direction:column;
  font-size:11px;position:relative;overflow:hidden}
#panel::before{content:'';position:absolute;inset:0;
  background:radial-gradient(ellipse at 50% 0%,rgba(212,168,67,0.04),transparent 70%);pointer-events:none;z-index:0}
#brand{z-index:1;padding:16px 18px 12px;border-bottom:1px solid #1a4a2a}
#brand h2{font-size:14px;font-weight:700;color:""" + GOLD + """;letter-spacing:3px;text-transform:uppercase}
#brand small{display:block;font-size:9px;color:#4a7a5a;margin-top:2px;letter-spacing:2px}
#stats{z-index:1;display:flex;border-bottom:1px solid #1a4a2a}
.st{flex:1;padding:12px 0;text-align:center;border-right:1px solid #0f2022}
.st:last-child{border:none}
.st .val{font-size:20px;font-weight:800;color:""" + COPPER_BRIGHT + """}
.st .lbl{font-size:9px;color:#4a7a5a;text-transform:uppercase;letter-spacing:1px;margin-top:2px}
#controls{z-index:1;padding:10px 16px;border-bottom:1px solid #1a4a2a;display:flex;flex-direction:column;gap:8px}
input{width:100%;padding:8px 10px;background:#030e06;border:1px solid #1a4a2a;color:""" + SILKSCREEN + """;
  font-size:11px;outline:none;border-radius:2px;font-family:inherit;transition:border-color .2s}
input:focus{border-color:""" + GOLD + """}
.btn-row{display:flex;gap:5px}
.btn{flex:1;padding:7px 0;text-align:center;background:#0a1a0e;border:1px solid #1a4a2a;
  color:#5a8a6a;font-size:10px;cursor:pointer;border-radius:2px;text-transform:uppercase;letter-spacing:1px;transition:all .15s}
.btn:hover{background:#0f2818;color:""" + SILKSCREEN + """;border-color:#2a5a3a}
.btn.accent{background:rgba(212,168,67,0.1);border-color:rgba(212,168,67,0.3);color:""" + GOLD + """}
.btn.accent:hover{background:rgba(212,168,67,0.2)}
#slabel{z-index:1;padding:10px 16px 4px;font-size:9px;color:#4a7a5a;text-transform:uppercase;letter-spacing:2px}
#info{z-index:1;margin:4px 12px;padding:10px;background:#030e06;border:1px solid #1a4a2a;border-radius:2px;
  min-height:60px;max-height:240px;overflow-y:auto;line-height:1.5;font-size:10px;color:#7aaa8a;transition:border-color .2s;word-break:break-word}
#info.flash{border-color:rgba(212,168,67,0.4)}
#info .n-type{color:""" + GOLD + """;font-size:10px;font-weight:600;margin-bottom:5px;text-transform:uppercase;letter-spacing:1px}
#info .n-prop{margin:2px 0}
#info .n-prop b{color:""" + SILKSCREEN + """;font-weight:400}
#info .n-placeholder{color:#4a7a5a;text-align:center;padding:12px 0;line-height:1.8}
#legend-wrap{z-index:1;flex:1;overflow-y:auto;padding:8px 16px 14px}
#legend{display:flex;flex-direction:column;gap:1px}
.leg-item{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:2px;
  cursor:pointer;transition:background .15s}
.leg-item:hover{background:rgba(212,168,67,0.08)}
.leg-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0}
.leg-name{font-size:10px;color:#7aaa8a;flex:1}
.leg-count{font-size:9px;color:#4a7a5a}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:#061408}
::-webkit-scrollbar-thumb{background:#1a4a2a;border-radius:2px}
</style></head><body>
<canvas id="c"></canvas>
<div id="panel">
  <div id="brand"><h2>VANTAGEO</h2><small>PCB SCHEMATIC VIEW</small></div>
  <div id="stats">
    <div class="st"><div class="val">""" + str(len(nodes)) + """</div><div class="lbl">Components</div></div>
    <div class="st"><div class="val">""" + str(len(edges)) + """</div><div class="lbl">Traces</div></div>
    <div class="st"><div class="val">""" + str(len(product_nodes)) + """</div><div class="lbl">Chips</div></div>
  </div>
  <div id="controls">
    <input placeholder="SEARCH COMPONENT..." id="search">
    <div class="btn-row">
      <button class="btn" onclick="fitAll()">FIT</button>
      <button class="btn" onclick="deselect()">CLR</button>
      <button class="btn accent" onclick="toggleSS()">LABELS</button>
    </div>
  </div>
  <div id="slabel">ACTIVE COMPONENT</div>
  <div id="info"><div class="n-placeholder">◇ ◇ ◇<br><br>CLICK A COMPONENT<br>TO INSPECT</div></div>
  <div id="slabel">TRACE LEGEND</div>
  <div id="legend-wrap"><div id="legend"></div></div>
</div>
<script>
var N=""" + nodes_json + """;
var E=""" + edges_json + """;
var TC=""" + trace_colors_json + """;

var W,H,ctx,scale=1,tx=0,ty=0;
var down=!1,downX=0,downY=0,hover=-1,selected=-1;
var showSilkscreen=!0,needsRedraw=!0,animTime=0;
var targetScale=1,targetTx=0,targetTy=0;

// Build adjacency map for quick lookups
var comps = {};
for(var i=0;i<E.length;i++){
  var t=E[i].label, eFrom=E[i].from, eTo=E[i].to;
  // Track edge type per target node
  if(!comps[eTo]) comps[eTo]=[];
  comps[eTo].push(t);
}

// Legend from edge type frequencies (deduplicate)
var edgeCounts={};
for(var i=0;i<E.length;i++) edgeCounts[E[i].label]=(edgeCounts[E[i].label]||0)+1;
var entries=Object.keys(edgeCounts).sort(function(a,b){return edgeCounts[b]-edgeCounts[a]});
var leg='';
for(var m=0;m<entries.length;m++){
  var nm=entries[m];
  var rc=TC[nm]||'#888';
  leg+='<div class="leg-item" data-type="'+nm+'"><div class="leg-dot" style="background:'+rc+';color:'+rc+'"></div><div class="leg-name">'+nm.replace(/_/g,' ')+'</div><div class="leg-count">'+edgeCounts[nm]+'</div></div>';
}
document.getElementById('legend').innerHTML=leg;

var canvas=document.getElementById('c');
ctx=canvas.getContext('2d');

function resize(){W=canvas.width=window.innerWidth-300;H=canvas.height=window.innerHeight;needsRedraw=!0}
function toWorld(sx,sy){return[(sx-W/2-tx)/scale,(sy-H/2-ty)/scale]}
function hitTest(wx,wy){
  for(var i=N.length-1;i>=0;i--){
    var n=N[i],hw=n.is_product?28:10,hh=n.is_product?18:8;
    var dx=wx-n.x,dy=wy-n.y;
    if(Math.abs(dx)<hw&&Math.abs(dy)<hh)return i;
  }
  return -1;
}

// Smooth camera
function tick(ts){
  requestAnimationFrame(tick);
  animTime=ts*.001;

  // Smooth zoom/pan towards target
  scale+=(targetScale-scale)*.12;
  tx+=(targetTx-tx)*.12;
  ty+=(targetTy-ty)*.12;
  if(Math.abs(scale-targetScale)>.001||Math.abs(tx-targetTx)>.1||Math.abs(ty-targetTy)>.1)
    needsRedraw=!0;

  if(!needsRedraw)return;
  needsRedraw=!1;
  draw();
}

function draw(){
  ctx.clearRect(0,0,W,H);

  // PCB substrate - layered green with fiber texture
  ctx.fillStyle='""" + PCB_GREEN_DARK + """';ctx.fillRect(0,0,W,H);
  var grad=ctx.createRadialGradient(W*.4,H*.3,0,W*.5,H*.5,W*1.2);
  grad.addColorStop(0,'""" + PCB_GREEN + """');grad.addColorStop(1,'""" + PCB_GREEN_DARK + """');
  ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);

  // Subtle fiber weave lines
  ctx.strokeStyle='rgba(20,60,30,0.3)';ctx.lineWidth=.5;
  for(var gy=-H;gy<H*2;gy+=4){
    ctx.beginPath();ctx.moveTo(0,gy+Math.sin(gy*.02+animTime*.1)*1.5);ctx.lineTo(W,gy+Math.sin(gy*.02+animTime*.1+.5)*1.5);ctx.stroke();
  }

  ctx.save();
  ctx.translate(W/2+tx,H/2+ty);
  ctx.scale(scale,scale);

  // ---- Copper pads (vias) for unconnected nodes ----
  ctx.fillStyle='""" + COPPER_DIM + """';
  for(var i=0;i<N.length;i++){
    if(N[i].hidden||N[i].is_product)continue;
    ctx.beginPath();ctx.arc(N[i].x,N[i].y,4,0,Math.PI*2);ctx.fill();
  }

  // ---- TRACES (copper paths) ----
  for(var e=0;e<E.length;e++){
    var a=N[E[e].from],b=N[E[e].to];
    if(!a||!b||a.hidden||b.hidden)continue;
    var et=E[e].label;
    var isSel=(selected>=0&&(E[e].from===selected||E[e].to===selected));
    var tc=TC[et]||'#888';

    var ay=a.y,by=b.y;
    if(a.is_product) ay=a.y+18; else ay=a.y;
    if(b.is_product) by=b.y+18; else by=b.y;

    // Right-angle PCB trace (Manhattan routing)
    var midY=(ay+by)/2;

    ctx.strokeStyle=isSel?'rgba(255,255,255,0.6)':'rgba(180,150,120,0.4)';
    if(TC[et])ctx.strokeStyle=isSel?TC[et]:'rgba(150,130,100,0.45)';
    ctx.lineWidth=isSel?2.5:1.2;
    ctx.lineCap='round';

    ctx.beginPath();
    ctx.moveTo(a.x,ay);
    if(Math.abs(a.x-b.x)<10){
      ctx.lineTo(b.x,by); // straight vertical
    } else {
      ctx.lineTo(a.x,midY); // out of source
      ctx.lineTo(b.x,midY); // horizontal run
    }
    ctx.lineTo(b.x,by); // into target
    ctx.stroke();

    // Endpoint pads
    ctx.fillStyle=isSel?tc:'""" + GOLD_PAD + """';
    ctx.beginPath();ctx.arc(b.x,by,isSel?5:3.5,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(a.x,ay,isSel?5:3.5,0,Math.PI*2);ctx.fill();

    // Signal pulse on selected traces
    if(isSel){
      var p=(animTime*.4)%1;
      var px=a.x+(b.x-a.x)*p,py=ay+(by-ay)*p;
      if(Math.abs(a.x-b.x)>10){px=a.x;py=ay+((midY-ay)+(by-midY))*(p<.5?p*2:(p-.5)*2);}
      ctx.fillStyle='rgba(255,255,200,0.9)';ctx.beginPath();ctx.arc(px,py,3,0,Math.PI*2);ctx.fill();
    }
  }

  // ---- COMPONENTS (SMD chips) ----
  for(var i=0;i<N.length;i++){
    var n=N[i];
    if(n.hidden)continue;
    var isSel=i===selected,isHov=i===hover;
    var x=n.x,y=n.y;

    if(n.is_product){
      // PRODUCT CHIP — large gold-capped IC
      var w=60,h=40,r=6;
      // Shadow
      ctx.shadowColor='rgba(0,0,0,0.5)';ctx.shadowBlur=10;ctx.shadowOffsetX=3;ctx.shadowOffsetY=3;

      // Chip body
      var chipGrad=ctx.createLinearGradient(x-w/2,y-h/2,x-w/2,y+h/2);
      chipGrad.addColorStop(0,'#1a1a1a');chipGrad.addColorStop(.3,'#2a2a2a');chipGrad.addColorStop(1,'#0a0a0a');
      ctx.fillStyle=chipGrad;
      roundRect(ctx,x-w/2,y-h/2,w,h,r);ctx.fill();
      ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;

      // Gold border
      ctx.strokeStyle=isSel||isHov?'""" + GOLD_PAD + """':'""" + GOLD + """';
      ctx.lineWidth=isSel?3:1.5;
      roundRect(ctx,x-w/2,y-h/2,w,h,r);ctx.stroke();

      // Die mark (corner dot)
      ctx.fillStyle='""" + SILKSCREEN + """';ctx.beginPath();ctx.arc(x-w/2+8,y-h/2+8,3,0,Math.PI*2);ctx.fill();

      // Pin strip left/right
      for(var p=0;p<8;p++){
        var py=y-h/2+6+p*5;
        ctx.fillStyle='""" + GOLD + """';ctx.fillRect(x-w/2-3,py-1,3,2);
        ctx.fillRect(x+w/2,py-1,3,2);
      }

      // Label (silkscreen above chip)
      if(showSilkscreen&&scale>.2){
        ctx.fillStyle='""" + SILKSCREEN + """';ctx.font='bold '+(isSel?14:11)+'px Segoe UI,system-ui,sans-serif';
        ctx.textAlign='center';
        ctx.fillText(n.label,x,y-h/2-10);
      }
    } else {
      // SMD COMPONENT — small ceramic package
      var sw=n.label.length*5+8,sh=14;
      if(sw<30)sw=30;
      // Body
      var smdGrad=ctx.createLinearGradient(x-sw/2,y-sh/2,x-sw/2,y+sh/2);
      smdGrad.addColorStop(0,'#383838');smdGrad.addColorStop(1,'#1a1a1a');
      ctx.fillStyle=smdGrad;
      roundRect(ctx,x-sw/2,y-sh/2,sw,sh,2);ctx.fill();

      // Gold end caps
      ctx.fillStyle=isSel||isHov?'""" + GOLD_PAD + """':'""" + GOLD + """';
      ctx.fillRect(x-sw/2-2,y-sh/2,3,sh);
      ctx.fillRect(x+sw/2-1,y-sh/2,3,sh);

      // Body stroke
      ctx.strokeStyle=isSel||isHov?'""" + GOLD_PAD + """':'""" + COPPER + """';
      ctx.lineWidth=isSel?2:.6;
      roundRect(ctx,x-sw/2,y-sh/2,sw,sh,2);ctx.stroke();

      // Silkscreen label
      if(showSilkscreen&&scale>.3){
        ctx.fillStyle=isSel?'#fff':'""" + SILKSCREEN + """';ctx.font=(isSel?9:8)+'px Segoe UI,system-ui,sans-serif';
        ctx.textAlign='center';ctx.fillText(n.label,x,y+2);
      }
    }
  }

  // ---- Silkscreen reference points ----
  ctx.fillStyle='""" + SILKSCREEN + """';ctx.font='8px monospace';
  ctx.textAlign='left';
  for(var i=0;i<N.length;i++){
    var n=N[i];
    if(n.hidden||!n.is_product||scale<.25)continue;
    ctx.fillText('REF: VP'+N[i].label.replace(/[^0-9]/g,'')[0],n.x+n.is_product?32:18,n.y-2);
  }

  ctx.restore();

  // HUD
  ctx.fillStyle='rgba(74,122,90,0.5)';ctx.font='9px monospace';ctx.textAlign='right';
  ctx.fillText('ZOOM '+Math.round(scale*100)+'%',W-10,16);
  ctx.textAlign='left';
  ctx.fillText('PANNEL | ZOOM (scroll)',10,16);
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}

// ---- Events ----
canvas.addEventListener('wheel',function(e){
  e.preventDefault();
  var z=e.deltaY>0?.92:1.08;
  targetScale=Math.max(.08,Math.min(5,targetScale*z));
  needsRedraw=!0;
});

canvas.addEventListener('mousedown',function(e){
  if(e.button!==0)return;
  var wx=toWorld(e.offsetX,e.offsetY);
  var h=hitTest(wx[0],wx[1]);
  if(h>=0){
    selected=h;
    var n=N[h];
    var hl='<div class="n-type">'+n.type+'</div>';
    var lines=n.title.split('\\n');
    for(var p=1;p<lines.length;p++){
      var kv=lines[p].split(': ');
      hl+='<div class="n-prop"><b>'+kv[0]+'</b>: '+(kv[1]||'')+'</div>';
    }
    document.getElementById('info').innerHTML=hl;
    document.getElementById('info').classList.add('flash');
    setTimeout(function(){document.getElementById('info').classList.remove('flash')},400);
  } else {
    selected=-1;
    document.getElementById('info').innerHTML='<div class="n-placeholder">&#9671; &#9671; &#9671;<br><br>CLICK A COMPONENT<br>TO INSPECT</div>';
  }
  down=!0;downX=e.offsetX;downY=e.offsetY;needsRedraw=!0;
});

canvas.addEventListener('mousemove',function(e){
  if(down){
    targetTx+=e.offsetX-downX;targetTy+=e.offsetY-downY;
    tx=targetTx;ty=targetTy;
    downX=e.offsetX;downY=e.offsetY;needsRedraw=!0;
  } else {
    var wx=toWorld(e.offsetX,e.offsetY);
    var newHover=hitTest(wx[0],wx[1]);
    if(newHover!==hover){hover=newHover;needsRedraw=!0}
  }
});

canvas.addEventListener('mouseup',function(){down=!1;needsRedraw=!0});
canvas.addEventListener('mouseleave',function(){if(hover>=0){hover=-1;needsRedraw=!0}if(down){down=!1;needsRedraw=!0}});

function fitAll(){targetTx=0;targetTy=0;targetScale=.55;needsRedraw=!0}
function deselect(){
  selected=-1;
  document.getElementById('info').innerHTML='<div class="n-placeholder">&#9671; &#9671; &#9671;<br><br>CLICK A COMPONENT<br>TO INSPECT</div>';
  needsRedraw=!0;
}
function toggleSS(){showSilkscreen=!showSilkscreen;needsRedraw=!0}

document.getElementById('search').addEventListener('input',function(e){
  var q=e.target.value.toLowerCase().trim();
  if(!q){for(var i=0;i<N.length;i++)N[i].hidden=!1;fitAll();return}
  var found=[];
  for(var i=0;i<N.length;i++){
    N[i].hidden=!(N[i].label.toLowerCase().indexOf(q)>=0||N[i].title.toLowerCase().indexOf(q)>=0);
    if(!N[i].hidden)found.push(i);
  }
  if(found.length>0){
    var cx=0,cy=0;
    for(var k=0;k<found.length;k++){cx+=N[found[k]].x;cy+=N[found[k]].y}
    cx/=found.length;cy/=found.length;
    targetTx=-cx*targetScale;targetTy=-cy*targetScale;
  }
  needsRedraw=!0
});

window.addEventListener('resize',function(){resize()});
resize();
requestAnimationFrame(tick);
</script></body></html>"""

    OUTPUT_HTML.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_HTML.write_text(html, encoding="utf-8")
    print(f"Exported: {OUTPUT_HTML}")
    print(f"  5 Products | {len(nodes)} Components | {len(edges)} Traces")


if __name__ == "__main__":
    export()
