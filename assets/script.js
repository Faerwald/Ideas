<script>
/* ========= tiny helpers ========= */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* ========= state ========= */
let PAPERS = [];
let TOPICS = [];          // from topics.json (label + any[])
let activeTopics = new Set();
let view = "table";       // will be flipped to "cards" on phones
let q = "";               // search text

/* ========= boot ========= */
document.addEventListener("DOMContentLoaded", async () => {
  // load data
  const [papers, topics] = await Promise.all([
    fetch("papers.json").then(r => r.json()),
    fetch("topics.json").then(r => r.json()).catch(() => [])
  ]);
  PAPERS = papers;
  TOPICS = topics || [];

  // build topic buttons
  const wrap = $("#topicButtons");
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

  // search
  $("#q").addEventListener("input", e => { q = e.target.value.trim(); render(); });

  // view toggles
  $("#viewTable").addEventListener("click", () => setView("table"));
  $("#viewCards").addEventListener("click", () => setView("cards"));

  // --- DEFAULT VIEW: Cards on mobile/tablet, Table on desktop
  const prefersCards =
    window.matchMedia("(max-width: 980px)").matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  setView(prefersCards ? "cards" : "table");

  render();
});

/* ========= view switch ========= */
function setView(v){
  view = v;
  $("#viewTable").setAttribute("aria-pressed", String(v==="table"));
  $("#viewCards").setAttribute("aria-pressed", String(v==="cards"));
  $("#tablewrap").style.display = v==="table" ? "" : "none";
  $("#grid").style.display      = v==="cards" ? "" : "none";
  $("#sections").style.display  = "none"; // we’re using flat grid for simplicity here
}

/* ========= filtering ========= */
function normalized(str){
  return (str||"").toLowerCase();
}
function matchesTopics(p){
  if (activeTopics.size===0) return true;
  const text = normalized([p.title,p.abstract,(p.tags||[]).join(" "), (p.firstPage||"")].join(" "));
  // AND over selected topics; within each topic: OR over its seed terms
  for (const label of activeTopics){
    const topic = TOPICS.find(t => t.label===label);
    if (!topic) return false;
    const any = topic.any || [];
    const hit = any.some(term => text.includes(term.toLowerCase()));
    if (!hit) return false;
  }
  return true;
}
function matchesQuery(p){
  if (!q) return true;
  const text = normalized([p.title,p.abstract,(p.tags||[]).join(" "), (p.firstPage||"")].join(" "));
  return q.toLowerCase().split(/\s+/).every(tok => text.includes(tok));
}
function currentRows(){
  return PAPERS.filter(p => matchesTopics(p) && matchesQuery(p));
}

/* ========= render ========= */
function render(){
  const rows = currentRows();
  $("#countLabel").textContent = `${rows.length} of ${PAPERS.length} shown`;
  if (view==="table") renderTable(rows); else renderCards(rows);
}

function renderTable(rows){
  const tbody = $("#tbody");
  tbody.innerHTML = "";
  for (const p of rows){
    const tr = document.createElement("tr");

    // Title
    const tdTitle = document.createElement("td");
    tdTitle.className = "title";
    tdTitle.textContent = p.title || "(untitled)";
    tr.appendChild(tdTitle);

    // Year
    const tdYear = document.createElement("td");
    tdYear.className = "year";
    tdYear.textContent = p.year || "";
    tr.appendChild(tdYear);

    // Category (from topics pass 1 if available, else Misc)
    const tdCat = document.createElement("td");
    tdCat.className = "category";
    tdCat.textContent = p.category || p.group || "Misc";
    tr.appendChild(tdCat);

    // Pages
    const tdPages = document.createElement("td");
    tdPages.className = "pages";
    tdPages.textContent = p.pages || "";
    tr.appendChild(tdPages);

    // WAIT
    const tdWait = document.createElement("td");
    tdWait.className = "wait";
    tdWait.textContent = p.wait ?? "";
    tr.appendChild(tdWait);

    // Locked
    const tdLock = document.createElement("td");
    tdLock.className = "locked";
    tdLock.textContent = p.locked ? "🔒" : "";
    tr.appendChild(tdLock);

    // Tags
    const tdTags = document.createElement("td");
    tdTags.className = "tags";
    tdTags.textContent = (p.tags||[]).join(", ");
    tr.appendChild(tdTags);

    // Actions
    const tdAct = document.createElement("td");
    tdAct.className = "actions";
    const read = document.createElement("a");
    read.className = "btn";
    read.textContent = "Read";
    read.href = p.locked && p.lockNotice ? p.lockNotice : (p.preview||p.drivePreview||`https://drive.google.com/file/d/${p.driveId}/preview`);
    read.target = "_blank";
    tdAct.appendChild(read);

    const dl = document.createElement("a");
    dl.className = "btn ghost";
    dl.textContent = "Download";
    dl.href = p.locked && p.lockNotice ? p.lockNotice : (p.download||p.driveDownload||`https://drive.google.com/uc?export=download&id=${p.driveId}`);
    dl.target = "_blank";
    tdAct.appendChild(dl);

    tr.appendChild(tdAct);
    tbody.appendChild(tr);
  }
}

function renderCards(rows){
  const grid = $("#grid");
  grid.innerHTML = "";
  for (const p of rows){
    const c = document.createElement("div");
    c.className = "card";
    const h = document.createElement("h2");
    h.textContent = p.title || "(untitled)";
    c.appendChild(h);

    const m = document.createElement("p");
    m.className = "meta";
    m.textContent = `${p.year||""} · ${p.category||p.group||"Misc"}${p.pages?` · ${p.pages} pp`:``}`;
    c.appendChild(m);

    if ((p.tags||[]).length){
      const tg = document.createElement("div");
      tg.style.display="flex"; tg.style.flexWrap="wrap"; tg.style.gap=".35rem";
      for (const t of p.tags) {
        const span = document.createElement("span"); span.className="tag"; span.textContent=t; tg.appendChild(span);
      }
      c.appendChild(tg);
    }

    const act = document.createElement("div");
    act.className = "actions";
    const read = document.createElement("a");
    read.className = "btn";
    read.textContent = "Read";
    read.href = p.locked && p.lockNotice ? p.lockNotice : (p.preview||p.drivePreview||`https://drive.google.com/file/d/${p.driveId}/preview`);
    read.target = "_blank";
    act.appendChild(read);

    const dl = document.createElement("a");
    dl.className = "btn ghost";
    dl.textContent = "Download";
    dl.href = p.locked && p.lockNotice ? p.lockNotice : (p.download||p.driveDownload||`https://drive.google.com/uc?export=download&id=${p.driveId}`);
    dl.target = "_blank";
    act.appendChild(dl);

    c.appendChild(act);
    grid.appendChild(c);
  }
}
</script>
