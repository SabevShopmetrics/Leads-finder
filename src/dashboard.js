// Generates a standalone, self-contained HTML dashboard from the scored rows.
// Data is inlined as JSON so the file opens by double-click (no server, no CORS).
// Vanilla JS + CSS only — no dependencies, no external requests.

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * @param {Array}  rows    sorted output rows (same shape as leads.json)
 * @param {object} summary { rawCount, unique, noWebsite, hot, avg, byTier,
 *                           byCategory, criteria, searches, generatedAt }
 * @param {string} outputDir absolute path to /output
 * @returns {Promise<string>} path to the written dashboard.html
 */
export async function writeDashboard(rows, summary, outputDir) {
  const html = renderHtml(rows, summary);
  const dashboardPath = resolve(outputDir, 'dashboard.html');
  await writeFile(dashboardPath, html, 'utf8');
  return dashboardPath;
}

function renderHtml(rows, summary) {
  // Embed data as a JS object literal (JSON is valid JS). Escape "<" so a
  // "</script>" inside any string can't break out of the tag, and escape the
  // JS-hostile line/paragraph separators (built via char codes so this source
  // file itself contains no literal separator characters).
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);
  const data = JSON.stringify({ rows, summary })
    .replace(/</g, '\\u003c')
    .split(LS)
    .join('\\u2028')
    .split(PS)
    .join('\\u2029');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SilexBrand · Varna Lead Scout</title>
