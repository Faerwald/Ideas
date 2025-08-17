<script>
/* ---------- tiny helpers ---------- */
const $ = s => document.querySelector(s);

/* ---------- state ---------- */
let PAPERS = [];
let TOPICS = [];
let activeTopics = new Set();
let q = "";
let view = "table";

/* ---------- FIRST-PAINT view choice (runs before data load) ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("view");
  const coarse = window.matchMedia("(pointer:coarse)").matches;                 // touch device
  const narrow = window.matchMedia("(max-width: 980px)").matches;               // small layout
  const smallScreen = Math.min(screen.width, screen.height) <= 1024;            // fallback
  const prefersCards = saved ? (saved === "cards") : (coarse || narrow || smallScreen);

  // Show the right shell immediately (prevents “table first” flash on Android)
  applyViewShell(prefersCards ? "cards" : "table");

  // continue boot
  boot(prefersCards ? "cards" : "table");
});

/* ---------- boot after shell ---------- */
async function boot(defaultView){
  // load data
  const [papers, topics] = await Promise.all([
    fetch("papers.json").then(r => r.json()),
    fetch("topics.json").then(r => r.json()).catch(() => [])
  ]);
  PAPERS = papers;
  TOPICS = topics || [];

  // topic buttons
  const wrap = $("#topicButtons");
  if (wrap){
    wrap.innerHTML = "";
    TOPICS.forEach(t => {
      const b = document.createElement("button");
      b.className = "chip";
      b.type = "button";
      b.textContent = t.label;
      b.setAttribute("aria-pressed","false");
      b.addEventListener("click", () => {
        const on = b.getAttribute("aria-pressed")==="true";
        b.setAttribute("aria-pressed", String(!on));
        if (on) activeTopics.delete(t.label); else activeTopics.add(t.label);
        render();
      });
      wrap.appendChild(b);
    });
  }

  // search
  $("#q")?.addEventListener("input", e => { q = e.target.value.trim(); render(); });

  // view toggles (save user choice)
  $("#viewTable")?.addEventListener("click", () => setView("table", true));
  $("#viewCards")?.addEventListener("click", () => setView("cards", true));

  // set initial view & paint
  setView(defaultView, false);
  render();
}

/* ---------- view helpers ---------- */
function applyViewShell(v){
  view = v;
  const tablewrap = document.getElementById("tablewrap");
  const grid      = document.getElementById("grid");
  if (tablewrap) tablewrap.style.display = (v==="table") ? "" : "none";
  if (grid)      grid.style.display      = (v==="cards") ? "" : "none";
  document.getElementById("viewTable")?.setAttribute("aria-pressed", String(v==="table"));
  document.getElementById("viewCards")?.setAttribute("aria-pressed", String(v==="cards"));
}
function setView(v, fromUser){
  applyViewShell(v);
  if (fromUser) localStorage.setItem("view", v);
}

/* ---------- filtering ---------- */
function normalized(str){ return (str||"").toLowerCase(); }
function matchesTopics(p){
  if (activeTopics.size===0) return true;
  const hay = normalized([p.title,p.abstract,(p.tags||[]).join(" "), (p.firstPage||"")].join(" "));
  for (const label of activeTopics){
    const t = TOPICS.find(x => x.label===label);
    if (!t) return false;
    const any = t.any||[];
    if (!any.some(term => hay.includes(term.toLowerCase()))) return false;
  }
  return true;
}
function matchesQuery(p){
  if (!q) return true;
  const hay = normalized([p.title,p.abstract,(p.tags||[]).join(" "), (p.firstPage||"")].join(" "));
  return q.toLowerCase().split(/\s+/).every(tok => hay.includes(tok));
}
function currentRows(){ return PAPERS.filter(p => matchesTopics(p) && matchesQuery(p)); }

/* ---------- renderers ---------- */
function render(){
  const rows = currentRows();
  const label = document.getElementById("countLabel");
  if (label) label.textContent = `${rows.length} of ${PAPERS.length} shown`;
  if (view==="table") renderTable(rows); else renderCards(rows);
}
function renderTable(rows){
  const tbody = document.getElementById("tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (const p of rows){
    const tr = document.createElement("tr");

    td(tr,"title", p.title || "(untitled)");
    td(tr,"year",  p.year || "");
    td(tr,"category", p.category || p.group || "Misc");
    td(tr,"pages", p.pages || "");
    td(tr,"wait",  (p.wait ?? ""));
    td(tr,"locked", p.locked ? "🔒" : "");
    td(tr,"tags",  (p.tags||[]).join(", "));

    const act = document.createElement("td");
    act.className = "actions";
    act.appendChild(aBtn("btn", "Read", p.locked && p.lockNotice ? p.lockNotice : (p.preview || p.drivePreview || `https://drive.google.com/file/d/${p.driveId}/preview`)));
    act.appendChild(aBtn("btn ghost", "Download", p.locked && p.lockNotice ? p.lockNotice : (p.download || p.driveDownload || `https://drive.google.com/uc?export=download&id=${p.driveId}`)));
    tr.appendChild(act);

    tbody.appendChild(tr);
  }
}
function renderCards(rows){
  const grid = document.getElementById("grid");
  if (!grid) return;
  grid.innerHTML = "";
  for (const p of rows){
    const c = el("div","card");
    const h = el("h2"); h.textContent = p.title || "(untitled)"; c.appendChild(h);
    const m = el("p","meta"); m.textContent = `${p.year||""} · ${p.category||p.group||"Misc"}${p.pages?` · ${p.pages} pp`:``}`; c.appendChild(m);

    const tags = (p.tags||[]);
    if (tags.length){
      const tg = el("div"); tg.style.display="flex"; tg.style.flexWrap="wrap"; tg.style.gap=".35rem";
      tags.forEach(t => { const s = el("span","tag"); s.textContent = t; tg.appendChild(s); });
      c.appendChild(tg);
    }

    const act = el("div","actions");
    act.appendChild(aBtn("btn", "Read", p.locked && p.lockNotice ? p.lockNotice : (p.preview || p.drivePreview || `https://drive.google.com/file/d/${p.driveId}/preview`)));
    act.appendChild(aBtn("btn ghost", "Download", p.locked && p.lockNotice ? p.lockNotice : (p.download || p.driveDownload || `https://drive.google.com/uc?export=download&id=${p.driveId}`)));
    c.appendChild(act);

    grid.appendChild(c);
  }
}

/* ---------- tiny dom utils ---------- */
function el(tag, cls){ const n=document.createElement(tag); if(cls) n.className=cls; return n; }
function td(tr, cls, text){ const n=el("td", cls); n.textContent = text; tr.appendChild(n); }
function aBtn(cls, text, href){ const a=el("a",cls); a.textContent=text; a.href=href; a.target="_blank"; return a; }
</script>
