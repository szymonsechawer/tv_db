// ============================================================
// stats.js — statystyki (zakładka Statystyki)
// ============================================================

function computeStats(){
  const items = db.items;
  const moviesWatched = items.filter(i=>i.type===TYPE_MOVIE && i.status===STATUS_WATCHED);
  const seriesWatched = items.filter(i=>i.type===TYPE_SERIES && i.status===STATUS_WATCHED);
  const seriesWatching = items.filter(i=>i.type===TYPE_SERIES && i.status===STATUS_WATCHING);
  const seriesPaused = items.filter(i=>i.type===TYPE_SERIES && i.status===STATUS_PAUSED);

  const relevantSeries = items.filter(i=>i.type===TYPE_SERIES &&
    (i.status===STATUS_WATCHED||i.status===STATUS_PAUSED||i.status===STATUS_WATCHING));

  let episodesWatched = 0, episodesMinutes = 0, episodesRemaining = 0;
  for (const s of relevantSeries) {
    for (const season of s.seasons||[]) {
      for (const ep of season.episodes||[]) {
        if (ep.watched) { episodesWatched++; episodesMinutes += (ep.duration||0); }
        else { episodesRemaining++; }
      }
    }
  }
  const moviesMinutes = moviesWatched.reduce((acc,m)=>acc+(m.duration||0),0);

  return {
    moviesCount: moviesWatched.length,
    seriesCount: seriesWatched.length,
    seriesWatchingCount: seriesWatching.length,
    seriesPausedCount: seriesPaused.length,
    episodesWatched, episodesRemaining, moviesMinutes, episodesMinutes,
  };
}

function updateStats(){
  const s = computeStats();
  document.getElementById("stat-movies-count").textContent = s.moviesCount;
  document.getElementById("stat-series-count").textContent = s.seriesCount;
  document.getElementById("stat-series-watching").textContent = s.seriesWatchingCount;
  document.getElementById("stat-episodes-watched").textContent = s.episodesWatched;
  document.getElementById("stat-episodes-remaining").textContent = s.episodesRemaining;
  document.getElementById("stat-movies-time").textContent = formatDuration(s.moviesMinutes);
  document.getElementById("stat-episodes-time").textContent = formatDuration(s.episodesMinutes);
  renderGenreStats();
  updateAverageStats();
}

// Zbiera daty (timestampy) obejrzenia filmów albo odcinków, na podstawie
// których liczona jest średnia dzienna/tygodniowa/miesięczna.
function collectWatchedDates(kind){
  const dates = [];
  if (kind === "movies") {
    for (const it of db.items) {
      if (it.type===TYPE_MOVIE && it.status===STATUS_WATCHED && it.watchedAt) dates.push(it.watchedAt);
    }
  } else {
    for (const it of db.items) {
      if (it.type !== TYPE_SERIES) continue;
      for (const season of it.seasons||[]) {
        for (const ep of season.episodes||[]) {
          if (ep.watched && ep.watchedAt) dates.push(ep.watchedAt);
        }
      }
    }
  }
  return dates;
}

// Liczy średnią dzienną/tygodniową/miesięczną na podstawie dat obejrzenia.
// Średnia = liczba obejrzanych pozycji z zapisaną datą / liczba dni od
// najwcześniejszej zapisanej daty do teraz.
function computeAverageStats(kind){
  const dates = collectWatchedDates(kind);
  if (!dates.length) return {count: 0, perDay: 0, perWeek: 0, perMonth: 0, hasData: false};
  const earliest = Math.min(...dates);
  const days = Math.max(1, (Date.now() - earliest) / 86400000);
  const perDay = dates.length / days;
  return {count: dates.length, perDay, perWeek: perDay*7, perMonth: perDay*30.44, hasData: true};
}

function formatAvgNumber(n){
  if (n <= 0) return "0";
  if (n >= 10) return String(Math.round(n));
  const rounded = Math.round(n*10)/10;
  return (rounded % 1 === 0) ? String(rounded) : rounded.toFixed(1);
}

function setAveragePane(prefix, s){
  const dayEl = document.getElementById(`stat-${prefix}-avg-day`);
  if (!dayEl) return;
  const weekEl = document.getElementById(`stat-${prefix}-avg-week`);
  const monthEl = document.getElementById(`stat-${prefix}-avg-month`);
  const noteEl = document.getElementById(`stat-${prefix}-avg-note`);
  if (!s.hasData) {
    dayEl.textContent = "—";
    weekEl.textContent = "—";
    monthEl.textContent = "—";
    if (noteEl) noteEl.textContent = "Brak danych — średnia pojawi się, gdy zaczniesz oznaczać pozycje jako obejrzane.";
    return;
  }
  dayEl.textContent = formatAvgNumber(s.perDay);
  weekEl.textContent = formatAvgNumber(s.perWeek);
  monthEl.textContent = formatAvgNumber(s.perMonth);
  if (noteEl) noteEl.textContent = "Średnia liczona od daty oznaczenia pierwszej pozycji jako obejrzanej (starsze wpisy sprzed tej funkcji nie mają zapisanej daty).";
}

function updateAverageStats(){
  setAveragePane("movies", computeAverageStats("movies"));
  setAveragePane("episodes", computeAverageStats("episodes"));
}

// Zlicza gatunki dla danego typu (film/serial) wśród pozycji uznanych za
// oglądane/obejrzane (filmy: zakończone; seriale: oglądane/zakończone/wstrzymane).
// Zwraca tylko gatunki, które faktycznie występują (count > 0), posortowane malejąco.
function computeGenreStats(type){
  const relevant = db.items.filter(i=>{
    if (i.type !== type) return false;
    if (type === TYPE_MOVIE) return i.status === STATUS_WATCHED;
    return i.status===STATUS_WATCHED || i.status===STATUS_WATCHING || i.status===STATUS_PAUSED;
  });
  const counts = {};
  let total = 0;
  for (const it of relevant) {
    for (const g of (it.genres||[])) {
      if (!g) continue;
      counts[g] = (counts[g]||0) + 1;
      total++;
    }
  }
  return Object.entries(counts)
    .filter(([,count])=>count>0)
    .map(([name,count])=>({name, count, pct: total ? (count/total*100) : 0}))
    .sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name));
}

// Formatuje procent tak, by małe udziały nie wyglądały jak "0%" po zaokrągleniu.
function formatGenrePct(pct){
  if (pct <= 0) return "0%";
  if (pct < 1) return pct.toFixed(1).replace(".0","") + "%";
  return Math.round(pct) + "%";
}

function renderGenreStatsInto(listId, emptyId, type){
  const list = document.getElementById(listId);
  const empty = document.getElementById(emptyId);
  if (!list) return;
  const data = computeGenreStats(type);
  if (!data.length) {
    list.innerHTML = "";
    if (empty) empty.style.display = "";
    return;
  }
  if (empty) empty.style.display = "none";
  list.innerHTML = data.map(g=>`
    <div class="genre-stat-row">
      <div class="genre-stat-name">${escapeHtml(g.name)}</div>
      <div class="genre-bar-track"><div class="genre-bar-fill" style="width:${g.pct.toFixed(1)}%;"></div></div>
      <div class="genre-stat-pct">${formatGenrePct(g.pct)}</div>
    </div>
  `).join("");
}

function renderGenreStats(){
  renderGenreStatsInto("stat-genres-movies-list", "stat-genres-movies-empty", TYPE_MOVIE);
  renderGenreStatsInto("stat-genres-series-list", "stat-genres-series-empty", TYPE_SERIES);
}

