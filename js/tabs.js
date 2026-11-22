// ============================================================
// tabs.js — przełączanie zakładek głównych i statusowych
// ============================================================

function initTabs(){
  document.querySelectorAll("#main-tabs .tab-btn").forEach(btn=>{
    btn.addEventListener("click", ()=> switchMainTab(btn.dataset.main));
  });
  const settingsBtn = document.getElementById("btn-settings");
  if (settingsBtn) settingsBtn.addEventListener("click", ()=> switchMainTab("settings"));
  const statsBtn = document.getElementById("btn-stats");
  if (statsBtn) statsBtn.addEventListener("click", ()=> switchMainTab("stats"));


  for (const type of [TYPE_MOVIE, TYPE_SERIES]) {
    const bar = document.getElementById(`subtabs-${type}`);
    const content = document.getElementById(`subcontent-${type}`);
    for (const status of TYPE_STATUS_ORDER[type]) {
      const btn = document.createElement("button");
      btn.className = "tab-btn";
      btn.textContent = STATUS_LABELS[status];
      btn.dataset.status = status;
      btn.addEventListener("click", ()=> switchStatusTab(type, status));
      bar.appendChild(btn);

      const pane = document.createElement("div");
      pane.className = "status-pane";
      pane.id = `pane-${type}-${status}`;
      pane.innerHTML = `<div class="filter-bar" style="display:none;"></div><div class="table-wrap"><table class="data"><thead></thead><tbody></tbody></table><div class="poster-grid" style="display:none;"></div></div>`;
      content.appendChild(pane);
    }
  }
  document.querySelectorAll("#subtabs-stats .tab-btn").forEach(btn=>{
    btn.addEventListener("click", ()=> switchStatsTab(btn.dataset.statsTab));
  });

  initNotesAutosave();
  // Po uruchomieniu aplikacja otwiera się na Seriale → Oglądane.
  activeStatus[TYPE_SERIES] = STATUS_WATCHING;
  switchMainTab(TYPE_SERIES);
}

let activeStatsTab = "general";

const STATS_TAB_ORDER = ["general","series","movies"];
function switchStatsTab(tab, dir){
  activeStatsTab = tab;
  const bar = document.getElementById("subtabs-stats");
  bar.querySelectorAll(".tab-btn").forEach(b=>{
    b.classList.toggle("active", b.dataset.statsTab===tab);
  });
  document.querySelectorAll("#subcontent-stats .status-pane").forEach(p=>p.classList.remove("active"));
  const pane = document.getElementById(`pane-stats-${tab}`);
  pane.classList.add("active");
  pane.classList.remove("swipe-in-l","swipe-in-r");
  if (dir) { void pane.offsetWidth; pane.classList.add(dir > 0 ? "swipe-in-l" : "swipe-in-r"); }
}

// Przesunięcie palcem w lewo/prawo przełącza Ogólne ↔ Seriale ↔ Filmy.
(function initStatsSwipe(){
  const area = document.getElementById("subcontent-stats");
  if (!area) return;
  let x0 = 0, y0 = 0, t0 = 0, track = false;
  area.addEventListener("touchstart", (e)=>{
    if (e.touches.length !== 1) { track = false; return; }
    // nie przechwytuj gestów na elementach przewijanych poziomo
    if (e.target.closest("input, textarea, select")) { track = false; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); track = true;
  }, {passive:true});
  area.addEventListener("touchend", (e)=>{
    if (!track) return; track = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - t0 > 800) return;
    const i = STATS_TAB_ORDER.indexOf(activeStatsTab);
    const j = dx < 0 ? i + 1 : i - 1;
    if (j < 0 || j >= STATS_TAB_ORDER.length) return;
    switchStatsTab(STATS_TAB_ORDER[j], dx < 0 ? 1 : -1);
  }, {passive:true});
})();

