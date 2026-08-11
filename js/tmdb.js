// ============================================================
// tmdb.js — integracja z The Movie Database (TMDb API)
// ============================================================

function getStoredTmdbKey(){
  if (db.settings && db.settings.tmdb_key) return db.settings.tmdb_key;
  try { return localStorage.getItem(TMDB_KEY_STORAGE) || ""; } catch(e){ return ""; }
}
function setStoredTmdbKey(v){
  if (!db.settings) db.settings = {...DEFAULT_SETTINGS};
  db.settings.tmdb_key = v || "";
  try { localStorage.setItem(TMDB_KEY_STORAGE, v || ""); } catch(e){}
  saveToLocalStorage();
  renderSettingsTab();
}
async function ensureTmdbKey(force){
  let key = getStoredTmdbKey();
  if (key && !force) return key;
  const val = await askText({
    title: "Klucz API TMDb",
    prompt: "Wklej swój klucz API TMDb (API Key v3) lub token v4.\nKlucz zostanie zapisany lokalnie w tej przeglądarce.",
    initial: key,
  });
  if (!val) return null;
  setStoredTmdbKey(val);
  return val;
}

async function tmdbFetch(path, params){
  const key = await ensureTmdbKey(false);
  if (!key) return null;
  const url = new URL("https://api.themoviedb.org/3" + path);
  url.searchParams.set("language", "pl-PL");
  for (const [k,v] of Object.entries(params||{})) {
    if (v!==null && v!==undefined && v!=="") url.searchParams.set(k, v);
  }
  const headers = {};
  if (key.startsWith("ey")) headers["Authorization"] = "Bearer " + key;
  else url.searchParams.set("api_key", key);
  const res = await fetch(url.toString(), {headers});
  if (res.status===401) {
    setStoredTmdbKey("");
    throw new Error("Nieprawidłowy klucz API TMDb.");
  }
  if (!res.ok) throw new Error("TMDb: błąd " + res.status);
  return res.json();
}

// Buduje pełny URL obrazka okładki (poster) na podstawie poster_path z TMDb.
function tmdbPosterUrl(posterPath, size){
  if (!posterPath) return null;
  return "https://image.tmdb.org/t/p/" + (size||"w342") + posterPath;
}

// Pobiera samą ścieżkę okładki (poster_path) dla filmu/serialu o danym id TMDb.
async function tmdbFetchPoster(type, id){
  const path = type===TYPE_MOVIE ? "/movie/" + id : "/tv/" + id;
  const data = await tmdbFetch(path, {});
  return (data && data.poster_path) ? data.poster_path : null;
}

function tmdbQueryCandidates(title){
  const t = String(title||"").trim();
  const out = [];
  const m = t.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (m) { out.push(m[2].trim()); out.push(m[1].trim()); }
  out.push(t);
  return out.filter((v,i,a)=>v && a.indexOf(v)===i);
}
function yearOf(premiereDate){
  const m = String(premiereDate||"").match(/\d{4}/);
  return m ? m[0] : "";
}

async function tmdbSearch(type, title, premiereDate){
  const isMovie = type===TYPE_MOVIE;
  const path = isMovie ? "/search/movie" : "/search/tv";
  const year = yearOf(premiereDate);
  for (const q of tmdbQueryCandidates(title)) {
    for (const withYear of (year ? [true,false] : [false])) {
      const params = {query:q, include_adult:"false"};
      if (withYear) params[isMovie ? "primary_release_year" : "first_air_date_year"] = year;
      const data = await tmdbFetch(path, params);
      if (data && data.results && data.results.length) return data.results[0];
    }
  }
  return null;
}

async function tmdbSearchList(type, query){
  const q = String(query||"").trim();
  if (!q) return [];
  const path = type===TYPE_MOVIE ? "/search/movie" : "/search/tv";
  const data = await tmdbFetch(path, {query:q, include_adult:"false"});
  return (data && Array.isArray(data.results)) ? data.results.slice(0,8) : [];
}

async function tmdbMovieRuntime(id){
  const data = await tmdbFetch("/movie/" + id, {});
  return data && data.runtime ? data.runtime : null;
}

// Wyciąga listę nazw gatunków (np. ["Dramat","Komedia"]) z pełnych danych TMDb.
function tmdbGenreNames(details){
  return (details && Array.isArray(details.genres))
    ? details.genres.map(g=>g && g.name).filter(Boolean)
    : [];
}

// Pobiera listę gatunków dla filmu/serialu o danym id TMDb.
async function tmdbFetchGenres(type, id){
  const path = type===TYPE_MOVIE ? "/movie/" + id : "/tv/" + id;
  const data = await tmdbFetch(path, {});
  return tmdbGenreNames(data);
}

// Wyciąga listę obsady (np. ["Jan Kowalski (Postać)", ...]) z danych /credits TMDb.
function tmdbCastNames(credits, limit){
  if (!credits || !Array.isArray(credits.cast)) return [];
  const n = limit || 10;
  return credits.cast
    .slice()
    .sort((a,b)=>(a.order==null?999:a.order)-(b.order==null?999:b.order))
    .slice(0, n)
    .map(c=>{
      const name = String((c && c.name) || "").trim();
      const character = String((c && c.character) || "").trim();
      if (!name) return "";
      return character ? `${name} (${character})` : name;
    })
    .filter(Boolean);
}

