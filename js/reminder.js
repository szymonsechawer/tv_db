// ============================================================
// reminder.js — przypomnienie o zapisie bazy do pliku
// Okienko pojawia się po 10 zmianach od ostatniego przypomnienia
// albo raz na dobę, jeśli od zapisu do pliku coś się zmieniło.
// ============================================================
const SAVE_REM_KEY = "tv_db_save_reminder";
const SAVE_REM_CHANGES = 10;
const SAVE_REM_HOURS = 24;
let saveRemLastCount = 0, saveRemTimer = null, saveRemShown = false;

function saveRemState(){
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_REM_KEY)); } catch(e){}
  if (!s) { s = {changes: 0, sinceRemind: 0, lastSave: 0, start: Date.now(), lastRemind: 0}; saveRemSet(s); }
  return s;
}
function saveRemSet(s){ try { localStorage.setItem(SAVE_REM_KEY, JSON.stringify(s)); } catch(e){} }

// wywoływane przy każdej zmianie danych (kilka zapisów z jednej akcji liczy się raz)
function saveRemNoteChange(){
  const now = Date.now();
  if (now - saveRemLastCount < 1500) return;
  saveRemLastCount = now;
  const s = saveRemState();
  s.changes++; s.sinceRemind++;
  saveRemSet(s);
  saveRemCheckSoon();
}

// po zapisie do pliku
function saveRemReset(){
  saveRemSet({changes: 0, sinceRemind: 0, lastSave: Date.now(), lastRemind: 0});
}

function saveRemDue(){
  const s = saveRemState();
  if (s.changes <= 0) return false;
  if (s.sinceRemind >= SAVE_REM_CHANGES) return true;
  const ref = Math.max(s.lastSave || 0, s.lastRemind || 0, s.start || 0);
  return Date.now() - ref >= SAVE_REM_HOURS * 3600 * 1000;
}

// pokaż dopiero, gdy nie jest otwarte żadne inne okno
function saveRemCheckSoon(){
  clearTimeout(saveRemTimer);
  saveRemTimer = setTimeout(function tick(){
    if (saveRemShown || !saveRemDue()) return;
    const root = document.getElementById("modal-root");
    if (root && root.children.length) { saveRemTimer = setTimeout(tick, 1500); return; }
    showSaveReminder();
  }, 1200);
}

function fmtSaveRemDate(ts){
  if (!ts) return "nigdy";
  const d = new Date(ts), p = n=>String(n).padStart(2,"0");
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function zmianWord(n){
  if (n === 1) return "zmianę";
  const d = n % 10, dd = n % 100;
  return (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) ? "zmiany" : "zmian";
}

function showSaveReminder(){
  saveRemShown = true;
  const s = saveRemState();
  const overlay = openOverlay(`
    <div class="modal-header">Kopia zapasowa</div>
    <div class="modal-body">
      <div class="msg-box">
        <div class="msg-icon info save-rem-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></div>
        <div class="msg-text">Od ostatniego zapisu do pliku wprowadzono <b>${s.changes} ${zmianWord(s.changes)}</b>.<br><span class="muted">${s.lastSave ? "Ostatni zapis: " + fmtSaveRemDate(s.lastSave) : "Nie było jeszcze zapisu do pliku od włączenia przypomnień."}</span><br><br>Zapisz bazę do pliku, żeby mieć kopię na wypadek utraty danych.</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn secondary" id="save-rem-later">Później</button>
      <button class="btn" id="save-rem-now">Zapisz teraz</button>
    </div>
  `);
  overlay.classList.add("save-rem-overlay");
  const close = ()=>{ closeOverlay(overlay); saveRemShown = false; };
  overlay.querySelector("#save-rem-later").addEventListener("click", ()=>{
    const st = saveRemState(); st.sinceRemind = 0; st.lastRemind = Date.now(); saveRemSet(st);
    close();
  });
  overlay.querySelector("#save-rem-now").addEventListener("click", ()=>{
    close();
    if (typeof saveDb === "function") saveDb();
  });
}
