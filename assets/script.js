const PAGE_SIZE = 24;

const state = {
  q: "",
  andMode: false,
  compact: false,
  sort: "year_desc",
  group: "none", // none | category | size
  activeTags: new Set(),
  data: [],
  filtered: [],
  page: 1
};

const drivePreview = id => `https://drive.google.com/file/d/${id}/preview`;
const driveDownload = id => `https://drive.google.com/uc?export=download&id=${id}`;

const grid = document.getElementById('grid');
const tagsBox = document.getElementById('tags');
const qInput = document.getElementById('q');
const andMode = document.getElementById('andMode');
const compact = document.getElementById('compact');
const sortSel = document.getElementById('sortSel');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const rangeLbl = document.getElementById('range');

// Inject a "Group by" control into the existing toolbar so you don't edit HTML
(function injectGroupControl(){
  const vc = document.querySelector('.view-controls');
  if (!vc) return;
  const label = document.createElement('label');
  label.textContent = "Group:";
  const sel = document.createElement('select');
  sel.id = 'groupSel';
  sel.innerHTML = `
    <option value="none">None</option>
    <option value="category">Category</option>
    <option value="size">Size (Large/Normal)</option>
  `;
  sel.onchange = () => { state.group = sel.value; state.page = 1; applyFilters(); };
  label.appendChild(sel);
  vc.appendChild(label);
})();

fetch('papers.json?ts=' + Date.now())
  .then(r => r.json())
  .then(data => {
    state.data = Array.isArray(data) ? data : [];
    buildTags();
    attachEvents();
    applyFilters();
  });

function attachEvents() {
  qInput.addEventListener('input', () => { state.q = qInput.value.toLowerCase(); state.page = 1; applyFilters(); });
  if (andMode) andMode.addEventListener('change', () => { state.andMode = andMode.checked; state.page = 1; applyFilters(); });
  if (compact) compact.addEventListener('change', () => { state.compact = compact.checked; render(); });
  if (sortSel) sortSel.addEventListener('change', () => { state.sort = sortSel.value; applyFilters(); });
  if (prevBtn) prevBtn.addEventListener('click', () => { if (state.page > 1) { state.page--; render(); } });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    const pages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    if (state.page < pages) { state.page++; render(); }
  });
}

function buildTags() {
  const all = new Set();
  state.data.forEach(p => (p.tags || []).forEach(t => all.add(t)));
  const frag = document.createDocumentFragment();
  [...all].sort((a,b)=>a.localeCompare(b)).forEach(tag => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = tag;
    b.setAttribute('aria-pressed', 'false');
    b.onclick = () => {
      if (state.activeTags.has(tag)) state.activeTags.delete(tag);
      else state.activeTags.add(tag);
      b.setAttribute('aria-pressed', state.activeTags.has(tag) ? 'true' : 'false');
      state.page = 1;
      applyFilters();
    };
    frag.appendChild(b);
  });
  tagsBox.innerHTML = "";
  tagsBox.appendChild(frag);
}

function sortItems(a, b) {
  if (state.sort === 'year_desc') return (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title);
  if (state.sort === 'year_asc') return (a.year || 0) - (b.year || 0) || a.title.localeCompare(b.title);
  if (state.sort === 'title_asc') return a.title.localeCompare(b.title);
  return 0;
}

function matches(p) {
  const q = state.q;
  const tagOK = state.activeTags.size === 0 || (p.tags || []).some(t => state.activeTags.has(t));
  if (!tagOK) return false;
  if (!q) return true;
  const hay = [
    p.title || "",
    p.abstract || "",
    (p.tags || []).join(" "),
    p.fp || ""          // NEW: first-page text
  ].join(" ").toLowerCase();
  return hay.includes(q);
}

function applyFilters() {
  state.filtered = state.data.filter(matches).sort(sortItems);
  state.page = 1;
  render();
}

function card(p) {
  const el = document.createElement('article');
  el.className = 'card';
  const readLink = p.driveId ? `<a class="btn" target="_blank" rel="noopener" href="${drivePreview(p.driveId)}">Read</a>` : '';
  const downloadLink = p.driveId ? `<a class="btn ghost" target="_blank" rel="noopener" href="${driveDownload(p.driveId)}">Download</a>` : '';
  const sizeBadge = p.pages ? `<span class="tag">${(p.pages||0)} pp</span>` : '';
  const catBadge = p.category ? `<span class="tag">${p.category}</span>` : '';
  const sizeGroup = p.size ? `<span class="tag">${p.size}</span>` : '';
  el.innerHTML = `
    <h2>${p.title}</h2>
    <p class="meta">${p.year || ''} ${p.venue ? '· ' + p.venue : ''}</p>
    <p>${p.abstract || ''}</p>
    <div class="tagrow">${sizeBadge}${catBadge}${sizeGroup}${(p.tags||[]).map(t=>`<span class="tag">${t}</span>`).join('')}</div>
    <div class="actions">${readLink} ${downloadLink}</div>`;
  return el;
}

function render() {
  grid.classList.toggle('list', state.compact);

  // Grouping mode disables pagination and renders by sections
  if (state.group !== "none") {
    const groups = new Map();
    const keyFn = state.group === "category"
      ? (p => p.category || "Misc")
      : (p => p.size || ((p.pages||0)>=100 ? "Large" : "Normal"));

    state.filtered.forEach(p => {
      const k = keyFn(p);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    });

    const labels = [...groups.keys()].sort((a,b)=>a.localeCompare(b));
    const frag = document.createDocumentFragment();
    grid.innerHTML = "";

    labels.forEach(label => {
      const h = document.createElement('h2');
      h.textContent = label;
      frag.appendChild(h);
      const section = document.createElement('div');
      section.className = 'grid';
      groups.get(label).forEach(p => section.appendChild(card(p)));
      frag.appendChild(section);
    });
    grid.appendChild(frag);

    if (prevBtn) prevBtn.style.display = "none";
    if (nextBtn) nextBtn.style.display = "none";
    if (rangeLbl) rangeLbl.textContent = `Showing ${state.filtered.length}`;
    return;
  }

  // Normal paged render
  const total = state.filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);

  const frag = document.createDocumentFragment();
  const slice = state.filtered.slice(start, end);
  if (slice.length === 0) {
    grid.innerHTML = '<p class="empty">No matches yet.</p>';
  } else {
    grid.innerHTML = "";
    slice.forEach(p => frag.appendChild(card(p)));
    grid.appendChild(frag);
  }

  if (prevBtn) prevBtn.style.display = "";
  if (nextBtn) nextBtn.style.display = "";
  if (prevBtn) prevBtn.disabled = (state.page <= 1);
  if (nextBtn) nextBtn.disabled = (state.page >= pages);
  if (rangeLbl) rangeLbl.textContent = `Showing ${total ? (start+1) : 0}–${end} of ${total}`;
}
