// ============================================================
// settings.js — zakładka ustawień, aktualizacje
// ============================================================

function renderSettingsTab(){
  const input = document.getElementById("set-tmdb-key");
  if (!input) return;
  input.value = (db.settings && db.settings.tmdb_key) || "";
  const auto = document.getElementById("set-tmdb-auto");
  if (auto) auto.checked = !!(db.settings && db.settings.tmdb_auto);
  const curVer = (db.settings && db.settings.ui_version) || "v2";
  const v1Btn = document.getElementById("set-ui-v1");
  const v2Btn = document.getElementById("set-ui-v2");
  const v3Btn = document.getElementById("set-ui-v3");
  if (v1Btn) v1Btn.classList.toggle("active", curVer === "v1");
  if (v2Btn) v2Btn.classList.toggle("active", curVer === "v2");
  if (v3Btn) v3Btn.classList.toggle("active", curVer === "v3");
}

function setSettingsStatus(msg, isErr){
  const el = document.getElementById("set-tmdb-status");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("err", !!isErr);
}

function initSettingsTab(){
  const input = document.getElementById("set-tmdb-key");
  document.getElementById("set-tmdb-save").addEventListener("click", ()=>{
    setStoredTmdbKey(input.value.trim());
    setSettingsStatus(input.value.trim() ? "Klucz API zapisany (baza JSON + przeglądarka)." : "Klucz API wyczyszczony.");
    setDirty(true);
  });
  document.getElementById("set-tmdb-clear").addEventListener("click", ()=>{
    setStoredTmdbKey("");
    setSettingsStatus("Klucz API wyczyszczony.");
    setDirty(true);
  });
  document.getElementById("set-tmdb-test").addEventListener("click", async ()=>{
    setStoredTmdbKey(input.value.trim());
    setSettingsStatus("Sprawdzanie połączenia z TMDb…");
    try {
      const res = await tmdbFetch("/configuration", {});
      setSettingsStatus(res ? "Połączenie z TMDb działa — klucz jest poprawny." : "Brak klucza API.", !res);
    } catch(err) {
      setSettingsStatus(err.message || String(err), true);
    }
  });
  document.getElementById("set-tmdb-auto").addEventListener("change", (e)=>{
    if (!db.settings) db.settings = {...DEFAULT_SETTINGS};
    db.settings.tmdb_auto = e.target.checked;
    saveToLocalStorage();
    setDirty(true);
  });
  document.getElementById("set-refresh-titles").addEventListener("click", refreshAllEpisodeTitles);
  document.getElementById("set-update-app").addEventListener("click", forceAppUpdate);
  for (const btn of [document.getElementById("set-ui-v1"), document.getElementById("set-ui-v2"), document.getElementById("set-ui-v3")]) {
    if (!btn) continue;
    btn.addEventListener("click", ()=>{
      if (!db.settings) db.settings = {...DEFAULT_SETTINGS};
      db.settings.ui_version = btn.dataset.ver;
      setDirty(true);
      renderSettingsTab();
      renderAll();
    });
  }
  renderSettingsTab();
}

async function forceAppUpdate(){
  const btn = document.getElementById("set-update-app");
  const statusEl = document.getElementById("set-update-status");
  const setStatus = (msg, isErr)=>{
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("err", !!isErr);
  };
  if (btn) { btn.disabled = true; btn.textContent = "Aktualizowanie…"; }
  setStatus("Czyszczenie pamięci podręcznej i pobieranie nowej wersji…");
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    setStatus("Pamięć wyczyszczona — przeładowuję aplikację…");
    setTimeout(()=>{
      const url = new URL(window.location.href);
      url.searchParams.set("upd", Date.now().toString());
      window.location.replace(url.toString());
    }, 400);
  } catch(err) {
    if (btn) { btn.disabled = false; btn.textContent = "Aktualizacja"; }
    setStatus(err.message || String(err), true);
  }
}

