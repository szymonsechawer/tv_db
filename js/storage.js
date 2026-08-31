// ============================================================
// storage.js — zapis/odczyt bazy danych (silnik SQLite w IndexedDB;
// obsługa importu/eksportu pliku .sqlite)
// ============================================================

function migrateItems(items){
  let fallbackAddedCounter = 0;
  for (const item of items) {
    if (typeof item !== "object" || item===null) continue;
    if (!item.id) item.id = uuidv4();
    if (!("title" in item)) item.title = item.title_pl || item.title_en || "";
    if (typeof item.description !== "string") item.description = "";
    // Data dodania do bazy - potrzebna do sortowania "Dodano". Dla pozycji
    // wczytanych ze starszych baz (bez tego pola) przyjmujemy kolejność, w
    // jakiej występują w pliku, jako przybliżenie kolejności dodania -
    // wartości te są zawsze mniejsze niż prawdziwe znaczniki czasu, więc
    // nowo dodawane pozycje trafiają "później" niż zmigrowane.
    if (typeof item.addedAt !== "number") item.addedAt = fallbackAddedCounter++;
    if (!item.original_title) {
      const split = splitOriginalTitle(item.title);
      if (split.original_title) { item.title = split.title; item.original_title = split.original_title; }
    }
    if (item.type !== TYPE_MOVIE && item.type !== TYPE_SERIES) {
      item.type = item.seasons ? TYPE_SERIES : TYPE_MOVIE;
    }
    if (!(item.status in STATUS_LABELS)) item.status = STATUS_WATCHING;
    if (item.type === TYPE_MOVIE && item.status !== STATUS_PLANNED && !TYPE_STATUS_ORDER[TYPE_MOVIE].includes(item.status)) {
      item.status = STATUS_WATCHED;
    }
    let rating = item.rating;
    item.rating = normalizeRating(rating);
    if (!Array.isArray(item.tags)) item.tags = [];
    item.tags = item.tags.map(t=>String(t||"").trim()).filter(Boolean);
    if (!Array.isArray(item.genres)) item.genres = [];
    item.genres = item.genres.map(g=>String(g||"").trim()).filter(Boolean);
    if (!Array.isArray(item.cast)) item.cast = [];
    item.cast = item.cast.map(c=>String(c||"").trim()).filter(Boolean);
    if (!Array.isArray(item.production_countries)) item.production_countries = [];
    item.production_countries = item.production_countries.map(c=>String(c||"").trim()).filter(Boolean);
    if (!Array.isArray(item.origin_country)) item.origin_country = [];
    item.origin_country = item.origin_country.map(c=>String(c||"").trim()).filter(Boolean);
    if (typeof item.original_language !== "string") item.original_language = "";
    if (!Array.isArray(item.production_companies)) item.production_companies = [];
    item.production_companies = item.production_companies.map(c=>String(c||"").trim()).filter(Boolean);
    if (typeof item.trailer_key !== "string") item.trailer_key = "";
    { const b = parseInt(item.budget, 10); item.budget = (Number.isInteger(b) && b > 0) ? b : null; }
    if (item.type === TYPE_MOVIE) {
      // "collection" (kolekcja/saga) - undefined = jeszcze nie sprawdzano w
      // TMDb, tablica (nawet pusta) = użytkownik już ją widział/edytował,
      // więc nie próbujemy jej już pobierać automatycznie ponownie.
      if (item.collection !== undefined) {
        if (!Array.isArray(item.collection)) {
          item.collection = undefined;
        } else {
          item.collection = item.collection
            .filter(p => p && typeof p === "object")
            .map(p => ({
              id: (typeof p.id === "number") ? p.id : null,
              title: String(p.title || p.name || "").trim(),
              original_title: String(p.original_title || p.original_name || "").trim(),
              release_date: String(p.release_date || p.first_air_date || "").trim(),
              poster_path: p.poster_path || null,
            }))
            .filter(p => p.title);
        }
      }
      // Tytuł całej kolekcji/sagi (np. "Kolekcja Iron Man"), osobno od
      // listy jej części - musi trafiać do pliku JSON tak samo jak reszta pól.
      if (typeof item.collection_title === "string") {
        item.collection_title = item.collection_title.trim();
        if (!item.collection_title) delete item.collection_title;
      } else {
        delete item.collection_title;
      }
    } else {
      delete item.collection;
      delete item.collection_title;
    }
    if (item.type === TYPE_SERIES) {
      if (!Array.isArray(item.seasons)) item.seasons = [];
      for (const season of item.seasons) {
        if (!Array.isArray(season.episodes)) season.episodes = [];
        for (const ep of season.episodes) {
          if (!("duration" in ep) || ep.duration==null) ep.duration = 0;
          if (!("title" in ep)) ep.title = "";
          // Opis odcinka - analogicznie do opisu sezonu niżej: zapisywany
          // osobno dla każdego odcinka (może być pobrany z TMDb, przetłumaczony
          // na polski i/lub edytowany ręcznie).
          ep.overview = (typeof ep.overview === "string") ? ep.overview.trim() : "";
        }
        // Opis i data premiery danego sezonu - zapisywane osobno dla
        // każdego sezonu (odróżnia je od ogólnego opisu/daty serialu).
        season.overview = (typeof season.overview === "string") ? season.overview.trim() : "";
        season.air_date = (typeof season.air_date === "string") ? season.air_date.trim() : "";
      }
    }
  }
  return items;
}

