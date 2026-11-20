// ============================================================
// tables.js — renderowanie tabel (filmy/seriale/nadchodzące)
// ============================================================

function columnsFor(type, status){
  if (status === STATUS_UPCOMING) return ["title","days","del"];
  if (status === STATUS_PLANNED) return ["title","priority"];
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

// Miniatura okładki wyświetlana po lewej stronie tytułu na liście (tak jak
// w aplikacji Showly). Jeśli okładka nie została jeszcze pobrana, pokazujemy
// pusty placeholder zamiast strzelać zapytaniami do TMDb przy każdym renderze.
function buildRowPosterEl(posterPath){
  if (posterPath) {
    const img = document.createElement("img");
    img.className = "row-poster";
    img.src = tmdbPosterUrl(posterPath, "w92");
    img.alt = "Okładka";
    img.loading = "lazy";
    img.addEventListener("click", (e)=>{
      e.stopPropagation();
      openPosterLightbox(tmdbPosterUrl(posterPath, "w780"));
    });
    return img;
  }
  const ph = document.createElement("div");
  ph.className = "row-poster-placeholder";
  return ph;
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
  if (column === "added") return item.addedAt || 0;
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
  if (column === "priority") return Number(item.priority)||0;
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
  if (search && getSearchMode(search) !== "tags") {
    const tokens = search.split(/[,]+|\s+/).map(t=>t.trim()).filter(Boolean);
    rows = rows.filter(r => tokens.every(tok => (r.title||"").toLowerCase().includes(tok)));
  }

  rows.sort((a,b)=>{
    const [sortCol, reverse] = sortState[key] || ["lp", false];
    if (sortCol === "title" || sortCol === "date") {
      const r = compareKeys(upcomingSortKey(a, sortCol), upcomingSortKey(b, sortCol));
      return reverse ? -r : r;
    }
    // domyślnie (i dla "ocena", która nie dotyczy nowości) sortuj po dniach do premiery
    return compareKeys(upcomingSortKey(a, "days"), upcomingSortKey(b, "days"));
  });

  const upTable = pane.querySelector("table.data");
  const upGrid = pane.querySelector(".poster-grid");
  if (isGridView() && upGrid) {
    upTable.style.display = "none";
    upGrid.style.display = "";
    renderPosterGrid(upGrid, rows.map(row=>{
      const linkedItem = row.item_id ? findItem(row.item_id) : null;
      return {
        title: row.title || "",
        poster_path: linkedItem && linkedItem.poster_path,
        badge: `S${row.season_number} · ${formatDaysLabel(row.days)}`,
        onOpen: ()=>openUpcomingViewDialog(row),
      };
    }), "Brak nowości. Kliknij „Sprawdź”.");
    return;
  }
  if (upGrid) { upGrid.style.display = "none"; upGrid.innerHTML = ""; }
  upTable.style.display = "";

  thead.innerHTML = "";
  const trH = document.createElement("tr");
  for (const col of columns) {
    const th = document.createElement("th");
    th.className = `col-${col}`;
    th.style.cursor = "default";
    th.textContent = col === "title" ? `${COL_LABELS[col]} (${rows.length})` : COL_LABELS[col];
    trH.appendChild(th);
  }
  thead.appendChild(trH);

  tbody.innerHTML = "";
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = columns.length;
    td.textContent = "Brak nowości. Kliknij „Sprawdź”.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  rows.forEach((row, idx)=>{
    const tr = document.createElement("tr");
    const tdTitle = document.createElement("td");
    tdTitle.className = "col-title";
    if (!showPosterInList()) {
      const titleLine = document.createElement("div");
      titleLine.className = "title-main";
      titleLine.textContent = row.title || "";
      tdTitle.appendChild(titleLine);
      if (row.air_date) {
        const dateLine = document.createElement("div");
        dateLine.className = "title-date";
        dateLine.textContent = formatDateDMY(row.air_date);
        tdTitle.appendChild(dateLine);
      }
    } else {
      const linkedItem = row.item_id ? findItem(row.item_id) : null;
      const wrapTitle = document.createElement("div");
      wrapTitle.className = "title-row-wrap";
      wrapTitle.appendChild(buildRowPosterEl(linkedItem && linkedItem.poster_path));
      const textCol = document.createElement("div");
      textCol.className = "title-text-col";
      const titleLine = document.createElement("div");
      titleLine.className = "title-main";
      titleLine.textContent = row.title || "";
      textCol.appendChild(titleLine);
      if (row.air_date) {
        const dateLine = document.createElement("div");
        dateLine.className = "title-date";
        dateLine.textContent = formatDateDMY(row.air_date);
        textCol.appendChild(dateLine);
      }
      wrapTitle.appendChild(textCol);
      tdTitle.appendChild(wrapTitle);
    }
    const tdDays = document.createElement("td");
    tdDays.className = "col-days";
    tdDays.textContent = formatDaysLabel(row.days);
    const tdDel = document.createElement("td");
    tdDel.className = "col-del";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn small next-ep-btn upcoming-add-btn";
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
      delete item.finished_date;
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
    if (selectedId[key] === upcomingKeyOf(row)) tr.classList.add("selected");
    tr.addEventListener("click", ()=>{
      selectedId[key] = upcomingKeyOf(row);
      tbody.querySelectorAll("tr").forEach(r=>r.classList.remove("selected"));
      tr.classList.add("selected");
    });
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
    const mode = getSearchMode(search);
    if (mode === "tags") {
      const tokens = search.replace(/#/g, "").split(/[,]+/).map(t=>t.trim()).filter(Boolean);
      items = items.filter(i => {
        const hay = (i.tags||[]).join(" ").toLowerCase();
        return tokens.every(tok => hay.includes(tok));
      });
    } else {
      const tokens = search.split(/[,]+|\s+/).map(t=>t.trim()).filter(Boolean);
      items = items.filter(i => tokens.every(tok => (i.title||"").toLowerCase().includes(tok)));
    }
  }

  const lpMap = new Map();
  items.forEach((it, idx)=> lpMap.set(it.id, idx+1));

  const totalBeforeFilter = items.length;
  const activeFilter = filterState[key];
  if (activeFilter && filterIsActive(activeFilter)) items = items.filter(i => itemMatchesFilter(i, activeFilter));
  renderFilterBar(pane, key, type, status, items.length, totalBeforeFilter);

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

  const table = pane.querySelector("table.data");
  const grid = pane.querySelector(".poster-grid");
  if (isGridView() && grid) {
    table.style.display = "none";
    grid.style.display = "";
    renderPosterGrid(grid, display.map(item=>({title: item.title || "", poster_path: item.poster_path, onOpen: ()=>openViewDialog(item.id)})));
    return;
  }
  if (grid) { grid.style.display = "none"; grid.innerHTML = ""; }
  table.style.display = "";

  thead.innerHTML = "";
  const trH = document.createElement("tr");
  for (const col of columns) {
    const th = document.createElement("th");
    th.className = `col-${col}`;
    th.textContent = col === "title" ? `${COL_LABELS[col]} (${display.length})` : COL_LABELS[col];
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
          if (useProgressBarOnly()) {
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
            // Dotknięcie komórki postępu odhacza kolejny odcinek (bez
            // zmiany wyglądu/rozmiaru - tylko krótkie przyciemnienie).
            if (p.next && p.next !== "✓" && status !== STATUS_WATCHED) {
              wrap.classList.add("prog-tappable");
              wrap.title = p.nextTitle ? `Odhacz: ${p.nextTitle}` : "Odhacz kolejny odcinek";
              wrap.addEventListener("click", async (e)=>{
                e.stopPropagation();
                if (wrap.classList.contains("prog-busy")) return;
                wrap.classList.add("prog-busy");
                try { await markNextFromList(item.id, wrap); }
                finally { wrap.classList.remove("prog-busy"); }
              });
              wrap.addEventListener("dblclick", (e)=>e.stopPropagation());
              // Nie przekazuj dotknięć do wiersza (podwójne dotknięcie
              // wiersza otwiera okno informacji).
              wrap.addEventListener("touchend", (e)=>e.stopPropagation());
            }
            td.appendChild(wrap);
          } else {
            const wrap = document.createElement("div");
            wrap.className = "next-ep-wrap";
            const btn = document.createElement("button");
            btn.type = "button";
            const codeEl = document.createElement("span");
            codeEl.className = "next-ep-code";
            const countsEl = document.createElement("span");
            countsEl.className = "next-ep-counts";
            countsEl.textContent = p.counts;
            const canMark = p.next && p.next !== "✓";
            btn.className = "btn small next-ep-btn" + (canMark ? "" : " secondary");
            codeEl.textContent = canMark ? p.next : (p.next === "✓" ? "✓" : "—");
            btn.appendChild(codeEl);
            btn.appendChild(countsEl);
            if (canMark) {
              btn.title = p.nextTitle ? `Odhacz: ${p.nextTitle}` : "Odhacz kolejny odcinek";
              btn.addEventListener("click", async (e)=>{
                e.stopPropagation();
                btn.disabled = true;
                try {
                  await markNextFromList(item.id);
                } finally {
                  btn.disabled = false;
                }
              });
            } else {
              btn.disabled = true;
            }
            wrap.appendChild(btn);
            let total = 0, watched = 0;
            for (const s of item.seasons||[]) for (const e of s.episodes||[]) { total++; if (e.watched) watched++; }
            const pct = total ? Math.round((watched/total)*100) : 0;
            const track = document.createElement("div");
            track.className = "progress-bar-track";
            const fill = document.createElement("div");
            fill.className = "progress-bar-fill";
            fill.style.width = pct + "%";
            track.appendChild(fill);
            wrap.appendChild(track);
            td.appendChild(wrap);
          }
        } else if (col === "title") {
          if (!showPosterInList()) {
            const titleLine = document.createElement("div");
            titleLine.className = "title-main";
            titleLine.textContent = item.title || "";
            td.appendChild(titleLine);
            if (item.premiere_date) {
              const dateLine = document.createElement("div");
              dateLine.className = "title-date";
              dateLine.textContent = item.premiere_date;
              td.appendChild(dateLine);
            }
          } else {
            const wrap = document.createElement("div");
            wrap.className = "title-row-wrap";
            wrap.appendChild(buildRowPosterEl(item.poster_path));
            const textCol = document.createElement("div");
            textCol.className = "title-text-col";
            const titleLine = document.createElement("div");
            titleLine.className = "title-main";
            titleLine.textContent = item.title || "";
            textCol.appendChild(titleLine);
            if (item.premiere_date) {
              const dateLine = document.createElement("div");
              dateLine.className = "title-date";
              dateLine.textContent = item.premiere_date;
              textCol.appendChild(dateLine);
            }
            wrap.appendChild(textCol);
            td.appendChild(wrap);
          }
        } else if (col === "priority") {
          const pr = Math.min(3, Math.max(0, Number(item.priority)||0));
          if (pr > 0) {
            const mark = document.createElement("span");
            mark.className = "priority-mark";
            mark.textContent = "!".repeat(pr);
            mark.title = `Priorytet ${pr}`;
            td.appendChild(mark);
          }
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
      const r = normalizeRating(item.rating);
      return r ? formatRating(r) : "—";
    }
    return "";
  }
}

