/* Table/Cards UI with:
   - Topic buttons (AND across topics, OR inside topic via topics.json)
   - Search over title+abstract+tags+fp/full (multi-word OR semantics)
   - Sortable TABLE with only: Title | Pages | Actions
   - Cards view optional
   - Locked items 🔒; redirect Read/Download to notice PDF
   - Auto-view: desktop=Table, mobile=Cards; manual toggle overrides
*/

const PRIVATE_NOTICE_ID = "https://drive.google.com/file/d/1iCLtsAIsN8Gu7BpH3owzZfIKBvntBh-_/view?usp=sharing"; // keep exactly as requested
const MOBILE_BP = 979;

const state = {
  data: [],
  q: "",
  topics: [],
  selected: new Set(),
  blacklist: new Set(),
  view: null,                          // "table" | "cards"
  sort: { key: "title", dir: "asc" },  // default: Title A→Z
  autoView: true
};

const els = { q:null, topicBox:null, sections:null, grid:null, count:null, tbody:null, viewTable:null, viewCards:null };

const drivePreview = id => `https://drive.google.com/file/d/${id}/preview`;
const driveDownload = id => `https://drive.google.com/uc?export=download&id=${id}`;

// Accept full URLs or bare IDs (for notice link or driveId)
const asPreviewUrl = v => (String(v).startsWith("http") ? v : drivePreview(v));
const asDownloadUrl = v => (String(v).startsWith("http") ? v : driveDownload(v));

document.addEventListener("DOMContentLoaded", () => {
  els.q = document.getElementById("q");
  els.topicBox = document.getElementById("topicButtons");
  els.sections = document.getElementById("sections");
  els.grid = document.getElementById("grid");
  els.count = document.getElementById("countLabel");
  els.tbody = document.getElementById("tbody");
  els.viewTable = document.getElementById("viewTable");
  els.viewCards = document.getElementById("viewCards");

  Promise.all([
    fetch("papers.json?ts="+Date.now()).then(r=>r.json()),
    fetch("topics.json?ts="+Date.now()).then(r=>r.json()).catch(_=>[]),
    fetch("blacklist.json?ts="+Date.now()).then(r=>r.json()).catch(_=>[])
  ]).then(([papers, topics, bl])=>{
    state.data = Array.isArray(papers)? papers : [];
    state.topics = Array.isArray(topics)? topics : [];
    if (Array.isArray(bl)) state.blacklist = new Set(bl);
    renderTopicButtons();
    attachEvents();
    initAutoView();
    applyFilters();
  });
});

/* ---------- auto-view ---------- */
function initAutoView(){
  const mq = window.matchMedia(`(max-width: ${MOBILE_BP}px)`);
  setView(mq.matches ? "cards" : "table", "auto");
  mq.addEventListener?.("change", e => { if (state.autoView) setView(e.matches ? "cards" : "table", "auto"); });
}
function setView(v, source="manual"){
  if (state.view === v && source!=="auto") return;
  state.view = v;
  if (source==="manual") state.autoView = false;
  els.viewTable?.setAttribute("aria-pressed", String(v==="table"));
  els.viewCards?.setAttribute("aria-pressed", String(v==="cards"));
  applyFilters();
}

/* ---------- topics & search ---------- */
function haystack(p){
  return [
    p.title || "",
    p.abstract || "",
    (p.tags || []).join(" "),
    p.full || p.firstPage || p.fp || ""
  ].join(" ").toLowerCase();
}
function isLocked(p){ return !!p.locked || (p.driveId && state.blacklist.has(p.driveId)); }

function renderTopicButtons(){
  const box = document.getElementById("topicButtons");
  box.innerHTML = "";
  const frag = document.createDocumentFragment();
  state.topics.forEach(t=>{
    const b=document.createElement("button");
    b.className="topic-chip"; b.type="button"; b.textContent=t.label;
    b.setAttribute("aria-pressed","false");
    b.onclick=()=>{
      const on = state.selected.has(t.label);
      if(on){ state.selected.delete(t.label); b.setAttribute("aria-pressed","false"); }
      else { state.selected.add(t.label); b.setAttribute("aria-pressed","true"); }
      applyFilters();
    };
    frag.appendChild(b);
  });
  const clr=document.createElement("button");
  clr.className="btn ghost small"; clr.type="button"; clr.textContent="Clear";
  clr.onclick=()=>{
    state.selected.clear();
    [...box.querySelectorAll(".topic-chip")].forEach(x=>x.setAttribute("aria-pressed","false"));
    applyFilters();
  };
  frag.appendChild(clr);
  box.appendChild(frag);
}

