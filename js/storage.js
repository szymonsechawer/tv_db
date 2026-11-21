// ============================================================
// storage.js — zapis/odczyt bazy danych (localStorage + plik JSON)
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
    // Data zakończenia (RRRR-MM-DD) - tylko dla pozycji w "Zakończonych".
    if (item.status !== STATUS_WATCHED || typeof item.finished_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.finished_date)) {
      delete item.finished_date;
    }
    if (item.type === TYPE_SERIES) {
      if (!Array.isArray(item.seasons)) item.seasons = [];
      for (const season of item.seasons) {
        if (!Array.isArray(season.episodes)) season.episodes = [];
        for (const ep of season.episodes) {
          if (!("duration" in ep) || ep.duration==null) ep.duration = 0;
          if (!("title" in ep)) ep.title = "";
          // Opisy odcinków nie są już używane - usuwane ze starszych baz.
          delete ep.overview;
        }
        // Opisy sezonów nie są już używane - usuwane ze starszych baz.
        delete season.overview;
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

// ============================================================
// Trwały zapis bazy w przeglądarce: IndexedDB (duży limit, setki MB),
// z awaryjnym localStorage (ok. 5 MB) gdy IndexedDB jest niedostępne.
// Nazwa saveToLocalStorage() zostaje dla zgodności z resztą kodu.
// ============================================================
const IDB_NAME = "tv_db";
const IDB_STORE = "kv";
const IDB_DATA_KEY = "data";
let storageBackend = "localStorage";   // "indexedDB" po udanym otwarciu
let lastSaveError = null;
let saveErrorShown = false;
let idbPromise = null;
let saveTimer = null;
let lastSavedBytes = 0;
let localSavedAt = 0;          // znacznik czasu ostatniej zmiany danych (do synchronizacji)
let skipSyncOnce = false;      // zapis lokalny bez wysyłania na GitHub (np. po pobraniu)

function idbOpen(){
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject)=>{
    if (!("indexedDB" in window)) { reject(new Error("Brak IndexedDB")); return; }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = ()=>{ req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error || new Error("Nie udało się otworzyć IndexedDB"));
    req.onblocked = ()=>reject(new Error("IndexedDB zablokowane"));
  });
  idbPromise.catch(()=>{ idbPromise = null; });
  return idbPromise;
}
async function idbGet(key){
  const d = await idbOpen();
  return new Promise((resolve, reject)=>{
    const r = d.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
    r.onsuccess = ()=>resolve(r.result);
    r.onerror = ()=>reject(r.error);
  });
}
async function idbPut(key, value){
  const d = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = d.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error || new Error("Błąd zapisu IndexedDB"));
    tx.onabort = ()=>reject(tx.error || new Error("Zapis IndexedDB przerwany (brak miejsca?)"));
  });
}

function buildPersistJson(){
  const data = {version: APP_VERSION, items: db.items, settings: db.settings, notes: db.notes, upcoming: db.upcoming || [], upcoming_ignored: db.upcoming_ignored || [], year_stats: db.year_stats || {movies:{}, episodes:{}}, planned: db.planned || [], saved_at: localSavedAt};
  return JSON.stringify(data);
}

// Zapis jest odkładany o chwilę i łączony (wiele zmian = jeden zapis).
function saveToLocalStorage(opts){
  if (!(opts && opts.keepStamp)) localSavedAt = Date.now();
  if (opts && opts.noSync) skipSyncOnce = true;
  try { localStorage.setItem(STORAGE_NAME_KEY, currentDbName); } catch(e){}
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{ saveTimer = null; persistNow(); }, 150);
}

async function persistNow(){
  const json = buildPersistJson();
  const noSync = skipSyncOnce; skipSyncOnce = false;
  const ok = await persistJson(json);
  if (ok && !noSync && typeof ghSyncSchedule === "function") ghSyncSchedule();
  return ok;
}

