// ============================================================
// reminders.js — przypomnienia o premierach odcinków (dziś / jutro)
//
// Bez własnego serwera przeglądarka nie może wysłać powiadomienia przy
// zamkniętej aplikacji, więc sprawdzamy premiery przy każdym otwarciu
// (i powrocie do) aplikacji: pasek u góry + powiadomienie systemowe
// (jeśli włączone) + licznik na ikonie aplikacji (iOS 16.4+, z ekranu
// głównego). Każda premiera jest zgłaszana powiadomieniem raz.
// ============================================================

const REMINDERS_ENABLED_KEY = "tv_db_reminders";
const REMINDERS_SHOWN_KEY = "tv_db_reminders_shown";
const REMINDER_BANNER_HIDDEN_KEY = "tv_db_reminder_banner_hidden";

function remindersEnabled(){
  try { return localStorage.getItem(REMINDERS_ENABLED_KEY) === "1"; } catch(e){ return false; }
}
function setRemindersEnabled(v){
  try { localStorage.setItem(REMINDERS_ENABLED_KEY, v ? "1" : "0"); } catch(e){}
}

function localISODate(offsetDays){
  const d = new Date();
  d.setDate(d.getDate() + (offsetDays||0));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function epCode(s, e){
  return `S${String(s).padStart(2,"0")}E${String(e).padStart(2,"0")}`;
}

// Premiery dziś i jutro: odcinki z datą emisji w obserwowanych serialach
// (Oglądane, Wstrzymane, Zakończone) oraz premiery sezonów z "Nowości".
function collectPremieres(){
  const today = localISODate(0), tomorrow = localISODate(1);
  const out = [];
  const seen = new Set();
  const push = (e)=>{ if (seen.has(e.key)) return; seen.add(e.key); out.push(e); };
  const followed = [STATUS_WATCHING, STATUS_PAUSED, STATUS_WATCHED];
  for (const it of db.items) {
    if (it.type !== TYPE_SERIES || !followed.includes(it.status)) continue;
    for (const s of it.seasons||[]) for (const ep of s.episodes||[]) {
      const d = String(ep.air_date||"").slice(0,10);
      if (d !== today && d !== tomorrow) continue;
      push({key:`${it.id}:${s.number}:${ep.number}:${d}`, itemId: it.id, title: it.title, code: epCode(s.number, ep.number), epTitle: ep.title || "", when: d===today ? "today" : "tomorrow", date: d});
    }
  }
  for (const u of db.upcoming||[]) {
    const d = String(u.air_date||"").slice(0,10);
    if (d !== today && d !== tomorrow) continue;
    const key = `${u.item_id || u.title}:${u.season_number}:1:${d}`;
    push({key, itemId: u.item_id, title: u.title, code: epCode(u.season_number, 1), epTitle: "Premiera sezonu", when: d===today ? "today" : "tomorrow", date: d});
  }
  out.sort((a,b)=> (a.when===b.when ? a.title.localeCompare(b.title,"pl") : (a.when==="today" ? -1 : 1)));
  return out;
}

function reminderLine(p){
  return `${p.when==="today" ? "Dziś" : "Jutro"} nowy odcinek: ${p.title} ${p.code}`;
}

function renderReminderBanner(list){
  let bar = document.getElementById("reminder-banner");
  const hiddenFor = (()=>{ try { return localStorage.getItem(REMINDER_BANNER_HIDDEN_KEY); } catch(e){ return null; } })();
  const sig = list.map(p=>p.key).join("|");
  if (!list.length || hiddenFor === sig) { if (bar) bar.remove(); return; }
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "reminder-banner";
    const app = document.getElementById("app");
    app.insertBefore(bar, document.getElementById("main-tabs"));
  }
  bar.innerHTML = "";
  const icon = document.createElement("div");
  icon.className = "reminder-icon";
  icon.textContent = "🔔";
  const body = document.createElement("div");
  body.className = "reminder-body";
  for (const p of list.slice(0, 4)) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "reminder-row";
    row.innerHTML = `<span class="reminder-when ${p.when}">${p.when==="today" ? "Dziś" : "Jutro"}</span><span class="reminder-title"></span><span class="reminder-code">${p.code}</span>`;
    row.querySelector(".reminder-title").textContent = p.title;
    if (p.itemId && findItem(p.itemId)) row.addEventListener("click", ()=>openViewDialog(p.itemId));
    body.appendChild(row);
  }
  if (list.length > 4) {
    const more = document.createElement("div");
    more.className = "reminder-more muted";
    more.textContent = `i ${list.length-4} więcej`;
    body.appendChild(more);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.className = "reminder-close";
  close.setAttribute("aria-label", "Ukryj");
  close.textContent = "×";
  close.addEventListener("click", ()=>{
    try { localStorage.setItem(REMINDER_BANNER_HIDDEN_KEY, sig); } catch(e){}
    bar.remove();
  });
  bar.append(icon, body, close);
}

