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
}

// Zlicza gatunki wśród oglądanych/obejrzanych pozycji (filmy zakończone,
// seriale oglądane/zakończone/wstrzymane) i zwraca listę posortowaną malejąco
// wg udziału procentowego.
function computeGenreStats(){
  const relevant = db.items.filter(i=>
    (i.type===TYPE_MOVIE && i.status===STATUS_WATCHED) ||
    (i.type===TYPE_SERIES && (i.status===STATUS_WATCHED || i.status===STATUS_WATCHING || i.status===STATUS_PAUSED))
  );
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
    .map(([name,count])=>({name, count, pct: total ? (count/total*100) : 0}))
    .sort((a,b)=>b.count-a.count);
}

function renderGenreStats(){
  const list = document.getElementById("stat-genres-list");
  const empty = document.getElementById("stat-genres-empty");
  if (!list) return;
  const data = computeGenreStats();
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
      <div class="genre-stat-pct">${g.pct.toFixed(0)}%</div>
    </div>
  `).join("");
}