function updateCheckButtonVisibility(){
  const row = document.getElementById("button-bar-check-row");
  if (row) {
    const show = activeMain===TYPE_SERIES && activeStatus[TYPE_SERIES]===STATUS_UPCOMING;
    row.style.display = show ? "" : "none";
  }
  const sortRow = document.getElementById("button-bar-sort-row");
  if (sortRow) {
    const showSort = activeMain===TYPE_MOVIE || activeMain===TYPE_SERIES;
    sortRow.style.display = showSort ? "" : "none";
  }
  if (typeof updateFilterButton === "function") updateFilterButton();
}

function switchMainTab(tab){
  activeMain = tab;
  document.querySelectorAll("#main-tabs .tab-btn").forEach(b=>{
    b.classList.toggle("active", b.dataset.main===tab);
  });
  const _sb = document.getElementById("btn-settings");
  if (_sb) _sb.classList.toggle("active", tab==="settings");
  const _stb = document.getElementById("btn-stats");
  if (_stb) _stb.classList.toggle("active", tab==="stats");
  document.querySelectorAll(".type-tab").forEach(el=>el.classList.remove("active"));

  document.getElementById(`tab-${tab}`).classList.add("active");
  if (tab===TYPE_MOVIE || tab===TYPE_SERIES) {
    switchStatusTab(tab, activeStatus[tab]);
  } else if (tab==="notes") {
    renderNotesTab();
  } else if (tab==="stats") {
    switchStatsTab(activeStatsTab);
  } else if (tab==="summary") {
    if (typeof renderSummaryTab === "function") renderSummaryTab();
  }
  updateCheckButtonVisibility();
}

function switchStatusTab(type, status){
  activeStatus[type] = status;
  const bar = document.getElementById(`subtabs-${type}`);
  bar.querySelectorAll(".tab-btn").forEach(b=>{
    b.classList.toggle("active", b.dataset.status===status);
  });
  document.querySelectorAll(`#subcontent-${type} .status-pane`).forEach(p=>p.classList.remove("active"));
  document.getElementById(`pane-${type}-${status}`).classList.add("active");
  renderTable(type, status);
  updateCheckButtonVisibility();
}


// ============================================================
// Listy Seriale / Filmy: przesunięcie palcem w lewo/prawo przechodzi do
// sąsiedniej zakładki (kolejność jak w menu: Seriale — Oglądane,
// Zakończone, Nowości, Nadchodzące, Planowane; Filmy — Zakończone, Planowane).
// ============================================================
function listSwipeSteps(type){
  const out = [];
  for (const st of TYPE_STATUS_ORDER[type]) {
    if (st === STATUS_UPCOMING) { out.push({st, mode:"seasons"}); out.push({st, mode:"episodes"}); }
    else out.push({st});
  }
  return out;
}
function initListSwipe(){
  for (const type of [TYPE_SERIES, TYPE_MOVIE]) {
    const area = document.getElementById(`subcontent-${type}`);
    if (!area) continue;
    let x0 = 0, y0 = 0, t0 = 0, track = false;
    area.addEventListener("touchstart", (e)=>{
      track = false;
      if (e.touches.length !== 1) return;
      // pomiń elementy przewijane w poziomie i pola formularzy
      for (let el = e.target; el && el !== area; el = el.parentElement) {
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
        if (el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return;
      }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); track = true;
    }, {passive:true, capture:true});
    area.addEventListener("touchend", (e)=>{
      if (!track) return; track = false;
      const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - t0 > 700) return;
      const steps = listSwipeSteps(type);
      const curSt = activeStatus[type];
      const curMode = (typeof upcomingMode !== "undefined") ? upcomingMode : "seasons";
      const i = steps.findIndex(s=>s.st === curSt && (!s.mode || s.mode === curMode));
      const j = dx < 0 ? i + 1 : i - 1;
      if (i < 0 || j < 0 || j >= steps.length) return;
      const nx = steps[j];
      if (nx.mode && typeof setUpcomingMode === "function") setUpcomingMode(nx.mode);
      switchStatusTab(type, nx.st);
      const pane = area.querySelector(".status-pane.active");
      if (pane) { pane.classList.remove("swipe-in-l","swipe-in-r"); void pane.offsetWidth; pane.classList.add(dx < 0 ? "swipe-in-l" : "swipe-in-r"); }
    }, {passive:true, capture:true});
  }
}
initListSwipe();
