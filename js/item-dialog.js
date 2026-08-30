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

// Sprawdza, czy pozycja dodawana/edytowana jako "Planowane" nie powiela już
// istniejącej pozycji o tym samym tytule w innej, "wyższej" zakładce
// (dla filmów: Zakończone; dla seriali: Zakończone lub Oglądane), a także
// czy taki tytuł nie jest już w samych Planowanych. Porównanie tylko po
// tytule (bez daty premiery), bo w planach data bywa nieznana/inna.
function findPlannedConflict(type, title, excludeId){
  const normTitle = title.trim().toLowerCase();
  if (!normTitle) return null;
  const relevantStatuses = type===TYPE_MOVIE
    ? [STATUS_WATCHED, STATUS_PLANNED]
    : [STATUS_WATCHED, STATUS_WATCHING, STATUS_PLANNED];
  for (const other of db.items) {
    if (other.type !== type) continue;
    if (excludeId!=null && other.id===excludeId) continue;
    if (!relevantStatuses.includes(other.status)) continue;
    if ((other.title||"").trim().toLowerCase() !== normTitle) continue;
    return other;
  }
  return null;
}

function computeLp(type, status, itemId){
  const items = db.items.filter(i=>i.type===type && (i.status||STATUS_WATCHING)===status);
  const idx = items.findIndex(i=>i.id===itemId);
  return idx===-1 ? null : idx+1;
}

