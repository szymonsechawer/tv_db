// ============================================================
// discover.js — zakładka "Odkrywaj": popularne teraz (trending TMDb)
// ============================================================

let discoverType = TYPE_MOVIE;

function initDiscoverTab(){
  document.querySelectorAll("#subtabs-discover .tab-btn").forEach(btn=>{
    btn.addEventListener("click", ()=> switchDiscoverType(btn.dataset.discoverType));
  });
  const refreshBtn = document.getElementById("btn-discover-refresh");
  if (refreshBtn) refreshBtn.addEventListener("click", ()=>{
    tmdbTrendingCache.delete(discoverType + ":week");
    renderDiscoverTab();
  });
}

function switchDiscoverType(type){
  discoverType = type;
  document.querySelectorAll("#subtabs-discover .tab-btn").forEach(b=>{
    b.classList.toggle("active", b.dataset.discoverType===type);
  });
  renderDiscoverTab();
}

async function renderDiscoverTab(){
  const tbody = document.getElementById("discover-tbody");
  const statusEl = document.getElementById("discover-status");
  if (!tbody) return;
  if (!getStoredTmdbKey()) {
    tbody.innerHTML = "";
    if (statusEl) {
      statusEl.textContent = "Podaj klucz API TMDb w zakładce Ustawienia, aby zobaczyć popularne tytuły.";
      statusEl.classList.add("err");
    }
    return;
  }
  if (statusEl) { statusEl.textContent = ""; statusEl.classList.remove("err"); }
  tbody.innerHTML = `<tr class="empty-row"><td class="col-title muted">Wczytywanie…</td></tr>`;
  try {
    const results = await tmdbFetchTrending(discoverType, "week");
    tbody.innerHTML = "";
    if (!results.length) {
      tbody.innerHTML = `<tr class="empty-row"><td class="col-title">Brak danych.</td></tr>`;
      return;
    }
    for (const r of results) tbody.appendChild(buildTmdbRecordRow(discoverType, r));
  } catch(err) {
    tbody.innerHTML = "";
    if (statusEl) { statusEl.textContent = err.message || String(err); statusEl.classList.add("err"); }
  }
}