// Odhacza kolejny odcinek z poziomu listy (przycisk albo komórka postępu).
// cell (opcjonalnie): komórka postępu w widoku z paskiem - zostaje najpierw
// zaktualizowana i podświetlona w miejscu, a po chwili lista się przerysowuje.
async function markNextFromList(id, cell){
  const opts = cell ? {beforeRender: async (item)=>{
    const p = formatProgress(item);
    let total = 0, watched = 0;
    for (const s of item.seasons||[]) for (const e of s.episodes||[]) { total++; if (e.watched) watched++; }
    const nextEl = cell.querySelector(".prog-next");
    const cntEl = cell.querySelector(".prog-counts");
    const fill = cell.querySelector(".progress-bar-fill");
    if (nextEl) nextEl.textContent = (p.next && p.next !== "✓") ? p.next : "✓";
    if (cntEl) cntEl.textContent = p.counts;
    if (fill) fill.style.width = (total ? Math.round((watched/total)*100) : 0) + "%";
    cell.classList.remove("prog-flash");
    void cell.offsetWidth;
    cell.classList.add("prog-flash");
    await new Promise(r=>setTimeout(r, 1100));
  }} : undefined;
  const result = await markNextEpisodeWatched(id, opts);
  if (result && result.notAiredYet) {
    const dateInfo = result.air_date
      ? ` Premiera: ${formatDateDMY(result.air_date)} (${formatDaysLabel(daysUntil(result.air_date))}).`
      : "";
    await showAlert("Odcinek jeszcze nie miał premiery", `Odcinek ${result.episode} (sezon ${result.season}) nie został jeszcze wyemitowany, więc nie można go oznaczyć jako obejrzany.${dateInfo}`);
  }
  return result;
}

