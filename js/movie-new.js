// ============================================================
// movie-new.js — Filmy · Nowości
// Planowane filmy, które po premierze kinowej pojawiły się w Polsce
// na platformie streamingowej albo w wypożyczalni/sklepie online.
// Sprawdzane automatycznie raz dziennie przy otwarciu aplikacji.
// Dane o platformach: TMDb / JustWatch.
// ============================================================

const MOVIE_NEW_RECENT_DAYS = 180;   // świeże premiery dodajemy od razu, nawet przy pierwszym sprawdzeniu

function movieNewRows(){
  return (db.movie_new || []).map(e=>({...e, item: findItem(e.item_id)}))
    .filter(r=>r.item && r.item.type === TYPE_MOVIE && r.item.status === STATUS_PLANNED);
}

function movieNewProvidersText(wp){
  if (!wp) return "";
  const parts = [];
  if ((wp.flatrate||[]).length) parts.push(wp.flatrate.join(", "));
  const rb = [...new Set([...(wp.rent||[]), ...(wp.buy||[])])];
  if (rb.length && !(wp.flatrate||[]).length) parts.push("wypożyczenie: " + rb.slice(0,3).join(", ") + (rb.length > 3 ? "…" : ""));
  else if (rb.length) parts.push("+ wypożyczenie");
  return parts.join(" · ");
}

async function checkMovieNew(opts){
  opts = opts || {};
  if (!getStoredTmdbKey()) { if (opts.manual) await showAlert("Brak klucza TMDb", "Dodaj klucz TMDb w Ustawieniach.", "error"); return; }
  if (!db.movie_new) db.movie_new = [];
  if (!db.movie_new_state) db.movie_new_state = {};
  const today = todayISODate();
  const planned = db.items.filter(i=>i.type === TYPE_MOVIE && i.status === STATUS_PLANNED && i.tmdb_id);
  const known = new Set(db.movie_new.map(e=>String(e.item_id)));
  let added = 0, changed = false;
  for (const it of planned) {
    const pd = String(it.premiere_date||"");
    if (pd && pd > today) continue;               // jeszcze przed premierą
    let wp = null;
    try { wp = await tmdbFetchWatchProviders(TYPE_MOVIE, it.tmdb_id); } catch(e) { continue; }
    const st = db.movie_new_state[it.id] || {};
    const available = !!wp;
    if (wp) { it.watch_providers = wp; changed = true; }
    if (available && !known.has(String(it.id)) && !st.dismissed) {
      const recent = pd && (Date.parse(today) - Date.parse(pd)) / 86400000 <= MOVIE_NEW_RECENT_DAYS;
      if (st.unavailable || recent) {
        db.movie_new.unshift({item_id: it.id, found: today});
        known.add(String(it.id)); added++;
      }
    }
    db.movie_new_state[it.id] = {...st, unavailable: !available || undefined, checked: today};
    changed = true;
  }
  // porządki: usuń wpisy filmów, które nie są już planowane
  const before = db.movie_new.length;
  db.movie_new = db.movie_new.filter(e=>{ const i = findItem(e.item_id); return i && i.status === STATUS_PLANNED; });
  if (db.movie_new.length !== before) changed = true;
  try { localStorage.setItem("tv_db_movie_new_checked", today); } catch(e) {}
  if (changed) { setDirty(true); renderAll(); }
  if (opts.manual) await showAlert("Nowości – filmy", added ? `Nowe filmy dostępne online: ${added}.` : "Brak nowych filmów dostępnych online.", "info");
}

function maybeAutoCheckMovieNew(){
  let last = "";
  try { last = localStorage.getItem("tv_db_movie_new_checked") || ""; } catch(e) {}
  if (last === todayISODate()) return;
  setTimeout(()=>{ checkMovieNew().catch(()=>{}); }, 4000);
}

function renderMovieNewTable(){
  const pane = document.getElementById(`pane-${TYPE_MOVIE}-${STATUS_AVAILABLE}`);
  if (!pane) return;
  const wrap = pane.querySelector(".table-wrap");
  const rows = movieNewRows();
  let last = "";
  try { last = localStorage.getItem("tv_db_movie_new_checked") || ""; } catch(e) {}
  wrap.innerHTML = `<table class="data mn-table"><thead><tr><th class="col-title">Tytuł (${rows.length})</th><th class="col-mn">Gdzie</th></tr></thead><tbody></tbody></table>
    <div class="mn-foot"><button type="button" class="btn small secondary" id="mn-check">Sprawdź teraz</button><span>${last ? "Sprawdzono " + escapeHtml(formatDateDMY(last)) + " · " : ""}Dane: TMDb / JustWatch</span></div>`;
  const tbody = wrap.querySelector("tbody");
  if (!rows.length) tbody.innerHTML = `<tr class="empty-row"><td colspan="2">Brak nowości.</td></tr>`;
  for (const r of rows) {
    const it = r.item;
    const tr = document.createElement("tr");
    tr.dataset.id = it.id;
    const year = String(it.premiere_date||"").slice(0,4);
    tr.innerHTML = `<td class="col-title"><span class="mn-t"></span>${year ? `<span class="gs-y">${escapeHtml(year)}</span>` : ""}</td><td class="col-mn"><span class="mn-p"></span></td>`;
    tr.querySelector(".mn-t").textContent = it.title;
    tr.querySelector(".mn-p").textContent = movieNewProvidersText(it.watch_providers);
    addDoubleActivation(tr, ()=>openMovieNewDialog(it));
    tbody.appendChild(tr);
  }
  wrap.querySelector("#mn-check").addEventListener("click", async (e)=>{
    const b = e.currentTarget; b.disabled = true; b.textContent = "Sprawdzam…";
    try { await checkMovieNew({manual:true}); } finally { renderMovieNewTable(); }
  });
}

function openMovieNewDialog(it){
  const wp = it.watch_providers || {};
  const row = (label, list)=> (list && list.length) ? `<div class="vl-row"><span class="vl-k">${label}</span><span class="vl-v">${escapeHtml(list.join(", "))}</span></div>` : "";
  const ov = openOverlay(`<div class="modal-header">${escapeHtml(it.title)}</div>
    <div class="modal-body"><div class="mn-dlg">${row("Streaming", wp.flatrate)}${row("Wypożyczenie", wp.rent)}${row("Zakup", wp.buy)}</div>
    <div class="muted" style="font-size:12px;margin-top:10px;">Dane: TMDb / JustWatch</div></div>
    <div class="modal-footer"><button class="btn secondary" id="mn-del">Usuń z Nowości</button><button class="btn secondary" id="mn-info">Informacje</button><button class="btn" id="mn-close">Zamknij</button></div>`);
  const close = ()=>closeOverlay(ov);
  ov.querySelector("#mn-close").addEventListener("click", close);
  ov.querySelector("#mn-info").addEventListener("click", ()=>{ close(); openViewDialog(it.id); });
  ov.querySelector("#mn-del").addEventListener("click", ()=>{
    db.movie_new = (db.movie_new||[]).filter(e=>String(e.item_id)!==String(it.id));
    db.movie_new_state[it.id] = {...(db.movie_new_state[it.id]||{}), dismissed: true};
    setDirty(true); close(); renderAll();
  });
}
