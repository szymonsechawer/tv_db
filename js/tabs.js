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
      pane.innerHTML = `<div class="table-wrap"><table class="data"><thead></thead><tbody></tbody></table></div>`;
      content.appendChild(pane);
    }
  }
  document.querySelectorAll("#subtabs-stats .tab-btn").forEach(btn=>{
    btn.addEventListener("click", ()=> switchStatsTab(btn.dataset.statsTab));
  });

  initNotesAutosave();
  switchMainTab(TYPE_MOVIE);
}

let activeStatsTab = "general";

function switchStatsTab(tab){
  activeStatsTab = tab;
  const bar = document.getElementById("subtabs-stats");
  bar.querySelectorAll(".tab-btn").forEach(b=>{
    b.classList.toggle("active", b.dataset.statsTab===tab);
  });
  document.querySelectorAll("#subcontent-stats .status-pane").forEach(p=>p.classList.remove("active"));
  document.getElementById(`pane-stats-${tab}`).classList.add("active");
}

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

