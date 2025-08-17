/* One-page view with TOPIC BUTTONS (AND).
   Each topic = OR list of keywords from topics.json (label + any[]).
   Search bar also applies (title + abstract + tags + fp). */

const state = {
  data: [],
  q: "",
  topics: [],         // [{label, any: [..]}]
  selected: new Set() // set of labels
};

const els = {
  q: null, topicBox: null, sections: null, grid: null, count: null
};

const drivePreview = id => `https://drive.google.com/file/d/${id}/preview`;
const driveDownload = id => `https://drive.google.com/uc?export=download&id=${id}`;

document.addEventListener("DOMContentLoaded", () => {
  els.q = document.getElementById("q");
  els.topicBox = document.getElementById("topicButtons");
  els.sections = document.getElementById("sections");
  els.grid = document.getElementById("grid");
  els.count = document.getElementById("countLabel");

  Promise.all([
    fetch('papers.json?ts=' + Date.now()).then(r => r.json()),
    fetch('topics.json?ts=' + Date.now()).then(r => r.json()).catch(_ => [])
  ]).then(([papers, topics]) => {
    state.data = Array.isArray(papers) ? papers : [];
    state.topics = (Array.isArray(topics) ? topics : []);
    renderTopicButtons();
    attachEvents();
    applyFilters();
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

function renderTopicButtons(){
  const box = els.topicBox;
  box.innerHTML = "";
  const frag = document.createDocumentFragment();

  state.topics.forEach(t => {
    const b = document.createElement("button");
    b.className = "topic-chip";
    b.type = "button";
    b.textContent = t.label;
    b.setAttribute("aria-pressed","false");
    b.onclick = () => {
      const on = state.selected.has(t.label);
      if (on) { state.selected.delete(t.label); b.setAttribute("aria-pressed","false"); }
      else { state.selected.add(t.label); b.setAttribute("aria-pressed","true"); }
      applyFilters();
    };
    frag.appendChild(b);
  });

  const clr = document.createElement("button");
  clr.className = "btn ghost small";
  clr.type = "button";
  clr.textContent = "Clear";
  clr.onclick = () => {
    state.selected.clear();
    [...box.querySelectorAll('.topic-chip')].forEach(x=>x.setAttribute('aria-pressed','false'));
    applyFilters();
  };
  frag.appendChild(clr);

  box.appendChild(frag);
}

function attachEvents(){
  els.q.addEventListener("input", ()=>{ state.q = els.q.value.toLowerCase(); applyFilters(); });
}

function matchesQuery(p){
  if (!state.q) return true;
  return haystack(p).includes(state.q);
}

function matchesTopics(p){
  if (state.selected.size === 0) return true;
  const h = haystack(p);
  // AND across selected topics; topic passes if ANY of its synonyms appear
  for (const label of state.selected){
    const topic = state.topics.find(t => t.label === label);
    if (!topic) return false;
    const any = topic.any || [];
    let ok = false;
    for (const kw of any){
      const k = String(kw).toLowerCase();
      // match k and common hyphen/space variants
      if (h.includes(k) || h.includes(k.replace(/-/g," ")) || h.includes(k.replace(/ /g,"-"))) {
        ok = true; break;
      }
    }
    if (!ok) return false;
  }
  return true;
}

function applyFilters(){
  const items = state.data.filter(p => matchesQuery(p) && matchesTopics(p));
  updateCounts(items.length, state.data.length);
  adjustCardSize(items.length);

  if (state.selected.size === 0 && !state.q){
    els.grid.style.display = "none";
    els.sections.style.display = "";
    renderSections(groupByCategory(items));
  } else {
    els.sections.style.display = "none";
    els.grid.style.display = "";
    renderGrid(items);
  }
}

/* ---------- render helpers ---------- */
function card(p){
  const el = document.createElement("article");
  el.className = "card";
  const sizeBadge = p.pages ? `<span class="tag">${p.pages} pp</span>` : "";
  const catBadge = p.category ? `<span class="tag">${escapeHTML(p.category)}</span>` : "";
  const sizeGroup = p.size ? `<span class="tag">${escapeHTML(p.size)}</span>` : "";
  el.innerHTML = `
    <h2>${escapeHTML(p.title || "")}</h2>
    <p class="meta">${p.year || ''} ${p.venue ? '· ' + escapeHTML(p.venue) : ''}</p>
    <p>${escapeHTML(p.abstract || '')}</p>
    <div class="tagrow">${sizeBadge}${catBadge}${sizeGroup}${(p.tags||[]).map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join('')}</div>
    <div class="actions">
      ${p.driveId ? `<a class="btn" target="_blank" rel="noopener" href="${drivePreview(p.driveId)}">Read</a>` : ''}
      ${p.driveId ? `<a class="btn ghost" target="_blank" rel="noopener" href="${driveDownload(p.driveId)}">Download</a>` : ''}
      ${p.doi ? `<a class="btn ghost" target="_blank" rel="noopener" href="https://doi.org/${p.doi}">DOI</a>` : ''}
    </div>`;
  return el;
}

function renderGrid(items){
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  items.forEach(p => frag.appendChild(card(p)));
  grid.appendChild(frag);
}

function groupByCategory(items){
  const map = new Map();
  items.forEach(p => {
    const k = p.category || "Misc";
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  });
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
}

function renderSections(groups){
  const box = document.getElementById("sections");
  box.innerHTML = "";
  const frag = document.createDocumentFragment();
  groups.forEach(([label, arr])=>{
    const h = document.createElement("h2");
    h.className = "section-title";
    h.textContent = label;
    const g = document.createElement("div");
    g.className = "grid";
    arr.forEach(p => g.appendChild(card(p)));
    frag.appendChild(h); frag.appendChild(g);
  });
  box.appendChild(frag);
}

function updateCounts(shown, total){
  const c = document.getElementById("countLabel");
  if (c) c.textContent = `${shown} of ${total} shown`;
}

function adjustCardSize(n){
  let min = 360;
  if (n >= 400) min = 180;
  else if (n >= 250) min = 220;
  else if (n >= 120) min = 260;
  else if (n >= 60) min = 300;
  else if (n >= 24) min = 340;
  document.documentElement.style.setProperty('--card-min', min + 'px');
}

function escapeHTML(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
