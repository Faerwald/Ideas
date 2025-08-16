const PAGE_SIZE = 24;

const state = {
  q: "",
  andMode: false,
  compact: false,
  sort: "year_desc",
  activeTags: new Set(),
  collection: null,
  collections: [],
  data: [],
  filtered: [],
  page: 1
};

const drivePreview = id => `https://drive.google.com/file/d/${id}/preview`;
const driveDownload = id => `https://drive.google.com/uc?export=download&id=${id}`;
const dropboxRaw = url => url.includes('dropbox.com') ? url.replace('?dl=0','?raw=1') : url;

const grid = document.getElementById('grid');
const tagsBox = document.getElementById('tags');
const collectionsBox = document.getElementById('collections');
const qInput = document.getElementById('q');
const andMode = document.getElementById('andMode');
const compact = document.getElementById('compact');
const sortSel = document.getElementById('sortSel');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const rangeLbl = document.getElementById('range');

Promise.all([
  fetch('papers.json?ts=' + Date.now()).then(r => r.json()),
  fetch('collections.json').then(r => r.json()).catch(_ => [])
]).then(([data, collections]) => {
  state.data = Array.isArray(data) ? data : [];
  state.collections = Array.isArray(collections) ? collections : [];
  buildCollections();
  buildTags();
  attachEvents();
  applyFilters();
});

function attachEvents() {
  qInput.addEventListener('input', () => { state.q = qInput.value.toLowerCase(); state.page = 1; applyFilters(); });
  andMode.addEventListener('change', () => { state.andMode = andMode.checked; state.page = 1; applyFilters(); });
  compact.addEventListener('change', () => { state.compact = compact.checked; render(); });
  sortSel.addEventListener('change', () => { state.sort = sortSel.value; applyFilters(); });
  prevBtn.addEventListener('click', () => { if (state.page > 1) { state.page--; render(); } });
  nextBtn.addEventListener('click', () => { const pages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE)); if (state.page < pages) { state.page++; render(); } });
}

function buildCollections() {
  collectionsBox.innerHTML = "";
  if (!state.collections.length) return;
  const frag = document.createDocumentFragment();
  state.collections.forEach(c => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = c.label;
    b.setAttribute('aria-pressed', 'false');
    b.onclick = () => {
      const active = (state.collection && state.collection.id === c.id);
      state.collection = active ? null : c;
      [...collectionsBox.querySelectorAll('.chip')].forEach(el => el.setAttribute('aria-pressed','false'));
      if (!active) b.setAttribute('aria-pressed','true');
      state.page = 1;
      applyFilters();
    };
    frag.appendChild(b);
  });
  collectionsBox.appendChild(frag);
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

function applyFilters() {
  const q = state.q;
  const tags = state.activeTags;
  const hasTags = tags.size > 0;
  const coll = state.collection;

  state.filtered = state.data.filter(p => {
    const textOK = !q || [p.title, p.abstract, (p.tags||[]).join(' ')].join(' ').toLowerCase().includes(q);
    if (!textOK) return false;

    let collOK = true;
    if (coll && coll.filter) {
      const any = coll.filter.anyTags || [];
      const all = coll.filter.allTags || [];
      const ptags = new Set(p.tags || []);
      collOK = (any.length ? any.some(t => ptags.has(t)) : true) && (all.length ? all.every(t => ptags.has(t)) : true);
      if (!collOK) return false;
    }

    if (!hasTags) return true;
    const ptags = new Set(p.tags || []);
    if (state.andMode) {
      for (const t of tags) if (!ptags.has(t)) return false;
      return true;
    } else {
      for (const t of tags) if (ptags.has(t)) return true;
      return false;
    }
  }).sort(sortItems);

  state.page = 1;
  render();
}

function card(p) {
  const el = document.createElement('article');
  el.className = 'card';
  const readLink = p.driveId
    ? `<a class="btn" target="_blank" rel="noopener" href="${drivePreview(p.driveId)}">Read</a>`
    : (p.dropbox || p.url ? `<a class="btn" target="_blank" rel="noopener" href="${dropboxRaw(p.dropbox || p.url)}">Read</a>` : '');
  const downloadLink = p.driveId
    ? `<a class="btn ghost" target="_blank" rel="noopener" href="${driveDownload(p.driveId)}">Download</a>`
    : (p.dropbox ? `<a class="btn ghost" target="_blank" rel="noopener" href="${(p.dropbox.includes('dl=0')?p.dropbox.replace('dl=0','dl=1'):p.dropbox)}">Download</a>` : '');

  el.innerHTML = `
    <h2>${p.title}</h2>
    <p class="meta">${p.year || ''} ${p.venue ? '· ' + p.venue : ''}</p>
    <p>${p.abstract || ''}</p>
    <div class="tagrow">${(p.tags||[]).map(t=>`<span class="tag">${t}</span>`).join('')}</div>
    <div class="actions">${readLink} ${downloadLink}
      ${p.doi ? `<a class="btn ghost" target="_blank" rel="noopener" href="https://doi.org/${p.doi}">DOI</a>` : ''}
      ${p.ots ? `<a class="btn ghost" target="_blank" rel="noopener" href="${p.ots}">OTS</a>` : ''}
    </div>`;
  return el;
}

function render() {
  grid.classList.toggle('list', state.compact);

  const total = state.filtered.length;
  const pages = Math.max(1, Math.ceil(total / 24));
  state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * 24;
  const end = Math.min(start + 24, total);

  const frag = document.createDocumentFragment();
  const slice = state.filtered.slice(start, end);
  if (slice.length === 0) {
    grid.innerHTML = '<p class="empty">No matches yet.</p>';
  } else {
    grid.innerHTML = "";
    slice.forEach(p => frag.appendChild(card(p)));
    grid.appendChild(frag);
  }

  prevBtn.disabled = (state.page <= 1);
  nextBtn.disabled = (state.page >= pages);
  rangeLbl.textContent = `Showing ${total ? (start+1) : 0}–${end} of ${total}`;
}
