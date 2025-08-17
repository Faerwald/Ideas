/* One-page view with TOPIC BUTTONS (AND across topics, OR inside a topic),
   search over title+abstract+tags+fp, and LOCK support (locked items greyed, sorted last).
   Optional blacklist.json can also mark items locked by driveId. */

const PRIVATE_NOTICE_ID = "PUT_PRIVATE_NOTICE_DRIVE_ID_HERE";   // <-- set this

const state = {
  data: [],
  q: "",
  topics: [],         // [{label, any: [..]}] from topics.json
  selected: new Set(),// labels selected
  blacklist: new Set()
};

const els = { q:null, topicBox:null, sections:null, grid:null, count:null };

const drivePreview = id => `https://drive.google.com/file/d/${id}/preview`;
const driveDownload = id => `https://drive.google.com/uc?export=download&id=${id}`;

document.addEventListener("DOMContentLoaded", () => {
  els.q = document.getElementById("q");
  els.topicBox = document.getElementById("topicButtons");
  els.sections = document.getElementById("sections");
  els.grid = document.getElementById("grid");
  els.count = document.getElementById("countLabel");

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
    applyFilters();
  });
});

function haystack(p){
  return [
    p.title||"",
    p.abstract||"",
    (p.tags||[]).join(" "),
    p.fp||""
  ].join(" ").toLowerCase();
}

function isLocked(p){
  return !!p.locked || (p.driveId && state.blacklist.has(p.driveId));
}

/* ----- topics UI ----- */
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

/* ----- search + topic matching ----- */
function attachEvents(){ els.q.addEventListener("input", ()=>{ state.q=els.q.value.toLowerCase(); applyFilters(); }); }

function matchesQuery(p){ return !state.q || haystack(p).includes(state.q); }

function matchesTopics(p){
  if(state.selected.size===0) return true;
  const h = haystack(p);
  for (const label of state.selected){
    const topic = state.topics.find(t=>t.label===label);
    if(!topic) return false;
    const any = topic.any || [];
    let ok=false;
    for(const kw of any){
      const k = String(kw).toLowerCase();
      // match variant with hyphen/space flips too
      if(h.includes(k) || h.includes(k.replace(/-/g," ")) || h.includes(k.replace(/ /g,"-"))){
        ok=true; break;
      }
    }
    if(!ok) return false;
  }
  return true;
}

/* ----- filter + render ----- */
function applyFilters(){
  const items = state.data
    .filter(p => matchesQuery(p) && matchesTopics(p))
    .sort((a,b)=> {
      const la=isLocked(a), lb=isLocked(b);
      if(la!==lb) return la? 1 : -1;            // locked go last
      // then newest year first, then title
      const ya=(a.year||0), yb=(b.year||0);
      if(yb!==ya) return yb-ya;
      return String(a.title||"").localeCompare(String(b.title||""));
    });

  updateCounts(items.length, state.data.length);
  adjustCardSize(items.length);

  if (state.selected.size===0 && !state.q){
    els.grid.style.display="none";
    els.sections.style.display="";
    renderSections(groupByCategory(items));
  } else {
    els.sections.style.display="none";
    els.grid.style.display="";
    renderGrid(items);
  }
}

function groupByCategory(items){
  const map=new Map();
  items.forEach(p=>{
    const k = p.category || "Misc";
    if(!map.has(k)) map.set(k,[]);
    map.get(k).push(p);
  });
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
}

function renderGrid(items){
  const g=els.grid; g.innerHTML="";
  const frag=document.createDocumentFragment();
  items.forEach(p=>frag.appendChild(card(p)));
  g.appendChild(frag);
}

function renderSections(groups){
  const box=els.sections; box.innerHTML="";
  const frag=document.createDocumentFragment();
  groups.forEach(([label,arr])=>{
    const h=document.createElement("h2");
    h.className="section-title";
    h.textContent=label;
    const grid=document.createElement("div");
    grid.className="grid";
    arr.forEach(p=>grid.appendChild(card(p)));
    frag.appendChild(h); frag.appendChild(grid);
  });
  box.appendChild(frag);
}

/* ----- card ----- */
function card(p){
  const locked = isLocked(p);
  const el=document.createElement("article");
  el.className = "card" + (locked ? " locked" : "");

  const sizeBadge = p.pages ? `<span class="tag">${p.pages} pp</span>` : "";
  const catBadge  = p.category ? `<span class="tag">${escapeHTML(p.category)}</span>` : "";
  const sizeGroup = p.size ? `<span class="tag">${escapeHTML(p.size)}</span>` : "";
  const lockBadge = locked ? `<span class="lock-badge" title="Locked">🔒</span>` : "";

  const readId = locked && PRIVATE_NOTICE_ID ? PRIVATE_NOTICE_ID : p.driveId;
  const readBtn = readId ? `<a class="btn" target="_blank" rel="noopener" href="${drivePreview(readId)}">Read</a>` : "";
  const dlBtn   = readId ? `<a class="btn ghost" target="_blank" rel="noopener" href="${driveDownload(readId)}">Download</a>` : "";

  el.innerHTML = `
    <div class="card-head">
      <h2>${escapeHTML(p.title||"")}</h2>
      ${lockBadge}
    </div>
    <p class="meta">${p.year || ''} ${p.venue ? '· ' + escapeHTML(p.venue) : ''}</p>
    <p>${escapeHTML(p.abstract || '')}</p>
    <div class="tagrow">${sizeBadge}${catBadge}${sizeGroup}${(p.tags||[]).map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join('')}</div>
    <div class="actions">${readBtn} ${dlBtn}</div>`;
  return el;
}

/* ----- misc UI helpers ----- */
function updateCounts(shown,total){ if(els.count) els.count.textContent=`${shown} of ${total} shown`; }

function adjustCardSize(n){
  let min=360;
  if(n>=400) min=180;
  else if(n>=250) min=220;
  else if(n>=120) min=260;
  else if(n>=60)  min=300;
  else if(n>=24)  min=340;
  document.documentElement.style.setProperty("--card-min", min+"px");
}

function escapeHTML(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}

const PRIVATE_NOTICE_ID = "PUT_PRIVATE_NOTICE_DRIVE_ID_HERE";