// Widok 4: siatka samych okładek; kliknięcie otwiera okno informacji.
// tiles: [{title, poster_path, badge?, onOpen}]
function renderPosterGrid(grid, items, emptyText){
  grid.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "poster-grid-empty";
    empty.textContent = emptyText || "Brak pozycji.";
    grid.appendChild(empty);
    return;
  }
  for (const item of items) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "poster-tile";
    tile.title = item.title || "";
    tile.setAttribute("aria-label", item.title || "Pozycja");
    if (item.poster_path) {
      const img = document.createElement("img");
      img.src = tmdbPosterUrl(item.poster_path, "w342");
      img.alt = item.title || "";
      img.loading = "lazy";
      img.addEventListener("error", ()=>{
        img.remove();
        tile.classList.add("no-poster");
        tile.insertBefore(document.createTextNode(item.title || ""), tile.firstChild);
      });
      tile.appendChild(img);
    } else {
      tile.classList.add("no-poster");
      tile.appendChild(document.createTextNode(item.title || ""));
    }
    if (item.badge) {
      const badge = document.createElement("span");
      badge.className = "poster-badge";
      badge.textContent = item.badge;
      tile.appendChild(badge);
    }
    tile.addEventListener("click", item.onOpen);
    grid.appendChild(tile);
  }
}