function extractPlannedIntoNotes(items, notes){
  const remaining = [];
  const collected = {[TYPE_MOVIE]: [], [TYPE_SERIES]: []};
  for (const item of items) {
    if (item.status === STATUS_PLANNED && (item.type===TYPE_MOVIE || item.type===TYPE_SERIES)) {
      if (item.title) collected[item.type].push(item.title);
    } else {
      remaining.push(item);
    }
  }
  const titles = {[TYPE_MOVIE]: "Planowane filmy", [TYPE_SERIES]: "Planowane seriale"};
  for (const type of [TYPE_MOVIE, TYPE_SERIES]) {
    if (collected[type].length) appendToNote(titles[type], collected[type].join("\n"));
  }
  return remaining;
}

function saveToLocalStorage(){
  // Nazwa funkcji została zachowana (wywołuje ją cała reszta aplikacji przez
  // setDirty()), ale zapis odbywa się teraz do prawdziwej bazy SQLite,
  // trzymanej trwale w IndexedDB telefonu/przeglądarki.
  persistAppStateToSqlite().catch(()=>{});
}

async function loadFromLocalStorage(){
  try{
    const state = await loadOrInitSqliteDatabase();
    if (!state) return false;
    const data = state.data;
    if (typeof data !== "object" || data===null || !Array.isArray(data.items)) return false;
    db = {version: data.version || APP_VERSION, items: migrateItems(data.items), settings: normalizeSettings(data.settings), notes: normalizeNotes(data.notes), upcoming: normalizeUpcoming(data.upcoming), upcoming_ignored: Array.isArray(data.upcoming_ignored) ? data.upcoming_ignored.map(String) : [], year_stats: normalizeYearStats(data.year_stats), planned: normalizePlanned(data.planned)};
    if (!db.settings.tmdb_key) {
      try { db.settings.tmdb_key = localStorage.getItem(TMDB_KEY_STORAGE) || ""; } catch(e){}
    }
    currentDbName = state.name || DEFAULT_DB_FILENAME;
    return true;
  }catch(e){ return false; }
}

function setDirty(v){
  dirty = v;
  saveToLocalStorage();
  updateDbBadge();
}

function updateDbBadge(){
  // Odznaka z nazwą pliku bazy i statusem zapisu została usunięta z UI.
}

document.getElementById("btn-open").addEventListener("click", async ()=>{
  if (supportsFSAccess) {
    try{
      const [handle] = await window.showOpenFilePicker({
        types:[{description:"Baza SQLite", accept:{"application/x-sqlite3":[".sqlite",".db"]}}],
        multiple:false,
      });
      const file = await handle.getFile();
      await loadDbFromFile(file);
      currentFileHandle = handle;
      return;
    }catch(err){
      if (err && err.name==="AbortError") return;
    }
  }
  document.getElementById("file-input").click();
});

