// ============================================================
// themes.js — motywy kolorystyczne (Ustawienia → Wygląd)
// ============================================================
const APP_THEMES = [{"id": "", "label": "Domyślny", "sw": ["#242424", "#1f6aa5", "#dce4ee"]}, {"id": "kino", "label": "Kino nocą", "bg": "radial-gradient(120% 80% at 50% 0%,#1a2340 0%,#0a0e17 70%)", "sw": ["#151c2c", "#d4a24c", "#eef1f7"]}, {"id": "jasny", "label": "Jasny", "bg": "#eef0f4", "sw": ["#ffffff", "#2563eb", "#1b1f27"]}];
const THEME_META = {"": "#242424", "kino": "#0a0e17", "jasny": "#e8eaef"};

function applyTheme(id){
  id = id || "";
  if (!APP_THEMES.some(t=>t.id===id)) id = "";
  if (id) document.documentElement.setAttribute("data-theme", id);
  else document.documentElement.removeAttribute("data-theme");
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", THEME_META[id] || "#242424");
  try { localStorage.setItem("tv_db_theme", id); } catch(e) {}
  const sel = document.getElementById("theme-select");
  if (sel && sel.value !== id) sel.value = id;
}

function setTheme(id){
  applyTheme(id);
  if (typeof db !== "undefined" && db) {
    if (!db.settings) db.settings = {...DEFAULT_SETTINGS};
    db.settings.theme = id;
    if (typeof saveToLocalStorage === "function") saveToLocalStorage();
  }
}

function renderThemePicker(){
  const box = document.getElementById("theme-picker");
  if (!box || box.dataset.built) { syncThemeFromDb(); return; }
  box.dataset.built = "1";
  const sel = document.createElement("select");
  sel.className = "entry"; sel.id = "theme-select"; sel.style.flex = "1";
  for (const t of APP_THEMES) {
    const o = document.createElement("option"); o.value = t.id; o.textContent = t.label; sel.appendChild(o);
  }
  sel.addEventListener("change", ()=>setTheme(sel.value));
  box.appendChild(sel);
  syncThemeFromDb();
}

function syncThemeFromDb(){
  let cur = "";
  try { cur = localStorage.getItem("tv_db_theme") || ""; } catch(e) {}
  if (typeof db !== "undefined" && db && db.settings && typeof db.settings.theme === "string") cur = db.settings.theme;
  applyTheme(cur);
}
