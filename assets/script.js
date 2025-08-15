// minimal client-side renderer for papers.json
const state = { q: "", activeTags: new Set(), data: [] };

const drivePreview = id => `https://drive.google.com/file/d/${id}/preview`;
const driveDownload = id => `https://drive.google.com/uc?export=download&id=${id}`;
const dropboxRaw = idOrUrl => idOrUrl.includes('dropbox.com') ? idOrUrl.replace('?dl=0','?raw=1') : idOrUrl;

const grid = document.getElementById('grid');
const tagsBox = document.getElementById('tags');
const qInput = document.getElementById('q');

fetch('papers.json')
  .then(r => r.json())
  .then(data => {
    state.data = data;
    renderTagSet();
    render();
  });

function renderTagSet() {
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
      render();
    };
    frag.appendChild(b);
  });
  tagsBox.innerHTML = "";
  tagsBox.appendChild(frag);
}

qInput.addEventListener('input', e => {
  state.q = e.target.value.toLowerCase();
  render();
});

function matches(p) {
  const q = state.q;
  const tagOK = state.activeTags.size === 0 || (p.tags || []).some(t => state.activeTags.has(t));
  const qOK = !q || [p.title, p.abstract, (p.tags||[]).join(' ')].join(' ').toLowerCase().includes(q);
  return tagOK && qOK;
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
  const frag = document.createDocumentFragment();
  const results = state.data.filter(matches);
  if (results.length === 0) {
    grid.innerHTML = '<p class="empty">No matches yet.</p>';
    return;
  }
  results.forEach(p => frag.appendChild(card(p)));
  grid.innerHTML = "";
  grid.appendChild(frag);
}
