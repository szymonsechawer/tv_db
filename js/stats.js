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
}