// ============================================================
// Filtrowanie list (gatunek, rok, ocena, kraj, platforma, tagi)
// ============================================================
const filterState = {};

function emptyFilter(){
  return {genres:[], yearFrom:"", yearTo:"", minRating:0, countries:[], providers:[], tags:[]};
}
function filterIsActive(f){
  return !!(f && (f.genres.length || f.yearFrom || f.yearTo || f.minRating || f.countries.length || f.providers.length || f.tags.length));
}
function itemYear(i){
  const m = String(i.premiere_date||"").match(/\d{4}/);
  return m ? parseInt(m[0],10) : null;
}
function itemCountries(i){
  return [...new Set([...(i.production_countries||[]), ...(i.origin_country||[])])];
}
function itemProviders(i){
  const wp = i.watch_providers;
  return wp ? (wp.flatrate||[]) : [];
}
function itemMatchesFilter(i, f){
  if (f.genres.length && !f.genres.some(g => (i.genres||[]).includes(g))) return false;
  const y = itemYear(i);
  if (f.yearFrom && (y==null || y < +f.yearFrom)) return false;
  if (f.yearTo && (y==null || y > +f.yearTo)) return false;
  if (f.minRating && normalizeRating(i.rating) < f.minRating) return false;
  if (f.countries.length && !f.countries.some(c => itemCountries(i).includes(c))) return false;
  if (f.providers.length && !f.providers.some(p => itemProviders(i).includes(p))) return false;
  if (f.tags.length && !f.tags.some(t => (i.tags||[]).map(x=>x.toLowerCase()).includes(t.toLowerCase()))) return false;
  return true;
}
function filterSummaryParts(f){
  const parts = [];
  if (f.genres.length) parts.push(f.genres.join(", "));
  if (f.yearFrom || f.yearTo) parts.push(`${f.yearFrom||"…"}–${f.yearTo||"…"}`);
  if (f.minRating) parts.push(`ocena ≥ ${f.minRating}`);
  if (f.countries.length) parts.push(f.countries.join(", "));
  if (f.providers.length) parts.push(f.providers.join(", "));
  if (f.tags.length) parts.push(f.tags.map(t=>"#"+t).join(" "));
  return parts;
}
function renderFilterBar(pane, key, type, status, shown, total){
  const bar = pane.querySelector(".filter-bar");
  if (!bar) return;
  const f = filterState[key];
  if (!filterIsActive(f)) { bar.style.display = "none"; bar.innerHTML = ""; updateFilterButton(); return; }
  bar.style.display = "";
  bar.innerHTML = "";
  const text = document.createElement("button");
  text.type = "button";
  text.className = "filter-bar-text";
  text.textContent = filterSummaryParts(f).join(" · ");
  text.addEventListener("click", ()=>openFilterForCurrentTab());
  const count = document.createElement("span");
  count.className = "filter-bar-count";
  count.textContent = `${shown} z ${total}`;
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "filter-bar-clear";
  clear.setAttribute("aria-label", "Wyczyść filtry");
  clear.textContent = "×";
  clear.addEventListener("click", ()=>{ delete filterState[key]; renderTable(type, status); });
  bar.append(text, count, clear);
  updateFilterButton();
}
function updateFilterButton(){
  const btn = document.getElementById("btn-filter");
  if (!btn) return;
  const key = getCurrentKey();
  btn.classList.toggle("filter-on", !!(key && filterIsActive(filterState[key])));
}

