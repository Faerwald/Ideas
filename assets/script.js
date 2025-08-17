/* Responsive UI:
   - Mobile (<=980px or mobile UA): default view = "cards"
   - Desktop: default view = "table"
   - AND filter across topics (OR inside a topic via topics.json)
   - Search over title + abstract + tags + first-page text (fp)
   - Sortable table (Title/Year/Category/Pages/WAIT/Lock/Tags)
   - Locked items greyed + 🔒 and redirect to a notice PDF
*/

const PRIVATE_NOTICE_ID = "PUT_PRIVATE_NOTICE_DRIVE_ID_HERE"; // <-- set to your Drive ID for the notice PDF

// Detect mobile (viewport or UA)
const IS_MOBILE = window.matchMedia("(max-width: 980px)").matches ||
                  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

const state = {
  data: [],
  q: "",
  topics: [],
  selected: new Set(),
  blacklist: new Set(),
  view: IS_MOBILE ? "cards" : "table",   // mobile=cards, desktop=table
  sort: { key: "year", dir: "desc" }     // default: newest first on desktop
};

const els = {
  q: null, topicBox: null, sections: null, grid: null, count: null,
  tbody: null, viewTable: null, viewCards: null, tablewrap: null
};

const drivePreview = id => `https://drive.google.com/file/d/${id}/preview`;
const driveDownload = id => `https://drive.google.com/uc?export=download&id=${id}`;

document.addEventListener("DOMContentLoaded", () => {
  els.q         = document.getElementById("q");
  els.topicBox  = document.getElementById("topicButtons");
  els.sections  = document.getElementById("sections"); // kept but not used for default
  els.grid      = document.getElementById("grid");
  els.count     = document.getElementById("countLabel");
  els.tbody     = document.getElementById("tbody");
  els.viewTable = document.getElementById("viewTable");
  els.viewCards = document.getElementById("viewCards");
  els.tablewrap = document.getElementById("tablewrap");

  Promise.all([
    fetch("papers.json?ts="+Date.now()).then(r=>r.json()),
    fetch("topics.json?ts="+Date.now()).then(r=>r.json()).catch(_=>[]),
    fetch("blacklist.json?ts="+Date.now()).then(r=>r.json()).catch(_=>[])
  ]).then(([papers, topics, bl])=>{
    state.data   = Array.isArray(papers) ? papers : [];
    state.topics = Array.isArray(topics) ? topics : [];
    if (Array.isArray(bl)) state.blacklist = new Set(bl);

    renderTopicButtons();
    attachEvents();

    // Set initial toggle buttons and containers to match the auto-default
    els.viewTable.setAttribute("aria-pressed", state.view==="table" ? "true" : "false");
    els.viewCards.setAttribute("aria-pressed", state.view==="cards" ? "true" : "false");

    // Ensure the right containers are visible before the first render
    if (state.view === "cards") {
      if (els.tablewrap) els.tablewrap.style.display = "none";
      if (els.sections)  els.sections.style.display  = "none";
      if (els.grid)      els.grid.style.display      = "";
    } else {
      if (els.tablewrap) els.tablewrap.style.display = "";
      if (els.sections)  els.sections.style.display  = "none";
      if (els.grid)      els.grid.style.display      = "none";
    }

    applyFilters();   // This renders the correct view immediately on load
  });
});

function haystack(p){
  return [
    p.title || "",
    p.abstract || "",
    (p.tags || []).join(" "),
    p.fp || ""
  ].join(" ").toLowerCase();
}
function isLocked(p){ return !!p.locked || (p.driveId && state.blacklist.has(p.driveId)); }
function esc(s){ return String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }

/* ---------- Topics (AND across labels) ---------- */
function renderTopicButtons(){
  const box = document.getElementById("topicButtons");
  box.innerHTML = "";
  const frag = document.createDocumentFragment();

  state.topics.forEach(t=>{
    const b = document.createElement("button");
    b.className = "topic-chip";
    b.type = "button";
    b.textContent = t.label;
    b.setAttribute("aria-pressed","false");
    b.onclick = () => {
      const on = state.selected.has(t.label);
      if(on){ state.selected.delete(t.label); b.setAttribute("aria-pressed","false"); }
      else  { state.selected.add(t.label);   b.setAttribute("aria-pressed","true");  }
      applyFilters();
    };
    frag.appendChild(b);
  });

  const clr = document.createElement("button");
  clr.className = "btn ghost small";
  clr.type  = "button";
  clr.textContent = "Clear";
  clr.onclick = () => {
    state.selected.clear();
    [...box.querySelectorAll(".topic-chip")].forEach(x=>x.setAttribute("aria-pressed","false"));
    applyFilters();
  };
  frag.appendChild(clr);

  box.appendChild(frag);
}

