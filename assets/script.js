/* Table on desktop / Cards on mobile (auto).
   Search over title + abstract + tags + full/firstPage + eval.
   Password gate for locked items (Ada Lovelace).
   Table columns: Title | Pages | Date | Actions | Eval.
*/

const PRIVATE_NOTICE_ID = "https://drive.google.com/file/d/1iCLtsAIsN8Gu7BpH3owzZfIKBvntBh-_/view?usp=sharing";
const LOCK_PASSWORD     = "Ada Lovelace";
const MOBILE_BP         = 979;

const state = {
  data: [],
  q: "",
  topics: [],
  selected: new Set(),
  view: null,                        // "table" | "cards"
  sort: { key: "date", dir: "desc" },
  autoView: true
};

const els = { q:null, topicBox:null, sections:null, grid:null, count:null, tbody:null, viewTable:null, viewCards:null };

/* ------------ helpers ------------ */
function escapeHTML(s){return String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
function haystack(p){
  return [
    p.title || "",
    p.abstract || "",
    (Array.isArray(p.tags)? p.tags.join(" ") : ""),
    getEvalText(p) || "",
    p.full || p.firstPage || p.fp || ""
  ].join(" ").toLowerCase();
}
function isLocked(p){ return !!p.locked; }
function previewLink(idOrUrl){ if(!idOrUrl) return null; return String(idOrUrl).startsWith("http") ? idOrUrl : `https://drive.google.com/file/d/${idOrUrl}/preview`; }
function downloadLink(idOrUrl){ if(!idOrUrl) return null; return String(idOrUrl).startsWith("http") ? idOrUrl : `https://drive.google.com/uc?export=download&id=${idOrUrl}`; }
function promptOk(){ const ans = prompt("Enter password:"); if (ans==null) return null; return ans.trim().toLowerCase() === LOCK_PASSWORD.toLowerCase(); }

/* Accept multiple CSV header spellings for evaluation text */
function getEvalText(p){
  return p.eval || p.Eval || p.evaluation || p["AI Eval"] || p.Description || p.Notes || p.Text || "";
}

/* ------------ boot ------------ */
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
    fetch("topics.json?ts="+Date.now()).then(r=>r.json()).catch(_=>[])
  ]).then(([papers, topics])=>{
    state.data = Array.isArray(papers)? papers : [];
    state.topics = Array.isArray(topics)? topics : [];
    renderTopicButtons();
    attachEvents();
    initAutoView();
    applyFilters();
  });
});

/* ------------ auto view ------------ */
function initAutoView(){
  const mq = window.matchMedia(`(max-width: ${MOBILE_BP}px)`);
  setView(mq.matches ? "cards" : "table", "auto");
  mq.addEventListener?.("change", e => {
    if (state.autoView) setView(e.matches ? "cards" : "table", "auto");
  });
}
function setView(v, source="manual"){
  if (state.view === v && source !== "auto") return;
  state.view = v;
  if (source === "manual") state.autoView = false;
  if (els.viewTable && els.viewCards){
    els.viewTable.setAttribute("aria-pressed", String(v==="table"));
    els.viewCards.setAttribute("aria-pressed", String(v==="cards"));
  }
  applyFilters();
}

/* ------------ topics ------------ */
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

/* ------------ events ------------ */
function attachEvents(){
  els.q.addEventListener("input", ()=>{ state.q=els.q.value.toLowerCase(); applyFilters(); });
  els.viewTable.onclick = ()=> setView("table","manual");
  els.viewCards.onclick = ()=> setView("cards","manual");

  // sortable headers (ignore actions & eval)
  document.querySelectorAll("#tbl thead th").forEach(th=>{
    const key = th.getAttribute("data-key");
    if(!key || key==="actions" || key==="eval") return;
    th.addEventListener("click", ()=>{
      if(state.sort.key===key){ state.sort.dir = state.sort.dir==="asc" ? "desc":"asc"; }
      else {
        state.sort.key = key;
        state.sort.dir = (key==="title") ? "asc" : "desc";
      }
      applyFilters();
    });
  });

  // password gate
  document.addEventListener("click", (e)=>{
    const a = e.target.closest("a");
    if (!a) return;
    if (!(a.classList.contains("unlock-read") || a.classList.contains("unlock-dl"))) return;

    e.preventDefault();
    const real = a.getAttribute("data-real");
    const ok = promptOk();
    let url;
    if (ok && real) {
      url = a.classList.contains("unlock-read") ? previewLink(real) : downloadLink(real);
    } else {
      url = a.classList.contains("unlock-read") ? previewLink(PRIVATE_NOTICE_ID) : downloadLink(PRIVATE_NOTICE_ID);
    }
    if (url) window.open(url, "_blank", "noopener");
  });
}

