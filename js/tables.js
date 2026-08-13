// ============================================================
// tables.js — renderowanie tabel (filmy/seriale/nadchodzące)
// ============================================================

function columnsFor(type, status){
  if (status === STATUS_UPCOMING) return ["title","days","del"];
  if (type === TYPE_SERIES) {
    if (status === STATUS_WATCHING) return ["title","progress"];
    if (status === STATUS_WATCHED) return ["title","rating"];
    return ["title","date","progress","rating"];
  }
  return ["title","rating"];
}

function formatProgress(item){
  const seasons = [...(item.seasons||[])].sort((a,b)=>(a.number||0)-(b.number||0));
  const total = seasons.reduce((acc,s)=>acc+(s.episodes||[]).length, 0);
  const watched = seasons.reduce((acc,s)=>acc+(s.episodes||[]).filter(e=>e.watched).length, 0);
  const remaining = total - watched;

  let nextLabel = null;
  let nextTitle = "";
  outer:
  for (const season of seasons) {
    const eps = [...(season.episodes||[])].sort((a,b)=>(a.number||0)-(b.number||0));
    for (const ep of eps) {
      if (!ep.watched) {
        nextLabel = `S${String(season.number||0).padStart(2,"0")} E${String(ep.number||0).padStart(2,"0")}`;
        nextTitle = ep.title || "";
        break outer;
      }
    }
  }
  const counts = `${watched}/${total} (${remaining})`;
  if (nextLabel) return { next: nextLabel, nextTitle, counts };
  if (total > 0) return { next: "✓", nextTitle: "", counts };
  return { next: "", nextTitle: "", counts: "—" };
}

function dateSortKey(item){
  const d = String(item.premiere_date||"").trim();
  const y = d.slice(0,4);
  if (y.length===4 && /^\d+$/.test(y)) return [0, parseInt(y,10)];
  return [1, d.toLowerCase()];
}

function sortKey(item, column, type){
  if (column === "title") return item.title ? item.title.toLowerCase() : "";
  if (column === "date") return dateSortKey(item);
  if (column === "time") {
    if (type === TYPE_MOVIE) return item.duration || 0;
    let sum = 0;
    for (const s of item.seasons||[]) for (const e of s.episodes||[]) if (e.watched) sum += (e.duration||0);
    return sum;
  }
  if (column === "progress") {
    let c = 0;
    for (const s of item.seasons||[]) for (const e of s.episodes||[]) if (e.watched) c++;
    return c;
  }
  if (column === "rating") return item.rating || 0;
  return item.title ? item.title.toLowerCase() : "";
}

