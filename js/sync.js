// ============================================================
// sync.js — automatyczna synchronizacja bazy z prywatnym repozytorium GitHub
// Każda zmiana (po zapisie lokalnym) jest wysyłana po kilku sekundach,
// a przy otwarciu aplikacji pobierana jest nowsza wersja, jeśli istnieje.
// Token przechowywany jest tylko na tym urządzeniu (localStorage) i nie
// trafia do pliku bazy.
// ============================================================
const GH_CFG_KEY = "tv_db_gh_sync";
const GH_STATE_KEY = "tv_db_gh_state";
const GH_BACKUP_KEY = "backup_before_sync";
const GH_DEFAULT_PATH = "tv_db.json";

let ghTimer = null, ghBusy = false, ghAgain = false, ghLastCheck = 0;

function ghCfg(){ try { return JSON.parse(localStorage.getItem(GH_CFG_KEY)) || {}; } catch(e){ return {}; } }
function ghSetCfg(c){ try { localStorage.setItem(GH_CFG_KEY, JSON.stringify(c)); } catch(e){} }
function ghState(){ try { return JSON.parse(localStorage.getItem(GH_STATE_KEY)) || {}; } catch(e){ return {}; } }
function ghSetState(patch){ const s = {...ghState(), ...patch}; try { localStorage.setItem(GH_STATE_KEY, JSON.stringify(s)); } catch(e){} renderGhStatus(); return s; }
function ghEnabled(){ const c = ghCfg(); return !!(c.enabled && c.token && c.repo); }

function ghUrl(c){
  const path = (c.path || GH_DEFAULT_PATH).split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${c.repo}/contents/${path}`;
}
function ghFetch(c, opts){
  opts = opts || {};
  return fetch(ghUrl(c) + (opts.query || ""), {
    method: opts.method || "GET",
    cache: "no-store",
    headers: {"Authorization": "Bearer " + c.token, "X-GitHub-Api-Version": "2022-11-28", "Accept": opts.accept || "application/vnd.github+json", ...(opts.body ? {"Content-Type":"application/json"} : {})},
    body: opts.body
  });
}
async function ghError(r){
  let msg = "";
  try { msg = (await r.json()).message || ""; } catch(e){}
  if (r.status === 401) return "Nieprawidłowy lub wygasły token (401).";
  if (r.status === 403) return "Brak uprawnień — token musi mieć dostęp „Contents: Read and write” do tego repozytorium (403).";
  if (r.status === 404) return "Nie znaleziono repozytorium — sprawdź nazwę i czy token ma do niego dostęp (404).";
  return `Błąd GitHub ${r.status}${msg ? ": " + msg : ""}`;
}

function utf8ToB64(str){
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}

// Pobiera plik: {sha, data} albo null, gdy pliku jeszcze nie ma.
async function ghDownload(c){
  c = c || ghCfg();
  const meta = await ghFetch(c);
  if (meta.status === 404) {
    // rozróżnij brak pliku od braku repozytorium
    const repo = await fetch(`https://api.github.com/repos/${c.repo}`, {cache:"no-store", headers:{"Authorization":"Bearer "+c.token}});
    if (repo.ok) return null;
    throw new Error(await ghError(repo));
  }
  if (!meta.ok) throw new Error(await ghError(meta));
  const m = await meta.json();
  const raw = await ghFetch(c, {accept: "application/vnd.github.raw+json"});
  if (!raw.ok) throw new Error(await ghError(raw));
  const text = (await raw.text()).replace(/^﻿/, "");
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.items)) throw new Error("Plik na GitHub nie jest bazą tv_db.");
  return {sha: m.sha, data};
}

async function ghPut(c, json, sha){
  const body = {message: "tv_db: " + new Date().toLocaleString("pl-PL"), content: utf8ToB64(json)};
  if (sha) body.sha = sha;
  return ghFetch(c, {method: "PUT", body: JSON.stringify(body)});
}

