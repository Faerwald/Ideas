/* Ideas — one-page view with topic buttons (AND), search in title+abstract+tags+first-page text,
   grouped by category when no filters, auto-resize cards by result count. */

const state = {
  data: [],
  q: "",
  selectedTopics: new Set(), // AND filter
  topics: [],                // unique topic labels (category + tags + "Large")
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

// ---------- boot ----------
document.addEventListener("DOMContentLoaded", () => {
  els.q = document.getElementById("q");
  els.topicBox = document.getElementById("topicButtons");
  els.sections = document.getElementById("sections");
  els.grid = document.getElementById("grid");
  els.count = document.getElementById("countLabel");

  fetch('papers.json?ts=' + Date.now())
    .then(r => r.json())
    .then(data => {
      state.data = Array.isArray(data) ? data : [];
      buildTopics();
      renderTopicButtons();
      attachEvents();
      applyFilters();
    });
});

// ---------- topics ----------
function buildTopics() {
  const tset = new Set();
  state.data.forEach(p => {
    if (p.category) tset.add(p.category);
    (p.tags || []).forEach(t => tset.add(t));
    if (p.size === "Large") tset.add("Large");
  });
  state.topics = [...tset].sort((a,b)=>a.localeCompare(b));
}

function renderTopicButtons() {
  const box = els.topicBox;
  box.innerHTML = "";
  const frag = document.createDocumentFragment();

  state.topics.forEach(label => {
    const b = document.createElement("button");
    b.className = "topic-chip";
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-pressed", "false");
    b.onclick = () => {
      if (state.selectedTopics.has(label)) {
        state.selectedTopics.delete(label);
        b.setAttribute("aria-pressed", "false");
      } else {
        state.selectedTopics.add(label);
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
    state.selectedTopics.clear();
    [...box.querySelectorAll('.topic-chip')].forEach(x=>x.setAttribute('aria-pressed','false'));
    applyFilters();
  };
  frag.appendChild(clr);

  box.appendChild(frag);
}

// ---------- filtering ----------
function attachEvents() {
  els.q.addEventListener("input", () => {
    state.q = els.q.value.toLowerCase();
    applyFilters();
  });
}

function matchesText(p) {
  if (!state.q) return true;
  const hay = [
    p.title || "",
    p.abstract || "",
    (p.tags || []).join(" "),
    p.fp || ""   // first-page text if present
  ].join(" ").toLowerCase();
  return hay.includes(state.q);
}

function matchesTopics(p) {
  if (state.selectedTopics.size === 0) return true;
  const pTopics = new Set([
    ...(p.tags || []),
    ...(p.category ? [p.category] : []),
    ...(p.size === "Large" ? ["Large"] : [])
  ]);
  // AND logic
  for (const t of state.selectedTopics) {
    if (!pTopics.has(t)) return false;
  }
  return true;
}

function applyFilters() {
  const filtered = state.data.filter(p => matchesText(p) && matchesTopics(p));
  updateCounts(filtered.length, state.data.length);
  adjustCardSize(filtered.length);

  if (state.selectedTopics.size === 0 && !state.q) {
    // no filters: group by category
    els.grid.style.display = "none";
    els.sections.style.display = "";
    renderSections(groupByCategory(filtered));
  } else {
    // filters active: single grid
    els.sections.style.display = "none";
    els.grid.style.display = "";
    renderGrid(filtered);
  }
}

// ---------- render ----------
function card(p) {
  const el = document.createElement("article");
  el.className = "card";
  const sizeBadge = p.pages ? `<span class="tag">${p.pages} pp</span>` : "";
  const catBadge = p.category ? `<span class="tag">${p.category}</span>` : "";
  const sizeGroup = p.size ? `<span class="tag">${p.size}</span>` : "";

  el.innerHTML = `
    <h2>${escapeHTML(p.title || "")}</h2>
    <p class="meta">${p.year || ''} ${p.venue ? '· ' + p.venue : ''}</p>
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
  const g = els.grid;
  g.innerHTML = "";
  const frag = document.createDocumentFragment();
  items.forEach(p => frag.appendChild(card(p)));
  g.appendChild(frag);
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
  const box = els.sections;
  box.innerHTML = "";
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
  box.appendChild(frag);
}

function updateCounts(shown, total) {
  if (els.count) els.count.textContent = `${shown} of ${total} shown`;
}

function adjustCardSize(n) {
  // smaller cards for huge result sets; larger when narrowed
  let min = 360; // px
  if (n >= 400) min = 180;
  else if (n >= 250) min = 220;
  else if (n >= 120) min = 260;
  else if (n >= 60) min = 300;
  else if (n >= 24) min = 340;
  document.documentElement.style.setProperty('--card-min', min + 'px');
}

// small HTML escaper
function escapeHTML(s){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