function attachEvents(){
  els.q.addEventListener("input", ()=>{ state.q=els.q.value.toLowerCase(); applyFilters(); });

  els.viewTable.onclick = ()=> setView("table","manual");
  els.viewCards.onclick = ()=> setView("cards","manual");

  // Sortable headers (Title, Pages only)
  document.querySelectorAll("#tbl thead th").forEach(th=>{
    const key = th.getAttribute("data-key");
    if(!key || key==="actions") return;
    th.addEventListener("click", ()=>{
      if(state.sort.key===key){ state.sort.dir = state.sort.dir==="asc" ? "desc":"asc"; }
      else { state.sort.key = key; state.sort.dir = (key==="title") ? "asc" : "desc"; }
      applyFilters();
    });
  });
}

/* ---------- custom title comparator: letters first, numbers/symbols last ---------- */
function titleSortKey(s){
  const t = String(s || "").trim();
  const startsWithLetter = /^[A-Za-z]/.test(t);
  // remove leading non-letters for comparison; compare case-insensitively
  const norm = t.replace(/^[^A-Za-z]+/, "").toLowerCase();
  return { bucket: startsWithLetter ? 0 : 1, norm, raw: t.toLowerCase() };
}

/* ---------- query matching (multi-word OR) ---------- */
function matchesQuery(p){
  const q = (state.q || "").trim().toLowerCase();
  if (!q) return true;
  const h = haystack(p); // lower-cased text
  // split on whitespace; strip leading/trailing punctuation from each term
  const terms = q.split(/\s+/)
    .map(t => t.replace(/^[^\w]+|[^\w]+$/g, ""))   // robust enough without unicode flags
    .filter(Boolean);
  // OR semantics across terms
  return terms.length === 0 || terms.some(t => h.includes(t));
}

/* ---------- topic matching (AND across topics, OR inside) ---------- */
function matchesTopics(p){
  if(state.selected.size===0) return true;
  const h = haystack(p);
  for(const label of state.selected){
    const topic = state.topics.find(t=>t.label===label);
    if(!topic) return false;
    const any = topic.any||[];
    let ok=false;
    for(const kw of any){
      const k = String(kw).toLowerCase();
      if(h.includes(k) || h.includes(k.replace(/-/g," ")) || h.includes(k.replace(/ /g,"-"))){ ok=true; break; }
    }
    if(!ok) return false;
  }
  return true;
}

/* ---------- filter & render ---------- */
function applyFilters(){
  let items = state.data.filter(p => matchesQuery(p) && matchesTopics(p));

  // sort: locked last, then selected column
  const dir = state.sort.dir==="asc" ? 1 : -1;
  items.sort((a,b)=>{
    const la=isLocked(a), lb=isLocked(b);
    if(la!==lb) return la? 1 : -1;

    if(state.sort.key==="title"){
      // Letters first (bucket 0), numbers/symbols last (bucket 1), then A→Z/Z→A inside bucket
      const A = titleSortKey(a.title);
      const B = titleSortKey(b.title);
      if (A.bucket !== B.bucket) return A.bucket - B.bucket; // bucket rule ignores dir: letters always before numbers
      const cmp = A.norm.localeCompare(B.norm, undefined, {sensitivity:"base"});
      return dir * cmp;
    }
    if(state.sort.key==="pages"){
      return dir * ((a.pages||0)-(b.pages||0));
    }
    return 0;
  });

  updateCounts(items.length, state.data.length);
  adjustCardSize(items.length);

  if(state.view==="table"){
    document.getElementById("tablewrap").style.display="";
    els.sections.style.display="none";
    els.grid.style.display="none";
    renderTable(items);
  }else{
    document.getElementById("tablewrap").style.display="none";
    if(state.selected.size===0 && !state.q){
      els.sections.style.display="";
      els.grid.style.display="none";
      renderSections(groupByCategory(items));
    }else{
      els.sections.style.display="none";
      els.grid.style.display="";
      renderGrid(items);
    }
  }
}