function ghSyncSchedule(){
  if (!ghEnabled()) return;
  ghSetState({pending: true});
  clearTimeout(ghTimer);
  ghTimer = setTimeout(()=>{ ghTimer = null; ghUpload(); }, 4000);
}

async function ghUpload(force){
  if (!ghEnabled()) return false;
  if (ghBusy) { ghAgain = true; return false; }
  ghBusy = true;
  const c = ghCfg();
  try {
    ghSetState({working: "Wysyłanie…"});
    const json = buildPersistJson();
    let r = await ghPut(c, json, ghState().sha);
    if (r.status === 409 || r.status === 422) {
      // plik na GitHub zmienił się (np. zapis z innego urządzenia)
      const remote = await ghDownload(c);
      if (!force && remote && (Number(remote.data.saved_at) || 0) > localSavedAt) {
        await ghApplyRemote(remote);
        return true;
      }
      r = await ghPut(c, json, remote ? remote.sha : undefined);
    }
    if (!r.ok) throw new Error(await ghError(r));
    const j = await r.json();
    ghSetState({sha: j.content && j.content.sha, pending: false, lastOk: Date.now(), lastErr: "", working: ""});
    return true;
  } catch(e) {
    ghSetState({lastErr: (e && e.message) || String(e), working: ""});
    return false;
  } finally {
    ghBusy = false;
    if (ghAgain) { ghAgain = false; ghSyncSchedule(); }
  }
}

async function ghApplyRemote(remote){
  // kopia bezpieczeństwa danych z tego urządzenia przed nadpisaniem
  try { if (typeof idbPut === "function" && storageBackend === "indexedDB") await idbPut(GH_BACKUP_KEY, buildPersistJson()); } catch(e){}
  const prevKey = (db.settings && db.settings.tmdb_key) || "";
  applyLoadedData(remote.data);
  if (!db.settings.tmdb_key) db.settings.tmdb_key = prevKey;
  saveToLocalStorage({keepStamp: true, noSync: true});
  flushPendingSave();
  ghSetState({sha: remote.sha, pending: false, lastOk: Date.now(), lastErr: "", working: ""});
  if (typeof syncThemeFromDb === "function") syncThemeFromDb();
  if (typeof renderSettingsTab === "function") renderSettingsTab();
  if (typeof renderAll === "function") renderAll();
  ghToast("Pobrano najnowsze dane z GitHub");
}

// Przy otwarciu aplikacji (i po powrocie do niej): pobierz nowszą wersję
// albo wyślij lokalne zmiany, jeśli to one są nowsze.
async function ghStartupSync(){
  if (!ghEnabled() || ghBusy) return;
  ghLastCheck = Date.now();
  const c = ghCfg();
  try {
    ghSetState({working: "Sprawdzanie…"});
    const remote = await ghDownload(c);
    ghSetState({working: ""});
    if (!remote) { await ghUpload(); return; }
    ghSetState({sha: remote.sha});
    const rAt = Number(remote.data.saved_at) || 0;
    if (rAt > localSavedAt) await ghApplyRemote(remote);
    else if (rAt < localSavedAt) await ghUpload();
    else ghSetState({pending: false, lastOk: Date.now(), lastErr: ""});
  } catch(e) {
    ghSetState({lastErr: (e && e.message) || String(e), working: ""});
  }
}

document.addEventListener("visibilitychange", ()=>{
  if (!ghEnabled()) return;
  if (document.visibilityState === "hidden") {
    if (ghTimer) { clearTimeout(ghTimer); ghTimer = null; ghUpload(); }
  } else if (Date.now() - ghLastCheck > 60000 && !ghState().pending) {
    ghStartupSync();
  }
});
window.addEventListener("online", ()=>{ if (ghEnabled() && ghState().pending) ghUpload(); });

function ghToast(text){
  const t = document.createElement("div");
  t.className = "gh-toast"; t.textContent = text;
  document.body.appendChild(t);
  setTimeout(()=>t.classList.add("hide"), 2600);
  setTimeout(()=>t.remove(), 3200);
}