/* ------------ filters/sort ------------ */
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
      if(h.includes(k) || h.includes(k.replace(/-/g," ")) || h.includes(k.replace(/ /g,"-"))){ ok=true; break; }
    }
    if(!ok) return false;
  }
  return true;
}

function applyFilters(){
  let items = state.data.filter(p => matchesQuery(p) && matchesTopics(p));

  const dir = state.sort.dir==="asc" ? 1 : -1;
  items.sort((a,b)=>{
    const la=isLocked(a), lb=isLocked(b);
    if(la!==lb) return la? 1 : -1;   // locked last
    const key = state.sort.key;
    const sa = v=>String(v||"").toLowerCase();
    if(key==="title") return dir * sa(a.title).localeCompare(sa(b.title));
    if(key==="pages") return dir * ((a.pages||0)-(b.pages||0));
    if(key==="date")  return dir * String(a.date||"").localeCompare(String(b.date||""));
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

/* ------------ table ------------ */
function renderTable(items){
  const tb = els.tbody;
  tb.innerHTML = "";
  const frag = document.createDocumentFragment();

  for(const p of items){
    const locked = isLocked(p);
    let readBtn, dlBtn;

    if (locked){
      const real = escapeHTML(p.driveId || "");
      readBtn = `<a href="#unlock" class="btn unlock-read" data-real="${real}">Read</a>`;
      dlBtn   = `<a href="#unlock" class="btn ghost unlock-dl" data-real="${real}">Download</a>`;
    } else {
      const target = p.driveId;
      readBtn = target ? `<a class="btn" target="_blank" rel="noopener" href="${previewLink(target)}">Read</a>` : "";
      dlBtn   = target ? `<a class="btn ghost" target="_blank" rel="noopener" href="${downloadLink(target)}">Download</a>` : "";
    }

    const evalHtml = escapeHTML(getEvalText(p));
    const tr = document.createElement("tr");
    if(locked) tr.className = "row-locked";
    tr.innerHTML = `
      <td>${escapeHTML(p.title||"")}</td>
      <td class="nowrap">${p.pages ?? ""}</td>
      <td class="nowrap">${p.date ?? ""}</td>
      <td class="nowrap">${readBtn} ${dlBtn}</td>
      <td class="evalcell">${evalHtml}</td>
    `;
    frag.appendChild(tr);
  }
  tb.appendChild(frag);
}

/* ------------ cards ------------ */
function card(p){
  const locked = isLocked(p);
  let readBtn, dlBtn, lockBadge = "";
  if (locked) lockBadge = `<span class="lock-badge" title="Locked">🔒</span>`;

  if (locked){
    const real = escapeHTML(p.driveId || "");
    readBtn = `<a href="#unlock" class="btn unlock-read" data-real="${real}">Read</a>`;
    dlBtn   = `<a href="#unlock" class="btn ghost unlock-dl" data-real="${real}">Download</a>`;
  } else {
    const target = p.driveId;
    readBtn = target ? `<a class="btn" target="_blank" rel="noopener" href="${previewLink(target)}">Read</a>` : "";
    dlBtn   = target ? `<a class="btn ghost" target="_blank" rel="noopener" href="${downloadLink(target)}">Download</a>` : "";
  }

  const evalHtml = getEvalText(p) ? `<p class="meta" style="margin-top:.35rem">${escapeHTML(getEvalText(p))}</p>` : "";

  const el=document.createElement("article");
  el.className = "card" + (locked ? " locked" : "");
  el.innerHTML = `
    <div class="card-head">
      <h2>${escapeHTML(p.title||"")}</h2>
      ${lockBadge}
    </div>
    <p class="meta">${p.date || ''} ${p.venue ? '· ' + escapeHTML(p.venue) : ''}</p>
    <p>${escapeHTML(p.abstract || '')}</p>
    <div class="tagrow">
      ${p.pages ? `<span class="tag">${p.pages} pp</span>` : ""}
      ${p.category ? `<span class="tag">${escapeHTML(p.category)}</span>` : ""}
      ${(Array.isArray(p.tags)? p.tags : []).map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join('')}
    </div>
    <div class="actions">${readBtn} ${dlBtn}</div>
    ${evalHtml}
  `;
  return el;
}
function renderGrid(items){
  const g=document.getElementById("grid"); g.innerHTML="";
  const frag=document.createDocumentFragment();
  items.forEach(p=>frag.appendChild(card(p)));
  g.appendChild(frag);
}

/* ------------ grouping for cards (no filters) ------------ */
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

/* ------------ misc ------------ */
function updateCounts(shown,total){
  const c=document.getElementById("countLabel");
  if(c) c.textContent = `${shown} of ${total} shown`;
}
function adjustCardSize(n){
  let min=360;
  if(n>=400) min=180; else if(n>=250) min=220; else if(n>=120) min=260; else if(n>=60) min=300; else if(n>=24) min=340;
  document.documentElement.style.setProperty("--card-min", min+"px");
}