// Zapewnia, że dana pozycja ma znane id TMDb - jeśli go brakuje, próbuje je
// znaleźć po tytule/dacie premiery (i od razu zapisuje na obiekcie).
async function ensureItemTmdbId(cur){
  if (cur.tmdb_id) return cur.tmdb_id;
  const hit = await tmdbSearch(cur.type, cur.title, cur.premiere_date);
  if (hit) { cur.tmdb_id = hit.id; return hit.id; }
  return null;
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
        markEpisodeWatched(ep, true);
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

// Znajduje pozycję w bazie na podstawie id TMDb (używane przez wiersze
// "Kolekcja" / "Odkrywaj", żeby rozpoznać, czy dana propozycja jest już
// dodana do bazy).
function findItemByTmdbId(type, tmdbId){
  return db.items.find(i=>i.type===type && i.tmdb_id===tmdbId) || null;
}

// Otwiera okno dodawania nowej pozycji, wstępnie wypełnione danymi z
// wyniku wyszukiwania/rekomendacji TMDb (poster, opis, obsada itd. zostaną
// pobrane automatycznie tak samo jak przy wybraniu podpowiedzi w polu tytułu).
async function addItemFromTmdb(type, hit){
  const result = await openItemDialog({item:null, itemType:type, prefillTmdb:hit});
  if (result) {
    db.items.push(result);
    setDirty(true);
    renderAll();
  }
}

// Buduje wiersz tabeli (tekst) używany w sekcji "Kolekcja" oraz w zakładce
// "Odkrywaj" — wygląda i zachowuje się tak samo jak rekordy filmów/seriali
// w zakładce "Planowane": dwuklik otwiera podgląd, jeśli pozycja jest już
// w bazie, albo okno dodawania wypełnione danymi z TMDb.
function buildTmdbRecordRow(type, r){
  const tr = document.createElement("tr");
  const existing = findItemByTmdbId(type, r.id);
  // Jeśli ta pozycja (np. część kolekcji/sagi) jest już w bazie użytkownika,
  // pokazujemy jej własny tytuł zapisany w bazie, a nie surowy tytuł z TMDb.
  // Dzięki temu ręczna poprawka tytułu na polski (np. w oknie edycji) od
  // razu widać też w liście kolekcji, zamiast pozostawiać stary, często
  // angielski tytuł pobrany wcześniej z TMDb.
  const title = (existing && existing.title)
    || (type===TYPE_MOVIE ? r.title : r.name)
    || (type===TYPE_MOVIE ? r.original_title : r.original_name)
    || "(bez tytułu)";
  const year = ((type===TYPE_MOVIE ? r.release_date : r.first_air_date) || "").slice(0,4);
  const td = document.createElement("td");
  td.className = "col-title";
  const titleLine = document.createElement("div");
  titleLine.className = "title-main";
  titleLine.textContent = title;
  if (existing) {
    const badge = document.createElement("span");
    badge.className = "muted";
    const statusLabel = STATUS_LABELS[existing.status] || existing.status || "w bazie";
    badge.textContent = "  •  " + statusLabel;
    titleLine.appendChild(badge);
  }
  td.appendChild(titleLine);
  if (year) {
    const dateLine = document.createElement("div");
    dateLine.className = "title-date";
    dateLine.textContent = year;
    td.appendChild(dateLine);
  }
  tr.appendChild(td);
  tr.style.cursor = "pointer";
  addDoubleActivation(tr, async ()=>{
    if (existing) { await openViewDialog(existing.id, {readOnly:true}); return; }
    const originalTitleRaw = (type===TYPE_MOVIE ? r.original_title : r.original_name) || "";
    const previewItem = {
      id: "preview:" + type + ":" + r.id,
      type,
      title,
      original_title: (originalTitleRaw && originalTitleRaw!==title) ? originalTitleRaw : "",
      premiere_date: year,
      poster_path: r.poster_path || null,
      tmdb_id: r.id,
      tags: [],
      rating: 0,
      seasons: [],
    };
    await openViewDialog(previewItem, {preview:true, tmdbHit:r, tmdbType:type});
  });
  return tr;
}

function openViewDialog(idOrItem, opts){
  const preview = !!(opts && opts.preview);
  const readOnly = !!(opts && (opts.readOnly || preview));
  return new Promise(resolve=>{
    let id, item;
    if (idOrItem && typeof idOrItem === "object") {
      item = idOrItem;
      id = item.id;
    } else {
      id = idOrItem;
      item = findItem(id);
    }
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

    const overlay = openOverlay(`
      <div class="modal-body has-tabs">
        <div class="inner-tabs">
          <button class="tab-btn active" id="vtab-info" type="button">Informacje</button>
          ${type===TYPE_SERIES ? '<button class="tab-btn" id="vtab-seasons" type="button">Sezony i odcinki</button>' : ''}
        </div>
        <div class="tab-scroll">
          <div id="vpane-info">
            ${!showPosterInList() ? `<div class="view-poster-wrap" id="view-poster-wrap">
              <img class="view-poster" id="view-poster-img" alt="Okładka" style="display:none;">
              <div class="view-poster-placeholder" id="view-poster-placeholder">Brak okładki</div>
            </div>` : ''}
            <div class="info-box">
            <div class="view-row"><div class="vlabel">Typ:</div><div class="vval">${escapeHtml(TYPE_LABELS[type]||"")}</div></div>
            <div class="view-row"><div class="vlabel">Tytuł:</div><div class="vval">${escapeHtml(item.title||"—")}</div></div>
            ${item.original_title ? `<div class="view-row"><div class="vlabel">Tytuł org.:</div><div class="vval">${escapeHtml(item.original_title)}</div></div>` : ""}
            <div class="view-row"><div class="vlabel">Czas:</div><div class="vval">${escapeHtml(timeTxt)}</div></div>
            <div class="view-row"><div class="vlabel">Data (rok):</div><div class="vval">${escapeHtml(item.premiere_date||"—")}</div></div>
            <div class="view-row" id="view-cert-row"></div>
            <div class="view-row" id="view-genres-row"></div>
            <div class="view-row" id="view-status-row"></div>
            <div class="view-row" id="view-rating-row"></div>
            <div class="view-row"><div class="vlabel">Tagi:</div><div class="vval"><div class="view-tags">${item.tags&&item.tags.length ? item.tags.map(t=>`<span class="view-tag">${escapeHtml(t)}</span>`).join("") : '<span class="muted">—</span>'}</div></div></div>
            <div class="view-row"><div class="vlabel">Opis:</div><div class="vval desc-inline" id="view-desc-text"></div></div>
            <div class="view-row"><div class="vlabel">${type===TYPE_MOVIE ? "Reżyseria:" : "Twórcy:"}</div><div class="vval desc-inline" id="view-creators-text"></div></div>
            <div class="view-row"><div class="vlabel">Obsada:</div><div class="vval desc-inline" id="view-cast-text"></div></div>
            <div class="view-row"><div class="vlabel">Kraje produkcji:</div><div class="vval desc-inline" id="view-countries-text"></div></div>
            <div class="view-row"><div class="vlabel">Kraj pochodzenia:</div><div class="vval desc-inline" id="view-origin-text"></div></div>
            <div class="view-row"><div class="vlabel">Oryg. język:</div><div class="vval desc-inline" id="view-language-text"></div></div>
            <div class="view-row"><div class="vlabel">Wytwórnia:</div><div class="vval desc-inline" id="view-companies-text"></div></div>
            <div class="view-row" id="view-budget-row"></div>
            <div class="view-row"><div class="vlabel">Zwiastun:</div><div class="vval desc-inline" id="view-links-text"></div></div>
            </div>
            ${type===TYPE_MOVIE ? `
            <div class="view-section" id="view-collection-section" style="display:none;">
              <div class="vlabel view-section-label" id="view-collection-title">Kolekcja:</div>
              <div class="table-wrap"><table class="data"><tbody id="view-collection-content"></tbody></table></div>
            </div>` : ''}
            <div class="tmdb-status" id="view-desc-status"></div>
            <div style="margin-top:6px;">
              <button class="btn small secondary" id="view-desc-fetch-btn" type="button">Pobierz dane</button>
            </div>
          </div>
          ${type===TYPE_SERIES ? '<div id="vpane-seasons" style="display:none;"></div>' : ''}
        </div>
        ${type===TYPE_SERIES ? `
        <div id="mark-next-ep-wrap" style="display:none;">
          <button class="btn small" id="mark-next-ep-btn" type="button"></button>
          <span id="mark-next-ep-title"></span>
        </div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn secondary" id="close-view-btn">Zamknij</button>
        ${(!readOnly && !preview) ? '<button class="btn" id="edit-from-view-btn">Edytuj</button>' : ''}
        ${preview ? '<button class="btn" id="add-from-view-btn">Dodaj do bazy</button>' : '<button class="btn" id="delete-from-view-btn">Usuń</button>'}
      </div>
    `, {wide:true});

    function refreshStaticRows(){
      const cur = findItem(id) || item;
      const statusLabel = STATUS_LABELS[cur.status] || cur.status || "—";
      const ratingVal = normalizeRating(cur.rating);
      const ratingTxt = ratingVal ? `${formatRating(ratingVal)}/10` : "—";
      overlay.querySelector("#view-status-row").innerHTML = `<div class="vlabel">Status:</div><div class="vval">${escapeHtml(statusLabel)}</div>`;
      overlay.querySelector("#view-rating-row").innerHTML = `<div class="vlabel">Ocena:</div><div class="vval">${escapeHtml(ratingTxt)}</div>`;
    }

    function refreshGenres(){
      const cur = findItem(id) || item;
      const genresTxt = (cur.genres && cur.genres.length) ? cur.genres.join(", ") : "—";
      overlay.querySelector("#view-genres-row").innerHTML = `<div class="vlabel">Gatunek:</div><div class="vval">${escapeHtml(genresTxt)}</div>`;
    }

    async function fetchGenresIfNeeded(){
      const cur = findItem(id) || item;
      if (cur.genres && cur.genres.length) return;
      try {
        let tid = cur.tmdb_id;
        if (!tid) {
          const hit = await tmdbSearch(cur.type, cur.title, cur.premiere_date);
          if (hit) { tid = hit.id; cur.tmdb_id = tid; }
        }
        if (!tid) return;
        const genres = await tmdbFetchGenres(cur.type, tid);
        if (genres && genres.length) {
          cur.genres = genres;
          saveToLocalStorage();
          refreshGenres();
        }
      } catch(err) {
        // cicho ignoruj błąd pobierania gatunku - nie blokuje okna informacji
      }
    }

    function refreshDescPane(){
      const cur = findItem(id) || item;
      const textEl = overlay.querySelector("#view-desc-text");
      const creatorsEl = overlay.querySelector("#view-creators-text");
      const castEl = overlay.querySelector("#view-cast-text");
      const fetchBtn = overlay.querySelector("#view-desc-fetch-btn");
      const anyData = (cur.description && cur.description.trim()) || (cur.creators && cur.creators.length) || (cur.cast && cur.cast.length);
      if (cur.description && cur.description.trim()) {
        textEl.textContent = cur.description;
        textEl.classList.remove("muted");
      } else {
        textEl.textContent = "Brak opisu.";
        textEl.classList.add("muted");
      }
      if (cur.creators && cur.creators.length) {
        creatorsEl.textContent = cur.creators.join("\n");
        creatorsEl.classList.remove("muted");
      } else {
        creatorsEl.textContent = type===TYPE_MOVIE ? "Brak informacji o reżyserii." : "Brak informacji o twórcach.";
        creatorsEl.classList.add("muted");
      }
      if (cur.cast && cur.cast.length) {
        castEl.textContent = cur.cast.join("\n");
        castEl.classList.remove("muted");
      } else {
        castEl.textContent = "Brak informacji o obsadzie.";
        castEl.classList.add("muted");
      }
      const countriesEl = overlay.querySelector("#view-countries-text");
      const originEl = overlay.querySelector("#view-origin-text");
      const languageEl = overlay.querySelector("#view-language-text");
      if (cur.production_countries && cur.production_countries.length) {
        countriesEl.textContent = cur.production_countries.join(", ");
        countriesEl.classList.remove("muted");
      } else {
        countriesEl.textContent = "Brak informacji.";
        countriesEl.classList.add("muted");
      }
      if (cur.origin_country && cur.origin_country.length) {
        originEl.textContent = cur.origin_country.join(", ");
        originEl.classList.remove("muted");
      } else {
        originEl.textContent = "Brak informacji.";
        originEl.classList.add("muted");
      }
      if (cur.original_language) {
        languageEl.textContent = cur.original_language;
        languageEl.classList.remove("muted");
      } else {
        languageEl.textContent = "Brak informacji.";
        languageEl.classList.add("muted");
      }
      fetchBtn.textContent = anyData ? "Odśwież dane" : "Pobierz dane";
    }
    refreshDescPane();

    function refreshExtras(){
      const cur = findItem(id) || item;
      const companiesEl = overlay.querySelector("#view-companies-text");
      const linksEl = overlay.querySelector("#view-links-text");
      if (companiesEl) {
        if (cur.production_companies && cur.production_companies.length) { companiesEl.textContent = cur.production_companies.join(", "); companiesEl.classList.remove("muted"); }
        else { companiesEl.textContent = "Brak informacji."; companiesEl.classList.add("muted"); }
      }
      if (linksEl) {
        if (cur.trailer_key) {
          linksEl.innerHTML = `<a href="https://www.youtube.com/watch?v=${escapeHtml(cur.trailer_key)}" target="_blank" rel="noopener" class="view-link">Obejrzyj na YouTube</a>`;
          linksEl.classList.remove("muted");
        } else { linksEl.textContent = "Brak informacji."; linksEl.classList.add("muted"); }
      }
    }
    refreshExtras();

    async function fetchExtrasIfNeeded(){
      const cur = findItem(id) || item;
      if (cur.production_companies && cur.production_companies.length && cur.trailer_key) return;
      try {
        let tid = cur.tmdb_id;
        if (!tid) {
          const hit = await tmdbSearch(cur.type, cur.title, cur.premiere_date);
          if (hit) { tid = hit.id; cur.tmdb_id = tid; }
        }
        if (!tid) return;
        let changed = false;
        try {
          const extras = await tmdbFetchExtras(cur.type, tid);
          if (extras && extras.companies.length) { cur.production_companies = extras.companies; changed = true; }
        } catch(err) { /* brak danych ogólnych - kontynuuj */ }
        try {
          const trailerKey = await tmdbFetchTrailerKey(cur.type, tid);
          if (trailerKey) { cur.trailer_key = trailerKey; changed = true; }
        } catch(err) { /* brak zwiastuna - kontynuuj */ }
        if (changed) {
          saveToLocalStorage();
          refreshExtras();
        }
      } catch(err) {
        // cicho ignoruj błąd pobierania dodatkowych informacji - nie blokuje okna informacji
      }
    }
    fetchExtrasIfNeeded();

    async function fetchOriginInfoIfNeeded(){
      const cur = findItem(id) || item;
      if ((cur.production_countries && cur.production_countries.length) &&
          (cur.origin_country && cur.origin_country.length) &&
          cur.original_language) return;
      try {
        let tid = cur.tmdb_id;
        if (!tid) {
          const hit = await tmdbSearch(cur.type, cur.title, cur.premiere_date);
          if (hit) { tid = hit.id; cur.tmdb_id = tid; }
        }
        if (!tid) return;
        const info = await tmdbFetchOriginInfo(cur.type, tid);
        if (info) {
          if (info.productionCountries.length) cur.production_countries = info.productionCountries;
          if (info.originCountry.length) cur.origin_country = info.originCountry;
          if (info.originalLanguage) cur.original_language = info.originalLanguage;
          saveToLocalStorage();
          refreshDescPane();
        }
      } catch(err) {
        // cicho ignoruj błąd pobierania kraju/języka - nie blokuje okna informacji
      }
    }
    fetchOriginInfoIfNeeded();

    // W wersji v1 okładka jest pokazywana bezpośrednio w oknie informacji;
    // w wersji v2 widoczna jest jako miniatura na liście, po lewej stronie
    // tytułu. W obu przypadkach dociągamy ją w tle przy pierwszym otwarciu
    // pozycji, jeśli jeszcze jej nie mamy w bazie.
    function refreshPoster(){
      const cur = findItem(id) || item;
      const img = overlay.querySelector("#view-poster-img");
      const placeholder = overlay.querySelector("#view-poster-placeholder");
      if (!img || !placeholder) return;
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
          renderTable(cur.type, cur.status || STATUS_WATCHING);
        }
      } catch(err) {
        // cicho ignoruj błąd pobierania okładki - nie blokuje okna informacji
      }
    }
    fetchPosterIfNeeded();
    refreshGenres();
    fetchGenresIfNeeded();

    // Kategoria wiekowa (certyfikacja) - jeśli ustawiono ją ręcznie w edycji,
    // pokaż tę wartość; w przeciwnym razie pobierz z TMDb i zapisz w bazie
    // (na wzór innych auto-pobieranych pól, np. gatunku czy okładki), żeby
    // przy kolejnym otwarciu nie trzeba było pobierać jej ponownie.
    async function refreshCertification(){
      const cur = findItem(id) || item;
      const row = overlay.querySelector("#view-cert-row");
      if (!row) return;
      if (cur.age_certification && cur.age_certification.trim()) {
        row.innerHTML = `<div class="vlabel">Kategoria wiekowa:</div><div class="vval">${escapeHtml(formatAgeCertification(cur.age_certification))}</div>`;
        return;
      }
      try {
        const tid = await ensureItemTmdbId(cur);
        if (!tid) { row.innerHTML = ""; return; }
        const cert = await tmdbFetchCertification(cur.type, tid);
        if (cert) {
          cur.age_certification = cert;
          saveToLocalStorage();
        }
        row.innerHTML = cert
          ? `<div class="vlabel">Kategoria wiekowa:</div><div class="vval">${escapeHtml(formatAgeCertification(cert))}</div>`
          : "";
      } catch(err) { row.innerHTML = ""; }
    }
    refreshCertification();

    // Budżet produkcji - jeśli ustawiono go ręcznie w edycji, pokaż tę
    // wartość; w przeciwnym razie spróbuj pobrać z TMDb (głównie filmy) i
    // zapisz w bazie, żeby przy kolejnym otwarciu nie trzeba było pobierać
    // jej ponownie.
    async function refreshBudget(){
      const cur = findItem(id) || item;
      const row = overlay.querySelector("#view-budget-row");
      if (!row) return;
      if (cur.budget) {
        row.innerHTML = `<div class="vlabel">Budżet:</div><div class="vval">${escapeHtml(formatMoney(cur.budget))}</div>`;
        return;
      }
      row.innerHTML = `<div class="vlabel">Budżet:</div><div class="vval muted">—</div>`;
      try {
        const tid = await ensureItemTmdbId(cur);
        if (!tid) return;
        const budget = await tmdbFetchBudget(cur.type, tid);
        if (budget) {
          cur.budget = budget;
          saveToLocalStorage();
          row.innerHTML = `<div class="vlabel">Budżet:</div><div class="vval">${escapeHtml(formatMoney(budget))}</div>`;
        }
      } catch(err) { /* brak danych o budżecie nie blokuje okna informacji */ }
    }
    refreshBudget();

    // Kolekcja/saga (np. seria filmów) - tylko dla filmów. Kolekcja jest
    // częścią danych pozycji (item.collection) i trafia do pliku JSON bazy
    // tak samo jak reszta pól. W oknie informacji jest tylko wyświetlana
    // (tekstowo, jak zwykłe rekordy filmów - dwuklik otwiera podgląd/dodawanie);
    // dodawanie i edycja kolekcji odbywa się w oknie edycji pozycji. Przycisk
    // "Pobierz/Odśwież dane" dosynchronizowuje ją z TMDb razem z resztą danych.
    function renderCollectionSection(){
      if (type !== TYPE_MOVIE) return;
      const cur = findItem(id) || item;
      const section = overlay.querySelector("#view-collection-section");
      const content = overlay.querySelector("#view-collection-content");
      if (!section || !content) return;
      const list = Array.isArray(cur.collection) ? cur.collection : [];
      if (!list.length) { section.style.display = "none"; return; }
      const titleEl = overlay.querySelector("#view-collection-title");
      if (titleEl) titleEl.textContent = cur.collection_title ? `Kolekcja: ${cur.collection_title}` : "Kolekcja:";
      content.innerHTML = "";
      const sortedParts = [...list].sort((a,b)=>String(a.release_date||"9999").localeCompare(String(b.release_date||"9999")));
      for (const part of sortedParts) content.appendChild(buildTmdbRecordRow(TYPE_MOVIE, part));
      section.style.display = "";
    }
    async function refreshCollection(){
      if (type !== TYPE_MOVIE) return;
      const cur = findItem(id) || item;
      if (cur.collection === undefined) {
        try {
          const tid = await ensureItemTmdbId(cur);
          if (tid) {
            const coll = await tmdbFetchCollection(tid);
            if (coll && Array.isArray(coll.parts) && coll.parts.length >= 2) {
              cur.collection = coll.parts.map(normalizeCollectionPart);
              if (coll.name) cur.collection_title = String(coll.name);
              saveToLocalStorage();
            }
          }
        } catch(err) { /* cicho ignoruj - sekcja kolekcji nie jest krytyczna */ }
      }
      renderCollectionSection();
    }
    refreshCollection();


    const posterImgEl = overlay.querySelector("#view-poster-img");
    if (posterImgEl) {
      posterImgEl.addEventListener("click", ()=>{
        const cur = findItem(id) || item;
        openPosterLightbox(tmdbPosterUrl(cur.poster_path, "w780"));
      });
    }

    function refreshMarkNextEp(){
      if (type!==TYPE_SERIES) return;
      const cur = findItem(id) || item;
      const p = formatProgress(cur);
      const btn = overlay.querySelector("#mark-next-ep-btn");
      const titleEl = overlay.querySelector("#mark-next-ep-title");
      if (!btn) return;
      if (readOnly) { btn.style.display = "none"; if (titleEl) titleEl.textContent = ""; return; }
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

    let collapsedSeasons = new Set((item.seasons||[]).map(s=>s.number));

    function refreshSeasonsPane(){
      if (type!==TYPE_SERIES) return;
      const cur = findItem(id) || item;
      const pane = overlay.querySelector("#vpane-seasons");
      if (!pane) return;
      pane.innerHTML = "";

      const seasons = cur.seasons || [];
      if (seasons.length===0) {
        const emptyMsg = document.createElement("div");
        emptyMsg.className = "muted";
        emptyMsg.textContent = "Brak sezonów.";
        pane.appendChild(emptyMsg);
      } else {
        const sorted = [...seasons].sort((a,b)=>(a.number||0)-(b.number||0));
        for (const season of sorted) {
          const box = document.createElement("div");
          box.className = "season-box";
          box.style.marginBottom = "8px";
          const total = (season.episodes||[]).length;
          const watched = (season.episodes||[]).filter(e=>e.watched).length;
          const pct = total>0 ? Math.round((watched/total)*100) : 0;
          const isCollapsed = collapsedSeasons.has(season.number);
          box.innerHTML = `
            <div class="season-title season-title-toggle">
              <span class="season-toggle-arrow">${isCollapsed ? "▶" : "▼"}</span>
              <span>Sezon ${season.number} (${watched}/${total} odc.)</span>
              <span class="season-pct">${pct}%</span>
            </div>
            <div class="season-details" style="${isCollapsed ? "display:none;" : ""}">
              ${season.air_date ? `<div class="title-date" style="margin:-4px 0 6px 20px;">${escapeHtml(String(season.air_date).slice(0,4))}</div>` : ""}
              ${season.overview ? `<div class="overview-box season-overview-box">${escapeHtml(season.overview)}</div>` : ""}
            </div>
            <div class="episodes-list" style="${isCollapsed ? "display:none;" : ""}"></div>
          `;
          box.querySelector(".season-title-toggle").addEventListener("click", ()=>{
            if (collapsedSeasons.has(season.number)) collapsedSeasons.delete(season.number);
            else collapsedSeasons.add(season.number);
            refreshSeasonsPane();
          });
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
              if (ep.overview) {
                const descBox = document.createElement("div");
                descBox.className = "overview-box episode-overview-box";
                descBox.textContent = ep.overview;
                epsList.appendChild(descBox);
              }
            }
          }
          pane.appendChild(box);
        }
      }

      refreshMarkNextEp();
    }

    const vtabInfo = overlay.querySelector("#vtab-info");
    const vtabSeasons = overlay.querySelector("#vtab-seasons");
    const vpaneInfo = overlay.querySelector("#vpane-info");
    const vpaneSeasons = overlay.querySelector("#vpane-seasons");
    const markNextEpWrap = overlay.querySelector("#mark-next-ep-wrap");

    const viewTabs = [
      {tab: vtabInfo, pane: vpaneInfo},
    ];
    if (vtabSeasons) viewTabs.push({tab: vtabSeasons, pane: vpaneSeasons, onShow: refreshSeasonsPane, showMarkNextEp: true});

    function activateViewTab(target){
      for (const t of viewTabs) {
        const active = t===target;
        t.tab.classList.toggle("active", active);
        t.pane.style.display = active ? "" : "none";
      }
      if (markNextEpWrap) markNextEpWrap.style.display = (target.showMarkNextEp && !readOnly && isUiV1()) ? "flex" : "none";
      if (target.onShow) target.onShow();
    }
    for (const t of viewTabs) {
      t.tab.addEventListener("click", ()=>activateViewTab(t));
    }

    if (type===TYPE_SERIES && !readOnly) {
      overlay.querySelector("#mark-next-ep-btn").addEventListener("click", async (ev)=>{
        const btn = ev.currentTarget;
        btn.disabled = true;
        btn.textContent = "Pobieranie…";
        try {
          await markNextEpisodeWatched(id);
        } finally {
          refreshStaticRows();
          refreshSeasonsPane();
        }
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
        const parts = [];
        const overview = await tmdbOverview(cur.type, tid);
        if (overview) { cur.description = overview; parts.push("opis"); }
        if (cur.type === TYPE_SERIES) {
          try {
            let seasonInfoChanged = false;
            for (const season of (cur.seasons||[])) {
              // forceRefresh=true: ten przycisk ma naprawiać/aktualizować dane,
              // więc musi ominąć pamięć podręczną sezonu z tej sesji (inaczej,
              // jeśli sezon był już raz pobrany wcześniej - np. przy otwarciu
              // zakładki "Sezony i odcinki" - dostawalibyśmy z powrotem ten sam,
              // stary opis, nawet jeśli był po angielsku i wymagał tłumaczenia).
              // tmdbSeasonEpisodes tłumaczy opisy na polski automatycznie, jeśli
              // TMDb nie miał wersji polskiej.
              const eps = await tmdbSeasonEpisodes(tid, season.number, true);
              if (eps) {
                if (eps.season_overview) { season.overview = eps.season_overview; seasonInfoChanged = true; }
                if (eps.season_air_date) { season.air_date = eps.season_air_date; seasonInfoChanged = true; }
                for (const ep of (season.episodes||[])) {
                  const match = eps.find(e=>e.episode_number===ep.number);
                  if (match && match.overview) { ep.overview = match.overview; seasonInfoChanged = true; }
                }
              }
            }
            if (seasonInfoChanged) parts.push("opisy i daty sezonów/odcinków");
          } catch(err) { /* brak opisów/dat sezonów nie blokuje reszty */ }

          // Dodatkowy przebieg "siatki bezpieczeństwa": tłumaczy opisy sezonów/
          // odcinków, które mimo powyższego kroku wciąż nie są po polsku (np.
          // bo akurat wtedy usługi tłumaczeniowe miały chwilowy limit) - bez
          // ponownego odpytywania TMDb, tylko na tekście, który już mamy.
          try {
            let translatedCount = 0;
            const srcLang = (cur.original_language && cur.original_language !== "pl") ? cur.original_language : "en";
            for (const season of (cur.seasons||[])) {
              if (season.overview && looksLikeNonPolishText(season.overview)) {
                const t = await translateTextToPolish(season.overview, srcLang);
                if (t && t !== season.overview) { season.overview = t; translatedCount++; }
                await new Promise(r => setTimeout(r, 400));
              }
              for (const ep of (season.episodes||[])) {
                if (ep.overview && looksLikeNonPolishText(ep.overview)) {
                  const t = await translateTextToPolish(ep.overview, srcLang);
                  if (t && t !== ep.overview) { ep.overview = t; translatedCount++; }
                  await new Promise(r => setTimeout(r, 400));
                }
              }
            }
            if (translatedCount>0) parts.push(`${translatedCount} ${polishPlural(translatedCount,"tłumaczenie opisu","tłumaczenia opisów","tłumaczeń opisów")}`);
          } catch(err) { /* błąd tłumaczenia nie blokuje reszty */ }
        }
        try {
          const creators = await tmdbFetchCreators(cur.type, tid);
          if (creators && creators.length) { cur.creators = creators; parts.push("twórców"); }
        } catch(err) { /* brak twórców nie blokuje reszty */ }
        try {
          const cast = await tmdbFetchCast(cur.type, tid);
          if (cast && cast.length) { cur.cast = cast; parts.push("obsadę"); }
        } catch(err) { /* brak obsady nie blokuje reszty */ }
        try {
          const info = await tmdbFetchOriginInfo(cur.type, tid);
          if (info) {
            if (info.productionCountries.length) { cur.production_countries = info.productionCountries; parts.push("kraje produkcji"); }
            if (info.originCountry.length) { cur.origin_country = info.originCountry; parts.push("kraj pochodzenia"); }
            if (info.originalLanguage) { cur.original_language = info.originalLanguage; parts.push("język oryginalny"); }
          }
        } catch(err) { /* brak danych o kraju/języku nie blokuje reszty */ }
        try {
          const extras = await tmdbFetchExtras(cur.type, tid);
          if (extras && extras.companies.length) { cur.production_companies = extras.companies; parts.push("wytwórnię"); }
        } catch(err) { /* brak dodatkowych danych nie blokuje reszty */ }
        try {
          const trailerKey = await tmdbFetchTrailerKey(cur.type, tid);
          if (trailerKey) { cur.trailer_key = trailerKey; parts.push("zwiastun"); }
        } catch(err) { /* brak zwiastuna nie blokuje reszty */ }
        if (type === TYPE_MOVIE) {
          try {
            const added = await syncItemCollectionFromTmdb(cur, tid);
            if (added > 0) parts.push(`kolekcję (${added} ${added===1?"nowa pozycja":"nowe pozycje"})`);
          } catch(err) { /* brak/błąd kolekcji nie blokuje reszty */ }
        }
        if (parts.length) {
          saveToLocalStorage();
          setDirty(true);
          statusEl.textContent = "Pobrano: " + parts.join(", ") + ".";
        } else {
          statusEl.textContent = "Brak danych w TMDb dla tej pozycji.";
        }
      } catch(err) {
        statusEl.textContent = err.message || String(err);
        statusEl.classList.add("err");
      } finally {
        btn.disabled = false;
        btn.textContent = oldLabel;
        refreshDescPane();
        refreshExtras();
        renderCollectionSection();
        refreshSeasonsPane();
        if (typeof renderTranslationStats === "function") renderTranslationStats();
      }
    });

    refreshStaticRows();

    requestAnimationFrame(()=>{
      const bodyEl = overlay.querySelector(".modal-body");
      if (bodyEl) {
        const h = bodyEl.getBoundingClientRect().height;
        bodyEl.style.flex = `0 0 ${h}px`;
        bodyEl.style.height = h + "px";
        bodyEl.style.maxHeight = h + "px";
      }
    });

    function finish(result){
      closeOverlay(overlay);
      document.removeEventListener("keydown", onKey);
      resolve(result);
    }
    function onKey(e){ if (!isTopOverlay(overlay)) return; if (e.key==="Escape") finish(null); }
    document.addEventListener("keydown", onKey);

    overlay.querySelector("#close-view-btn").addEventListener("click", ()=>finish(null));
    if (preview) {
      overlay.querySelector("#add-from-view-btn").addEventListener("click", async ()=>{
        finish(null);
        await addItemFromTmdb(opts.tmdbType || type, opts.tmdbHit);
      });
    } else {
      overlay.querySelector("#delete-from-view-btn").addEventListener("click", async ()=>{
        const cur = findItem(id) || item;
        const ok = await showConfirm("Usuń pozycję", `Czy na pewno usunąć „${cur.title||""}”?`);
        if (!ok) return;
        db.items = db.items.filter(i=>i.id!==id);
        setDirty(true);
        renderAll();
        finish(null);
      });
    }
    if (!readOnly && !preview) overlay.querySelector("#edit-from-view-btn").addEventListener("click", async ()=>{
      finish(null);
      await openEditDialog(id);
    });
  });
}

function openItemDialog({item, itemType, prefillTmdb}){
  return new Promise(resolve=>{
    const isNew = item==null;
    const type = isNew ? itemType : item.type;
    let seasons = isNew ? [] : JSON.parse(JSON.stringify(item.seasons||[]));
    let innerTab = "basic";

    const statusChoices = [...TYPE_STATUS_ORDER[type].filter(s=>s!==STATUS_PLANNED && s!==STATUS_UPCOMING), STATUS_PLANNED];
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
            <div class="form-row"><label>Kategoria wiekowa:</label><input class="entry" id="f-age-cert" type="text" style="flex:1;" placeholder="np. 16, PG-13, TV-MA (puste = pobierz automatycznie)"></div>
            <div class="form-row"><label>Status:</label>
              <select class="entry" id="f-status" style="flex:1;">
                ${statusOptions.map(o=>`<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("")}
              </select>
            </div>
            <div class="form-row"><label>Ocena (0-10):</label>
              <input class="entry" id="f-rating" type="number" min="0" max="10" step="0.1" style="width:80px;flex:none;">
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
              <label class="tags-label">Gatunek:</label>
              <div style="flex:1;">
                <div id="genres-chip-list"></div>
                <input class="entry" id="f-genre-input" type="text" placeholder="dodaj gatunek i Enter">
              </div>
            </div>
            <div class="form-row" style="align-items:flex-start;">
              <label class="tags-label">Obsada:</label>
              <div style="flex:1;">
                <div id="cast-chip-list"></div>
                <input class="entry" id="f-cast-input" type="text" placeholder="dodaj aktora i Enter">
              </div>
            </div>
            <div class="form-row" style="align-items:flex-start;">
              <label class="tags-label">${type===TYPE_MOVIE ? "Reżyseria:" : "Twórcy:"}</label>
              <div style="flex:1;">
                <div id="creators-chip-list"></div>
                <input class="entry" id="f-creators-input" type="text" placeholder="${type===TYPE_MOVIE ? "dodaj reżysera i Enter" : "dodaj twórcę i Enter"}">
              </div>
            </div>
            <div class="form-row" style="align-items:flex-start;">
              <label class="tags-label">Kraje prod.:</label>
              <div style="flex:1;">
                <div id="countries-chip-list"></div>
                <input class="entry" id="f-countries-input" type="text" placeholder="dodaj kraj i Enter">
              </div>
            </div>
            <div class="form-row" style="align-items:flex-start;">
              <label class="tags-label">Kraj poch.:</label>
              <div style="flex:1;">
                <div id="origin-chip-list"></div>
                <input class="entry" id="f-origin-input" type="text" placeholder="dodaj kraj i Enter">
              </div>
            </div>
            <div class="form-row"><label>Oryg. język:</label><input class="entry" id="f-language" type="text" style="flex:1;" placeholder="np. en"></div>
            <div class="form-row" style="align-items:flex-start;">
              <label class="tags-label">Wytwórnia:</label>
              <div style="flex:1;">
                <div id="companies-chip-list"></div>
                <input class="entry" id="f-companies-input" type="text" placeholder="dodaj wytwórnię i Enter">
              </div>
            </div>
            <div class="form-row"><label>Budżet ($):</label><input class="entry" id="f-budget" type="text" style="flex:1;" placeholder="np. 200000000 (puste = pobierz automatycznie)"></div>
            ${type===TYPE_MOVIE ? `
            <div class="form-row" style="align-items:flex-start;">
              <label class="tags-label">Kolekcja:</label>
              <div style="flex:1;">
                <input class="entry" id="collection-title-input" type="text" placeholder="Nazwa kolekcji (np. Kolekcja Iron Man)" style="margin-bottom:6px;">
                <div style="display:flex;gap:6px;margin-bottom:6px;">
                  <button class="btn small secondary" id="collection-add-btn" type="button">Dodaj</button>
                </div>
                <div class="table-wrap"><table class="data"><tbody id="edit-collection-content"></tbody></table></div>
              </div>
            </div>` : ''}
            <div class="form-row"><label>Zwiastun:</label><input class="entry" id="f-trailer" type="text" style="flex:1;" placeholder="link lub ID YouTube"></div>
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
    const budgetInput = overlay.querySelector("#f-budget");
    const ageCertInput = overlay.querySelector("#f-age-cert");
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
      if (budgetInput) budgetInput.value = item.budget ? String(item.budget) : "";
      ageCertInput.value = item.age_certification || "";
      statusSelect.value = STATUS_LABELS[item.status] || defaultStatus;
      ratingSelect.value = String(normalizeRating(item.rating));
      descriptionInput.value = item.description || "";
    }
    titleInput.focus();

    let tmdbId = isNew ? null : (item.tmdb_id || null);
    let genres = isNew ? [] : [...(item.genres||[])];
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
          const details = await tmdbFetch("/movie/" + r.id, {});
          const runtime = details && details.runtime ? details.runtime : null;
          if (durationInput && runtime) durationInput.value = String(runtime);
          if (budgetInput && details && details.budget) budgetInput.value = String(details.budget);
          genres = tmdbGenreNames(details);
          try { const c = await tmdbFetchCast(type, r.id); if (c && c.length) cast = c; } catch(err) {}
          try { const cr = await tmdbFetchCreators(type, r.id); if (cr && cr.length) creators = cr; } catch(err) {}
          renderGenreChips(); renderCastChips(); renderCreatorsChips();
          await applyTmdbExtraInfo(r.id, details);
          const overview = await tmdbOverview(type, r.id);
          if (descriptionInput && overview) descriptionInput.value = overview;
          setTmdbStatus("Uzupełniono dane z TMDb" + (runtime ? ` (czas: ${runtime} min).` : "."));
        } else {
          const details = await tmdbFetch("/tv/" + r.id, {});
          if (budgetInput && details && details.budget) budgetInput.value = String(details.budget);
          genres = tmdbGenreNames(details);
          try { const c = await tmdbFetchCast(type, r.id); if (c && c.length) cast = c; } catch(err) {}
          try { const cr = await tmdbFetchCreators(type, r.id); if (cr && cr.length) creators = cr; } catch(err) {}
          renderGenreChips(); renderCastChips(); renderCreatorsChips();
          await applyTmdbExtraInfo(r.id, details);
          const fetched = [];
          if (details && Array.isArray(details.seasons)) {
            for (const s of details.seasons) {
              const sn = Number(s.season_number);
              if (!sn || sn < 1) continue;
              const eps = await tmdbSeasonEpisodes(r.id, sn);
              const episodes = (eps||[]).map(e=>({number: e.episode_number, watched:false, duration: e.runtime||0, title: e.name||"", overview: e.overview||""})).filter(e=>e.number>0);
              fetched.push({number: sn, episodes, overview: eps.season_overview||"", air_date: eps.season_air_date||""});
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
    // Uzupełnia brakujące nazwy ORAZ opisy odcinków z TMDb (opisy od razu
    // przetłumaczone na polski, jeśli TMDb nie miał wersji polskiej - patrz
    // tmdbSeasonEpisodes). Uruchamiane automatycznie przy pierwszym otwarciu
    // zakładki "Sezony i odcinki".
    async function autoFillEpisodeTitles(){
      if (titlesBackfillDone) return;
      const missingSeasons = seasons.filter(s=>(s.episodes||[]).some(e=>isGenericEpisodeName(e.title, e.number) || !e.overview));
      if (missingSeasons.length===0) { titlesBackfillDone = true; return; }
      if (!tmdbId && !getStoredTmdbKey()) return;
      titlesBackfillDone = true;
      try {
        const id = await ensureTmdbId();
        let filledTitles = 0;
        let filledOverviews = 0;
        for (const season of missingSeasons) {
          const eps = await tmdbSeasonEpisodes(id, season.number);
          for (const ep of season.episodes) {
            const match = eps.find(e=>e.episode_number===ep.number);
            if (!match) continue;
            if (!ep.title && match.name) { ep.title = match.name; filledTitles++; }
            if (!ep.overview && match.overview) { ep.overview = match.overview; filledOverviews++; }
          }
        }
        if (filledTitles>0 || filledOverviews>0) {
          renderSeasonsList();
          const parts = [];
          if (filledTitles>0) parts.push(`nazwy ${filledTitles} odcinków`);
          if (filledOverviews>0) parts.push(`opisy ${filledOverviews} odcinków`);
          setTmdbStatus(`Uzupełniono ${parts.join(" i ")} z TMDb.`);
        }
      } catch(err) {
        // cichy błąd - brak danych nie blokuje pracy z sezonami
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

    const genresChipList = overlay.querySelector("#genres-chip-list");
    const genreInput = overlay.querySelector("#f-genre-input");
    function renderGenreChips(){
      genresChipList.innerHTML = "";
      for (const genre of genres) {
        const chip = document.createElement("span");
        chip.className = "tag-chip";
        const label = document.createElement("span");
        label.textContent = genre;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "tag-remove";
        removeBtn.textContent = "✕";
        removeBtn.title = "Usuń gatunek";
        removeBtn.addEventListener("click", ()=>{
          genres = genres.filter(g=>g!==genre);
          renderGenreChips();
        });
        chip.appendChild(label);
        chip.appendChild(removeBtn);
        genresChipList.appendChild(chip);
      }
    }
    function addGenreFromInput(){
      const raw = genreInput.value.split(",");
      let added = false;
      for (let piece of raw) {
        const val = piece.trim();
        if (!val) continue;
        if (!genres.some(g=>g.toLowerCase()===val.toLowerCase())) { genres.push(val); added = true; }
      }
      if (added) renderGenreChips();
      genreInput.value = "";
    }
    genreInput.addEventListener("keydown", (e)=>{
      if (e.key==="Enter" || e.key===",") {
        e.preventDefault();
        addGenreFromInput();
      }
    });
    genreInput.addEventListener("blur", ()=>{ if (genreInput.value.trim()) addGenreFromInput(); });
    renderGenreChips();

    let cast = isNew ? [] : [...(item.cast||[])];
    const castChipList = overlay.querySelector("#cast-chip-list");
    const castInput = overlay.querySelector("#f-cast-input");
    function renderCastChips(){
      castChipList.innerHTML = "";
      for (const actor of cast) {
        const chip = document.createElement("span");
        chip.className = "tag-chip";
        const label = document.createElement("span");
        label.textContent = actor;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "tag-remove";
        removeBtn.textContent = "✕";
        removeBtn.title = "Usuń z obsady";
        removeBtn.addEventListener("click", ()=>{
          cast = cast.filter(c=>c!==actor);
          renderCastChips();
        });
        chip.appendChild(label);
        chip.appendChild(removeBtn);
        castChipList.appendChild(chip);
      }
    }
    function addCastFromInput(){
      const raw = castInput.value.split(",");
      let added = false;
      for (let piece of raw) {
        const val = piece.trim();
        if (!val) continue;
        if (!cast.some(c=>c.toLowerCase()===val.toLowerCase())) { cast.push(val); added = true; }
      }
      if (added) renderCastChips();
      castInput.value = "";
    }
    castInput.addEventListener("keydown", (e)=>{
      if (e.key==="Enter" || e.key===",") {
        e.preventDefault();
        addCastFromInput();
      }
    });
    castInput.addEventListener("blur", ()=>{ if (castInput.value.trim()) addCastFromInput(); });
    renderCastChips();

    let creators = isNew ? [] : [...(item.creators||[])];
    const creatorsChipList = overlay.querySelector("#creators-chip-list");
    const creatorsInput = overlay.querySelector("#f-creators-input");
    function renderCreatorsChips(){
      creatorsChipList.innerHTML = "";
      for (const person of creators) {
        const chip = document.createElement("span");
        chip.className = "tag-chip";
        const label = document.createElement("span");
        label.textContent = person;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "tag-remove";
        removeBtn.textContent = "✕";
        removeBtn.title = type===TYPE_MOVIE ? "Usuń z reżyserii" : "Usuń z twórców";
        removeBtn.addEventListener("click", ()=>{
          creators = creators.filter(c=>c!==person);
          renderCreatorsChips();
        });
        chip.appendChild(label);
        chip.appendChild(removeBtn);
        creatorsChipList.appendChild(chip);
      }
    }
    function addCreatorsFromInput(){
      const raw = creatorsInput.value.split(",");
      let added = false;
      for (let piece of raw) {
        const val = piece.trim();
        if (!val) continue;
        if (!creators.some(c=>c.toLowerCase()===val.toLowerCase())) { creators.push(val); added = true; }
      }
      if (added) renderCreatorsChips();
      creatorsInput.value = "";
    }
    creatorsInput.addEventListener("keydown", (e)=>{
      if (e.key==="Enter" || e.key===",") {
        e.preventDefault();
        addCreatorsFromInput();
      }
    });
    creatorsInput.addEventListener("blur", ()=>{ if (creatorsInput.value.trim()) addCreatorsFromInput(); });
    renderCreatorsChips();

    function setupChipField(initial, listId, inputId, removeTitle){
      let values = [...(initial||[])];
      const listEl = overlay.querySelector("#"+listId);
      const inputEl = overlay.querySelector("#"+inputId);
      function render(){
        listEl.innerHTML = "";
        for (const val of values) {
          const chip = document.createElement("span");
          chip.className = "tag-chip";
          const label = document.createElement("span");
          label.textContent = val;
          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "tag-remove";
          removeBtn.textContent = "✕";
          removeBtn.title = removeTitle;
          removeBtn.addEventListener("click", ()=>{ values = values.filter(v=>v!==val); render(); });
          chip.appendChild(label);
          chip.appendChild(removeBtn);
          listEl.appendChild(chip);
        }
      }
      function addFromInput(){
        let added = false;
        for (const piece of inputEl.value.split(",")) {
          const val = piece.trim();
          if (!val) continue;
          if (!values.some(v=>v.toLowerCase()===val.toLowerCase())) { values.push(val); added = true; }
        }
        if (added) render();
        inputEl.value = "";
      }
      inputEl.addEventListener("keydown", (e)=>{
        if (e.key==="Enter" || e.key===",") { e.preventDefault(); addFromInput(); }
      });
      inputEl.addEventListener("blur", ()=>{ if (inputEl.value.trim()) addFromInput(); });
      render();
      return {
        get: ()=>[...values],
        set: (next)=>{ values = [...(next||[])]; render(); },
      };
    }

    const countriesField = setupChipField(isNew ? [] : item.production_countries, "countries-chip-list", "f-countries-input", "Usuń kraj produkcji");
    const originField = setupChipField(isNew ? [] : item.origin_country, "origin-chip-list", "f-origin-input", "Usuń kraj pochodzenia");
    const companiesField = setupChipField(isNew ? [] : item.production_companies, "companies-chip-list", "f-companies-input", "Usuń wytwórnię");
    const languageInput = overlay.querySelector("#f-language");
    const trailerInput = overlay.querySelector("#f-trailer");
    // Okładka nie jest ręcznie edytowalna - pobierana automatycznie z TMDb.
    let currentPosterPath = isNew ? null : (item.poster_path || null);
    if (!isNew) {
      languageInput.value = item.original_language || "";
      trailerInput.value = item.trailer_key || "";
    }

    // Kolekcja/saga (tylko dla filmów) - edytowana lokalnie w tym oknie i
    // zapisywana do danych pozycji (item.collection) dopiero po kliknięciu
    // "Zapisz". `collectionKnown` odróżnia "jeszcze nie sprawdzano w TMDb"
    // (undefined - okno informacji spróbuje pobrać automatycznie) od
    // "sprawdzono/edytowano" (tablica, nawet pusta - nie pobieraj już
    // automatycznie).
    let collectionDraft = (!isNew && Array.isArray(item.collection)) ? [...item.collection] : [];
    let collectionKnown = !isNew && item.collection !== undefined;
    if (type === TYPE_MOVIE) {
      const collContent = overlay.querySelector("#edit-collection-content");
      const collAddBtn = overlay.querySelector("#collection-add-btn");
      const collTitleInput = overlay.querySelector("#collection-title-input");
      if (collTitleInput && !isNew && item.collection_title) collTitleInput.value = item.collection_title;
      function renderCollectionRows(){
        if (!collContent) return;
        collContent.innerHTML = "";
        if (!collectionDraft.length) {
          const tr = document.createElement("tr");
          const td = document.createElement("td");
          td.className = "muted";
          td.textContent = "Brak pozycji w kolekcji.";
          tr.appendChild(td);
          collContent.appendChild(tr);
          return;
        }
        const sortedParts = [...collectionDraft].sort((a,b)=>String(a.release_date||"9999").localeCompare(String(b.release_date||"9999")));
        for (const part of sortedParts) {
          const tr = buildTmdbRecordRow(TYPE_MOVIE, part);
          const delTd = document.createElement("td");
          delTd.style.whiteSpace = "nowrap";
          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "btn small secondary";
          delBtn.textContent = "✕";
          delBtn.title = "Usuń z kolekcji";
          delBtn.addEventListener("click", (e)=>{
            e.stopPropagation();
            collectionDraft = collectionDraft.filter(p=>p!==part);
            collectionKnown = true;
            renderCollectionRows();
          });
          delTd.appendChild(delBtn);
          tr.appendChild(delTd);
          collContent.appendChild(tr);
        }
      }
      if (collAddBtn) collAddBtn.addEventListener("click", async ()=>{
        const q = await askText({title:"Dodaj do kolekcji", prompt:"Wpisz tytuł filmu:"});
        if (!q) return;
        let results = [];
        try { results = await tmdbSearchList(TYPE_MOVIE, q); } catch(err) { results = []; }
        let chosen = null;
        if (results.length > 1) {
          chosen = await openPickListDialog({
            title: "Wybierz film",
            items: results,
            renderLabel: r => (r.title||r.original_title||"(bez tytułu)") + (r.release_date ? ` (${r.release_date.slice(0,4)})` : ""),
          });
          if (!chosen) return;
        } else if (results.length === 1) {
          chosen = results[0];
        } else {
          chosen = {id:null, title:q, release_date:"", poster_path:null};
        }
        const part = normalizeCollectionPart(chosen);
        if (part.id!=null && collectionDraft.some(p=>p.id===part.id)) { renderCollectionRows(); return; }
        collectionDraft.push(part);
        collectionKnown = true;
        // Jeśli dodawany film należy do kolekcji w TMDb, a użytkownik nie
        // wpisał jeszcze własnej nazwy - podpowiedz nazwę kolekcji z TMDb.
        if (chosen && chosen.id!=null && collTitleInput && !collTitleInput.value.trim()) {
          try {
            const coll = await tmdbFetchCollection(chosen.id);
            if (coll && coll.name) collTitleInput.value = coll.name;
          } catch(err) { /* brak nazwy kolekcji nie blokuje dodawania */ }
        }
        renderCollectionRows();
      });
      renderCollectionRows();
    }

    // Zaakceptuj pełny link YouTube albo sam identyfikator filmu.
    function extractYoutubeId(val){
      const v = String(val||"").trim();
      if (!v) return "";
      let m = /(?:youtu\.be\/|v=|\/embed\/)([A-Za-z0-9_-]{6,})/.exec(v);
      if (m) return m[1];
      return v;
    }

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
        ${season.air_date ? `<div class="title-date" style="margin:-2px 0 6px 0;">${escapeHtml(String(season.air_date).slice(0,4))}</div>` : ""}
        <textarea class="entry season-overview-input" rows="4" placeholder="Opis sezonu" style="display:block;width:100%;box-sizing:border-box;margin:0 0 8px 0;font-size:12px;resize:vertical;">${escapeHtml(season.overview||"")}</textarea>
        <div class="season-actions">
          <button class="btn small" data-act="check-all">Zaznacz cały</button>
          <button class="btn small" data-act="uncheck-all">Odznacz cały</button>
          ${canEdit ? '<button class="btn small secondary" data-act="remove-season">Usuń sezon</button>' : ''}
        </div>
        <div class="episodes-list"></div>
      `;
      const overviewInput = box.querySelector(".season-overview-input");
      overviewInput.addEventListener("input", ()=>{
        season.overview = overviewInput.value;
      });
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
        for (const e of season.episodes) markEpisodeWatched(e, true);
        renderSeasonsList();
        await autoSeasonDurations(season);
      });
      box.querySelector('[data-act="uncheck-all"]').addEventListener("click", ()=>{
        for (const e of season.episodes) markEpisodeWatched(e, false);
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
        markEpisodeWatched(ep, checkbox.checked);
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

      // Opis odcinka - edytowalne pole w ramce (analogicznie do opisu sezonu),
      // umieszczone pod wierszem odcinka.
      const wrap = document.createElement("div");
      wrap.className = "episode-wrap";
      wrap.appendChild(row);
      const overviewInput = document.createElement("textarea");
      overviewInput.className = "entry ep-overview-input";
      overviewInput.rows = 2;
      overviewInput.placeholder = "Opis odcinka";
      overviewInput.value = ep.overview || "";
      overviewInput.addEventListener("input", ()=>{
        ep.overview = overviewInput.value;
      });
      wrap.appendChild(overviewInput);
      return wrap;
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
        for (let i=1; i<=result.count; i++) episodes.push({number:i, watched:false, duration:0, title:"", overview:""});
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
            const episodes = (eps||[]).map(e=>({number: e.episode_number, watched:false, duration: e.runtime||0, title: e.name||"", overview: e.overview||""})).filter(e=>e.number>0);
            fetched.push({number: sn, episodes, overview: eps.season_overview||"", air_date: eps.season_air_date||""});
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

    async function applyTmdbExtraInfo(tid, details){
      try {
        const info = await tmdbFetchOriginInfo(type, tid);
        if (info) {
          if (info.productionCountries && info.productionCountries.length) countriesField.set(info.productionCountries);
          if (info.originCountry && info.originCountry.length) originField.set(info.originCountry);
          if (info.originalLanguage && languageInput) languageInput.value = info.originalLanguage;
        }
      } catch(err) { /* brak danych o kraju/jezyku nie blokuje reszty */ }
      try {
        let fetchedPoster = details && details.poster_path ? details.poster_path : null;
        if (!fetchedPoster) fetchedPoster = await tmdbFetchPoster(type, tid);
        if (fetchedPoster) currentPosterPath = fetchedPoster;
      } catch(err) { /* brak okladki nie blokuje reszty */ }
      try {
        const extras = await tmdbFetchExtras(type, tid);
        if (extras && extras.companies && extras.companies.length) companiesField.set(extras.companies);
      } catch(err) { /* brak wytworni nie blokuje reszty */ }
      try {
        const trailerKey = await tmdbFetchTrailerKey(type, tid);
        if (trailerKey && trailerInput) trailerInput.value = trailerKey;
      } catch(err) { /* brak zwiastuna nie blokuje reszty */ }
    }

    function finish(result){
      closeOverlay(overlay);
      document.removeEventListener("keydown", onKey);
      resolve(result);
    }
    function onKey(e){ if (!isTopOverlay(overlay)) return; if (e.key==="Escape") finish(null); }
    document.addEventListener("keydown", onKey);

    if (isNew && prefillTmdb) {
      applySuggestion(prefillTmdb);
    }

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
      let budget = null;
      if (budgetInput) {
        const budgetStr = budgetInput.value.trim();
        if (budgetStr) {
          if (!/^\d+$/.test(budgetStr)) {
            await showAlert("Błędny budżet", "Budżet musi być liczbą całkowitą (w dolarach).", "error");
            return;
          }
          budget = parseInt(budgetStr,10);
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
      if (statusKey === STATUS_PLANNED) {
        const conflict = findPlannedConflict(type, title, excludeId);
        if (conflict) {
          const conflictStatusLabel = STATUS_LABELS[conflict.status] || conflict.status || "";
          const conflictLp = computeLp(conflict.type, conflict.status, conflict.id);
          const lpTxt = conflictLp!=null ? `Lp ${conflictLp}` : "nieznana pozycja";
          await showAlert(
            "Pozycja już istnieje",
            `Pozycja „${title}” już znajduje się na liście ${TYPE_LABELS[type]} w zakładce „${conflictStatusLabel}” (${lpTxt}).\n\n` +
            `Nie można dodać jej do Planowanych, ponieważ powstałby duplikat.`,
            "error"
          );
          return;
        }
      }

      const resultItem = isNew ? {id: uuidv4(), type, addedAt: Date.now()} : item;
      resultItem.title = title;
      const origTitleVal = originalTitleInput.value.trim();
      if (origTitleVal) resultItem.original_title = origTitleVal;
      else delete resultItem.original_title;
      resultItem.premiere_date = premiereDate;
      const ageCertVal = ageCertInput.value.trim();
      if (ageCertVal) resultItem.age_certification = ageCertVal;
      else delete resultItem.age_certification;
      resultItem.status = statusKey;
      resultItem.rating = normalizeRating(ratingSelect.value);
      resultItem.tags = [...tags];
      resultItem.genres = [...genres];
      resultItem.cast = [...cast];
      resultItem.creators = [...creators];
      resultItem.description = descriptionInput.value.trim();
      resultItem.production_countries = countriesField.get();
      resultItem.origin_country = originField.get();
      resultItem.original_language = languageInput ? languageInput.value.trim() : "";
      resultItem.production_companies = companiesField.get();
      const trailerVal = trailerInput ? extractYoutubeId(trailerInput.value) : "";
      if (trailerVal) resultItem.trailer_key = trailerVal;
      else delete resultItem.trailer_key;
      if (currentPosterPath) resultItem.poster_path = currentPosterPath;
      else delete resultItem.poster_path;
      if (tmdbId) resultItem.tmdb_id = tmdbId;
      resultItem.budget = budget;
      if (type===TYPE_MOVIE) {
        resultItem.duration = duration;
        if (collectionKnown) resultItem.collection = collectionDraft;
        else delete resultItem.collection;
        const collTitleVal = overlay.querySelector("#collection-title-input");
        const collTitleTrimmed = collTitleVal ? collTitleVal.value.trim() : "";
        if (collTitleTrimmed) resultItem.collection_title = collTitleTrimmed;
        else delete resultItem.collection_title;
        if (statusKey === STATUS_WATCHED) {
          if (!resultItem.watchedAt) resultItem.watchedAt = Date.now();
        } else {
          delete resultItem.watchedAt;
        }
      } else {
        resultItem.seasons = seasons;
      }
      finish(resultItem);
    });
  });
}

