// ============================================================
// themes.js — motywy kolorystyczne (Ustawienia → Wygląd)
// ============================================================
const APP_THEMES = [{"id": "", "label": "Domyślny", "sw": ["#242424", "#1f6aa5", "#dce4ee"]}, {"id": "kino", "label": "Kino nocą", "bg": "radial-gradient(120% 80% at 50% 0%,#1a2340 0%,#0a0e17 70%)", "sw": ["#151c2c", "#d4a24c", "#eef1f7"]}, {"id": "szklo", "label": "Szkło", "bg": "linear-gradient(160deg,#2b1055 0%,#1b1f4b 45%,#0d3b4f 100%)", "sw": ["rgba(255,255,255,.07)", "#8b5cf6", "#f4f2ff"]}, {"id": "neon", "label": "Czerń + neon", "bg": "#000", "sw": ["#0b0b0b", "#00e5ff", "#f2f2f2"]}, {"id": "jasny", "label": "Jasny", "bg": "#eef0f4", "sw": ["#ffffff", "#2563eb", "#1b1f27"]}, {"id": "zachod", "label": "Zachód słońca", "bg": "linear-gradient(180deg,#2a1520 0%,#160e12 60%)", "sw": ["#2a1b21", "#ff7a59", "#fbeee9"]}, {"id": "las", "label": "Las", "bg": "linear-gradient(180deg,#14211a 0%,#0c120f 70%)", "sw": ["#18231d", "#4caf7d", "#e8f2ec"]}, {"id": "retro", "label": "Retro VHS", "bg": "linear-gradient(180deg,#2a0f4f 0%,#120a26 55%,#0b1a3a 100%)", "sw": ["#22163f", "#ff2e97", "#fbe9ff"]}, {"id": "grafit", "label": "Grafit minimal", "bg": "#111113", "sw": ["#1c1c1f", "#e4e4e7", "#fafafa"]}, {"id": "ocean", "label": "Ocean", "bg": "radial-gradient(140% 90% at 100% 0%,#13405a 0%,#07141f 65%)", "sw": ["#0f2638", "#2ec4b6", "#e6f6f8"]}, {"id": "kawa", "label": "Kawa", "bg": "#17130f", "sw": ["#28211b", "#c8935a", "#f5ece2"]}, {"id": "karty3d", "label": "Karty 3D", "bg": "linear-gradient(180deg,#1d1f24,#141518)", "sw": ["#2b2b2b", "#1f6aa5", "#dce4ee"]}];
const THEME_META = {"": "#242424", "kino": "#0a0e17", "szklo": "#1b1f4b", "neon": "#000", "jasny": "#e8eaef", "zachod": "#160e12", "las": "#0c120f", "retro": "#120a26", "grafit": "#111113", "ocean": "#07141f", "kawa": "#17130f", "karty3d": "#1c1c1c"};

function applyTheme(id){
  id = id || "";
  if (!APP_THEMES.some(t=>t.id===id)) id = "";
  if (id) document.documentElement.setAttribute("data-theme", id);
  else document.documentElement.removeAttribute("data-theme");
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", THEME_META[id] || "#242424");
  try { localStorage.setItem("tv_db_theme", id); } catch(e) {}
  document.querySelectorAll(".theme-opt").forEach(b=>b.classList.toggle("active", b.dataset.theme===id));
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
  for (const t of APP_THEMES) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "theme-opt"; b.dataset.theme = t.id;
    const prev = document.createElement("span"); prev.className = "theme-prev";
    prev.style.background = t.bg || t.sw[0];
    prev.innerHTML = `<i style="background:${t.sw[0]}"></i><i style="background:${t.sw[1]}"></i>`;
    const name = document.createElement("span"); name.className = "theme-name"; name.textContent = t.label;
    b.append(prev, name);
    b.addEventListener("click", ()=>setTheme(t.id));
    box.appendChild(b);
  }
  syncThemeFromDb();
}

function syncThemeFromDb(){
  let cur = "";
  try { cur = localStorage.getItem("tv_db_theme") || ""; } catch(e) {}
  if (typeof db !== "undefined" && db && db.settings && typeof db.settings.theme === "string") cur = db.settings.theme;
  applyTheme(cur);
}
