// Generates a standalone, self-contained HTML dashboard from the scored rows.
// Data is inlined as JSON so the file opens by double-click (no server, no CORS).
// Vanilla JS + CSS only — no dependencies, no external requests.

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * @param {Array}  rows    sorted output rows (same shape as leads.json)
 * @param {object} summary { rawCount, unique, noWebsite, hot, generatedAt }
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
  // Safely embed data: close-tag break + line/para separators.
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
    --bg: #0b1020; --bg2: #10162c; --card: #151c33; --card2: #1b2440;
    --line: #26314f; --text: #e8ecf7; --muted: #93a0c0; --faint: #6b779a;
    --brand: #6d8bff; --brand2: #8a6dff;
    --hot: #ff5d73; --warm: #ffb020; --cold: #4a5578;
    --ok: #34d399; --shadow: 0 10px 40px rgba(0,0,0,.35);
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg:#f4f6fc; --bg2:#eef1fa; --card:#ffffff; --card2:#f7f9ff;
      --line:#e2e7f3; --text:#141a2e; --muted:#5b678a; --faint:#8b96b5;
      --shadow:0 10px 30px rgba(30,45,90,.10);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    color:var(--text); background:linear-gradient(160deg,var(--bg),var(--bg2)); min-height:100vh;
    -webkit-font-smoothing:antialiased;
  }
  .wrap { max-width:1180px; margin:0 auto; padding:32px 20px 64px; }
  header { display:flex; align-items:center; gap:14px; margin-bottom:4px; }
  .logo {
    width:42px;height:42px;border-radius:12px;flex:0 0 auto;
    background:linear-gradient(135deg,var(--brand),var(--brand2));
    display:grid;place-items:center;font-weight:800;color:#fff;font-size:20px;
    box-shadow:0 6px 18px rgba(109,139,255,.5);
  }
  h1 { font-size:22px; margin:0; letter-spacing:-.3px; }
  .sub { color:var(--muted); font-size:13px; margin-top:2px; }
  .kpis { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; margin:26px 0 22px; }
  @media (max-width:820px){ .kpis{ grid-template-columns:repeat(2,1fr); } }
  .kpi {
    background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px 18px;
    box-shadow:var(--shadow); position:relative; overflow:hidden;
  }
  .kpi .n { font-size:30px; font-weight:800; letter-spacing:-1px; }
  .kpi .l { color:var(--muted); font-size:12.5px; margin-top:2px; text-transform:uppercase; letter-spacing:.4px; }
  .kpi.hot .n{ color:var(--hot);} .kpi.nosite .n{ color:var(--warm);} .kpi.uniq .n{ color:var(--brand);}
  .kpi::after{ content:""; position:absolute; right:-30px; top:-30px; width:90px; height:90px; border-radius:50%;
    background:radial-gradient(circle,rgba(109,139,255,.18),transparent 70%); }

  .controls {
    display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:16px;
    background:var(--card); border:1px solid var(--line); border-radius:14px; padding:12px 14px; box-shadow:var(--shadow);
  }
  .controls input[type=search], .controls select {
    background:var(--card2); color:var(--text); border:1px solid var(--line); border-radius:10px;
    padding:9px 12px; font-size:14px; outline:none;
  }
  .controls input[type=search]{ min-width:220px; flex:1; }
  .controls input[type=search]:focus, .controls select:focus{ border-color:var(--brand); }
  .controls label{ color:var(--muted); font-size:12.5px; display:flex; align-items:center; gap:7px; }
  .controls .spacer{ flex:1; }
  .count { color:var(--faint); font-size:13px; white-space:nowrap; }

  .tablecard { background:var(--card); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); overflow:hidden; }
  .scroll { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  thead th {
    position:sticky; top:0; background:var(--card2); color:var(--muted); text-align:left;
    font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.4px;
    padding:12px 14px; border-bottom:1px solid var(--line); cursor:pointer; white-space:nowrap; user-select:none;
  }
  thead th.no-sort{ cursor:default; }
  thead th .arrow{ opacity:.35; font-size:10px; margin-left:4px; }
  thead th.sorted .arrow{ opacity:1; color:var(--brand); }
  tbody td { padding:12px 14px; border-bottom:1px solid var(--line); vertical-align:top; }
  tbody tr:hover { background:var(--card2); }
  tbody tr:last-child td { border-bottom:none; }
  .biz { font-weight:600; }
  .addr { color:var(--faint); font-size:12.5px; margin-top:2px; max-width:280px; }
  .niches { display:flex; flex-wrap:wrap; gap:4px; }
  .tag { background:var(--card2); border:1px solid var(--line); color:var(--muted); border-radius:999px; padding:2px 9px; font-size:11.5px; }
  .score { font-weight:800; font-size:15px; width:34px; height:34px; border-radius:9px; display:grid; place-items:center; color:#fff; }
  .s-hot{ background:linear-gradient(135deg,var(--hot),#ff8a5d);} .s-warm{ background:linear-gradient(135deg,var(--warm),#ffd257); color:#3a2a00;} .s-cold{ background:var(--cold);}
  .pill{ font-size:11.5px; padding:2px 9px; border-radius:999px; font-weight:600; }
  .pill.no{ background:rgba(255,93,115,.15); color:var(--hot); }
  .pill.yes{ background:rgba(52,211,153,.14); color:var(--ok); }
  .rating{ white-space:nowrap; }
  .star{ color:var(--warm); }
  a.link{ color:var(--brand); text-decoration:none; }
  a.link:hover{ text-decoration:underline; }
  .bd{ color:var(--faint); font-size:11.5px; margin-top:3px; }
  .empty{ padding:48px; text-align:center; color:var(--muted); }
  footer{ color:var(--faint); font-size:12px; margin-top:18px; text-align:center; }
  .brandline{ color:var(--brand); }
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

  <div class="controls">
    <input type="search" id="q" placeholder="Search business, address, niche…" />
    <select id="niche"><option value="">All niches</option></select>
    <label>Website
      <select id="site">
        <option value="">any</option>
        <option value="no">no site</option>
        <option value="yes">has site</option>
      </select>
    </label>
    <label>Min score
      <select id="minscore">
        <option value="0">0+</option>
        <option value="4">4+</option>
        <option value="7">7+ (hot)</option>
        <option value="9">9+</option>
      </select>
    </label>
    <span class="spacer"></span>
    <span class="count" id="count"></span>
  </div>

  <div class="tablecard">
    <div class="scroll">
      <table>
        <thead>
          <tr id="head">
            <th data-k="score" class="sorted">Score <span class="arrow">▼</span></th>
            <th data-k="business">Business <span class="arrow">▲</span></th>
            <th data-k="niches" class="no-sort">Niche(s)</th>
            <th data-k="hasWebsite">Website <span class="arrow">▲</span></th>
            <th data-k="rating">Rating <span class="arrow">▲</span></th>
            <th data-k="reviewCount">Reviews <span class="arrow">▲</span></th>
            <th data-k="phone" class="no-sort">Phone</th>
            <th data-k="status">Status <span class="arrow">▲</span></th>
            <th data-k="maps" class="no-sort">Map</th>
          </tr>
        </thead>
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

// ---- KPIs ----
const avg = rows.length ? (rows.reduce((a,r)=>a+(+r.score||0),0)/rows.length) : 0;
const kpis = [
  { n: summary.rawCount ?? rows.length, l: "Raw results", cls:"" },
  { n: summary.unique ?? rows.length, l: "Unique businesses", cls:"uniq" },
  { n: summary.noWebsite ?? rows.filter(r=>r.hasWebsite==="no").length, l: "No website", cls:"nosite" },
  { n: summary.hot ?? rows.filter(r=>+r.score>=7).length, l: "Hot leads (7+)", cls:"hot" },
  { n: avg.toFixed(1), l: "Avg score", cls:"" },
];
document.getElementById("kpis").innerHTML = kpis.map(k=>
  '<div class="kpi '+k.cls+'"><div class="n">'+k.n+'</div><div class="l">'+k.l+'</div></div>').join("");
document.getElementById("genat").textContent = summary.generatedAt ? ("Generated "+summary.generatedAt) : "Lead intelligence dashboard";
document.getElementById("ftotal").textContent = rows.length + " businesses scored";

// ---- niche filter options ----
const niches = [...new Set(rows.flatMap(r => String(r.niches||"").split(/;\\s*/).filter(Boolean)))].sort();
const nsel = document.getElementById("niche");
niches.forEach(n => { const o=document.createElement("option"); o.value=o.textContent=n; nsel.appendChild(o); });

// ---- state ----
let sortKey = "score", sortDir = -1;
const esc = s => String(s??"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const scoreClass = s => s>=7 ? "s-hot" : s>=4 ? "s-warm" : "s-cold";

function esc_attr(s){ return esc(s).replace(/"/g,"&quot;"); }

function render() {
  const q = document.getElementById("q").value.trim().toLowerCase();
  const nf = document.getElementById("niche").value;
  const sf = document.getElementById("site").value;
  const ms = +document.getElementById("minscore").value;

  let list = rows.filter(r => {
    if (ms && (+r.score||0) < ms) return false;
    if (sf && r.hasWebsite !== sf) return false;
    if (nf && !String(r.niches||"").split(/;\\s*/).includes(nf)) return false;
    if (q) {
      const hay = (r.business+" "+r.address+" "+r.niches+" "+r.phone).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  list.sort((a,b)=>{
    let x=a[sortKey], y=b[sortKey];
    if (sortKey==="score"||sortKey==="rating"||sortKey==="reviewCount"){ x=+x||0; y=+y||0; return (x-y)*sortDir; }
    x=String(x||"").toLowerCase(); y=String(y||"").toLowerCase();
    return (x<y?-1:x>y?1:0)*sortDir;
  });

  const tb = document.getElementById("rows");
  tb.innerHTML = list.map(r => {
    const s = +r.score||0;
    const tags = String(r.niches||"").split(/;\\s*/).filter(Boolean).map(n=>'<span class="tag">'+esc(n)+'</span>').join("");
    const site = r.hasWebsite==="yes"
      ? '<a class="link" href="'+esc_attr(r.website)+'" target="_blank" rel="noopener">visit ↗</a>'
      : '<span class="pill no">no site</span>';
    const rating = r.rating!=="" && r.rating!=null ? '<span class="rating"><span class="star">★</span> '+esc(r.rating)+'</span>' : '<span style="color:var(--faint)">—</span>';
    const reviews = r.reviewCount!=="" && r.reviewCount!=null ? esc(r.reviewCount) : '<span style="color:var(--faint)">—</span>';
    const phone = r.phone ? esc(r.phone) : '<span style="color:var(--faint)">—</span>';
    const status = r.businessStatus ? '<span class="pill '+(r.businessStatus==="OPERATIONAL"?"yes":"")+'">'+esc(r.businessStatus)+'</span>' : "—";
    const map = r.mapsUri ? '<a class="link" href="'+esc_attr(r.mapsUri)+'" target="_blank" rel="noopener">open ↗</a>' : "—";
    return '<tr>'
      + '<td><div class="score '+scoreClass(s)+'">'+s+'</div></td>'
      + '<td><div class="biz">'+esc(r.business||"(unnamed)")+'</div>'
        + (r.address?'<div class="addr">'+esc(r.address)+'</div>':'')
        + (r.scoreBreakdown?'<div class="bd">'+esc(r.scoreBreakdown)+'</div>':'')+'</td>'
      + '<td><div class="niches">'+tags+'</div></td>'
      + '<td>'+site+'</td>'
      + '<td>'+rating+'</td>'
      + '<td>'+reviews+'</td>'
      + '<td>'+phone+'</td>'
      + '<td>'+status+'</td>'
      + '<td>'+map+'</td>'
      + '</tr>';
  }).join("");

  document.getElementById("empty").style.display = list.length ? "none" : "block";
  document.getElementById("count").textContent = list.length + " of " + rows.length + " shown";
}

// ---- sorting via header click ----
document.getElementById("head").addEventListener("click", e => {
  const th = e.target.closest("th"); if (!th || th.classList.contains("no-sort")) return;
  const k = th.dataset.k;
  if (k===sortKey) sortDir = -sortDir;
  else { sortKey = k; sortDir = (k==="score"||k==="rating"||k==="reviewCount") ? -1 : 1; }
  document.querySelectorAll("thead th").forEach(h=>{
    h.classList.toggle("sorted", h.dataset.k===sortKey);
    const a=h.querySelector(".arrow"); if(a && h.dataset.k===sortKey) a.textContent = sortDir<0 ? "▼" : "▲";
  });
  render();
});

["q","niche","site","minscore"].forEach(id => {
  document.getElementById(id).addEventListener("input", render);
});

render();
</script>
</body>
</html>
`;
}
