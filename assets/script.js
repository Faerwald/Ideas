/* Table-first UI with:
   - Topic buttons (AND across topics, OR inside each topic via topics.json)
   - Search over title+abstract+tags+fp
   - Sortable table (Title/Year/Category/Pages/WAIT/Lock/Tags)
   - Cards view optional
   - Locked items greyed + 🔒 and redirect to a notice PDF
   - NEW: Auto-view (desktop=Table, mobile=Cards) with manual override
*/

const PRIVATE_NOTICE_ID = "https://drive.google.com/file/d/1iCLtsAIsN8Gu7BpH3owzZfIKBvntBh-_/view?usp=sharing"; // <-- set this to your Drive file ID
const MOBILE_BP = 979;              // mobile if viewport <= this width

const state = {
  data: [],
  q: "",
  topics: [],
  selected: new Set(),
  blacklist: new Set(),
  view: null,                       // "table" | "cards" (filled by autoView on load)
  sort: { key: "year", dir: "desc" },
  autoView: true                    // auto-switch between table/cards until user clicks
};

const els = { q:null, topicBox:null, sections:null, grid:null, count:null, tbody:null, viewTable:null, viewCards:null };

const drivePreview = id => `https://drive.google.com/file/d/${id}/preview`;
const driveDownload = id => `https://drive.google.com/uc?export=download&id=${id}`;

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
    initAutoView();       // <-- decide initial view based on viewport
    applyFilters();
  });
});

/* ------------------ auto-view logic ------------------ */
function initAutoView(){
  const mq = window.matchMedia(`(max-width: ${MOBILE_BP}px)`);
  setView(mq.matches ? "cards" : "table", "auto");
  // keep listening while autoView is true
  mq.addEventListener?.("change", e => {
    if (state.autoView) setView(e.matches ? "cards" : "table", "auto");
  });
}

function setView(newView, source="manual"){
  if (state.view === newView && source !== "auto") return;
  state.view = newView;
  if (source === "manual") state.autoView = false;  // user choice locks it
  // update buttons
  if (els.viewTable && els.viewCards){
    els.viewTable.setAttribute("aria-pressed", String(newView==="table"));
    els.viewCards.setAttribute("aria-pressed", String(newView==="cards"));
  }
  // re-render using current filters
  applyFilters();
}

/* ------------------ search & topics ------------------ */
function haystack(p){
  return [p.title||"", p.abstract||"", (p.tags||[]).join(" "), p.fp||""].join(" ").toLowerCase();
}
function isLocked(p){ return !!p.locked || (p.driveId && state.blacklist.has(p.driveId)); }

function renderTopicButtons(){
  const box = document.getElementById("topicButtons");
  box.innerHTML = "";
  const frag = document.createDocumentFragment();
  state.topics.forEach(t=>{
    const b=document.createElement("button");
    b.className="topic-chip";
    b.type="button";
    b.textContent=t.label;
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
  clr.className="btn ghost small";
  clr.type="button";
  clr.textContent="Clear";
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

  // Manual view toggle (disables autoView)
  els.viewTable.onclick = ()=> setView("table", "manual");
  els.viewCards.onclick = ()=> setView("cards", "manual");

  // Sortable headers
  document.querySelectorAll("#tbl thead th").forEach(th=>{
    const key = th.getAttribute("data-key");
    if(!key || key==="actions") return;
    th.addEventListener("click", ()=>{
      if(state.sort.key===key){ state.sort.dir = state.sort.dir==="asc" ? "desc":"asc"; }
      else {
        state.sort.key = key;
        state.sort.dir = (key==="title"||key==="category"||key==="tags") ? "asc" : "desc";
      }
      applyFilters();
    });
  });
}

function matchesQuery(p){ return !state.q || haystack(p).includes(state.q); }
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
      // match variants with hyphen/space flips too
      if(h.includes(k) || h.includes(k.replace(/-/g," ")) || h.includes(k.replace(/ /g,"-"))){ ok=true; break; }
    }
    if(!ok) return false;
  }
  return true;
}

