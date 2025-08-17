<script>
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

let PAPERS = [];
let TOPICS = [];
let activeTopics = new Set();
let view = null;   // will be set by setView()

document.addEventListener("DOMContentLoaded", async () => {
  // Load data
  const [papers, topics] = await Promise.all([
    fetch("papers.json").then(r=>r.json()),
    fetch("topics.json").then(r=>r.json()).catch(()=>[])
  ]);
  PAPERS = papers;
  TOPICS = topics || [];

  // Build topic buttons
  const wrap = $("#topicButtons");
  if (wrap){
    wrap.innerHTML = "";
    TOPICS.forEach(t => {
      const b = document.createElement("button");
      b.className = "chip"; b.type="button";
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

  // Search
  const qEl = $("#q");
  if (qEl) qEl.addEventListener("input", e => { q = e.target.value.trim(); render(); });

  // View toggles
  $("#viewTable")?.addEventListener("click", () => setView("table", true));
  $("#viewCards")?.addEventListener("click", () => setView("cards", true));

  // Decide default view (Cards on phones/tablets; Table otherwise)
  const prefersCards =
    window.matchMedia("(max-width: 980px)").matches ||
    window.matchMedia("(pointer: coarse)").matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  setView(prefersCards ? "cards" : "table", false);
  render();
});

let q = "";
function normalized(s){ return (s||"").toLowerCase(); }

function matchesTopics(p){
  if (activeTopics.size===0) return true;
  const text = normalized([p.title,p.abstract,(p.tags||[]).join(" "), (p.firstPage||"")].join(" "));
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
function currentRows(){ return PAPERS.filter(p => matchesTopics(p) && matchesQuery(p)); }

function setView(v, userTriggered){
  view = v;
  document.body.classList.remove("view-table","view-cards");
  document.body.classList.add(v==="cards" ? "view-cards" : "view-table");
  $("#viewTable")?.setAttribute("aria-pressed", String(v==="table"));
  $("#viewCards")?.setAttribute("aria-pressed", String(v==="cards"));
  // If user explicitly chooses, remember it for the session
  if (userTriggered) sessionStorage.setItem("viewPref", v);
  // If no user choice yet, honor a past session choice
  if (!userTriggered){
    const remembered = sessionStorage.getItem("viewPref");
    if (remembered && remembered!==v){
      // override default with remembered preference
      setView(remembered, false);
      return;
    }
  }
}

function render(){
  const rows = currentRows();
  const count = $("#countLabel"); if (count) count.textContent = `${rows.length} of ${PAPERS.length} shown`;
  if (view==="table") renderTable(rows); else renderCards(rows);
}

function renderTable(rows){
  const tbody = $("#tbody"); if (!tbody) return;
  tbody.innerHTML = "";
  for (const p of rows){
    const tr = document.createElement("tr");

    td(tr, "title", p.title || "(untitled)");
    td(tr, "year",  p.year || "");
    td(tr, "category", p.category || p.group || "Misc");
    td(tr, "pages", p.pages || "");
    td(tr, "wait",  p.wait ?? "");
    td(tr, "locked", p.locked ? "🔒" : "");
    td(tr, "tags",  (p.tags||[]).join(", "));

    // actions
    const tda = document.createElement("td"); tda.className = "actions";
    const read = linkBtn("Read", p);
    const dl   = linkBtn("Download", p, true);
    tda.append(read, dl);
    tr.appendChild(tda);

    tbody.appendChild(tr);
  }
}
function td(tr, cls, text){ const el=document.createElement("td"); el.className=cls; el.textContent=String(text); tr.appendChild(el); }
function linkBtn(kind, p, ghost=false){
  const a=document.createElement("a");
  a.className = "btn" + (ghost?" ghost":"");
  a.textContent = kind;
  const prev = p.preview || p.drivePreview || (p.driveId ? `https://drive.google.com/file/d/${p.driveId}/preview` : "#");
  const down = p.download || p.driveDownload || (p.driveId ? `https://drive.google.com/uc?export=download&id=${p.driveId}` : "#");
  const url  = (kind==="Read" ? prev : down);
  a.href = (p.locked && p.lockNotice) ? p.lockNotice : url;
  a.target = "_blank";
  return a;
}

function renderCards(rows){
  const grid = $("#grid"); if (!grid) return;
  grid.innerHTML = "";
  for (const p of rows){
    const c = document.createElement("div"); c.className="card";
    const h = document.createElement("h2"); h.textContent = p.title || "(untitled)"; c.appendChild(h);
    const m = document.createElement("p"); m.className="meta";
    m.textContent = `${p.year||""} · ${p.category||p.group||"Misc"}${p.pages?` · ${p.pages} pp`:``}${p.wait?` · WAIT ${p.wait}`:``}`;
    c.appendChild(m);

    if ((p.tags||[]).length){
      const tg=document.createElement("div"); tg.style.display="flex"; tg.style.flexWrap="wrap"; tg.style.gap=".35rem";
      for (const t of p.tags){ const s=document.createElement("span"); s.className="tag"; s.textContent=t; tg.appendChild(s); }
      c.appendChild(tg);
    }
    const act=document.createElement("div"); act.className="actions";
    act.appendChild(linkBtn("Read", p));
    act.appendChild(linkBtn("Download", p, true));
    c.appendChild(act);

    grid.appendChild(c);
  }
}
</script>