// Pobiera listę obsady (aktorów) dla filmu/serialu o danym id TMDb.
async function tmdbFetchCast(type, id, limit){
  const path = type===TYPE_MOVIE ? "/movie/" + id + "/credits" : "/tv/" + id + "/credits";
  const data = await tmdbFetch(path, {});
  return tmdbCastNames(data, limit);
}

// Wyciąga listę twórców: dla filmu — reżyser(zy) z ekipy (crew), dla serialu —
// twórców serialu (created_by) z danych szczegółowych TMDb.
function tmdbCreatorNames(type, data, credits){
  if (type===TYPE_MOVIE) {
    if (!credits || !Array.isArray(credits.crew)) return [];
    const seen = new Set();
    const out = [];
    for (const c of credits.crew) {
      if (!c || c.job!=="Director") continue;
      const name = String(c.name||"").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(`${name} (Reżyseria)`);
    }
    return out;
  }
  if (!data || !Array.isArray(data.created_by)) return [];
  const seen = new Set();
  const out = [];
  for (const c of data.created_by) {
    const name = String((c && c.name) || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

// Pobiera listę twórców (reżyser filmu / twórcy serialu) dla pozycji o danym id TMDb.
async function tmdbFetchCreators(type, id){
  if (type===TYPE_MOVIE) {
    const credits = await tmdbFetch("/movie/" + id + "/credits", {});
    return tmdbCreatorNames(type, null, credits);
  }
  const data = await tmdbFetch("/tv/" + id, {});
  return tmdbCreatorNames(type, data, null);
}

async function tmdbOverview(type, id){
  const path = type===TYPE_MOVIE ? "/movie/" + id : "/tv/" + id;
  const data = await tmdbFetch(path, {});
  if (data && typeof data.overview === "string" && data.overview.trim()) return data.overview.trim();
  // fallback do angielskiego opisu, gdy brak polskiego tłumaczenia w TMDb
  try {
    const alt = await tmdbFetch(path, {language: "en-US"});
    if (alt && typeof alt.overview === "string" && alt.overview.trim()) return alt.overview.trim();
  } catch(err) { /* brak alternatywy - ignoruj */ }
  return "";
}

// TMDb zwraca dla nieprzetłumaczonych odcinków nazwy generyczne ("Odcinek 5",
// "Episode 5", "Folge 5"...). Traktujemy je jak brak nazwy, żeby móc pobrać
// nazwę oryginalną.
function isGenericEpisodeName(name, number){
  const t = String(name||"").trim();
  if (!t) return true;
  const re = /^(odcinek|epizod|episode|ep\.?|épisode|folge|episodio|episódio|afsnit|jakso|serie|bölüm|эпизод|серия|第\s*\d+\s*話)\s*[nr.:#]*\s*(\d+)?$/i;
  const m = t.match(re);
  if (!m) return false;
  if (m[2] == null) return true;
  return number == null || Number(m[2]) === Number(number);
}

async function tmdbSeriesOriginalLanguage(seriesId){
  if (tmdbSeriesOrigLangCache.has(seriesId)) return tmdbSeriesOrigLangCache.get(seriesId);
  let lang = "";
  try {
    const info = await tmdbFetch("/tv/" + seriesId, {});
    lang = (info && info.original_language) ? String(info.original_language) : "";
  } catch(err) { lang = ""; }
  tmdbSeriesOrigLangCache.set(seriesId, lang);
  return lang;
}

async function tmdbSeasonEpisodes(seriesId, seasonNumber, forceRefresh){
  const cacheKey = seriesId + ":" + seasonNumber;
  if (!forceRefresh && tmdbSeasonCache.has(cacheKey)) return tmdbSeasonCache.get(cacheKey);
  const data = await tmdbFetch(`/tv/${seriesId}/season/${seasonNumber}`, {});
  let eps = (data && Array.isArray(data.episodes)) ? data.episodes : [];

  // wyczyść generyczne nazwy, aby fallback mógł je zastąpić
  for (const ep of eps) {
    if (isGenericEpisodeName(ep.name, ep.episode_number)) ep.name = "";
  }

  const stillMissing = () => eps.length===0 || eps.some(e=>!e.name || !e.name.trim());

  if (stillMissing()) {
    // kolejność prób: angielski, język oryginalny serialu, bez języka (wersja domyślna TMDb)
    const langs = ["en-US"];
    const orig = await tmdbSeriesOriginalLanguage(seriesId);
    if (orig && orig !== "en" && orig !== "pl") langs.push(orig);

    for (const lang of langs) {
      if (!stillMissing()) break;
      try {
        const alt = await tmdbFetch(`/tv/${seriesId}/season/${seasonNumber}`, {language: lang});
        let epsAlt = (alt && Array.isArray(alt.episodes)) ? alt.episodes : [];
        for (const ep of epsAlt) {
          if (isGenericEpisodeName(ep.name, ep.episode_number)) ep.name = "";
        }
        if (eps.length===0 && epsAlt.length>0) {
          eps = epsAlt;
          continue;
        }
        for (const ep of eps) {
          if (ep.name && ep.name.trim()) continue;
          const match = epsAlt.find(e=>e.episode_number===ep.episode_number);
          if (match && match.name && match.name.trim()) ep.name = match.name;
        }
      } catch(err) {
        // brak danych w tym języku - próbuj dalej
      }
    }
  }

  tmdbSeasonCache.set(cacheKey, eps);
  return eps;
}

