/* One-page view with keyword buttons (AND) using the same search pipeline
   (title + abstract + tags + first-page text `fp`). Buttons come from keywords.json. */

const state = {
  data: [],
  q: "",
  keywords: [],           // from keywords.json
  selected: new Set(),    // AND filter (selected keywords)
};

const els = {
  q: null,
  topicBox: null,
  sections: null,
  grid: null,
  count: null,
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
  ]).then(([papers, keywords]) => {
    state.data = Array.isArray(papers) ? papers : [];
    state.keywords = (Array.isArray(keywords) ? keywords : []).map(s => String(s).trim()).filter(Boolean);
    renderKeywordButtons();
    attachEvents();
    applyFilters();
  });
});

/* ---------- UI: keyword buttons from keywords.json ---------- */
function renderKeywordButtons() {
  const box = els.topicBox;
  box.innerHTML = "";
  const frag = document.createDocumentFragment();

  state.keywords.forEach(label => {
    const b = document.createElement("button");
    b.className = "topic-chip";
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-pressed", "false");
    b.onclick = () => {
      if (state.selected.has(label)) {
        state.selected.delete(label);
        b.setAttribute("aria-pressed", "false");
      } else {
        state.selected.add(label);
        b.setAttribute("aria-pressed", "true");
      }
      applyFilters();
    };
    frag.appendChild(b);
  });

  // Clear button
  const clr = document.createElement("button");
  clr.className = "btn ghost small";
  clr.type = "button";
  clr.textContent = "Clear";
  clr.onclick = () => {
    state.selected.clear();
    [...box.querySelectorAll('.topic-chip')].forEach(x => x.setAttribute('aria-pressed','false'));
    applyFilters();
  };
  frag.appendChild(clr);

  box.appendChild(frag);
}

/* ---------- filter logic (same pipeline as search bar) ---------- */
function attachEvents() {
  els.q.addEventListener("input", () => {
    state.q = els.q.value.toLowerCase();
    applyFilters();
  });
}

function haystack(p) {
  return [
    p.title || "",
    p.abstract || "",
    (p.tags || []).join(" "),
    p.fp || ""     // first-page text
  ].join(" ").toLowerCase();
}

function matchesQuery(p) {
  if (!state.q) return true;
  return haystack(p).includes(state.q);
}

function matchesKeywords(p) {
  if (state.selected.size === 0) return true;
  const h = haystack(p);
  // AND: every selected keyword must appear in the same haystack
  for (const kw of state.selected) {
    if (!h.includes(kw.toLowerCase())) return false;
  }
  return true;
}

function applyFilters() {
  const items = state.data.filter(p => matchesQuery(p) && matchesKeywords(p));
  updateCounts(items.length, state.data.length);
  adjustCardSize(items.length);

  if (state.selected.size === 0 && !state.q) {
    // no filters: group by category for overview
    els.grid.style.display = "none";
    els.sections.style.display = "";
    renderSections(groupByCategory(items));
  } else {
    // filters active: single grid
    els.sections.style.display = "none";
    els.grid.style.display = "";
    renderGrid(items);
  }
}

/* ---------- render ---------- */
function card(p) {
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

function renderGrid(items) {
  els.grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  items.forEach(p => frag.appendChild(card(p)));
  els.grid.appendChild(frag);
}

function groupByCategory(items) {
  const map = new Map();
  items.forEach(p => {
    const k = p.category || "Misc";
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  });
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
}

function renderSections(groups) {
  els.sections.innerHTML = "";
  const frag = document.createDocumentFragment();
  groups.forEach(([label, arr]) => {
    const h = document.createElement("h2");
    h.className = "section-title";
    h.textContent = label;
    const grid = document.createElement("div");
    grid.className = "grid";
    arr.forEach(p => grid.appendChild(card(p)));
    frag.appendChild(h);
    frag.appendChild(grid);
  });
  els.sections.appendChild(frag);
}

function updateCounts(shown, total) {
  if (els.count) els.count.textContent = `${shown} of ${total} shown`;
}

function adjustCardSize(n) {
  // smaller cards for huge result sets; larger when narrowed
  let min = 360;
  if (n >= 400) min = 180;
  else if (n >= 250) min = 220;
  else if (n >= 120) min = 260;
  else if (n >= 60) min = 300;
  else if (n >= 24) min = 340;
  document.documentElement.style.setProperty('--card-min', min + 'px');
}

function escapeHTML(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
