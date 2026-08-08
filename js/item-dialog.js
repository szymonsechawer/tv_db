// ============================================================
// item-dialog.js — okno podglądu i edycji pozycji (film/serial)
// ============================================================

function findDuplicate(type, title, premiereDate, excludeId){
  const normTitle = title.trim().toLowerCase();
  const normDate = String(premiereDate||"").trim().toLowerCase();
  for (const other of db.items) {
    if (other.type !== type) continue;
    if (excludeId!=null && other.id===excludeId) continue;
    if ((other.title||"").trim().toLowerCase() !== normTitle) continue;
    if (String(other.premiere_date||"").trim().toLowerCase() !== normDate) continue;
    return other;
  }
  return null;
}

function computeLp(type, status, itemId){
  const items = db.items.filter(i=>i.type===type && (i.status||STATUS_WATCHING)===status);
  const idx = items.findIndex(i=>i.id===itemId);
  return idx===-1 ? null : idx+1;
}

async function markNextEpisodeWatched(id){
  const item = findItem(id);
  if (!item) return null;
  const seasons = [...(item.seasons||[])].sort((a,b)=>(a.number||0)-(b.number||0));
  for (const season of seasons) {
    const eps = [...(season.episodes||[])].sort((a,b)=>(a.number||0)-(b.number||0));
    for (const ep of eps) {
      if (!ep.watched) {
        if (!ep.duration) {
          try {
            let tid = item.tmdb_id;
            if (!tid) {
              const hit = await tmdbSearch(TYPE_SERIES, item.title, item.premiere_date);
              if (hit) { tid = hit.id; item.tmdb_id = tid; }
            }
            if (tid) {
              const tmdbEps = await tmdbSeasonEpisodes(tid, season.number);
              const match = tmdbEps.find(e=>e.episode_number===ep.number);
              if (match && match.runtime) ep.duration = match.runtime;
            }
          } catch(err) {
          }
        }
        ep.watched = true;
        db.items = db.items.filter(i=>i.id!==id);
        const allWatched = seasons.every(s=>(s.episodes||[]).every(e=>e.watched));
        if (allWatched) {
          item.status = STATUS_WATCHED;
          db.items.push(item);
        } else {
          db.items.unshift(item);
        }
        setDirty(true);
        renderAll();
        return {season: season.number, episode: ep.number, completed: allWatched};
      }
    }
  }
  return null;
}