/* ---------- Events ---------- */
function attachEvents(){
  if (els.q) els.q.addEventListener("input", ()=>{ state.q = els.q.value.toLowerCase(); applyFilters(); });

  els.viewTable.onclick = ()=>{ state.view="table";
    els.viewTable.setAttribute("aria-pressed","true");
    els.viewCards.setAttribute("aria-pressed","false");
    applyFilters();
  };
  els.viewCards.onclick = ()=>{ state.view="cards";
    els.viewCards.setAttribute("aria-pressed","true");
    els.viewTable.setAttribute("aria-pressed","false");
    applyFilters();
  };

  // If the user resizes across the breakpoint, keep the current view,
  // but you could auto-switch by uncommenting below:
  // window.matchMedia("(max-width: 980px)").addEventListener("change", e=>{
  //   state.view = e.matches ? "cards" : "table";
  //   els.viewCards.setAttribute("aria-pressed", e.matches ? "true" : "false");
  //   els.viewTable.setAttribute("aria-pressed", e.matches ? "false" : "true");
  //   applyFilters();
  // });
}

/* ---------- Filtering logic ---------- */
function matchesQuery(p){ return !state.q || haystack(p).includes(state.q); }

function matchesTopics(p){
  if (state.selected.size===0) return true;
  const h = haystack(p);
  for (const label of state.selected){
    const topic = state.topics.find(t=>t.label===label);
    if(!topic) return false;
    const any = topic.any || [];
    let ok=false;
    for (const kw of any){
      const k = String(kw).toLowerCase();
      // match keyword plus simple hyphen/space flips
      if (h.includes(k) || h.includes(k.replace(/-/g," ")) || h.includes(k.replace(/ /g,"-"))) { ok=true; break; }
    }
    if(!ok) return false;
  }
  return true;
}

function applyFilters(){
  let items = state.data.filter(p => matchesQuery(p) && matchesTopics(p));

  // Sorting for table view (locked last, then by chosen column)
  if (state.view === "table") {
    const dir = state.sort.dir === "asc" ? 1 : -1;
    items.sort((a,b)=>{
      const la=isLocked(a), lb=isLocked(b);
      if(la!==lb) return la? 1 : -1;
      const key = state.sort.key;
      const sa = v => String(v||"").toLowerCase();
      if(key==="title")   return dir * sa(a.title).localeCompare(sa(b.title));
      if(key==="category")return dir * sa(a.category).localeCompare(sa(b.category));
      if(key==="tags"){
        const ta=(a.tags||[]).join(", "), tb=(b.tags||[]).join(", ");
        return dir * ta.localeCompare(tb);
      }
      if(key==="pages")   return dir * ((a.pages||0)-(b.pages||0));
      if(key==="year")    return dir * ((a.year||0)-(b.year||0));
      if(key==="wait")    return dir * ((a.wait||0)-(b.wait||0));
      if(key==="locked")  return dir * ((isLocked(a)?1:0)-(isLocked(b)?1:0));
      return 0;
    });
  }

  updateCounts(items.length, state.data.length);
  adjustCardSize(items.length);

  // Show correct container(s) and render
  if (state.view === "table") {
    if (els.tablewrap) els.tablewrap.style.display = "";
    if (els.grid)      els.grid.style.display      = "none";
    if (els.sections)  els.sections.style.display  = "none";
    renderTable(items);
  } else { // cards
    if (els.tablewrap) els.tablewrap.style.display = "none";
    if (els.sections)  els.sections.style.display  = "none";
    if (els.grid)      els.grid.style.display      = "";
    renderGrid(items);   // Always render cards directly (even with no filters)
  }
}