async function persistJson(json){
  if (storageBackend === "indexedDB") {
    try {
      await idbPut(IDB_DATA_KEY, json);
      lastSavedBytes = json.length;
      onSaveOk();
      return true;
    } catch(err) {
      // spróbuj awaryjnie localStorage
      try { localStorage.setItem(STORAGE_KEY, json); lastSavedBytes = json.length; onSaveOk(); return true; }
      catch(e2) { onSaveError(err); return false; }
    }
  }
  try { localStorage.setItem(STORAGE_KEY, json); lastSavedBytes = json.length; onSaveOk(); return true; }
  catch(err) { onSaveError(err); return false; }
}

function flushPendingSave(){
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; persistNow(); }
}
document.addEventListener("visibilitychange", ()=>{ if (document.visibilityState === "hidden") flushPendingSave(); });
window.addEventListener("pagehide", flushPendingSave);

function onSaveOk(){
  lastSaveError = null;
  saveErrorShown = false;
  if (typeof renderStorageInfo === "function") renderStorageInfo();
}
function onSaveError(err){
  lastSaveError = err;
  if (typeof renderStorageInfo === "function") renderStorageInfo();
  if (!saveErrorShown) {
    saveErrorShown = true;
    showAlert("Nie udało się zapisać danych",
      "Przeglądarka nie zapisała ostatnich zmian (brak miejsca lub błąd pamięci).\n\nZapisz bazę do pliku przyciskiem „Zapisz”, żeby niczego nie stracić.\n\nSzczegóły: " + ((err && err.message) || err),
      "error");
  }
}

function applyLoadedData(data){
  localSavedAt = Number(data.saved_at) || 0;
  db = {version: data.version || APP_VERSION, items: migrateItems(data.items), settings: normalizeSettings(data.settings), notes: normalizeNotes(data.notes), upcoming: normalizeUpcoming(data.upcoming), upcoming_ignored: Array.isArray(data.upcoming_ignored) ? data.upcoming_ignored.map(String) : [], year_stats: normalizeYearStats(data.year_stats), planned: normalizePlanned(data.planned)};
  if (!db.settings.tmdb_key) {
    try { db.settings.tmdb_key = localStorage.getItem(TMDB_KEY_STORAGE) || ""; } catch(e){}
  }
  try { currentDbName = localStorage.getItem(STORAGE_NAME_KEY) || DEFAULT_DB_FILENAME; } catch(e){}
}
function parseStored(raw){
  if (!raw) return null;
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (typeof data !== "object" || data===null || !Array.isArray(data.items)) return null;
  return data;
}

// Wczytanie przy starcie. Jednorazowo przenosi starą bazę z localStorage
// do IndexedDB (po sprawdzeniu zapisu usuwa kopię z localStorage, żeby
// zwolnić miejsce).
async function loadPersistedDb(){
  let fromIdb = null;
  try {
    await idbOpen();
    storageBackend = "indexedDB";
    fromIdb = parseStored(await idbGet(IDB_DATA_KEY));
  } catch(e) { storageBackend = "localStorage"; }

  let fromLs = null;
  try { fromLs = parseStored(localStorage.getItem(STORAGE_KEY)); } catch(e){}

  const data = fromIdb || fromLs;
  if (!data) return false;
  applyLoadedData(data);

  if (storageBackend === "indexedDB" && !fromIdb && fromLs) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      await idbPut(IDB_DATA_KEY, raw);
      const check = await idbGet(IDB_DATA_KEY);
      if (check && check.length === raw.length) {
        localStorage.removeItem(STORAGE_KEY);
        lastSavedBytes = raw.length;
      }
    } catch(e) { /* zostaje localStorage */ }
  } else if (storageBackend === "indexedDB" && fromIdb && fromLs) {
    // stara kopia po migracji - niepotrzebna
    try { localStorage.removeItem(STORAGE_KEY); } catch(e){}
  }
  if (fromIdb) lastSavedBytes = JSON.stringify(fromIdb).length;
  if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch(e){} }
  return true;
}

