// ============================================================
// storage.js — zapis/odczyt bazy danych (localStorage + plik JSON)
// ============================================================

function migrateItems(items){
  for (const item of items) {
    if (typeof item !== "object" || item===null) continue;
    if (!item.id) item.id = uuidv4();
    if (!("title" in item)) item.title = item.title_pl || item.title_en || "";
    if (typeof item.description !== "string") item.description = "";
    if (!item.original_title) {
      const split = splitOriginalTitle(item.title);
      if (split.original_title) { item.title = split.title; item.original_title = split.original_title; }
    }
    if (item.type !== TYPE_MOVIE && item.type !== TYPE_SERIES) {
      item.type = item.seasons ? TYPE_SERIES : TYPE_MOVIE;
    }
    if (!(item.status in STATUS_LABELS)) item.status = STATUS_WATCHING;
    if (item.type === TYPE_MOVIE && !TYPE_STATUS_ORDER[TYPE_MOVIE].includes(item.status)) {
      item.status = STATUS_WATCHED;
    }
    let rating = item.rating;
    if (!Number.isInteger(rating) || rating < 0 || rating > 10) item.rating = 0;
    if (!Array.isArray(item.tags)) item.tags = [];
    item.tags = item.tags.map(t=>String(t||"").trim()).filter(Boolean);
    if (!Array.isArray(item.genres)) item.genres = [];
    item.genres = item.genres.map(g=>String(g||"").trim()).filter(Boolean);
    if (item.type === TYPE_SERIES) {
      if (!Array.isArray(item.seasons)) item.seasons = [];
      for (const season of item.seasons) {
        if (!Array.isArray(season.episodes)) season.episodes = [];
        for (const ep of season.episodes) {
          if (!("duration" in ep) || ep.duration==null) ep.duration = 0;
          if (!("title" in ep)) ep.title = "";
        }
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
  try{
    const data = {version: APP_VERSION, items: db.items, settings: db.settings, notes: db.notes, upcoming: db.upcoming || [], upcoming_ignored: db.upcoming_ignored || []};
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(STORAGE_NAME_KEY, currentDbName);
  }catch(e){ }
}

function loadFromLocalStorage(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data===null || !Array.isArray(data.items)) return false;
    db = {version: data.version || APP_VERSION, items: migrateItems(data.items), settings: normalizeSettings(data.settings), notes: normalizeNotes(data.notes), upcoming: normalizeUpcoming(data.upcoming), upcoming_ignored: Array.isArray(data.upcoming_ignored) ? data.upcoming_ignored.map(String) : []};
    db.items = extractPlannedIntoNotes(db.items, db.notes);
    if (!db.settings.tmdb_key) {
      try { db.settings.tmdb_key = localStorage.getItem(TMDB_KEY_STORAGE) || ""; } catch(e){}
    }
    currentDbName = localStorage.getItem(STORAGE_NAME_KEY) || DEFAULT_DB_FILENAME;
    return true;
  }catch(e){ return false; }
}

function setDirty(v){
  dirty = v;
  saveToLocalStorage();
  updateDbBadge();
}

function updateDbBadge(){
  const el = document.getElementById("db-name-badge");
  el.innerHTML = `${escapeHtml(currentDbName)}${dirty ? ' <span class="dirty">(niezapisane zmiany)</span>' : ''}`;
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
    db = {version: data.version || APP_VERSION, items: migrateItems(items), settings: normalizeSettings(data.settings), notes: normalizeNotes(data.notes), upcoming: normalizeUpcoming(data.upcoming), upcoming_ignored: Array.isArray(data.upcoming_ignored) ? data.upcoming_ignored.map(String) : []};
    db.items = extractPlannedIntoNotes(db.items, db.notes);
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
  const data = {version: APP_VERSION, items: db.items, settings: db.settings, notes: db.notes, upcoming: db.upcoming || [], upcoming_ignored: db.upcoming_ignored || []};
  const json = JSON.stringify(data, null, 2);

  saveToLocalStorage();
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