/* ---------- Table rendering ---------- */
function renderTable(items){
  const tb = els.tbody;
  if (!tb) return;
  tb.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const p of items){
    const tr = document.createElement("tr");
    if (isLocked(p)) tr.className = "row-locked";

    const w  = p.wait ?? "";
    const wc = w ? ` w${w}` : "";
    const waitBadge = w ? `<span class="badge-wait${wc}">${w}</span>` : "";

    const targetId = (isLocked(p) && PRIVATE_NOTICE_ID) ? PRIVATE_NOTICE_ID : p.driveId;
    const readBtn = targetId ? `<a class="btn" target="_blank" rel="noopener" href="${drivePreview(targetId)}">Read</a>` : "";
    const dlBtn   = targetId ? `<a class="btn ghost" target="_blank" rel="noopener" href="${driveDownload(targetId)}">Download</a>` : "";
    const lockIco = isLocked(p) ? "🔒" : "";

    tr.innerHTML = `
      <td>${esc(p.title)}</td>
      <td class="nowrap">${p.year||""}</td>
      <td>${esc(p.category||"")}</td>
      <td class="nowrap">${p.pages||""}</td>
      <td class="nowrap">${waitBadge}</td>
      <td class="nowrap">${lockIco}</td>
      <td>${(p.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join(' ')}</td>
      <td class="nowrap">${readBtn} ${dlBtn}</td>
    `;
    frag.appendChild(tr);
  }
  tb.appendChild(frag);
}

/* ---------- Cards rendering ---------- */
function card(p){
  const locked = isLocked(p);
  const el = document.createElement("article");
  el.className = "card" + (locked ? " locked" : "");

  const sizeBadge = p.pages ? `<span class="tag">${p.pages} pp</span>` : "";
  const catBadge  = p.category ? `<span class="tag">${esc(p.category)}</span>` : "";
  const sizeGroup = p.size ? `<span class="tag">${esc(p.size)}</span>` : "";
  const lockBadge = locked ? `<span class="lock-badge" title="Locked">🔒</span>` : "";
  const wait      = p.wait ? `<span class="tag">WAIT ${p.wait}</span>` : "";

  const targetId = locked && PRIVATE_NOTICE_ID ? PRIVATE_NOTICE_ID : p.driveId;
  const readBtn  = targetId ? `<a class="btn" target="_blank" rel="noopener" href="${drivePreview(targetId)}">Read</a>` : "";
  const dlBtn    = targetId ? `<a class="btn ghost" target="_blank" rel="noopener" href="${driveDownload(targetId)}">Download</a>` : "";

  el.innerHTML = `
    <div class="card-head">
      <h2>${esc(p.title)}</h2>
      ${lockBadge}
    </div>
    <p class="meta">${p.year || ''} ${p.venue ? '· ' + esc(p.venue) : ''}</p>
    <p>${esc(p.abstract || '')}</p>
    <div class="tagrow">${sizeBadge}${catBadge}${sizeGroup}${wait}${(p.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>
    <div class="actions">${readBtn} ${dlBtn}</div>
  `;
  return el;
}

function renderGrid(items){
  const g = els.grid;
  if (!g) return;
  g.innerHTML = "";
  const frag = document.createDocumentFragment();
  items.forEach(p => frag.appendChild(card(p)));
  g.appendChild(frag);
}

/* ---------- Misc ---------- */
function updateCounts(shown,total){ if(els.count) els.count.textContent = `${shown} of ${total} shown`; }
function adjustCardSize(n){
  let min = 360;
  if (n >= 400) min = 180;
  else if (n >= 250) min = 220;
  else if (n >= 120) min = 260;
  else if (n >= 60)  min = 300;
  else if (n >= 24)  min = 340;
  document.documentElement.style.setProperty("--card-min", min+"px");
}

// Sortable header clicks
document.addEventListener("click", (e)=>{
  const th = e.target.closest("#tbl thead th");
  if (!th) return;
  const key = th.getAttribute("data-key");
  if (!key || key==="actions") return;
  if (state.sort.key === key) {
    state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
  } else {
    state.sort.key = key;
    state.sort.dir = (key==="title"||key==="category"||key==="tags") ? "asc" : "desc";
  }
  applyFilters();
});