// Zgodność: synchroniczny odczyt z localStorage (używany tylko awaryjnie).
function loadFromLocalStorage(){
  try{
    const data = parseStored(localStorage.getItem(STORAGE_KEY));
    if (!data) return false;
    applyLoadedData(data);
    return true;
  }catch(e){ return false; }
}

function renderStorageInfo(){
  const el = document.getElementById("set-storage-status");
  if (!el) return;
  const mb = (lastSavedBytes / (1024*1024)).toFixed(1).replace(".", ",");
  if (lastSaveError) {
    el.textContent = `Błąd zapisu! Zapisz bazę do pliku. (${(lastSaveError && lastSaveError.message) || lastSaveError})`;
    el.classList.add("err");
    return;
  }
  el.classList.remove("err");
  el.textContent = storageBackend === "indexedDB"
    ? `Dane zapisywane w IndexedDB (duży limit pamięci) · ok. ${mb} MB`
    : `Dane zapisywane w localStorage (limit ok. 5 MB) · ok. ${mb} MB`;
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
        types:[{description:"Baza JSON", accept:{"application/json":[".json"]}}],
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
    const text = await file.text();
    const cleaned = text.replace(/^\uFEFF/, "");
    const data = JSON.parse(cleaned);
    if (typeof data !== "object" || data===null || Array.isArray(data)) {
      throw new Error("Nieoczekiwany format pliku (oczekiwano obiektu JSON).");
    }
    const items = data.items;
    if (!Array.isArray(items)) throw new Error("Pole 'items' w pliku bazy nie jest listą.");
    const prevKey = (db.settings && db.settings.tmdb_key) || "";
    db = {version: data.version || APP_VERSION, items: migrateItems(items), settings: normalizeSettings(data.settings), notes: normalizeNotes(data.notes), upcoming: normalizeUpcoming(data.upcoming), upcoming_ignored: Array.isArray(data.upcoming_ignored) ? data.upcoming_ignored.map(String) : [], year_stats: normalizeYearStats(data.year_stats), planned: normalizePlanned(data.planned)};
    if (!db.settings.tmdb_key) db.settings.tmdb_key = prevKey;
    renderSettingsTab();
    currentDbName = file.name || DEFAULT_DB_FILENAME;
    setDirty(false);
    renderAll();
    await showAlert("Baza danych otwarta", `Wczytano bazę danych (${db.items.length} pozycji):\n${currentDbName}`, "info");
  }catch(err){
    await showAlert("Błąd", `Nie udało się otworzyć bazy danych:\n${err.message||err}`, "error");
  }
}

document.getElementById("btn-save").addEventListener("click", ()=>{ saveDb(); });

async function saveDb(){
  const data = {version: APP_VERSION, items: db.items, settings: db.settings, notes: db.notes, upcoming: db.upcoming || [], upcoming_ignored: db.upcoming_ignored || [], year_stats: db.year_stats || {movies:{}, episodes:{}}, planned: db.planned || []};
  const json = JSON.stringify(data, null, 2);

  saveToLocalStorage();
  flushPendingSave();
  dirty = false;
  updateDbBadge();

  if (currentFileHandle && typeof currentFileHandle.createWritable === "function") {
    try{
      const writable = await currentFileHandle.createWritable();
      await writable.write(json);
      await writable.close();
      return;
    }catch(err){
      if (err && err.name==="NotAllowedError") {
      } else {
        await showAlert("Błąd zapisu pliku", `Dane zostały zachowane lokalnie w pamięci przeglądarki.\n\nBłąd zapisu do pliku: ${err.message||err}`, "error");
        return;
      }
    }
  }

  if (supportsFSAccess && typeof window.showSaveFilePicker === "function") {
    try{
      const handle = await window.showSaveFilePicker({
        suggestedName: currentDbName || DEFAULT_DB_FILENAME,
        types:[{description:"Baza JSON", accept:{"application/json":[".json"]}}],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
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
    const blob = new Blob([json], {type: "application/json"});
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