async function refreshAllEpisodeTitles(){
  const btn = document.getElementById("set-refresh-titles");
  const statusEl = document.getElementById("set-refresh-titles-status");
  const setStatus = (msg, isErr)=>{
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("err", !!isErr);
  };
  const key = await ensureTmdbKey(false);
  if (!key) { setStatus("Brak klucza API TMDb — podaj go powyżej.", true); return; }

  const allItems = db.items.filter(i=>i.type===TYPE_SERIES || i.type===TYPE_MOVIE);
  if (allItems.length===0) { setStatus("Brak pozycji w bazie."); return; }

  btn.disabled = true;
  const oldLabel = btn.textContent;
  let done = 0, updatedEpisodes = 0, updatedSeries = 0, updatedDesc = 0, updatedPosters = 0, updatedGenres = 0, updatedCast = 0, updatedCreators = 0, updatedOrigin = 0, updatedExtras = 0, updatedCollections = 0, errors = 0;
  const noMatchTitles = [];   // nie znaleziono powiązania z TMDb
  const noDescTitles = [];    // znaleziono powiązanie, ale brak opisu w TMDb
  const errorTitles = [];     // błąd podczas komunikacji z TMDb
  btn.textContent = `Sprawdzanie 0/${allItems.length}…`;

  for (const item of allItems) {
    done++;
    btn.textContent = `Sprawdzanie ${done}/${allItems.length}…`;
    setStatus(`Trwa: „${item.title}” (${done}/${allItems.length})…`);
    try {
      let tid = item.tmdb_id;
      if (!tid) {
        const hit = await tmdbSearch(item.type, item.title, item.premiere_date);
        if (hit) { tid = hit.id; item.tmdb_id = tid; }
      }
      if (!tid) { errors++; noMatchTitles.push(item.title || "(bez tytułu)"); continue; }

      if (!item.poster_path) {
        try {
          const posterPath = await tmdbFetchPoster(item.type, tid);
          if (posterPath) { item.poster_path = posterPath; updatedPosters++; }
        } catch(err) {
          // brak okładki nie jest błędem krytycznym - kontynuuj resztę aktualizacji
        }
      }

      if (!item.genres || !item.genres.length) {
        try {
          const genres = await tmdbFetchGenres(item.type, tid);
          if (genres && genres.length) { item.genres = genres; updatedGenres++; }
        } catch(err) {
          // brak gatunku nie jest błędem krytycznym - kontynuuj resztę aktualizacji
        }
      }

      if (!item.cast || !item.cast.length) {
        try {
          const cast = await tmdbFetchCast(item.type, tid);
          if (cast && cast.length) { item.cast = cast; updatedCast++; }
        } catch(err) {
          // brak obsady nie jest błędem krytycznym - kontynuuj resztę aktualizacji
        }
      }

      if (!item.creators || !item.creators.length) {
        try {
          const creators = await tmdbFetchCreators(item.type, tid);
          if (creators && creators.length) { item.creators = creators; updatedCreators++; }
        } catch(err) {
          // brak twórców nie jest błędem krytycznym - kontynuuj resztę aktualizacji
        }
      }

      if ((!item.production_countries || !item.production_countries.length) ||
          (!item.origin_country || !item.origin_country.length) ||
          !item.original_language) {
        try {
          const info = await tmdbFetchOriginInfo(item.type, tid);
          if (info) {
            let changed = false;
            if ((!item.production_countries || !item.production_countries.length) && info.productionCountries.length) { item.production_countries = info.productionCountries; changed = true; }
            if ((!item.origin_country || !item.origin_country.length) && info.originCountry.length) { item.origin_country = info.originCountry; changed = true; }
            if (!item.original_language && info.originalLanguage) { item.original_language = info.originalLanguage; changed = true; }
            if (changed) updatedOrigin++;
          }
        } catch(err) {
          // brak kraju/języka nie jest błędem krytycznym - kontynuuj resztę aktualizacji
        }
      }

      if ((!item.production_companies || !item.production_companies.length) || !item.trailer_key) {
        try {
          let extraChanged = false;
          if (!item.production_companies || !item.production_companies.length) {
            const extras = await tmdbFetchExtras(item.type, tid);
            if (extras && extras.companies.length) { item.production_companies = extras.companies; extraChanged = true; }
          }
          if (!item.trailer_key) {
            const trailerKey = await tmdbFetchTrailerKey(item.type, tid);
            if (trailerKey) { item.trailer_key = trailerKey; extraChanged = true; }
          }
          if (extraChanged) updatedExtras++;
        } catch(err) {
          // brak dodatkowych informacji nie jest błędem krytycznym - kontynuuj resztę aktualizacji
        }
      }

      if (item.type===TYPE_MOVIE) {
        try {
          const added = await syncItemCollectionFromTmdb(item, tid);
          if (added > 0) updatedCollections++;
        } catch(err) {
          // brak/błąd kolekcji nie jest błędem krytycznym - kontynuuj resztę aktualizacji
        }
      }

      if (item.type===TYPE_SERIES && Array.isArray(item.seasons) && item.seasons.length>0) {
        let itemUpdated = 0;
        for (const season of item.seasons) {
          const eps = await tmdbSeasonEpisodes(tid, season.number, true);
          for (const ep of (season.episodes||[])) {
            const match = (eps||[]).find(e=>e.episode_number===ep.number);
            if (match && match.name && match.name !== ep.title) { ep.title = match.name; itemUpdated++; }
            if (match && match.overview && match.overview !== (ep.overview||"")) { ep.overview = match.overview; itemUpdated++; }
          }
          if (eps) {
            if (eps.season_overview && eps.season_overview !== (season.overview||"")) season.overview = eps.season_overview;
            if (eps.season_air_date && eps.season_air_date !== (season.air_date||"")) season.air_date = eps.season_air_date;
          }
          // krótka przerwa między kolejnymi sezonami - dzięki dwóm niezależnym
          // usługom tłumaczeniowym (Google Translate + MyMemory) ryzyko
          // wpadnięcia w limit jest dużo mniejsze, więc nie trzeba już czekać
          // tak długo jak przy jednej usłudze
          await new Promise(r => setTimeout(r, 400));
        }
        if (itemUpdated>0) { updatedEpisodes += itemUpdated; updatedSeries++; }
      }

      const overview = await tmdbOverview(item.type, tid);
      if (overview && overview !== (item.description||"")) {
        item.description = overview;
        updatedDesc++;
      } else if (!overview && !(item.description||"").trim()) {
        noDescTitles.push(item.title || "(bez tytułu)");
      }
    } catch(err) {
      errors++;
      errorTitles.push(`${item.title || "(bez tytułu)"} — ${err.message || err}`);
    }
  }

  btn.disabled = false;
  btn.textContent = oldLabel;
  const anyChange = updatedEpisodes>0 || updatedDesc>0 || updatedPosters>0 || updatedGenres>0 || updatedCast>0 || updatedCreators>0 || updatedOrigin>0 || updatedExtras>0 || updatedCollections>0;
  if (anyChange) { saveToLocalStorage(); setDirty(true); renderAll(); }

  if (anyChange) {
    const parts = [];
    if (updatedEpisodes>0) parts.push(`${updatedEpisodes} ${updatedEpisodes===1?"pole (nazwa/opis) odcinka":"pól (nazwy/opisy) odcinków"} w ${updatedSeries} ${updatedSeries===1?"serialu":"serialach"}`);
    if (updatedDesc>0) parts.push(`${updatedDesc} ${updatedDesc===1?"opis":"opisów"}`);
    if (updatedPosters>0) parts.push(`${updatedPosters} ${updatedPosters===1?"okładkę":"okładek"}`);
    if (updatedGenres>0) parts.push(`${updatedGenres} ${updatedGenres===1?"gatunek":"gatunków"}`);
    if (updatedCast>0) parts.push(`${updatedCast} ${updatedCast===1?"obsadę":"obsad"}`);
    if (updatedCreators>0) parts.push(`${updatedCreators} ${updatedCreators===1?"listę twórców":"list twórców"}`);
    if (updatedOrigin>0) parts.push(`${updatedOrigin} ${updatedOrigin===1?"kraj/język produkcji":"kraje/języki produkcji"}`);
    if (updatedExtras>0) parts.push(`${updatedExtras} ${updatedExtras===1?"komplet dodatkowych informacji":"kompletów dodatkowych informacji"} (wytwórnia, zwiastun)`);
    if (updatedCollections>0) parts.push(`${updatedCollections} ${updatedCollections===1?"kolekcję":"kolekcji"} (nowe części)`);
    setStatus(`Gotowe: zaktualizowano ${parts.join(" oraz ")}` + (errors>0 ? ` (${errors} pozycji pominięto).` : "."));
  } else {
    setStatus("Sprawdzono ponownie — nic nie wymagało aktualizacji." + (errors>0 ? ` (${errors} pozycji pominięto — brak dopasowania w TMDb.)` : ""), errors>0);
  }

  if (noMatchTitles.length || noDescTitles.length || errorTitles.length) {
    const sections = [];
    if (noMatchTitles.length) {
      sections.push(`Brak powiązania z TMDb (nie znaleziono pozycji):\n${noMatchTitles.map(t=>`• ${t}`).join("\n")}`);
    }
    if (noDescTitles.length) {
      sections.push(`Brak opisu w TMDb:\n${noDescTitles.map(t=>`• ${t}`).join("\n")}`);
    }
    if (errorTitles.length) {
      sections.push(`Błędy połączenia z TMDb:\n${errorTitles.map(t=>`• ${t}`).join("\n")}`);
    }
    await showAlert("Znaleziono problemy", sections.join("\n\n"), "error");
  }
}