function openViewDialog(id){
  return new Promise(resolve=>{
    const item = findItem(id);
    if (!item) { resolve(null); return; }
    const type = item.type;

    let timeTxt;
    if (type===TYPE_MOVIE) {
      timeTxt = item.duration ? `${item.duration} min` : "—";
    } else {
      let sum = 0;
      for (const s of item.seasons||[]) for (const e of s.episodes||[]) if (e.watched) sum += (e.duration||0);
      timeTxt = sum ? `${sum} min` : "—";
    }

    let bodyExtra = "";
    if (type===TYPE_SERIES) {
      bodyExtra = `
        <div class="view-row" id="view-progress-row"></div>
        <div id="mark-next-ep-wrap">
          <button class="btn small" id="mark-next-ep-btn"></button>
          <span id="mark-next-ep-title"></span>
        </div>
      `;
    }

    const overlay = openOverlay(`
      <div class="modal-body has-tabs">
        <div class="inner-tabs">
          <button class="tab-btn active" id="vtab-info" type="button">Informacje</button>
          <button class="tab-btn" id="vtab-desc" type="button">Opis</button>
          ${type===TYPE_SERIES ? '<button class="tab-btn" id="vtab-seasons" type="button">Sezony i odcinki</button>' : ''}
        </div>
        <div class="tab-scroll">
          <div id="vpane-info">
            <div class="view-poster-wrap" id="view-poster-wrap">
              <img class="view-poster" id="view-poster-img" alt="Okładka" style="display:none;">
              <div class="view-poster-placeholder" id="view-poster-placeholder">Brak okładki</div>
            </div>
            <div class="view-row"><div class="vlabel">Typ:</div><div class="vval">${escapeHtml(TYPE_LABELS[type]||"")}</div></div>
            <div class="view-row"><div class="vlabel">Tytuł:</div><div class="vval">${escapeHtml(item.title||"—")}</div></div>
            ${item.original_title ? `<div class="view-row"><div class="vlabel">Tytuł org.:</div><div class="vval">${escapeHtml(item.original_title)}</div></div>` : ""}
            <div class="view-row"><div class="vlabel">Czas:</div><div class="vval">${escapeHtml(timeTxt)}</div></div>
            <div class="view-row"><div class="vlabel">Data (rok):</div><div class="vval">${escapeHtml(item.premiere_date||"—")}</div></div>
            <div class="view-row" id="view-status-row"></div>
            <div class="view-row" id="view-rating-row"></div>
            <div class="view-row"><div class="vlabel">Tagi:</div><div class="vval"><div class="view-tags">${item.tags&&item.tags.length ? item.tags.map(t=>`<span class="view-tag">${escapeHtml(t)}</span>`).join("") : '<span class="muted">—</span>'}</div></div></div>
            ${bodyExtra}
          </div>
          <div id="vpane-desc" style="display:none;">
            <div class="tmdb-status" id="view-desc-status"></div>
            <div class="desc-text" id="view-desc-text"></div>
            <div style="margin-top:12px;">
              <button class="btn small secondary" id="view-desc-fetch-btn" type="button">Pobierz opis</button>
            </div>
          </div>
          ${type===TYPE_SERIES ? '<div id="vpane-seasons" style="display:none;"></div>' : ''}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn secondary" id="close-view-btn">Zamknij</button>
        <button class="btn" id="edit-from-view-btn">Edytuj</button>
        <button class="btn danger-outline" id="delete-from-view-btn">Usuń</button>
      </div>
    `, {wide:true});

    function refreshStaticRows(){
      const cur = findItem(id) || item;
      const statusLabel = STATUS_LABELS[cur.status] || cur.status || "—";
      const ratingVal = parseInt(cur.rating||0,10);
      const ratingTxt = ratingVal ? `${ratingVal}/10` : "—";
      overlay.querySelector("#view-status-row").innerHTML = `<div class="vlabel">Status:</div><div class="vval">${escapeHtml(statusLabel)}</div>`;
      overlay.querySelector("#view-rating-row").innerHTML = `<div class="vlabel">Ocena:</div><div class="vval">${escapeHtml(ratingTxt)}</div>`;
    }

    function refreshProgress(){
      if (type!==TYPE_SERIES) return;
      const cur = findItem(id) || item;
      const p = formatProgress(cur);
      const progRow = overlay.querySelector("#view-progress-row");
      progRow.innerHTML = `<div class="vlabel">Postęp:</div><div class="vval">${escapeHtml(p.counts)}</div>`;
      const btn = overlay.querySelector("#mark-next-ep-btn");
      const titleEl = overlay.querySelector("#mark-next-ep-title");
      if (p.next && p.next!=="✓") {
        btn.style.display = "";
        btn.textContent = `✔ ${p.next}`;
        btn.disabled = false;
        if (titleEl) titleEl.textContent = p.nextTitle || "";
      } else {
        btn.style.display = "none";
        if (titleEl) titleEl.textContent = "";
      }
    }

    function refreshDescPane(){
      const cur = findItem(id) || item;
      const textEl = overlay.querySelector("#view-desc-text");
      const fetchBtn = overlay.querySelector("#view-desc-fetch-btn");
      if (cur.description && cur.description.trim()) {
        textEl.textContent = cur.description;
        textEl.classList.remove("muted");
        fetchBtn.textContent = "Odśwież opis";
      } else {
        textEl.textContent = "Brak opisu.";
        textEl.classList.add("muted");
        fetchBtn.textContent = "Pobierz opis";
      }
    }
    refreshDescPane();

    function refreshPoster(){
      const cur = findItem(id) || item;
      const img = overlay.querySelector("#view-poster-img");
      const placeholder = overlay.querySelector("#view-poster-placeholder");
      if (cur.poster_path) {
        img.src = tmdbPosterUrl(cur.poster_path, "w342");
        img.style.display = "";
        placeholder.style.display = "none";
      } else {
        img.style.display = "none";
        placeholder.style.display = "";
      }
    }
    refreshPoster();

    async function fetchPosterIfNeeded(){
      const cur = findItem(id) || item;
      if (cur.poster_path) return;
      try {
        let tid = cur.tmdb_id;
        if (!tid) {
          const hit = await tmdbSearch(cur.type, cur.title, cur.premiere_date);
          if (hit) { tid = hit.id; cur.tmdb_id = tid; }
        }
        if (!tid) return;
        const posterPath = await tmdbFetchPoster(cur.type, tid);
        if (posterPath) {
          cur.poster_path = posterPath;
          saveToLocalStorage();
          refreshPoster();
        }
      } catch(err) {
        // cicho ignoruj błąd pobierania okładki - nie blokuje okna informacji
      }
    }
    fetchPosterIfNeeded();

    overlay.querySelector("#view-poster-img").addEventListener("click", ()=>{
      const cur = findItem(id) || item;
      openPosterLightbox(tmdbPosterUrl(cur.poster_path, "w780"));
    });

    function refreshSeasonsPane(){
      if (type!==TYPE_SERIES) return;
      const cur = findItem(id) || item;
      const pane = overlay.querySelector("#vpane-seasons");
      if (!pane) return;
      pane.innerHTML = "";
      const seasons = cur.seasons || [];
      if (seasons.length===0) {
        const p = document.createElement("div");
        p.className = "muted";
        p.textContent = "Brak sezonów.";
        pane.appendChild(p);
        return;
      }
      const sorted = [...seasons].sort((a,b)=>(a.number||0)-(b.number||0));
      for (const season of sorted) {
        const box = document.createElement("div");
        box.className = "season-box";
        box.style.marginBottom = "10px";
        const total = (season.episodes||[]).length;
        box.innerHTML = `
          <div class="season-title">Sezon ${season.number} (${total} odc.)</div>
          <div class="episodes-list"></div>
        `;
        const epsList = box.querySelector(".episodes-list");
        if (total===0) {
          const p = document.createElement("div");
          p.className = "muted";
          p.textContent = "Brak odcinków w tym sezonie.";
          epsList.appendChild(p);
        } else {
          const sortedEps = [...season.episodes].sort((a,b)=>(a.number||0)-(b.number||0));
          for (const ep of sortedEps) {
            const row = document.createElement("div");
            row.className = "episode-row ep-static";
            row.innerHTML = `
              <label>${ep.watched ? '<span class="ep-check">✓</span>' : ''}<span class="ep-num">${ep.number}.</span><span class="ep-title-static">${escapeHtml(ep.title || ("Odcinek " + ep.number))}</span></label>
              <span class="ep-duration-static">${escapeHtml(String(ep.duration||0))} min</span>
            `;
            epsList.appendChild(row);
          }
        }
        pane.appendChild(box);
      }
    }

    const vtabInfo = overlay.querySelector("#vtab-info");
    const vtabDesc = overlay.querySelector("#vtab-desc");
    const vtabSeasons = overlay.querySelector("#vtab-seasons");
    const vpaneInfo = overlay.querySelector("#vpane-info");
    const vpaneDesc = overlay.querySelector("#vpane-desc");
    const vpaneSeasons = overlay.querySelector("#vpane-seasons");
    vtabInfo.addEventListener("click", ()=>{
      vtabInfo.classList.add("active"); vtabDesc.classList.remove("active");
      if (vtabSeasons) vtabSeasons.classList.remove("active");
      vpaneInfo.style.display=""; vpaneDesc.style.display="none";
      if (vpaneSeasons) vpaneSeasons.style.display="none";
    });
    vtabDesc.addEventListener("click", ()=>{
      vtabDesc.classList.add("active"); vtabInfo.classList.remove("active");
      if (vtabSeasons) vtabSeasons.classList.remove("active");
      vpaneInfo.style.display="none"; vpaneDesc.style.display="";
      if (vpaneSeasons) vpaneSeasons.style.display="none";
      refreshDescPane();
    });
    if (vtabSeasons) {
      vtabSeasons.addEventListener("click", ()=>{
        vtabSeasons.classList.add("active"); vtabInfo.classList.remove("active"); vtabDesc.classList.remove("active");
        vpaneInfo.style.display="none"; vpaneDesc.style.display="none";
        vpaneSeasons.style.display="";
        refreshSeasonsPane();
      });
    }

    overlay.querySelector("#view-desc-fetch-btn").addEventListener("click", async ()=>{
      const btn = overlay.querySelector("#view-desc-fetch-btn");
      const statusEl = overlay.querySelector("#view-desc-status");
      btn.disabled = true;
      const oldLabel = btn.textContent;
      btn.textContent = "Pobieranie…";
      statusEl.textContent = "";
      statusEl.classList.remove("err");
      try {
        const cur = findItem(id) || item;
        let tid = cur.tmdb_id;
        if (!tid) {
          const hit = await tmdbSearch(cur.type, cur.title, cur.premiere_date);
          if (hit) { tid = hit.id; cur.tmdb_id = tid; }
        }
        if (!tid) {
          statusEl.textContent = "Nie znaleziono pozycji w TMDb.";
          statusEl.classList.add("err");
          return;
        }
        const overview = await tmdbOverview(cur.type, tid);
        if (overview) {
          cur.description = overview;
          saveToLocalStorage();
          setDirty(true);
          statusEl.textContent = "Opis pobrany.";
        } else {
          statusEl.textContent = "Brak opisu w TMDb dla tej pozycji.";
        }
      } catch(err) {
        statusEl.textContent = err.message || String(err);
        statusEl.classList.add("err");
      } finally {
        btn.disabled = false;
        btn.textContent = oldLabel;
        refreshDescPane();
      }
    });

    refreshStaticRows();
    refreshProgress();

    requestAnimationFrame(()=>{
      const bodyEl = overlay.querySelector(".modal-body");
      if (bodyEl) {
        const h = bodyEl.getBoundingClientRect().height;
        bodyEl.style.flex = `0 0 ${h}px`;
        bodyEl.style.height = h + "px";
        bodyEl.style.maxHeight = h + "px";
      }
    });

    if (type===TYPE_SERIES) {
      overlay.querySelector("#mark-next-ep-btn").addEventListener("click", async (ev)=>{
        const btn = ev.currentTarget;
        const prevText = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Pobieranie…";
        try {
          await markNextEpisodeWatched(id);
        } finally {
          refreshStaticRows();
          refreshProgress();
        }
      });
    }

    function finish(result){
      closeOverlay(overlay);
      document.removeEventListener("keydown", onKey);
      resolve(result);
    }
    function onKey(e){ if (!isTopOverlay(overlay)) return; if (e.key==="Escape") finish(null); }
    document.addEventListener("keydown", onKey);

    overlay.querySelector("#close-view-btn").addEventListener("click", ()=>finish(null));
    overlay.querySelector("#delete-from-view-btn").addEventListener("click", async ()=>{
      const cur = findItem(id) || item;
      const ok = await showConfirm("Usuń pozycję", `Czy na pewno usunąć „${cur.title||""}”?`);
      if (!ok) return;
      db.items = db.items.filter(i=>i.id!==id);
      setDirty(true);
      renderAll();
      finish(null);
    });
    overlay.querySelector("#edit-from-view-btn").addEventListener("click", async ()=>{
      finish(null);
      await openEditDialog(id);
    });
  });
}

