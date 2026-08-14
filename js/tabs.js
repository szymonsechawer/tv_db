// ============================================================
// tabs.js — przełączanie zakładek głównych i statusowych
// ============================================================

function initTabs(){
  document.querySelectorAll("#main-tabs .tab-btn").forEach(btn=>{
    btn.addEventListener("click", ()=> switchMainTab(btn.dataset.main));
  });
  const settingsIconBtn = document.getElementById("settings-icon-btn");
  if (settingsIconBtn) settingsIconBtn.addEventListener("click", ()=> switchMainTab("settings"));

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
  if (!row) return;
  const show = activeMain===TYPE_SERIES && activeStatus[TYPE_SERIES]===STATUS_UPCOMING;
  row.style.display = show ? "" : "none";
}

function switchMainTab(tab){
  activeMain = tab;
  document.querySelectorAll("#main-tabs .tab-btn").forEach(b=>{
    b.classList.toggle("active", b.dataset.main===tab);
  });
  const _sib = document.getElementById("settings-icon-btn");
  if (_sib) _sib.classList.toggle("active", tab==="settings");
  document.querySelectorAll(".type-tab").forEach(el=>el.classList.remove("active"));
  document.getElementById(`tab-${tab}`).classList.add("active");
  if (tab===TYPE_MOVIE || tab===TYPE_SERIES) {
    switchStatusTab(tab, activeStatus[tab]);
  } else if (tab==="notes") {
    renderNotesTab();
  } else if (tab==="planned") {
    renderPlannedTable();
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