document.getElementById("file-input").addEventListener("change", async (e)=>{
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  currentFileHandle = null;
  await loadDbFromFile(file);
});

async function loadDbFromFile(file){
  try{
    const buf = await file.arrayBuffer();
    if (!buf || buf.byteLength === 0) {
      throw new Error("Wybrany plik jest pusty albo nie udało się go w pełni odczytać. Jeśli plik jest w iCloud Drive, upewnij się, że jest już pobrany na urządzenie (nie tylko w chmurze), i spróbuj ponownie.");
    }
    await initSqlEngine();
    let newDbase;
    try{
      newDbase = new SQL.Database(new Uint8Array(buf));
    }catch(e){
      throw new Error("To nie jest plik bazy danych SQLite (np. plik JSON lub inny format nie zadziała tutaj).");
    }
    ensureSchema(newDbase);
    const state = readAppStateFromSqlite(newDbase);
    if (!state) throw new Error("Plik nie zawiera rozpoznawalnej bazy tv_db (brak danych w tabeli kv).");
    const items = state.data.items;
    if (!Array.isArray(items)) throw new Error("Pole 'items' w bazie nie jest listą.");
    const prevKey = (db.settings && db.settings.tmdb_key) || "";
    db = {version: state.data.version || APP_VERSION, items: migrateItems(items), settings: normalizeSettings(state.data.settings), notes: normalizeNotes(state.data.notes), upcoming: normalizeUpcoming(state.data.upcoming), upcoming_ignored: Array.isArray(state.data.upcoming_ignored) ? state.data.upcoming_ignored.map(String) : [], year_stats: normalizeYearStats(state.data.year_stats), planned: normalizePlanned(state.data.planned)};
    if (!db.settings.tmdb_key) db.settings.tmdb_key = prevKey;
    currentDbName = file.name || DEFAULT_DB_FILENAME;
    // Wczytany plik staje się od teraz aktywną bazą urządzenia (trwale w IndexedDB).
    await replaceActiveSqliteDatabase(newDbase);
    localStorage.setItem(STORAGE_NAME_KEY, currentDbName);
    renderSettingsTab();
    setDirty(false);
    renderAll();
    await showAlert("Baza danych otwarta", `Wczytano bazę danych (${db.items.length} pozycji):\n${currentDbName}`, "info");
  }catch(err){
    await showAlert("Błąd", `Nie udało się otworzyć bazy danych:\n${err.message||err}`, "error");
  }
}

document.getElementById("btn-save").addEventListener("click", ()=>{ saveDb(); });

async function saveDb(){
  await persistAppStateToSqlite(); // zapis do aktywnej bazy w IndexedDB (jak dotychczas przy każdej zmianie)
  dirty = false;
  updateDbBadge();

  const bytes = sqliteDb ? sqliteDb.export() : new Uint8Array();

  if (currentFileHandle && typeof currentFileHandle.createWritable === "function") {
    try{
      const writable = await currentFileHandle.createWritable();
      await writable.write(bytes);
      await writable.close();
      return;
    }catch(err){
      if (err && err.name==="NotAllowedError") {
      } else {
        await showAlert("Błąd zapisu pliku", `Dane zostały zachowane lokalnie w bazie na urządzeniu.\n\nBłąd zapisu do pliku: ${err.message||err}`, "error");
        return;
      }
    }
  }

  if (supportsFSAccess && typeof window.showSaveFilePicker === "function") {
    try{
      const handle = await window.showSaveFilePicker({
        suggestedName: currentDbName || DEFAULT_DB_FILENAME,
        types:[{description:"Baza SQLite", accept:{"application/x-sqlite3":[".sqlite"]}}],
      });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      currentFileHandle = handle;
      currentDbName = handle.name || currentDbName;
      localStorage.setItem(STORAGE_NAME_KEY, currentDbName);
      updateDbBadge();
      return;
    }catch(err){
      if (err && err.name==="AbortError") return;
    }
  }

  try{
    const blob = new Blob([bytes], {type: "application/x-sqlite3"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentDbName || DEFAULT_DB_FILENAME;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
  }catch(err){
  }
}