function openItemDialog({item, itemType}){
  return new Promise(resolve=>{
    const isNew = item==null;
    const type = isNew ? itemType : item.type;
    let seasons = isNew ? [] : JSON.parse(JSON.stringify(item.seasons||[]));
    let innerTab = "basic";

    const statusChoices = TYPE_STATUS_ORDER[type].filter(s=>s!==STATUS_PLANNED && s!==STATUS_UPCOMING);
    const statusOptions = statusChoices.map(s=>STATUS_LABELS[s]);
    const defaultStatus = STATUS_LABELS[statusChoices[0]];

    const overlay = openOverlay(`
      <div class="modal-header">${isNew ? "Dodaj pozycję" : "Edytuj pozycję"}</div>
      <div class="modal-body has-tabs">
        <div class="inner-tabs">
          <button class="tab-btn active" id="itab-basic" type="button">Dane podstawowe</button>
          ${type===TYPE_SERIES ? '<button class="tab-btn" id="itab-seasons" type="button">Sezony i odcinki</button>' : ''}
        </div>

        <div class="tab-scroll">
          <div id="pane-basic">
            <div class="tmdb-status" id="tmdb-status"></div>
            <div class="form-row"><label>Typ:</label><div class="value-static">${TYPE_LABELS[type]}</div></div>
            <div class="form-row"><label>Tytuł*:</label><div style="flex:1;position:relative;"><input class="entry" id="f-title" type="text" style="width:100%;" autocomplete="off"><div class="tmdb-suggest" id="tmdb-suggest" style="display:none;"></div></div></div>
            <div class="form-row"><label>Tytuł org.:</label><input class="entry" id="f-original-title" type="text" style="flex:1;" placeholder="opcjonalnie"></div>
            <div class="form-row"><label>Data (rok):</label><input class="entry" id="f-date" type="text" style="flex:1;"></div>
            ${type===TYPE_MOVIE ? '<div class="form-row"><label>Czas trwania (min):</label><input class="entry" id="f-duration" type="text" style="flex:1;"></div>' : ''}
            <div class="form-row"><label>Status:</label>
              <select class="entry" id="f-status" style="flex:1;">
                ${statusOptions.map(o=>`<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("")}
              </select>
            </div>
            <div class="form-row"><label>Ocena (0-10):</label>
              <select class="entry" id="f-rating" style="width:80px;flex:none;">
                ${Array.from({length:11},(_,i)=>`<option value="${i}">${i}</option>`).join("")}
              </select>
            </div>
            <div class="form-row" style="align-items:flex-start;">
              <label class="tags-label">Tagi:</label>
              <div style="flex:1;">
                <div id="tags-chip-list"></div>
                <input class="entry" id="f-tag-input" type="text" list="tag-suggestions">
                <datalist id="tag-suggestions"></datalist>
              </div>
            </div>
            <div class="form-row" style="align-items:flex-start;">
              <label>Opis:</label>
              <textarea class="entry" id="f-description" rows="5" style="flex:1;resize:vertical;font-weight:500;line-height:1.5;"></textarea>
            </div>
            <div class="error-text" id="dup-error"></div>
          </div>

          ${type===TYPE_SERIES ? `
          <div id="pane-seasons" style="display:none;">
            <button class="btn small" id="btn-fetch-seasons" type="button">Pobierz</button>
            <button class="btn small" id="btn-add-season" type="button" style="display:none;margin-left:6px;">Dodaj sezon</button>
            <div id="seasons-list" style="margin-top:10px;"></div>
          </div>` : ''}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn secondary" id="cancel-item-btn">Anuluj</button>
        <button class="btn" id="save-item-btn">Zapisz</button>
      </div>
    `, {wide:true});

    const titleInput = overlay.querySelector("#f-title");
    const originalTitleInput = overlay.querySelector("#f-original-title");
    const dateInput = overlay.querySelector("#f-date");
    const durationInput = overlay.querySelector("#f-duration");
    const statusSelect = overlay.querySelector("#f-status");
    const ratingSelect = overlay.querySelector("#f-rating");
    const descriptionInput = overlay.querySelector("#f-description");
    const dupError = overlay.querySelector("#dup-error");

    statusSelect.value = defaultStatus;
    ratingSelect.value = "0";

    if (!isNew) {
      titleInput.value = item.title || "";
      originalTitleInput.value = item.original_title || "";
      dateInput.value = item.premiere_date || "";
      if (type===TYPE_MOVIE && durationInput) durationInput.value = item.duration ? String(item.duration) : "";
      statusSelect.value = STATUS_LABELS[item.status] || defaultStatus;
      ratingSelect.value = String(parseInt(item.rating||0,10));
      descriptionInput.value = item.description || "";
    }
    titleInput.focus();

    let tmdbId = isNew ? null : (item.tmdb_id || null);
    const tmdbStatus = overlay.querySelector("#tmdb-status");

    function setTmdbStatus(msg, isErr){
      tmdbStatus.textContent = msg || "";
      tmdbStatus.classList.toggle("err", !!isErr);
    }

    const suggestBox = overlay.querySelector("#tmdb-suggest");
    let suggestTimer = null;
    let suggestItems = [];
    let suggestActive = -1;
    let applyingSuggestion = false;

    function hideSuggest(){
      suggestBox.style.display = "none";
      suggestBox.innerHTML = "";
      suggestItems = [];
      suggestActive = -1;
    }

    function sugTitle(r){ return (type===TYPE_MOVIE ? r.title : r.name) || (type===TYPE_MOVIE ? r.original_title : r.original_name) || ""; }
    function sugOriginal(r){ return (type===TYPE_MOVIE ? r.original_title : r.original_name) || ""; }
    function sugDate(r){ return (type===TYPE_MOVIE ? r.release_date : r.first_air_date) || ""; }

    function renderSuggest(results){
      suggestItems = results;
      suggestActive = -1;
      suggestBox.innerHTML = "";
      if (!results.length) { hideSuggest(); return; }
      results.forEach((r, idx)=>{
        const el = document.createElement("div");
        el.className = "sug";
        const t = sugTitle(r);
        const orig = sugOriginal(r);
        const year = (sugDate(r)||"").slice(0,4);
        el.innerHTML = `<span>${escapeHtml(t)}${year ? " (" + escapeHtml(year) + ")" : ""}</span>` +
          (orig && orig!==t ? `<span class="sug-sub">${escapeHtml(orig)}</span>` : "");
        el.addEventListener("mousedown", (e)=>{ e.preventDefault(); applySuggestion(r); });
        suggestBox.appendChild(el);
      });
      suggestBox.style.display = "";
    }

    function highlightSuggest(dir){
      if (!suggestItems.length) return;
      suggestActive = (suggestActive + dir + suggestItems.length) % suggestItems.length;
      [...suggestBox.children].forEach((c,i)=>c.classList.toggle("active", i===suggestActive));
    }

    async function applySuggestion(r){
      applyingSuggestion = true;
      hideSuggest();
      tmdbId = r.id;
      titleInput.value = sugTitle(r);
      const orig = sugOriginal(r);
      originalTitleInput.value = (orig && orig!==titleInput.value) ? orig : "";
      const d = sugDate(r);
      if (d) dateInput.value = d.slice(0,4);
      setTmdbStatus("Pobieranie szczegółów z TMDb…");
      try {
        if (type===TYPE_MOVIE) {
          const runtime = await tmdbMovieRuntime(r.id);
          if (durationInput && runtime) durationInput.value = String(runtime);
          const overview = await tmdbOverview(type, r.id);
          if (descriptionInput && overview) descriptionInput.value = overview;
          setTmdbStatus("Uzupełniono dane z TMDb" + (runtime ? ` (czas: ${runtime} min).` : "."));
        } else {
          const details = await tmdbFetch("/tv/" + r.id, {});
          const fetched = [];
          if (details && Array.isArray(details.seasons)) {
            for (const s of details.seasons) {
              const sn = Number(s.season_number);
              if (!sn || sn < 1) continue;
              const eps = await tmdbSeasonEpisodes(r.id, sn);
              const episodes = (eps||[]).map(e=>({number: e.episode_number, watched:false, duration: e.runtime||0, title: e.name||""})).filter(e=>e.number>0);
              fetched.push({number: sn, episodes});
            }
          }
          fetched.sort((a,b)=>(a.number||0)-(b.number||0));
          if (fetched.length) {
            seasons = fetched;
            renderSeasonsList();
          }
          const epCount = fetched.reduce((a,s)=>a+s.episodes.length, 0);
          const overview = await tmdbOverview(type, r.id);
          if (descriptionInput && overview) descriptionInput.value = overview;
          setTmdbStatus(`Uzupełniono dane z TMDb: ${fetched.length} sezonów, ${epCount} odcinków.`);
        }
      } catch(err) {
        setTmdbStatus(err.message || String(err), true);
      }
      applyingSuggestion = false;
    }

    async function runSuggest(){
      const q = titleInput.value.trim();
      if (q.length < 2 || !getStoredTmdbKey()) { hideSuggest(); return; }
      try {
        const results = await tmdbSearchList(type, q);
        if (titleInput.value.trim() !== q) return;
        renderSuggest(results);
      } catch(err) {
        hideSuggest();
      }
    }

    titleInput.addEventListener("input", ()=>{
      if (applyingSuggestion) return;
      tmdbId = null;
      if (suggestTimer) clearTimeout(suggestTimer);
      suggestTimer = setTimeout(runSuggest, 350);
    });
    titleInput.addEventListener("keydown", (e)=>{
      if (suggestBox.style.display === "none") return;
      if (e.key === "ArrowDown") { e.preventDefault(); highlightSuggest(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); highlightSuggest(-1); }
      else if (e.key === "Enter" && suggestActive >= 0) { e.preventDefault(); applySuggestion(suggestItems[suggestActive]); }
      else if (e.key === "Escape") { e.stopPropagation(); hideSuggest(); }
    });
    titleInput.addEventListener("blur", ()=>{ setTimeout(hideSuggest, 150); });

    async function ensureTmdbId(){
      if (tmdbId) return tmdbId;
      const title = titleInput.value.trim();
      if (!title) throw new Error("Najpierw wpisz tytuł.");
      const hit = await tmdbSearch(type, title, dateInput.value.trim());
      if (!hit) throw new Error("Nie znaleziono w TMDb: " + title);
      tmdbId = hit.id;
      return tmdbId;
    }

    async function autoMovieRuntime(){
      if (type!==TYPE_MOVIE || !durationInput) return;
      if (durationInput.value.trim()) return;
      try {
        setTmdbStatus("Pobieranie czasu trwania z TMDb…");
        const id = await ensureTmdbId();
        const runtime = await tmdbMovieRuntime(id);
        if (runtime) {
          durationInput.value = String(runtime);
          setTmdbStatus("Czas trwania pobrany z TMDb: " + runtime + " min.");
        } else {
          setTmdbStatus("TMDb nie podaje czasu trwania tego filmu.", true);
        }
      } catch(err) {
        setTmdbStatus(err.message || String(err), true);
      }
    }

    async function autoSeasonDurations(season){
      const missing = (season.episodes||[]).filter(e=>e.watched && !e.duration);
      if (missing.length===0) return;
      try {
        setTmdbStatus(`Pobieranie czasów odcinków (sezon ${season.number}) z TMDb…`);
        const id = await ensureTmdbId();
        const eps = await tmdbSeasonEpisodes(id, season.number);
        let filled = 0;
        for (const ep of missing) {
          const match = eps.find(e=>e.episode_number===ep.number);
          if (match && match.runtime) { ep.duration = match.runtime; filled++; }
        }
        renderSeasonsList();
        if (filled>0) setTmdbStatus(`Sezon ${season.number}: pobrano czas dla ${filled} z ${missing.length} odcinków (TMDb).`, filled<missing.length);
        else setTmdbStatus(`TMDb nie podaje czasów odcinków dla sezonu ${season.number}.`, true);
      } catch(err) {
        setTmdbStatus(err.message || String(err), true);
      }
    }

    let titlesBackfillDone = false;
    async function autoFillEpisodeTitles(){
      if (titlesBackfillDone) return;
      const missingSeasons = seasons.filter(s=>(s.episodes||[]).some(e=>isGenericEpisodeName(e.title, e.number)));
      if (missingSeasons.length===0) { titlesBackfillDone = true; return; }
      if (!tmdbId && !getStoredTmdbKey()) return;
      titlesBackfillDone = true;
      try {
        const id = await ensureTmdbId();
        let filled = 0;
        for (const season of missingSeasons) {
          const eps = await tmdbSeasonEpisodes(id, season.number);
          for (const ep of season.episodes) {
            if (ep.title) continue;
            const match = eps.find(e=>e.episode_number===ep.number);
            if (match && match.name) { ep.title = match.name; filled++; }
          }
        }
        if (filled>0) {
          renderSeasonsList();
          setTmdbStatus(`Uzupełniono nazwy ${filled} odcinków z TMDb.`);
        }
      } catch(err) {
        // cichy błąd - brak nazw nie blokuje pracy z sezonami
      }
    }

    async function autoEpisodeDuration(season, ep, durInput){
      if (ep.duration) return;
      try {
        setTmdbStatus("Pobieranie czasu odcinka z TMDb…");
        const id = await ensureTmdbId();
        const eps = await tmdbSeasonEpisodes(id, season.number);
        const match = eps.find(e=>e.episode_number===ep.number);
        if (match && match.runtime) {
          ep.duration = match.runtime;
          if (durInput) durInput.value = String(ep.duration);
          setTmdbStatus(`Sezon ${season.number}, odcinek ${ep.number}: ${ep.duration} min (TMDb).`);
          renderSeasonsList();
        } else {
          setTmdbStatus(`TMDb nie podaje czasu odcinka ${ep.number} (sezon ${season.number}).`, true);
        }
      } catch(err) {
        setTmdbStatus(err.message || String(err), true);
      }
    }

    if (type===TYPE_MOVIE && durationInput) {
      statusSelect.addEventListener("change", ()=>{
        if (LABEL_TO_STATUS[statusSelect.value]===STATUS_WATCHED) autoMovieRuntime();
      });
      durationInput.addEventListener("dblclick", ()=>autoMovieRuntime());
    }

    let tags = isNew ? [] : [...(item.tags||[])];
    const tagsChipList = overlay.querySelector("#tags-chip-list");
    const tagInput = overlay.querySelector("#f-tag-input");
    const tagSuggestions = overlay.querySelector("#tag-suggestions");
    tagSuggestions.innerHTML = getAllTags().map(t=>`<option value="${escapeHtml(t)}"></option>`).join("");

    function renderTagChips(){
      tagsChipList.innerHTML = "";
      for (const tag of tags) {
        const chip = document.createElement("span");
        chip.className = "tag-chip";
        const label = document.createElement("span");
        label.textContent = tag;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "tag-remove";
        removeBtn.textContent = "✕";
        removeBtn.title = "Usuń tag";
        removeBtn.addEventListener("click", ()=>{
          tags = tags.filter(t=>t!==tag);
          renderTagChips();
        });
        chip.appendChild(label);
        chip.appendChild(removeBtn);
        tagsChipList.appendChild(chip);
      }
    }
    function addTagFromInput(){
      const raw = tagInput.value.split(",");
      let added = false;
      for (let piece of raw) {
        const val = piece.trim();
        if (!val) continue;
        if (!tags.some(t=>t.toLowerCase()===val.toLowerCase())) { tags.push(val); added = true; }
      }
      if (added) renderTagChips();
      tagInput.value = "";
    }
    tagInput.addEventListener("keydown", (e)=>{
      if (e.key==="Enter" || e.key===",") {
        e.preventDefault();
        addTagFromInput();
      }
    });
    tagInput.addEventListener("blur", ()=>{ if (tagInput.value.trim()) addTagFromInput(); });
    renderTagChips();

    if (type===TYPE_SERIES) {
      const tabBasic = overlay.querySelector("#itab-basic");
      const tabSeasons = overlay.querySelector("#itab-seasons");
      const paneBasic = overlay.querySelector("#pane-basic");
      const paneSeasons = overlay.querySelector("#pane-seasons");
      tabBasic.addEventListener("click", ()=>{
        innerTab="basic"; tabBasic.classList.add("active"); tabSeasons.classList.remove("active");
        paneBasic.style.display=""; paneSeasons.style.display="none";
      });
      tabSeasons.addEventListener("click", ()=>{
        innerTab="seasons"; tabSeasons.classList.add("active"); tabBasic.classList.remove("active");
        paneBasic.style.display="none"; paneSeasons.style.display="";
        autoFillEpisodeTitles();
      });
      const addSeasonBtn = overlay.querySelector("#btn-add-season");
      if (addSeasonBtn) addSeasonBtn.style.display = "";
      renderSeasonsList();
    }

    function renderSeasonsList(){
      const list = overlay.querySelector("#seasons-list");
      if (!list) return;
      list.innerHTML = "";
      if (seasons.length===0) {
        const p = document.createElement("div");
        p.className = "muted";
        p.textContent = "Brak sezonów. Kliknij „Pobierz”, aby pobrać sezony i odcinki z TMDb.";
        list.appendChild(p);
        return;
      }
      const sorted = [...seasons].sort((a,b)=>(a.number||0)-(b.number||0));
      for (const season of sorted) {
        list.appendChild(buildSeasonBox(season));
      }
    }

    function buildSeasonBox(season){
      const watchedCount = (season.episodes||[]).filter(e=>e.watched).length;
      const total = (season.episodes||[]).length;
      const seasonMinutes = (season.episodes||[]).filter(e=>e.watched).reduce((a,e)=>a+(e.duration||0),0);

      const canEdit = true;

      const box = document.createElement("div");
      box.className = "season-box";
      box.innerHTML = `
        <div class="season-title">Sezon ${season.number}  (${watchedCount}/${total} obejrzane, ${escapeHtml(formatDuration(seasonMinutes))} obejrzane)</div>
        <div class="season-actions">
          <button class="btn small" data-act="check-all">Zaznacz cały</button>
          <button class="btn small" data-act="uncheck-all">Odznacz cały</button>
          ${canEdit ? '<button class="btn small secondary" data-act="remove-season">Usuń sezon</button>' : ''}
        </div>
        <div class="episodes-list"></div>
      `;
      const epsList = box.querySelector(".episodes-list");
      if (total===0) {
        const p = document.createElement("div");
        p.className = "muted";
        p.textContent = "Brak odcinków w tym sezonie.";
        epsList.appendChild(p);
      } else {
        const sortedEps = [...season.episodes].sort((a,b)=>(a.number||0)-(b.number||0));
        for (const ep of sortedEps) epsList.appendChild(buildEpisodeRow(season, ep));
      }

      box.querySelector('[data-act="check-all"]').addEventListener("click", async ()=>{
        for (const e of season.episodes) e.watched = true;
        renderSeasonsList();
        await autoSeasonDurations(season);
      });
      box.querySelector('[data-act="uncheck-all"]').addEventListener("click", ()=>{
        for (const e of season.episodes) e.watched = false;
        renderSeasonsList();
      });
      const removeBtn = box.querySelector('[data-act="remove-season"]');
      if (removeBtn) removeBtn.addEventListener("click", async ()=>{
        const ok = await showConfirm("Usuń sezon", `Czy na pewno usunąć Sezon ${season.number} wraz ze wszystkimi odcinkami?`);
        if (!ok) return;
        seasons = seasons.filter(s=>s!==season);
        renderSeasonsList();
      });

      return box;
    }

    function buildEpisodeRow(season, ep){
      const canEdit = true;
      const row = document.createElement("div");
      row.className = "episode-row";
      if (canEdit) {
        row.innerHTML = `
          <label><input type="checkbox" ${ep.watched?"checked":""}><span class="ep-num">${ep.number}.</span><input type="text" class="ep-title-input" value="${escapeHtml(ep.title||"")}" placeholder="Odcinek ${ep.number}"></label>
          <input type="number" min="0" value="${ep.duration||0}">
          <span class="muted">min</span>
          <button type="button" class="ep-delete-btn" title="Usuń odcinek">✕</button>
        `;
      } else {
        row.classList.add("ep-static");
        row.innerHTML = `
          <label><input type="checkbox" ${ep.watched?"checked":""}><span class="ep-num">${ep.number}.</span><span class="ep-title-static">${escapeHtml(ep.title || ("Odcinek " + ep.number))}</span></label>
          <span class="ep-duration-static">${escapeHtml(String(ep.duration||0))} min</span>
        `;
      }
      const checkbox = row.querySelector('input[type="checkbox"]');

      checkbox.addEventListener("change", async ()=>{
        ep.watched = checkbox.checked;
        if (ep.watched && !ep.duration) {
          const durInput = row.querySelector('input[type="number"]');
          await autoEpisodeDuration(season, ep, durInput);
        }
        renderSeasonsList();
      });

      if (canEdit) {
        const durInput = row.querySelector('input[type="number"]');
        const titleInput = row.querySelector('.ep-title-input');
        const deleteBtn = row.querySelector('.ep-delete-btn');
        titleInput.addEventListener("input", ()=>{
          ep.title = titleInput.value;
        });
        titleInput.addEventListener("keydown", (e)=>{ if (e.key==="Enter") titleInput.blur(); });
        durInput.addEventListener("change", ()=>{
          const v = parseInt(durInput.value,10);
          ep.duration = Number.isFinite(v) && v>=0 ? v : 0;
          durInput.value = ep.duration;
        });
        deleteBtn.addEventListener("click", async ()=>{
          const ok = await showConfirm("Usuń odcinek", `Czy na pewno usunąć odcinek ${ep.number}?`);
          if (!ok) return;
          season.episodes = season.episodes.filter(e=>e!==ep);
          renderSeasonsList();
        });
      }
      return row;
    }

    if (type===TYPE_SERIES) {
      const addSeasonBtn2 = overlay.querySelector("#btn-add-season");
      if (addSeasonBtn2) addSeasonBtn2.addEventListener("click", async ()=>{
        const nextNumber = seasons.length ? Math.max(...seasons.map(s=>s.number||0))+1 : 1;
        const result = await showAddSeasonPrompt(nextNumber);
        if (!result) return;
        if (seasons.some(s=>s.number===result.number)) {
          await showAlert("Sezon istnieje", `Sezon ${result.number} już istnieje na liście.`, "error");
          return;
        }
        const episodes = [];
        for (let i=1; i<=result.count; i++) episodes.push({number:i, watched:false, duration:0, title:""});
        seasons.push({number: result.number, episodes});
        renderSeasonsList();
      });
      overlay.querySelector("#btn-fetch-seasons").addEventListener("click", async ()=>{
        try {
          setTmdbStatus("Pobieranie sezonów i odcinków z TMDb…");
          const id = await ensureTmdbId();
          const details = await tmdbFetch("/tv/" + id, {});
          if (!details || !Array.isArray(details.seasons)) { setTmdbStatus("TMDb nie zwrócił danych o sezonach.", true); return; }
          const fetched = [];
          for (const s of details.seasons) {
            const sn = Number(s.season_number);
            if (!sn || sn < 1) continue;
            const eps = await tmdbSeasonEpisodes(id, sn);
            const episodes = (eps||[]).map(e=>({number: e.episode_number, watched:false, duration: e.runtime||0, title: e.name||""})).filter(e=>e.number>0);
            fetched.push({number: sn, episodes});
          }
          fetched.sort((a,b)=>(a.number||0)-(b.number||0));
          seasons = fetched;
          renderSeasonsList();
          setTmdbStatus("Pobrano " + seasons.length + " sezonów z TMDb.", false);
        } catch(err) {
          setTmdbStatus(err.message || String(err), true);
        }
      });
    }

    function finish(result){
      closeOverlay(overlay);
      document.removeEventListener("keydown", onKey);
      resolve(result);
    }
    function onKey(e){ if (!isTopOverlay(overlay)) return; if (e.key==="Escape") finish(null); }
    document.addEventListener("keydown", onKey);

    overlay.querySelector("#cancel-item-btn").addEventListener("click", ()=>finish(null));

    overlay.querySelector("#save-item-btn").addEventListener("click", async ()=>{
      dupError.textContent = "";
      const title = titleInput.value.trim();
      if (!title) {
        await showAlert("Brak tytułu", "Pole „Tytuł” jest wymagane.", "error");
        return;
      }
      let duration = null;
      if (type===TYPE_MOVIE) {
        const durStr = durationInput.value.trim();
        if (durStr) {
          if (!/^\d+$/.test(durStr)) {
            await showAlert("Błędny czas trwania", "Czas trwania musi być liczbą całkowitą (w minutach).", "error");
            return;
          }
          duration = parseInt(durStr,10);
        }
      }
      const statusKey = LABEL_TO_STATUS[statusSelect.value] || STATUS_WATCHING;
      const premiereDate = dateInput.value.trim();
      const excludeId = isNew ? null : item.id;
      const duplicate = findDuplicate(type, title, premiereDate, excludeId);
      if (duplicate) {
        const dupStatusLabel = STATUS_LABELS[duplicate.status] || duplicate.status || "";
        const dateTxt = premiereDate || "brak daty";
        const dupLp = computeLp(duplicate.type, duplicate.status, duplicate.id);
        const lpTxt = dupLp!=null ? `Lp ${dupLp}` : "nieznana pozycja";
        await showAlert(
          "Duplikat pozycji",
          `Pozycja „${title}” (${dateTxt}) już istnieje na liście ${TYPE_LABELS[type]} w zakładce „${dupStatusLabel}” (${lpTxt}).\n\n` +
          `Nie można zapisać/przenieść tej pozycji, ponieważ powstałby duplikat (ten sam tytuł i ta sama data).`,
          "error"
        );
        return;
      }

      const resultItem = isNew ? {id: uuidv4(), type} : item;
      resultItem.title = title;
      const origTitleVal = originalTitleInput.value.trim();
      if (origTitleVal) resultItem.original_title = origTitleVal;
      else delete resultItem.original_title;
      resultItem.premiere_date = premiereDate;
      resultItem.status = statusKey;
      resultItem.rating = parseInt(ratingSelect.value||"0",10);
      resultItem.tags = [...tags];
      resultItem.description = descriptionInput.value.trim();
      if (tmdbId) resultItem.tmdb_id = tmdbId;
      if (type===TYPE_MOVIE) {
        resultItem.duration = duration;
      } else {
        resultItem.seasons = seasons;
      }
      finish(resultItem);
    });
  });
}