function fmtWhen(ts){
  if (!ts) return "";
  const d = new Date(ts), p = n=>String(n).padStart(2,"0");
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderGhStatus(){
  const el = document.getElementById("gh-status");
  if (!el) return;
  const c = ghCfg(), s = ghState();
  el.classList.remove("err");
  if (!c.enabled) { el.textContent = "Synchronizacja wyłączona."; return; }
  if (s.working) { el.textContent = s.working; return; }
  if (s.lastErr) { el.textContent = "Błąd: " + s.lastErr; el.classList.add("err"); return; }
  const parts = [];
  if (s.lastOk) parts.push("Ostatnia synchronizacja: " + fmtWhen(s.lastOk));
  if (s.pending) parts.push("zmiany czekają na wysłanie");
  el.textContent = parts.join(" · ") || "Połączono.";
}

function initGhSyncSettings(){
  const repoEl = document.getElementById("gh-repo");
  if (!repoEl || repoEl.dataset.init) return;
  repoEl.dataset.init = "1";
  const tokEl = document.getElementById("gh-token"), pathEl = document.getElementById("gh-path");
  const c = ghCfg();
  repoEl.value = c.repo || ""; tokEl.value = c.token || ""; pathEl.value = c.path || "";

  document.getElementById("gh-connect").addEventListener("click", async ()=>{
    const repo = repoEl.value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "");
    const token = tokEl.value.trim();
    const path = pathEl.value.trim() || GH_DEFAULT_PATH;
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) { showAlert("Synchronizacja", "Podaj repozytorium w formacie użytkownik/nazwa oraz token dostępu.", "error"); return; }
    const cfg = {repo, token, path, enabled: true};
    repoEl.value = repo;
    try {
      ghSetState({working: "Łączenie…", lastErr: ""});
      const remote = await ghDownload(cfg);
      ghSetCfg(cfg);
      localStorage.setItem(GH_STATE_KEY, JSON.stringify({sha: remote ? remote.sha : null}));
      if (!remote) {
        await ghUpload(true);
        showAlert("Synchronizacja", "Połączono. Baza z tego urządzenia została wysłana na GitHub.", "info");
      } else {
        const when = fmtWhen(Number(remote.data.saved_at) || 0) || "nieznana data";
        const take = await showConfirm("Na GitHub jest już baza",
          `Na GitHub jest baza (${remote.data.items.length} pozycji, zapisana: ${when}).\n\nTak — pobierz ją na to urządzenie (zastąpi dane tutaj).\nNie — wyślij dane z tego urządzenia na GitHub.`);
        if (take) await ghApplyRemote(remote); else await ghUpload(true);
      }
    } catch(e) {
      ghSetState({working: "", lastErr: (e && e.message) || String(e)});
      showAlert("Synchronizacja", "Nie udało się połączyć:\n" + ((e && e.message) || e), "error");
    }
    renderGhStatus();
  });
  document.getElementById("gh-push").addEventListener("click", async ()=>{
    if (!ghEnabled()) { showAlert("Synchronizacja", "Najpierw połącz z GitHub.", "info"); return; }
    if (await ghUpload(true)) ghToast("Wysłano dane na GitHub");
  });
  document.getElementById("gh-pull").addEventListener("click", async ()=>{
    if (!ghEnabled()) { showAlert("Synchronizacja", "Najpierw połącz z GitHub.", "info"); return; }
    try {
      ghSetState({working: "Pobieranie…"});
      const remote = await ghDownload();
      ghSetState({working: ""});
      if (!remote) { showAlert("Synchronizacja", "Na GitHub nie ma jeszcze pliku bazy.", "info"); return; }
      if (await showConfirm("Pobierz z GitHub", "Zastąpić dane na tym urządzeniu wersją z GitHub?")) await ghApplyRemote(remote);
    } catch(e) { ghSetState({working: "", lastErr: (e && e.message) || String(e)}); }
  });
  document.getElementById("gh-off").addEventListener("click", ()=>{
    const cfg = ghCfg(); cfg.enabled = false; ghSetCfg(cfg); renderGhStatus();
  });
  renderGhStatus();
}