<style>
  :root {
    --bg:#0b1020; --bg2:#10162c; --card:#151c33; --card2:#1b2440;
    --line:#26314f; --text:#e8ecf7; --muted:#93a0c0; --faint:#6b779a;
    --brand:#6d8bff; --brand2:#8a6dff;
    --a:#34d399; --b:#ffb020; --c:#5b8cff; --d:#6b7392;
    --hot:#ff5d73; --shadow:0 10px 40px rgba(0,0,0,.35); --track:#222b46;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg:#f4f6fc; --bg2:#eef1fa; --card:#ffffff; --card2:#f7f9ff;
      --line:#e2e7f3; --text:#141a2e; --muted:#5b678a; --faint:#8b96b5;
      --shadow:0 10px 30px rgba(30,45,90,.10); --track:#e7ecf7;
    }
  }
  * { box-sizing:border-box; }
  body {
    margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    color:var(--text); background:linear-gradient(160deg,var(--bg),var(--bg2)); min-height:100vh;
    -webkit-font-smoothing:antialiased;
  }
  .wrap { max-width:1320px; margin:0 auto; padding:32px 20px 64px; }
  header { display:flex; align-items:center; gap:14px; margin-bottom:4px; }
  .logo {
    width:44px;height:44px;border-radius:12px;flex:0 0 auto;
    background:linear-gradient(135deg,var(--brand),var(--brand2));
    display:grid;place-items:center;font-weight:800;color:#fff;font-size:21px;
    box-shadow:0 6px 18px rgba(109,139,255,.5);
  }
  h1 { font-size:22px; margin:0; letter-spacing:-.3px; }
  .sub { color:var(--muted); font-size:13px; margin-top:2px; }
  .brandline { color:var(--brand); }

  .kpis { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; margin:24px 0 18px; }
  @media (max-width:900px){ .kpis{ grid-template-columns:repeat(2,1fr);} }
  .kpi { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px 18px; box-shadow:var(--shadow); position:relative; overflow:hidden; }
  .kpi .n { font-size:30px; font-weight:800; letter-spacing:-1px; }
  .kpi .l { color:var(--muted); font-size:12.5px; margin-top:2px; text-transform:uppercase; letter-spacing:.4px; }
  .kpi.hot .n{ color:var(--hot);} .kpi.nosite .n{ color:var(--b);} .kpi.uniq .n{ color:var(--brand);} .kpi.avg .n{ color:var(--a);}
  .kpi::after{ content:""; position:absolute; right:-30px; top:-30px; width:90px; height:90px; border-radius:50%; background:radial-gradient(circle,rgba(109,139,255,.16),transparent 70%); }

  .strips { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:18px; }
  @media (max-width:900px){ .strips{ grid-template-columns:1fr;} }
  .strip { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px 16px; box-shadow:var(--shadow); }
  .strip h3 { margin:0 0 10px; font-size:12px; text-transform:uppercase; letter-spacing:.5px; color:var(--muted); font-weight:600; }
  .segbar { display:flex; height:12px; border-radius:99px; overflow:hidden; background:var(--track); }
  .segbar > span { display:block; height:100%; }
  .seglegend { display:flex; flex-wrap:wrap; gap:12px; margin-top:9px; font-size:12.5px; color:var(--muted); }
  .seglegend .dot { width:9px; height:9px; border-radius:3px; display:inline-block; margin-right:5px; vertical-align:middle; }

  .controls { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:16px;
    background:var(--card); border:1px solid var(--line); border-radius:14px; padding:12px 14px; box-shadow:var(--shadow); }
  .controls input[type=search], .controls select {
    background:var(--card2); color:var(--text); border:1px solid var(--line); border-radius:10px; padding:9px 12px; font-size:14px; outline:none; }
  .controls input[type=search]{ min-width:200px; flex:1; }
  .controls input[type=search]:focus, .controls select:focus{ border-color:var(--brand); }
  .controls label{ color:var(--muted); font-size:12.5px; display:flex; align-items:center; gap:7px; }
  .controls .spacer{ flex:1; }
  .count { color:var(--faint); font-size:13px; white-space:nowrap; }

  .tablecard { background:var(--card); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); overflow:hidden; }
  .scroll { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; font-size:14px; min-width:960px; }
  thead th { position:sticky; top:0; background:var(--card2); color:var(--muted); text-align:left; font-weight:600; font-size:12px;
    text-transform:uppercase; letter-spacing:.4px; padding:12px 14px; border-bottom:1px solid var(--line); cursor:pointer; white-space:nowrap; user-select:none; }
  thead th.no-sort{ cursor:default; }
  thead th .arrow{ opacity:.35; font-size:10px; margin-left:4px; }
  thead th.sorted .arrow{ opacity:1; color:var(--brand); }
  tbody td { padding:11px 14px; border-bottom:1px solid var(--line); vertical-align:top; }
  tbody tr:hover { background:var(--card2); }
  tbody tr:last-child td { border-bottom:none; }
  .biz { font-weight:600; }
  .addr { color:var(--faint); font-size:12.5px; margin-top:2px; max-width:240px; }
  .niches { display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; }
  .tag { background:var(--card2); border:1px solid var(--line); color:var(--muted); border-radius:999px; padding:1px 8px; font-size:11px; }

  .score { font-weight:800; font-size:15px; width:44px; height:36px; border-radius:9px; display:grid; place-items:center; color:#0b1020; }
  .t-A{ background:linear-gradient(135deg,var(--a),#7ef0c2);} .t-B{ background:linear-gradient(135deg,var(--b),#ffd257);}
  .t-C{ background:linear-gradient(135deg,var(--c),#93b4ff); color:#fff;} .t-D{ background:var(--d); color:#fff;}
  .tierpill { font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; }
  .tp-A{ background:rgba(52,211,153,.16); color:var(--a);} .tp-B{ background:rgba(255,176,32,.16); color:var(--b);}
  .tp-C{ background:rgba(91,140,255,.16); color:var(--c);} .tp-D{ background:rgba(107,115,146,.2); color:var(--faint);}
  .catpill { font-size:11.5px; padding:2px 9px; border-radius:8px; background:var(--card2); border:1px solid var(--line); white-space:nowrap; }

  .crit { display:grid; grid-template-columns:repeat(6, 1fr); gap:5px; min-width:210px; }
  .crit .cell { text-align:center; }
  .crit .bar { height:34px; width:100%; background:var(--track); border-radius:5px; position:relative; overflow:hidden; }
  .crit .bar > span { position:absolute; bottom:0; left:0; right:0; border-radius:5px 5px 0 0; }
  .crit .v { font-size:10px; color:var(--faint); margin-top:2px; }
  .crit .k { font-size:9px; color:var(--faint); text-transform:uppercase; letter-spacing:.3px; }

  .pill{ font-size:11.5px; padding:2px 9px; border-radius:999px; font-weight:600; }
  .pill.no{ background:rgba(255,93,115,.15); color:var(--hot);} .pill.yes{ background:rgba(52,211,153,.14); color:var(--a);}
  .rating{ white-space:nowrap;} .star{ color:var(--b);}
  a.link{ color:var(--brand); text-decoration:none;} a.link:hover{ text-decoration:underline; }
  .empty{ padding:48px; text-align:center; color:var(--muted); }
  footer{ color:var(--faint); font-size:12px; margin-top:18px; text-align:center; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="logo">S</div>
    <div>
      <h1>Varna Lead Scout <span class="brandline">· SilexBrand</span></h1>
      <div class="sub" id="genat"></div>
    </div>
  </header>

  <div class="kpis" id="kpis"></div>

  <div class="strips">
    <div class="strip"><h3>Leads by tier</h3><div class="segbar" id="tierbar"></div><div class="seglegend" id="tierlegend"></div></div>
    <div class="strip"><h3>Leads by category</h3><div class="segbar" id="catbar"></div><div class="seglegend" id="catlegend"></div></div>
  </div>

  <div class="controls">
    <input type="search" id="q" placeholder="Search business, address, niche…" />
    <select id="cat"><option value="">All categories</option></select>
    <label>Tier <select id="tier"><option value="">any</option><option value="A">A · Hot</option><option value="B">B · Warm</option><option value="C">C · Nurture</option><option value="D">D · Cold</option></select></label>
    <label>Website <select id="site"><option value="">any</option><option value="no">no site</option><option value="yes">has site</option></select></label>
    <label>Min score <select id="minscore"><option value="0">0+</option><option value="50">50+</option><option value="65">65+</option><option value="80">80+ (hot)</option></select></label>
    <span class="spacer"></span>
    <span class="count" id="count"></span>
  </div>

  <div class="tablecard">
    <div class="scroll">
      <table>
        <thead><tr id="head">
          <th data-k="score" class="sorted">Score <span class="arrow">▼</span></th>
          <th data-k="business">Business <span class="arrow">▲</span></th>
          <th data-k="category">Category <span class="arrow">▲</span></th>
          <th data-k="tier">Tier <span class="arrow">▲</span></th>
          <th class="no-sort" id="crithead">Criteria (1–100)</th>
          <th data-k="hasWebsite">Website <span class="arrow">▲</span></th>
          <th data-k="rating">Rating <span class="arrow">▲</span></th>
          <th data-k="reviewCount">Reviews <span class="arrow">▲</span></th>
          <th data-k="phone" class="no-sort">Phone</th>
          <th data-k="maps" class="no-sort">Map</th>
        </tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
    <div class="empty" id="empty" style="display:none">No leads match these filters.</div>
  </div>

  <footer>Generated by SilexBrand Lead Scout · data from Google Places API (New) · <span id="ftotal"></span></footer>
</div>

<script>
const DATA = ${data};
const rows = DATA.rows || [];
const summary = DATA.summary || {};
const CRITERIA = summary.criteria || [];
const tierColor = { A:getVar('--a'), B:getVar('--b'), C:getVar('--c'), D:getVar('--d') };
const catPalette = ['#6d8bff','#34d399','#ffb020','#ff5d73','#8a6dff','#22d3ee','#f472b6','#a3e635','#fb923c','#94a3b8'];
function getVar(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888'; }
const esc = s => String(s??"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const escA = s => esc(s).replace(/"/g,"&quot;");

// ── KPIs ──
const kpis = [
  { n: summary.rawCount ?? rows.length, l:"Raw results", cls:"" },
  { n: summary.unique ?? rows.length, l:"Unique businesses", cls:"uniq" },
  { n: summary.noWebsite ?? rows.filter(r=>r.hasWebsite==="no").length, l:"No website", cls:"nosite" },
  { n: (summary.byTier && summary.byTier.A) ?? rows.filter(r=>r.tier==="A").length, l:"Hot leads (A)", cls:"hot" },
  { n: (summary.avg ?? Math.round(rows.reduce((a,r)=>a+(+r.score||0),0)/(rows.length||1))) + "", l:"Avg score /100", cls:"avg" },
];
document.getElementById("kpis").innerHTML = kpis.map(k=>'<div class="kpi '+k.cls+'"><div class="n">'+k.n+'</div><div class="l">'+k.l+'</div></div>').join("");
document.getElementById("genat").textContent = summary.generatedAt ? ("Generated "+summary.generatedAt+(summary.searches?(" · "+summary.searches+" searches"):"")) : "Lead intelligence dashboard";
document.getElementById("ftotal").textContent = rows.length + " businesses scored";

// ── tier + category strips ──
function renderSeg(barId, legendId, counts, colorFn, order){
  const entries = (order || Object.keys(counts)).filter(k=>counts[k]).map(k=>[k,counts[k]]);
  const total = entries.reduce((a,[,n])=>a+n,0) || 1;
  document.getElementById(barId).innerHTML = entries.map(([k,n])=>'<span style="width:'+(100*n/total)+'%;background:'+colorFn(k)+'"></span>').join("");
  document.getElementById(legendId).innerHTML = entries.map(([k,n])=>'<span><span class="dot" style="background:'+colorFn(k)+'"></span>'+esc(k)+' · '+n+'</span>').join("");
}
const tierCounts = summary.byTier || tallyBy(rows, r=>r.tier);
const tierLabels = { A:"A · Hot", B:"B · Warm", C:"C · Nurture", D:"D · Cold" };
renderSeg("tierbar","tierlegend",
  Object.fromEntries(Object.entries(tierCounts).map(([k,v])=>[tierLabels[k]||k,v])),
  lbl=>tierColor[(lbl+"")[0]]||"#888", ["A · Hot","B · Warm","C · Nurture","D · Cold"]);
const catCounts = summary.byCategory || tallyBy(rows, r=>r.category);
const catKeys = Object.keys(catCounts).sort((a,b)=>catCounts[b]-catCounts[a]);
const catColor = Object.fromEntries(catKeys.map((c,i)=>[c, catPalette[i%catPalette.length]]));
renderSeg("catbar","catlegend", catCounts, c=>catColor[c]||"#888", catKeys);

// ── filters populate ──
const catSel = document.getElementById("cat");
catKeys.slice().sort().forEach(c=>{ const o=document.createElement("option"); o.value=o.textContent=c; catSel.appendChild(o); });

// criteria header tooltip
document.getElementById("crithead").title = CRITERIA.map(c=>c.label+" ("+Math.round(c.weight*100)+"%)").join(" · ");

function tallyBy(list, fn){ const o={}; for(const r of list){ const k=fn(r); o[k]=(o[k]||0)+1; } return o; }
function critColor(v){ return v>=80?getVar('--a'): v>=60?getVar('--b'): v>=40?getVar('--c'): getVar('--d'); }

// ── state + render ──
let sortKey="score", sortDir=-1;
const NUM = new Set(["score","rating","reviewCount"]);

function render(){
  const q=document.getElementById("q").value.trim().toLowerCase();
  const cf=document.getElementById("cat").value;
  const tf=document.getElementById("tier").value;
  const sf=document.getElementById("site").value;
  const ms=+document.getElementById("minscore").value;

  let list=rows.filter(r=>{
    if(ms && (+r.score||0)<ms) return false;
    if(tf && r.tier!==tf) return false;
    if(cf && r.category!==cf) return false;
    if(sf && r.hasWebsite!==sf) return false;
    if(q){ const hay=(r.business+" "+r.address+" "+r.niches+" "+r.category+" "+r.phone).toLowerCase(); if(!hay.includes(q)) return false; }
    return true;
  });

  list.sort((a,b)=>{
    let x=a[sortKey], y=b[sortKey];
    if(NUM.has(sortKey)){ x=+x||0; y=+y||0; return (x-y)*sortDir; }
    x=String(x||"").toLowerCase(); y=String(y||"").toLowerCase();
    return (x<y?-1:x>y?1:0)*sortDir;
  });

  document.getElementById("rows").innerHTML = list.map(r=>{
    const s=+r.score||0, tier=r.tier||"D";
    const crit = CRITERIA.map(c=>{
      const v = (r.criteria && r.criteria[c.key]) ?? r["score_"+c.key] ?? 0;
      return '<div class="cell" title="'+escA(c.label)+': '+v+'/100"><div class="bar"><span style="height:'+v+'%;background:'+critColor(v)+'"></span></div><div class="v">'+v+'</div><div class="k">'+esc(c.key.slice(0,4))+'</div></div>';
    }).join("");
    const tags = String(r.niches||"").split(/;\\s*/).filter(Boolean).map(n=>'<span class="tag">'+esc(n)+'</span>').join("");
    const site = r.hasWebsite==="yes" ? '<a class="link" href="'+escA(r.website)+'" target="_blank" rel="noopener">visit ↗</a>' : '<span class="pill no">no site</span>';
    const rating = (r.rating!=="" && r.rating!=null) ? '<span class="rating"><span class="star">★</span> '+esc(r.rating)+'</span>' : '<span style="color:var(--faint)">—</span>';
    const reviews = (r.reviewCount!=="" && r.reviewCount!=null) ? esc(r.reviewCount) : '<span style="color:var(--faint)">—</span>';
    const phone = r.phone ? esc(r.phone) : '<span style="color:var(--faint)">—</span>';
    const map = r.mapsUri ? '<a class="link" href="'+escA(r.mapsUri)+'" target="_blank" rel="noopener">open ↗</a>' : "—";
    return '<tr>'
      + '<td><div class="score t-'+tier+'">'+s+'</div></td>'
      + '<td><div class="biz">'+esc(r.business||"(unnamed)")+'</div>'+(r.address?'<div class="addr">'+esc(r.address)+'</div>':'')+(tags?'<div class="niches">'+tags+'</div>':'')+'</td>'
      + '<td><span class="catpill">'+esc(r.category||"Other")+'</span></td>'
      + '<td><span class="tierpill tp-'+tier+'">'+tier+' · '+esc(r.tierLabel||"")+'</span></td>'
      + '<td><div class="crit">'+crit+'</div></td>'
      + '<td>'+site+'</td><td>'+rating+'</td><td>'+reviews+'</td><td>'+phone+'</td><td>'+map+'</td>'
      + '</tr>';
  }).join("");

  document.getElementById("empty").style.display = list.length ? "none":"block";
  document.getElementById("count").textContent = list.length+" of "+rows.length+" shown";
}

document.getElementById("head").addEventListener("click", e=>{
  const th=e.target.closest("th"); if(!th||th.classList.contains("no-sort")||!th.dataset.k) return;
  const k=th.dataset.k;
  if(k===sortKey) sortDir=-sortDir; else { sortKey=k; sortDir=NUM.has(k)?-1:1; }
  document.querySelectorAll("thead th").forEach(h=>{ h.classList.toggle("sorted", h.dataset.k===sortKey);
    const a=h.querySelector(".arrow"); if(a && h.dataset.k===sortKey) a.textContent = sortDir<0?"▼":"▲"; });
  render();
});
["q","cat","tier","site","minscore"].forEach(id=>document.getElementById(id).addEventListener("input", render));
render();
</script>
</body>
</html>
`;
}