function renderTable(items){
  const tb = els.tbody;
  tb.innerHTML = "";
  const frag = document.createDocumentFragment();
  for(const p of items){
    const tr = document.createElement("tr");
    if(isLocked(p)) tr.className="row-locked";

    // target for locked vs unlocked
    const target = (isLocked(p) && PRIVATE_NOTICE_ID) ? PRIVATE_NOTICE_ID : p.driveId;
    const readUrl = target ? asPreviewUrl(target) : null;
    const dlUrl   = target ? asDownloadUrl(target) : null;

    // outline, smaller buttons
    const readBtn = readUrl ? `<a class="btn sm" target="_blank" rel="noopener" href="${readUrl}">Read</a>` : "";
    const dlBtn   = dlUrl ?   `<a class="btn ghost sm" target="_blank" rel="noopener" href="${dlUrl}">Download</a>` : "";

    tr.innerHTML = `
      <td>${escapeHTML(p.title||"")}</td>
      <td class="nowrap" style="text-align:center">${p.pages ?? ""}</td>
      <td class="nowrap">${readBtn} ${dlBtn}</td>
    `;
    frag.appendChild(tr);
  }
  tb.appendChild(frag);
}

/* Cards view */
function card(p){
  const locked = isLocked(p);
  const el=document.createElement("article");
  el.className = "card" + (locked ? " locked" : "");
  const sizeBadge = p.pages ? `<span class="tag">${p.pages} pp</span>` : "";
  const lockBadge = locked ? `<span class="lock-badge" title="Locked">🔒</span>` : "";

  const target = locked && PRIVATE_NOTICE_ID ? PRIVATE_NOTICE_ID : p.driveId;
  const readUrl = target ? asPreviewUrl(target) : null;
  const dlUrl   = target ? asDownloadUrl(target) : null;
  const readBtn = readUrl ? `<a class="btn sm" target="_blank" rel="noopener" href="${readUrl}">Read</a>` : "";
  const dlBtn   = dlUrl ?   `<a class="btn ghost sm" target="_blank" rel="noopener" href="${dlUrl}">Download</a>` : "";

  el.innerHTML = `
    <div class="card-head">
      <h2>${escapeHTML(p.title||"")}</h2>
      ${lockBadge}
    </div>
    <div class="tagrow">${sizeBadge}</div>
    <div class="actions">${readBtn} ${dlBtn}</div>`;
  return el;
}
function renderGrid(items){
  const g=document.getElementById("grid"); g.innerHTML="";
  const frag=document.createDocumentFragment();
  items.forEach(p=>frag.appendChild(card(p)));
  g.appendChild(frag);
}

/* Grouping for Cards/no-filters */
function groupByCategory(items){
  const map=new Map();
  items.forEach(p=>{
    const k=p.category||"Misc";
    if(!map.has(k)) map.set(k,[]);
    map.get(k).push(p);
  });
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
}
function renderSections(groups){
  const box=document.getElementById("sections"); box.innerHTML="";
  const frag=document.createDocumentFragment();
  groups.forEach(([label,arr])=>{
    const h=document.createElement("h2");
    h.className="section-title"; h.textContent=label;
    const g=document.createElement("div"); g.className="grid";
    arr.forEach(p=>g.appendChild(card(p)));
    frag.appendChild(h); frag.appendChild(g);
  });
  box.appendChild(frag);
}

/* Misc helpers */
function updateCounts(shown,total){ const c=document.getElementById("countLabel"); if(c) c.textContent=`${shown} of ${total} shown`; }
function adjustCardSize(n){
  let min=360;
  if(n>=400) min=180; else if(n>=250) min=220; else if(n>=120) min=260; else if(n>=60) min=300; else if(n>=24) min=340;
  document.documentElement.style.setProperty("--card-min", min+"px");
}
function escapeHTML(s){
  return String(s||"").replace(/[&<>"']/g, m => (
    {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]
  ));
}