async function checkUpcomingSeasons(){
  const btn = document.getElementById("btn-check");
  const key = await ensureTmdbKey(false);
  if (!key) { await showAlert("Brak klucza API", "Aby sprawdzić nadchodzące sezony, podaj klucz API TMDb w zakładce Ustawienia.", "error"); return; }

  const seriesItems = db.items.filter(i => i.type===TYPE_SERIES && (i.status===STATUS_WATCHING || i.status===STATUS_WATCHED));
  const upcoming = [];
  const errors = [];
  const ignored = Array.isArray(db.upcoming_ignored) ? db.upcoming_ignored : [];
  const prevKeys = (db.upcoming || []).map(upcomingKeyOf);
  let done = 0;
  const oldLabel = btn.textContent;
  btn.disabled = true;
  const tick = ()=>{ done++; btn.textContent = `Sprawdzam ${done}/${seriesItems.length}…`; };
  btn.textContent = `Sprawdzam 0/${seriesItems.length}…`;

  async function processItem(item){
    try{
      let tid = item.tmdb_id;
      if (!tid) {
        const hit = await tmdbSearch(TYPE_SERIES, item.title, item.premiere_date);
        if (hit) { tid = hit.id; item.tmdb_id = tid; }
      }
      if (!tid) return;
      const details = await tmdbFetch("/tv/" + tid, {});
      if (!details || !Array.isArray(details.seasons)) return;
      const localMax = (item.seasons||[]).reduce((m,s)=>Math.max(m, Number(s.number)||0), 0);
      const nextNum = localMax + 1;
      const season = details.seasons.find(s=>Number(s.season_number)===nextNum);
      if (!season) return;
      const days = daysUntil(season.air_date);
      if (days === null) return;
      const entry = {
        item_id: item.id,
        title: item.title,
        original_title: item.original_title || null,
        season_number: nextNum,
        air_date: season.air_date,
        episode_count: Number(season.episode_count) || 0,
      };
      if (ignored.includes(upcomingKeyOf(entry))) return;
      upcoming.push(entry);
    }catch(err){
      errors.push(`${item.title}: ${err.message || err}`);
    }
  }

  try{
    const queue = seriesItems.slice();
    const workers = Array.from({length: Math.min(5, queue.length || 1)}, async ()=>{
      while (queue.length) {
        const item = queue.shift();
        await processItem(item);
        tick();
      }
    });
    await Promise.all(workers);
  } finally {
    btn.disabled = false;
    btn.textContent = oldLabel;
  }

  db.upcoming = upcoming;
  setDirty(true);
  renderAll();

  const fresh = upcoming.filter(e => !prevKeys.includes(upcomingKeyOf(e)));
  if (fresh.length) {
    await showAlert(
      "Nowe nadchodzące sezony",
      `Do zakładki „Nowości” dodano:\n\n${fresh
        .map(e => `• ${e.title} — sezon ${e.season_number}, ${formatDaysLabel(daysUntil(e.air_date))}`)
        .join("\n")}`,
      "info"
    );
  } else {
    await showAlert(
      "Nowości",
      upcoming.length
        ? `Brak nowych pozycji.\nNadchodzące seriale: ${upcoming.length} — sprawdź zakładkę „Nowości”.`
        : "Brak nadchodzących seriali ze znaną datą premiery.",
      "info"
    );
  }
  if (errors.length) {
    await showAlert("Ostrzeżenia", errors.slice(0,10).join("\n"), "error");
  }
}

document.getElementById("btn-check").addEventListener("click", ()=>{ checkUpcomingSeasons(); });

