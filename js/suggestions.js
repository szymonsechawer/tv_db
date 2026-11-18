// ============================================================
// suggestions.js — zakładka "Propozycje": najlepiej oceniane / popularne
// filmy i seriale dostępne w serwisach streamingowych (TMDb Discover, PL)
// ============================================================

// Identyfikatory serwisów w TMDb (region PL, abonament).
const SUGGEST_PROVIDERS = [
  {id: 8,    name: "Netflix"},
  {id: 337,  name: "Disney+"},
  {id: 1899, name: "Max"},
  {id: 119,  name: "Prime Video"},
  {id: 350,  name: "Apple TV+"},
  {id: 1773, name: "SkyShowtime"},
];

const suggestState = {
  type: TYPE_MOVIE,
  provider: "all",       // "all" albo id serwisu
  sort: "top",           // "top" = najlepiej oceniane, "popular" = popularne teraz
  hideOwned: true,
  page: 0,
  totalPages: 1,
  results: [],
  loading: false,
  error: "",
  initialized: false,
};
const suggestCache = new Map();

function suggestQueryKey(page){
  return [suggestState.type, suggestState.provider, suggestState.sort, page].join(":");
}

async function fetchSuggestPage(page){
  const key = suggestQueryKey(page);
  if (suggestCache.has(key)) return suggestCache.get(key);
  const isMovie = suggestState.type === TYPE_MOVIE;
  const providers = suggestState.provider === "all"
    ? SUGGEST_PROVIDERS.map(p=>p.id).join("|")
    : String(suggestState.provider);
  const params = {
    watch_region: "PL",
    with_watch_providers: providers,
    with_watch_monetization_types: "flatrate",
    page,
  };
  if (suggestState.sort === "top") {
    params.sort_by = "vote_average.desc";
    params["vote_count.gte"] = isMovie ? 1500 : 400;
  } else {
    params.sort_by = "popularity.desc";
    params["vote_count.gte"] = isMovie ? 100 : 50;
  }
  const data = await tmdbFetch(isMovie ? "/discover/movie" : "/discover/tv", params);
  suggestCache.set(key, data);
  return data;
}

async function loadSuggestions(reset){
  if (suggestState.loading) return;
  if (reset) { suggestState.page = 0; suggestState.totalPages = 1; suggestState.results = []; }
  if (suggestState.page >= suggestState.totalPages) return;
  suggestState.loading = true;
  suggestState.error = "";
  renderSuggestionsTab();
  try {
    const data = await fetchSuggestPage(suggestState.page + 1);
    if (!data) {
      suggestState.error = "Dodaj klucz TMDb w Ustawieniach, żeby zobaczyć propozycje.";
    } else {
      suggestState.page = data.page || (suggestState.page + 1);
      suggestState.totalPages = Math.min(data.total_pages || 1, 20);
      suggestState.results.push(...(data.results || []));
    }
  } catch(err) {
    suggestState.error = (err && err.message) || "Nie udało się pobrać propozycji.";
  }
  suggestState.loading = false;
  renderSuggestionsTab();
}

function initSuggestionsTab(){
  if (suggestState.initialized) { renderSuggestionsTab(); return; }
  suggestState.initialized = true;
  const root = document.getElementById("pane-suggest");
  document.querySelectorAll("#tab-suggest [data-suggest-type]").forEach(btn=>btn.addEventListener("click", ()=>{
    suggestState.type = btn.dataset.suggestType;
    loadSuggestions(true);
  }));
  root.querySelectorAll("[data-suggest-sort]").forEach(btn=>btn.addEventListener("click", ()=>{
    suggestState.sort = btn.dataset.suggestSort;
    loadSuggestions(true);
  }));
  const chips = root.querySelector("#suggest-providers");
  for (const p of [{id:"all", name:"Wszystkie"}, ...SUGGEST_PROVIDERS]) {
    const c = document.createElement("button");
    c.type = "button";
    c.className = "filter-chip";
    c.dataset.provider = String(p.id);
    c.textContent = p.name;
    c.addEventListener("click", ()=>{
      suggestState.provider = p.id === "all" ? "all" : p.id;
      loadSuggestions(true);
    });
    chips.appendChild(c);
  }
  root.querySelector("#suggest-hide-owned").addEventListener("change", (e)=>{
    suggestState.hideOwned = e.target.checked;
    renderSuggestionsTab();
  });
  root.querySelector("#suggest-more").addEventListener("click", ()=>loadSuggestions(false));
  loadSuggestions(true);
}

function renderSuggestionsTab(){
  const root = document.getElementById("pane-suggest");
  if (!root) return;
  document.querySelectorAll("#tab-suggest [data-suggest-type]").forEach(b=>b.classList.toggle("active", b.dataset.suggestType===suggestState.type));
  root.querySelectorAll("[data-suggest-sort]").forEach(b=>b.classList.toggle("active", b.dataset.suggestSort===suggestState.sort));
  root.querySelectorAll("#suggest-providers .filter-chip").forEach(c=>c.classList.toggle("on", c.dataset.provider===String(suggestState.provider)));
  root.querySelector("#suggest-hide-owned").checked = suggestState.hideOwned;

  const type = suggestState.type;
  const visible = suggestState.results.filter(r => !(suggestState.hideOwned && findItemByTmdbId(type, r.id)));
  const grid = root.querySelector("#suggest-grid");
  renderPosterGrid(grid, visible.map(r=>{
    const owned = findItemByTmdbId(type, r.id);
    const title = (type===TYPE_MOVIE ? r.title : r.name) || (type===TYPE_MOVIE ? r.original_title : r.original_name) || "";
    const rating = (typeof r.vote_average === "number" && r.vote_average > 0) ? "★ " + r.vote_average.toFixed(1) : "";
    const year = ((type===TYPE_MOVIE ? r.release_date : r.first_air_date) || "").slice(0,4);
    return {
      title,
      poster_path: r.poster_path,
      badge: [rating, year, owned ? "masz" : ""].filter(Boolean).join(" · "),
      onOpen: ()=>openSuggestion(type, r, title, year),
    };
  }), suggestState.loading ? "Ładowanie…" : (suggestState.error || "Brak propozycji dla wybranych ustawień."));

  const status = root.querySelector("#suggest-status");
  status.textContent = suggestState.error && suggestState.results.length ? suggestState.error : "";
  const more = root.querySelector("#suggest-more");
  more.style.display = (!suggestState.error && suggestState.results.length && suggestState.page < suggestState.totalPages) ? "" : "none";
  more.disabled = suggestState.loading;
  more.textContent = suggestState.loading ? "Ładowanie…" : "Pokaż więcej";
}

async function openSuggestion(type, r, title, year){
  const existing = findItemByTmdbId(type, r.id);
  if (existing) { await openViewDialog(existing.id, {readOnly:true}); return; }
  const originalTitleRaw = (type===TYPE_MOVIE ? r.original_title : r.original_name) || "";
  const previewItem = {
    id: "preview:" + type + ":" + r.id,
    type,
    title,
    original_title: (originalTitleRaw && originalTitleRaw!==title) ? originalTitleRaw : "",
    premiere_date: year,
    poster_path: r.poster_path || null,
    tmdb_id: r.id,
    description: r.overview || "",
    tags: [],
    rating: 0,
    seasons: [],
  };
  await openViewDialog(previewItem, {preview:true, tmdbHit:r, tmdbType:type, addStatus:STATUS_PLANNED});
  renderSuggestionsTab();
}