function renderUpcomingTable(){
  const pane = document.getElementById(`pane-${TYPE_SERIES}-${STATUS_UPCOMING}`);
  if (!pane) return;
  const thead = pane.querySelector("thead");
  const tbody = pane.querySelector("tbody");
  const columns = columnsFor(TYPE_SERIES, STATUS_UPCOMING);
  const key = `${TYPE_SERIES}:${STATUS_UPCOMING}`;

  let rows = (db.upcoming || [])
    .map(e=>({...e, days: daysUntil(e.air_date)}))
    .filter(r => r.days !== null);
  const search = searchQuery.trim().toLowerCase();
  if (search && searchMode !== "tags") {
    const tokens = search.split(/[,]+|\s+/).map(t=>t.trim()).filter(Boolean);
    rows = rows.filter(r => tokens.every(tok => (r.title||"").toLowerCase().includes(tok)));
  }

  rows.sort((a,b)=> compareKeys(upcomingSortKey(a, "days"), upcomingSortKey(b, "days")));

  thead.innerHTML = "";
  const trH = document.createElement("tr");
  for (const col of columns) {
    const th = document.createElement("th");
    th.className = `col-${col}`;
    th.style.cursor = "default";
    th.textContent = COL_LABELS[col];
    trH.appendChild(th);
  }
  thead.appendChild(trH);

  tbody.innerHTML = "";
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = columns.length;
    td.textContent = "Brak nadchodzących sezonów. Kliknij „Sprawdź”.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  rows.forEach((row, idx)=>{
    const tr = document.createElement("tr");
    const tdTitle = document.createElement("td");
    tdTitle.className = "col-title";
    tdTitle.textContent = row.title || "";
    const tdDays = document.createElement("td");
    tdDays.className = "col-days";
    tdDays.textContent = formatDaysLabel(row.days);
    const tdDel = document.createElement("td");
    tdDel.className = "col-del";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn small";
    addBtn.textContent = "Dodaj";
    addBtn.addEventListener("click", async (e)=>{
      e.stopPropagation();
      const ok = await showConfirm("Dodaj do oglądanych", `Dodać „${row.title}” — sezon ${row.season_number} do oglądanych?`);
      if (!ok) return;
      const item = row.item_id ? findItem(row.item_id) : null;
      if (!item) { await showAlert("Błąd", "Nie znaleziono serialu w bazie.", "error"); return; }
      const nextNum = (item.seasons||[]).reduce((m,s)=>Math.max(m, Number(s.number)||0), 0) + 1;
      const count = Math.max(0, Number(row.episode_count)||0);
      const episodes = Array.from({length:count}, (_,i)=>({number:i+1, watched:false, duration:0, title:""}));
      if (!Array.isArray(item.seasons)) item.seasons = [];
      item.seasons.push({number:nextNum, episodes});
      item.seasons.sort((a,b)=>(a.number||0)-(b.number||0));
      item.status = STATUS_WATCHING;
      db.items = db.items.filter(i=>i.id!==item.id);
      db.items.unshift(item);
      const uk = upcomingKeyOf(row);
      db.upcoming = (db.upcoming||[]).filter(x=>upcomingKeyOf(x)!==uk);
      setDirty(true);
      renderAll();
      await showAlert("Dodano sezon", `Dodano sezon ${nextNum} (${count} odcinków). Serial przeniesiono do zakładki „Oglądane”.`, "info");
    });
    tdDel.appendChild(addBtn);
    tr.appendChild(tdTitle);
    tr.appendChild(tdDays);
    tr.appendChild(tdDel);
    addDoubleActivation(tr, ()=>{ openUpcomingViewDialog(row); });
    tbody.appendChild(tr);
  });
}

function openUpcomingViewDialog(row){
  return new Promise(resolve=>{
    const linkedItem = row.item_id ? findItem(row.item_id) : null;
    const origTitle = row.original_title || (linkedItem && linkedItem.original_title) || null;
    const overlay = openOverlay(`
      <div class="modal-body">
        <div class="view-row"><div class="vlabel">Typ:</div><div class="vval">Serial</div></div>
        <div class="view-row"><div class="vlabel">Tytuł:</div><div class="vval">${escapeHtml(row.title||"—")}</div></div>
        ${origTitle ? `<div class="view-row"><div class="vlabel">Tytuł org.:</div><div class="vval">${escapeHtml(origTitle)}</div></div>` : ""}
        <div class="view-row"><div class="vlabel">Data:</div><div class="vval">${escapeHtml(row.air_date||"—")}</div></div>
        <div class="view-row"><div class="vlabel">Nowy sezon:</div><div class="vval">${escapeHtml(String(row.season_number||"—"))}</div></div>
        <div class="view-row"><div class="vlabel">Liczba odcinków:</div><div class="vval">${escapeHtml(String(row.episode_count||"—"))}</div></div>
      </div>
      <div class="modal-footer">
        <button class="btn" id="close-upcoming-view-btn">Zamknij</button>
      </div>
    `, {wide:true});

    function finish(){ closeOverlay(overlay); document.removeEventListener("keydown", onKey); resolve(null); }
    function onKey(e){ if (!isTopOverlay(overlay)) return; if (e.key==="Escape") finish(); }
    document.addEventListener("keydown", onKey);
    overlay.querySelector("#close-upcoming-view-btn").addEventListener("click", finish);
  });
}

