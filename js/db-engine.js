// ============================================================
// db-engine.js — prawdziwa baza SQLite (silnik WebAssembly) trzymana
// trwale w IndexedDB telefonu/przeglądarki. Zastępuje dawny zapis
// samego JSON-a w localStorage. Reszta aplikacji nadal operuje na
// zwykłym obiekcie JS `db` (patrz config.js) — ten plik odpowiada
// tylko za to, ŻE i JAK ten obiekt trafia na dysk.
// ============================================================

let SQL = null;          // instancja biblioteki sql.js (po inicjalizacji)
let sqliteDb = null;      // aktualnie otwarta baza SQLite (w pamięci, WASM)
let sqlEngineReady = null; // Promise — inicjalizacja silnika (raz na sesję)

// --- IndexedDB: proste odczyty/zapisy surowych bajtów pliku .sqlite -------

function idbOpen(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = ()=>{
      const dbase = req.result;
      if (!dbase.objectStoreNames.contains(IDB_STORE)) {
        dbase.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}

async function idbGetBytes(key){
  const dbase = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = dbase.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(key);
    req.onsuccess = ()=> resolve(req.result || null);
    req.onerror = ()=> reject(req.error);
  });
}

async function idbSetBytes(key, bytes){
  const dbase = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = dbase.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    store.put(bytes, key);
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
  });
}

// --- Inicjalizacja silnika sql.js (raz) ------------------------------------

function base64ToUint8Array(base64){
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i=0; i<binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function initSqlEngine(){
  if (sqlEngineReady) return sqlEngineReady;
  const config = {
    locateFile: file => `js/vendor/${file}`,
  };
  // Jeśli dostępny jest osadzony base64 z plikiem sql-wasm.wasm (patrz
  // js/vendor/sql-wasm-base64.js), przekazujemy go bezpośrednio jako
  // gotowe bajty (`wasmBinary`). Dzięki temu silnik NIE próbuje pobierać
  // pliku .wasm przez fetch()/XMLHttpRequest - a to właśnie te wywołania
  // blokują przeglądarki, gdy strona jest otwarta lokalnie z dysku
  // (protokół file://), zamiast być hostowana przez serwer HTTP. Z tym
  // rozwiązaniem aplikacja działa identycznie w obu przypadkach.
  if (typeof window.SQL_WASM_BASE64 === "string" && window.SQL_WASM_BASE64) {
    try{ config.wasmBinary = base64ToUint8Array(window.SQL_WASM_BASE64); }catch(e){}
  }
  sqlEngineReady = initSqlJs(config).then(sql => { SQL = sql; return sql; });
  return sqlEngineReady;
}

function ensureSchema(dbase){
  // Prosta, jednotabelowa struktura "klucz -> wartość (JSON)". To wciąż
  // prawdziwy, samodzielny plik bazy danych SQLite (można go otworzyć w
  // dowolnym programie do SQLite), a jednocześnie nie wymaga przepisywania
  // całej logiki aplikacji na zapytania SQL dla każdego pola z osobna.
  dbase.run(`CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT
  );`);
}

function kvSet(dbase, key, value){
  dbase.run("INSERT INTO kv(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value;", [key, value]);
}

function kvGet(dbase, key){
  const res = dbase.exec("SELECT value FROM kv WHERE key = ?;", [key]);
  if (!res.length || !res[0].values.length) return null;
  return res[0].values[0][0];
}

// Otwiera bazę z podanych bajtów (Uint8Array) albo tworzy nową, pustą.
async function openSqliteFromBytes(bytes){
  await initSqlEngine();
  const dbase = bytes ? new SQL.Database(bytes) : new SQL.Database();
  ensureSchema(dbase);
  return dbase;
}

// Zapisuje aktualny stan (obiekt `db` z config.js) do otwartej bazy SQLite
// w pamięci, a następnie trwale zapisuje cały plik bazy do IndexedDB.
async function persistAppStateToSqlite(){
  if (!sqliteDb) return;
  const payload = {
    version: APP_VERSION,
    items: db.items,
    settings: db.settings,
    notes: db.notes,
    upcoming: db.upcoming || [],
    upcoming_ignored: db.upcoming_ignored || [],
    year_stats: db.year_stats || {movies:{}, episodes:{}},
    planned: db.planned || [],
  };
  kvSet(sqliteDb, "app_data", JSON.stringify(payload));
  kvSet(sqliteDb, "db_name", currentDbName || DEFAULT_DB_FILENAME);
  const bytes = sqliteDb.export(); // Uint8Array — realny, kompletny plik .sqlite
  try{
    await idbSetBytes(IDB_FILE_KEY, bytes);
  }catch(e){ /* brak IndexedDB / brak miejsca — dane zostają przynajmniej w pamięci */ }
}

// Wczytuje obiekt `db`-owy (kształt identyczny jak wcześniej z JSON-a) z
// podanej, otwartej bazy SQLite. Zwraca null, jeśli baza jest pusta.
function readAppStateFromSqlite(dbase){
  const raw = kvGet(dbase, "app_data");
  if (!raw) return null;
  try{
    const data = JSON.parse(raw);
    const name = kvGet(dbase, "db_name");
    return {data, name: name || DEFAULT_DB_FILENAME};
  }catch(e){ return null; }
}

// Jednorazowa migracja ze starego localStorage (JSON) do SQLite — tylko
// jeśli baza SQLite jest jeszcze pusta, a w localStorage są dane ze
// starszej wersji aplikacji. Dzięki temu nikt nie traci dotychczasowej bazy
// przy aktualizacji appki.
function migrateLegacyLocalStorageIfNeeded(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data===null || !Array.isArray(data.items)) return null;
    const name = localStorage.getItem(STORAGE_NAME_KEY) || DEFAULT_DB_FILENAME;
    return {data, name};
  }catch(e){ return null; }
}

// Inicjalizuje silnik + otwiera (lub tworzy) bazę SQLite trzymaną w
// IndexedDB. Zwraca obiekt {data, name} gotowy do wstawienia jako `db`,
// albo null, jeśli to zupełnie nowa/pusta instalacja appki.
async function loadOrInitSqliteDatabase(){
  await initSqlEngine();
  let bytes = null;
  try{ bytes = await idbGetBytes(IDB_FILE_KEY); }catch(e){}
  sqliteDb = await openSqliteFromBytes(bytes ? new Uint8Array(bytes) : null);

  let state = readAppStateFromSqlite(sqliteDb);
  if (!state) {
    // Baza SQLite jest pusta — sprawdź, czy jest coś do zmigrowania ze
    // starszej wersji appki (localStorage + JSON).
    const legacy = migrateLegacyLocalStorageIfNeeded();
    if (legacy) {
      state = legacy;
      kvSet(sqliteDb, "app_data", JSON.stringify(legacy.data));
      kvSet(sqliteDb, "db_name", legacy.name);
      try{ await idbSetBytes(IDB_FILE_KEY, sqliteDb.export()); }catch(e){}
    }
  }
  return state;
}

// Zamienia aktualnie otwartą bazę SQLite w pamięci na wskazaną (np. po
// wczytaniu pliku .sqlite przez użytkownika) i od razu utrwala ją w
// IndexedDB jako nową aktywną bazę appki na tym urządzeniu.
async function replaceActiveSqliteDatabase(newDbase){
  sqliteDb = newDbase;
  ensureSchema(sqliteDb);
  try{ await idbSetBytes(IDB_FILE_KEY, sqliteDb.export()); }catch(e){}
}