async function showSystemNotifications(list){
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  let shown = {};
  try { shown = JSON.parse(localStorage.getItem(REMINDERS_SHOWN_KEY) || "{}"); } catch(e){}
  const today = localISODate(0);
  for (const k of Object.keys(shown)) if (shown[k] < today) delete shown[k];   // sprzątanie starych
  const fresh = list.filter(p=>!shown[p.key]);
  if (!fresh.length) return;
  const reg = ("serviceWorker" in navigator) ? await navigator.serviceWorker.getRegistration() : null;
  for (const p of fresh) {
    const title = p.when==="today" ? "Dziś nowy odcinek" : "Jutro nowy odcinek";
    const opts = {body: `${p.title} ${p.code}${p.epTitle ? " – " + p.epTitle : ""}`, tag: p.key, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: {itemId: p.itemId}};
    try {
      if (reg && reg.showNotification) await reg.showNotification(title, opts);
      else new Notification(title, opts);
      shown[p.key] = p.date;
    } catch(e) {}
  }
  try { localStorage.setItem(REMINDERS_SHOWN_KEY, JSON.stringify(shown)); } catch(e){}
}

function updateAppBadge(list){
  const n = list.filter(p=>p.when==="today").length;
  try {
    if (n && navigator.setAppBadge) navigator.setAppBadge(n);
    else if (navigator.clearAppBadge) navigator.clearAppBadge();
  } catch(e){}
}

function checkPremiereReminders(){
  const list = remindersEnabled() ? collectPremieres() : [];
  renderReminderBanner(list);
  updateAppBadge(list);
  if (list.length) showSystemNotifications(list);
  renderReminderSettings();
}

document.addEventListener("visibilitychange", ()=>{ if (document.visibilityState === "visible") checkPremiereReminders(); });

// ---------- Ustawienia ----------
function isStandaloneApp(){
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
}
function renderReminderSettings(){
  const btn = document.getElementById("set-reminders-toggle");
  const st = document.getElementById("set-reminders-status");
  if (!btn || !st) return;
  const on = remindersEnabled();
  btn.textContent = on ? "Wyłącz" : "Włącz";
  btn.classList.toggle("secondary", on);
  const perm = ("Notification" in window) ? Notification.permission : "unsupported";
  let msg;
  if (!on) msg = "Wyłączone.";
  else if (perm === "granted") msg = "Włączone: pasek w aplikacji + powiadomienia systemowe.";
  else if (perm === "denied") msg = "Włączone tylko w aplikacji — powiadomienia systemowe zablokowane w ustawieniach telefonu.";
  else if (perm === "unsupported") msg = isStandaloneApp() ? "Włączone tylko w aplikacji (to urządzenie nie obsługuje powiadomień)." : "Włączone tylko w aplikacji. Powiadomienia systemowe na iPhonie działają po dodaniu aplikacji do ekranu głównego.";
  else msg = "Włączone w aplikacji — dotknij „Wyłącz” i „Włącz” ponownie, żeby zezwolić na powiadomienia.";
  st.textContent = msg;
}
async function toggleReminders(){
  if (remindersEnabled()) { setRemindersEnabled(false); checkPremiereReminders(); return; }
  setRemindersEnabled(true);
  if ("Notification" in window && Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch(e){}
  }
  try { localStorage.removeItem(REMINDER_BANNER_HIDDEN_KEY); } catch(e){}
  checkPremiereReminders();
}
(function initReminderSettings(){
  const btn = document.getElementById("set-reminders-toggle");
  if (btn) btn.addEventListener("click", toggleReminders);
  renderReminderSettings();
})();