function openFilterDialog(title, items, current){
  const count = (getter)=>{
    const m = new Map();
    for (const i of items) for (const v of getter(i)) if (v) m.set(v, (m.get(v)||0)+1);
    return [...m.entries()].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0], "pl"));
  };
  const groups = [
    {key:"genres", label:"Gatunek", values: count(i=>i.genres||[])},
    {key:"providers", label:"Gdzie obejrzeć (streaming)", values: count(itemProviders)},
    {key:"countries", label:"Kraj", values: count(itemCountries)},
    {key:"tags", label:"Tagi", values: count(i=>i.tags||[])},
  ];
  const f = JSON.parse(JSON.stringify(current || emptyFilter()));
  return new Promise(resolve=>{
    const ratingOpts = [0,5,6,7,8,9].map(r=>`<option value="${r}">${r ? "≥ " + r : "dowolna"}</option>`).join("");
    const overlay = openOverlay(`
      <div class="modal-header">${escapeHtml(title)}</div>
      <div class="modal-body filter-dialog">
        <div class="filter-row">
          <label>Rok</label>
          <input class="entry" id="flt-year-from" type="number" inputmode="numeric" placeholder="od">
          <span class="muted">–</span>
          <input class="entry" id="flt-year-to" type="number" inputmode="numeric" placeholder="do">
        </div>
        <div class="filter-row">
          <label>Ocena</label>
          <select class="entry" id="flt-rating">${ratingOpts}</select>
        </div>
        <div id="flt-groups"></div>
      </div>
      <div class="modal-footer">
        <button class="btn secondary" id="flt-reset">Wyczyść</button>
        <button class="btn secondary" id="flt-cancel">Anuluj</button>
        <button class="btn" id="flt-apply">Pokaż</button>
      </div>
    `);
    const yf = overlay.querySelector("#flt-year-from"), yt = overlay.querySelector("#flt-year-to"), rt = overlay.querySelector("#flt-rating");
    const applyBtn = overlay.querySelector("#flt-apply");
    yf.value = f.yearFrom; yt.value = f.yearTo; rt.value = String(f.minRating||0);
    const groupsEl = overlay.querySelector("#flt-groups");
    function readInputs(){
      f.yearFrom = yf.value.trim(); f.yearTo = yt.value.trim(); f.minRating = parseInt(rt.value,10)||0;
    }
    function refreshCount(){
      readInputs();
      const n = items.filter(i=>itemMatchesFilter(i, f)).length;
      applyBtn.textContent = `Pokaż (${n})`;
    }
    for (const g of groups) {
      if (!g.values.length) continue;
      const sec = document.createElement("div");
      sec.className = "filter-group";
      const h = document.createElement("div");
      h.className = "filter-group-label";
      h.textContent = g.label;
      const chips = document.createElement("div");
      chips.className = "filter-chips";
      for (const [val, n] of g.values) {
        const c = document.createElement("button");
        c.type = "button";
        c.className = "filter-chip" + (f[g.key].includes(val) ? " on" : "");
        c.textContent = `${g.key==="tags" ? "#" : ""}${val} (${n})`;
        c.addEventListener("click", ()=>{
          const arr = f[g.key];
          const idx = arr.indexOf(val);
          if (idx>=0) arr.splice(idx,1); else arr.push(val);
          c.classList.toggle("on", idx<0);
          refreshCount();
        });
        chips.appendChild(c);
      }
      sec.append(h, chips);
      groupsEl.appendChild(sec);
    }
    [yf, yt, rt].forEach(el=>el.addEventListener("input", refreshCount));
    refreshCount();
    function finish(v){ closeOverlay(overlay); document.removeEventListener("keydown", onKey); resolve(v); }
    function onKey(e){ if (!isTopOverlay(overlay)) return; if (e.key==="Escape") finish(null); }
    document.addEventListener("keydown", onKey);
    overlay.querySelector("#flt-cancel").addEventListener("click", ()=>finish(null));
    overlay.querySelector("#flt-reset").addEventListener("click", ()=>finish(emptyFilter()));
    applyBtn.addEventListener("click", ()=>{ readInputs(); finish(f); });
  });
}

