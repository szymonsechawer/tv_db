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

  const plannedBar = document.getElementById("subtabs-planned");
  const plannedContent = document.getElementById("subcontent-planned");
  for (const type of [TYPE_MOVIE, TYPE_SERIES]) {
    const btn = document.createElement("button");
    btn.className = "tab-btn";
    btn.textContent = TYPE_LABELS[type];
    btn.dataset.plannedType = type;
    btn.addEventListener("click", ()=> switchPlannedTab(type));
    plannedBar.appendChild(btn);

    const pane = document.createElement("div");
    pane.className = "status-pane";
    pane.id = `pane-planned-${type}`;
    pane.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th class="col-title">Tytuł</th></tr></thead><tbody id="planned-tbody-${type}"></tbody></table></div>`;
    plannedContent.insertBefore(pane, document.getElementById("pane-planned-notes"));
  }
  const notesBtn = document.createElement("button");
  notesBtn.className = "tab-btn";
  notesBtn.textContent = "Notatki";
  notesBtn.dataset.plannedType = "notes";
  notesBtn.addEventListener("click", ()=> switchPlannedTab("notes"));
  plannedBar.appendChild(notesBtn);

  initNotesAutosave();
  initDiscoverTab();
  switchMainTab(TYPE_MOVIE);
}

function switchPlannedTab(type){
  activePlannedType = type;
  const bar = document.getElementById("subtabs-planned");
  bar.querySelectorAll(".tab-btn").forEach(b=>{
    b.classList.toggle("active", b.dataset.plannedType===type);
  });
  document.querySelectorAll("#subcontent-planned .status-pane").forEach(p=>p.classList.remove("active"));
  document.getElementById(`pane-planned-${type}`).classList.add("active");
  if (type==="notes") {
    renderNotesTab();
  } else {
    renderPlannedTable();
  }
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
  const _sb = document.getElementById("btn-settings");
  if (_sb) _sb.classList.toggle("active", tab==="settings");
  const _stb = document.getElementById("btn-stats");
  if (_stb) _stb.classList.toggle("active", tab==="stats");
  document.querySelectorAll(".type-tab").forEach(el=>el.classList.remove("active"));

  document.getElementById(`tab-${tab}`).classList.add("active");
  if (tab===TYPE_MOVIE || tab===TYPE_SERIES) {
    switchStatusTab(tab, activeStatus[tab]);
  } else if (tab==="planned") {
    switchPlannedTab(activePlannedType);
  } else if (tab==="stats") {
    switchStatsTab(activeStatsTab);
  } else if (tab==="discover") {
    switchDiscoverType(discoverType);
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