/* ------------------ render pipeline ------------------ */
function applyFilters(){
  let items = state.data.filter(p => matchesQuery(p) && matchesTopics(p));

  // sort: locked last, then by selected column
  const dir = state.sort.dir==="asc" ? 1 : -1;
  items.sort((a,b)=>{
    const la=isLocked(a), lb=isLocked(b);
    if(la!==lb) return la? 1 : -1; // locked last
    const key = state.sort.key;
    const sa = v=>String(v||"").toLowerCase();
    if(key==="title")    return dir * sa(a.title).localeCompare(sa(b.title));
    if(key==="category") return dir * sa(a.category).localeCompare(sa(b.category));
    if(key==="tags"){
      const ta=(a.tags||[]).join(", "), tb=(b.tags||[]).join(", ");
      return dir * ta.localeCompare(tb);
    }
    if(key==="pages") return dir * ((a.pages||0)-(b.pages||0));
    if(key==="year")  return dir * ((a.year||0)-(b.year||0));
    if(key==="wait")  return dir * ((a.wait||0)-(b.wait||0));
    if(key==="locked")return dir * ((isLocked(a)?1:0)-(isLocked(b)?1:0));
    return 0;
  });

  updateCounts(items.length, state.data.length);
  adjustCardSize(items.length);

  if(state.view==="table"){
    // Show table
    document.getElementById("tablewrap").style.display="";
    els.sections.style.display="none";
    els.grid.style.display="none";
    renderTable(items);
  }else{
    // Show cards
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
    const w = p.wait ?? "";
    const wc = w ? ` w${w}` : "";
    const waitBadge = w ? `<span class="badge-wait${wc}">${w}</span>` : "";

    const targetId = (isLocked(p) && PRIVATE_NOTICE_ID) ? PRIVATE_NOTICE_ID : p.driveId;
    const readBtn = targetId ? `<a class="btn" target="_blank" rel="noopener" href="${drivePreview(targetId)}">Read</a>` : "";
    const dlBtn   = targetId ? `<a class="btn ghost" target="_blank" rel="noopener" href="${driveDownload(targetId)}">Download</a>` : "";
    const lockIco = isLocked(p) ? "🔒" : "";

    tr.innerHTML = `
      <td>${escapeHTML(p.title||"")}</td>
      <td class="nowrap">${p.year||""}</td>
      <td>${escapeHTML(p.category||"")}</td>
      <td class="nowrap">${p.pages||""}</td>
      <td class="nowrap">${waitBadge}</td>
      <td class="nowrap">${lockIco}</td>
      <td>${(p.tags||[]).map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join(' ')}</td>
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
  const catBadge  = p.category ? `<span class="tag">${escapeHTML(p.category)}</span>` : "";
  const sizeGroup = p.size ? `<span class="tag">${escapeHTML(p.size)}</span>` : "";
  const lockBadge = locked ? `<span class="lock-badge" title="Locked">🔒</span>` : "";
  const wait = p.wait ? `<span class="tag">WAIT ${p.wait}</span>` : "";

  const targetId = locked && PRIVATE_NOTICE_ID ? PRIVATE_NOTICE_ID : p.driveId;
  const readBtn = targetId ? `<a class="btn" target="_blank" rel="noopener" href="${drivePreview(targetId)}">Read</a>` : "";
  const dlBtn   = targetId ? `<a class="btn ghost" target="_blank" rel="noopener" href="${driveDownload(targetId)}">Download</a>` : "";

  el.innerHTML = `
    <div class="card-head">
      <h2>${escapeHTML(p.title||"")}</h2>
      ${lockBadge}
    </div>
    <p class="meta">${p.year || ''} ${p.venue ? '· ' + escapeHTML(p.venue) : ''}</p>
    <p>${escapeHTML(p.abstract || '')}</p>
    <div class="tagrow">${sizeBadge}${catBadge}${sizeGroup}${wait}${(p.tags||[]).map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join('')}</div>
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