async function openFilterForCurrentTab(){
  if (activeMain !== TYPE_MOVIE && activeMain !== TYPE_SERIES) return;
  const type = activeMain;
  const status = activeStatus[type];
  if (status === STATUS_UPCOMING) return;
  const key = `${type}:${status}`;
  const items = db.items.filter(i => i.type===type && (i.status||STATUS_WATCHING)===status);
  const result = await openFilterDialog(`Filtruj — ${TYPE_LABELS[type]} / ${STATUS_LABELS[status]}`, items, filterState[key]);
  if (!result) return;
  if (filterIsActive(result)) filterState[key] = result; else delete filterState[key];
  renderTable(type, status);
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

document.getElementById("btn-filter").addEventListener("click", openFilterForCurrentTab);

document.getElementById("btn-view").addEventListener("click", async ()=>{
  const choice = await openViewModeMenu(getUiVersion());
  if (!choice || choice === getUiVersion()) return;
  if (!db.settings) db.settings = {...DEFAULT_SETTINGS};
  db.settings.ui_version = choice;
  saveToLocalStorage();
  setDirty(true);
  renderAll();
});

document.getElementById("btn-sort").addEventListener("click", async ()=>{
  if (activeMain !== TYPE_MOVIE && activeMain !== TYPE_SERIES) return;
  const type = activeMain;
  const status = activeStatus[type];
  const key = `${type}:${status}`;
  const isUpcoming = status === STATUS_UPCOMING;
  const isPlanned = status === STATUS_PLANNED;
  const current = sortState[key] || ["lp", false];
  const choice = await openSortMenu({
    title: `Sortuj — ${TYPE_LABELS[type]} / ${STATUS_LABELS[status]}`,
    current,
    includeRating: !isUpcoming,
    includeAdded: !isUpcoming,
    includePriority: isPlanned,
  });
  if (!choice) return;
  sortState[key] = choice;
  renderTable(type, status);
});