function renderTable(type, status){
  if (status === STATUS_UPCOMING) { renderUpcomingTable(); return; }
  const pane = document.getElementById(`pane-${type}-${status}`);
  const thead = pane.querySelector("thead");
  const tbody = pane.querySelector("tbody");
  const columns = columnsFor(type, status);
  const key = `${type}:${status}`;

  let items = db.items.filter(i => i.type===type && (i.status||STATUS_WATCHING)===status);
  const search = searchQuery.trim().toLowerCase();
  if (search) {
    const tokens = search.split(/[,]+|\s+/).map(t=>t.trim()).filter(Boolean);
    items = items.filter(i => {
      const hay = searchMode === "tags"
        ? (i.tags||[]).join(" ").toLowerCase()
        : (i.title||"").toLowerCase();
      return tokens.every(tok => hay.includes(tok));
    });
  }

  const lpMap = new Map();
  items.forEach((it, idx)=> lpMap.set(it.id, idx+1));

  const [sortCol, reverse] = sortState[key];
  let display = items.slice();
  if (sortCol === "lp") {
    display.sort((a,b)=> (lpMap.get(a.id)-lpMap.get(b.id)) * (reverse?-1:1));
  } else {
    display.sort((a,b)=>{
      const r = compareKeys(sortKey(a,sortCol,type), sortKey(b,sortCol,type));
      return reverse ? -r : r;
    });
  }

  thead.innerHTML = "";
  const trH = document.createElement("tr");
  for (const col of columns) {
    const th = document.createElement("th");
    th.className = `col-${col}`;
    th.textContent = COL_LABELS[col];
    trH.appendChild(th);
  }
  thead.appendChild(trH);

  tbody.innerHTML = "";
  if (display.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = columns.length;
    td.textContent = "Brak pozycji.";
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    for (const item of display) {
      const tr = document.createElement("tr");
      tr.dataset.id = item.id;
      if (selectedId[key] === item.id) tr.classList.add("selected");
      for (const col of columns) {
        const td = document.createElement("td");
        td.className = `col-${col}`;
        if (col === "progress") {
          const p = formatProgress(item);
          let total = 0, watched = 0;
          for (const s of item.seasons||[]) for (const e of s.episodes||[]) { total++; if (e.watched) watched++; }
          const pct = total ? Math.round((watched/total)*100) : 0;
          const wrap = document.createElement("div");
          wrap.className = "progress-cell";
          const top = document.createElement("div");
          top.className = "prog-toprow";
          const next = document.createElement("span");
          next.className = "prog-next";
          next.textContent = (status === STATUS_WATCHED) ? "" : p.next;
          const cnt = document.createElement("span");
          cnt.className = "prog-counts";
          cnt.textContent = p.counts;
          top.appendChild(next);
          top.appendChild(cnt);
          const track = document.createElement("div");
          track.className = "progress-bar-track";
          const fill = document.createElement("div");
          fill.className = "progress-bar-fill";
          fill.style.width = pct + "%";
          track.appendChild(fill);
          wrap.appendChild(top);
          wrap.appendChild(track);
          td.appendChild(wrap);
        } else {
          td.textContent = cellValue(item, col, type);
        }
        tr.appendChild(td);
      }
      tr.addEventListener("click", ()=>{
        selectedId[key] = item.id;
        pane.querySelectorAll("tbody tr").forEach(r=>r.classList.remove("selected"));
        tr.classList.add("selected");
      });
      addDoubleActivation(tr, ()=>{
        openViewDialog(item.id);
      });
      tbody.appendChild(tr);
    }
  }

  function cellValue(item, col, itemType){
    if (col === "lp") return lpMap.get(item.id) ?? "";
    if (col === "title") return item.title || "";
    if (col === "date") return item.premiere_date || "";
    if (col === "time") {
      if (itemType === TYPE_MOVIE) return item.duration ? String(item.duration) : "—";
      let sum = 0;
      for (const s of item.seasons||[]) for (const e of s.episodes||[]) if (e.watched) sum += (e.duration||0);
      return sum ? String(sum) : "—";
    }
    if (col === "progress") { const p = formatProgress(item); return p.next ? `${p.next}  ${p.counts}` : p.counts; }
    if (col === "rating") {
      const r = parseInt(item.rating||0,10);
      return r ? `${r}/10` : "—";
    }
    return "";
  }
}

function renderAll(){
  for (const type of [TYPE_MOVIE, TYPE_SERIES]) {
    for (const status of TYPE_STATUS_ORDER[type]) {
      renderTable(type, status);
    }
  }
  renderNotesTab();
  updateStats();
  updateDbBadge();
}

function getCurrentKey(){
  if (activeMain !== TYPE_MOVIE && activeMain !== TYPE_SERIES) return null;
  return `${activeMain}:${activeStatus[activeMain]}`;
}

function getSelectedItemId(){
  const key = getCurrentKey();
  if (!key) return null;
  return selectedId[key] || null;
}

function findItem(id){
  return db.items.find(i=>i.id===id) || null;
}

