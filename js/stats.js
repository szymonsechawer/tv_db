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
  renderCatchUpInfo();
}

// Zbiera wpisy {ts, duration} obejrzenia filmów albo odcinków (ts = timestamp
// obejrzenia, duration = czas trwania w minutach), na podstawie których liczone
// są średnie, wykresy tygodniowy/miesięczny oraz rekordy roczne.
function collectWatchedEntries(kind){
  const entries = [];
  if (kind === "movies") {
    for (const it of db.items) {
      if (it.type===TYPE_MOVIE && it.status===STATUS_WATCHED && it.watchedAt) entries.push({ts: it.watchedAt, duration: it.duration||0});
    }
  } else {
    for (const it of db.items) {
      if (it.type !== TYPE_SERIES) continue;
      for (const season of it.seasons||[]) {
        for (const ep of season.episodes||[]) {
          if (ep.watched && ep.watchedAt) entries.push({ts: ep.watchedAt, duration: ep.duration||0});
        }
      }
    }
  }
  return entries;
}

// Zbiera same daty (timestampy) obejrzenia — skrót dla miejsc, gdzie czas
// trwania nie jest potrzebny.
function collectWatchedDates(kind){
  return collectWatchedEntries(kind).map(e=>e.ts);
}

// Liczy średnią dzienną/tygodniową/miesięczną na podstawie dat obejrzenia.
// Początek doby (00:00 czasu lokalnego) dla danego timestampu.
function startOfDayLocal(ts){
  const d = new Date(ts);
  d.setHours(0,0,0,0);
  return d.getTime();
}

// Liczy średnią dzienną/tygodniową/miesięczną na podstawie dat obejrzenia.
// Średnia = liczba obejrzanych pozycji z zapisaną datą / liczba DNI KALENDARZOWYCH
// od najwcześniejszej zapisanej daty do dziś (włącznie z obydwoma dniami skrajnymi).
// Np. 2 odcinki w poniedziałek + 3 we wtorek = 5 odcinków / 2 dni = 2,5 dziennie
// (a nie 5, jak przy liczeniu "gołego" czasu, który dawałby ~1 dobę różnicy).
function computeAverageStats(kind){
  const dates = collectWatchedDates(kind);
  if (!dates.length) return {count: 0, perDay: 0, perWeek: 0, perMonth: 0, days: 0, hasData: false};
  const earliest = Math.min(...dates);
  // Liczba dni kalendarzowych obserwacji (min. 1, zeby nie dzielic przez zero).
  const days = Math.max(1, Math.round((startOfDayLocal(Date.now()) - startOfDayLocal(earliest)) / 86400000) + 1);
  const perDay = dates.length / days;
  // Sredniej tygodniowej/miesiecznej nie ekstrapolujemy w gore, dopoki nie minal
  // pelny tydzien/miesiac — inaczej 1 odcinek obejrzany dzis dawal "7 tygodniowo".
  const perWeek = dates.length / Math.max(1, days/7);
  const perMonth = dates.length / Math.max(1, days/30.44);
  return {count: dates.length, perDay, perWeek, perMonth, days, hasData: true};
}

function formatAvgNumber(n){
  if (n <= 0) return "0";
  if (n >= 10) return String(Math.round(n));
  const rounded = Math.round(n*10)/10;
  return (rounded % 1 === 0) ? String(rounded) : rounded.toFixed(1);
}

// Klucz dnia (lokalny, wg czasu urządzenia) w formacie YYYY-MM-DD, używany do
// grupowania obejrzanych pozycji po dniu kalendarzowym.
function dayKeyLocal(ts){
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// Grupuje obejrzane pozycje (filmy/odcinki) wg dnia kalendarzowego, na
// podstawie zapisanych dat obejrzenia (watchedAt).
function computeDailyCounts(kind){
  const dates = collectWatchedDates(kind);
  const counts = {};
  for (const ts of dates) {
    const k = dayKeyLocal(ts);
    counts[k] = (counts[k]||0) + 1;
  }
  return counts;
}

// Poniedziałek bieżącego tygodnia (00:00 czasu lokalnego).
function startOfWeekMonday(date){
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const day = d.getDay(); // 0=niedziela..6=sobota
  const diff = (day === 0) ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

const WEEKDAY_LABELS_PL = ["Pn","Wt","Śr","Cz","Pt","So","Nd"];

// Dane do wykresu kolumnowego bieżącego tygodnia (od poniedziałku).
// Zeruje się automatycznie z nadejściem nowego tygodnia, bo liczy tylko dni
// mieszczące się w aktualnym tygodniu.
function computeWeekChartData(kind){
  const counts = computeDailyCounts(kind);
  const monday = startOfWeekMonday(new Date());
  const todayKey = dayKeyLocal(Date.now());
  const days = [];
  let max = 0;
  for (let i=0;i<7;i++){
    const d = new Date(monday);
    d.setDate(monday.getDate()+i);
    const key = dayKeyLocal(d.getTime());
    const count = counts[key] || 0;
    if (count > max) max = count;
    days.push({label: WEEKDAY_LABELS_PL[i], count, isToday: key===todayKey});
  }
  return {days, max};
}

// Rekord: najwięcej pozycji obejrzanych jednego dnia (cała historia danych).
// Ponieważ liczony jest zawsze z pełnej historii dat obejrzenia, rekord
// "zostaje" (nie znika po zresetowaniu wykresu tygodniowego) i rośnie tylko
// wtedy, gdy pojawi się dzień z większą liczbą obejrzanych pozycji.
function computeDayRecord(kind){
  const counts = computeDailyCounts(kind);
  let max = 0;
  for (const k in counts) if (counts[k] > max) max = counts[k];
  return max;
}

function renderWeekChart(elId, kind, totalElId){
  const el = document.getElementById(elId);
  if (!el) return;
  const {days, max} = computeWeekChartData(kind);
  const scaleMax = Math.max(max, 1);
  el.innerHTML = days.map(d=>{
    const pct = d.count>0 ? Math.max(Math.round((d.count/scaleMax)*100), 6) : 0;
    const cls = "week-chart-col" + (d.count>0 ? " has-value" : "") + (d.isToday ? " today" : "");
    return `
      <div class="${cls}">
        <div class="week-chart-value">${d.count}</div>
        <div class="week-chart-bar-wrap"><div class="week-chart-bar" style="height:${pct}%;"></div></div>
        <div class="week-chart-label">${d.label}</div>
      </div>
    `;
  }).join("");
  if (totalElId) {
    const totalEl = document.getElementById(totalElId);
    if (totalEl) totalEl.textContent = days.reduce((acc,d)=>acc+d.count, 0);
  }
}

// Liczy średni dzienny czas oglądania (w minutach) na podstawie zapisanych
// dat obejrzenia i czasów trwania — tak samo jak computeAverageStats liczy
// średnią dzienną liczby pozycji, tylko sumuje minuty zamiast sztuk.
function computeAverageMinutesPerDay(kind){
  const entries = collectWatchedEntries(kind);
  if (!entries.length) return {perDay: 0, hasData: false};
  const dates = entries.map(e=>e.ts);
  const earliest = Math.min(...dates);
  const days = Math.max(1, Math.round((startOfDayLocal(Date.now()) - startOfDayLocal(earliest)) / 86400000) + 1);
  const totalMinutes = entries.reduce((acc,e)=>acc+(e.duration||0), 0);
  return {perDay: totalMinutes / days, hasData: true, totalMinutes, days};
}

function updateAverageStats(){
  archiveCompletedYears();

  renderWeekChart("stat-movies-week-chart", "movies", "stat-movies-week-total");
  renderWeekChart("stat-episodes-week-chart", "episodes", "stat-episodes-week-total");
  renderMonthChart("stat-movies-month-chart", "movies", "stat-movies-year-total");
  renderMonthChart("stat-episodes-month-chart", "episodes", "stat-episodes-year-total");

  const epAvg = computeAverageStats("episodes");
  document.getElementById("stat-episodes-avg-day").textContent = epAvg.hasData ? formatAvgNumber(epAvg.perDay) : "—";

  const epMinAvg = computeAverageMinutesPerDay("episodes");
  const epAvgTimeGeneralEl = document.getElementById("stat-episodes-avg-time-general");
  if (epAvgTimeGeneralEl) epAvgTimeGeneralEl.textContent = epMinAvg.hasData ? formatDuration(Math.round(epMinAvg.perDay)) : "—";
}

// ============================================================
// Wykres miesięczny (bieżący rok) + rekordy roczne (po zakończeniu roku)
// ============================================================

const MONTH_LABELS_PL = ["Sty","Lut","Mar","Kwi","Maj","Cze","Lip","Sie","Wrz","Paź","Lis","Gru"];

// Klucz miesiąca (lokalny) w formacie YYYY-MM.
function monthKeyLocal(ts){
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

// Grupuje obejrzane pozycje wg miesiąca kalendarzowego (wszystkie lata).
function computeMonthlyCounts(kind){
  const dates = collectWatchedDates(kind);
  const counts = {};
  for (const ts of dates) {
    const k = monthKeyLocal(ts);
    counts[k] = (counts[k]||0) + 1;
  }
  return counts;
}

// Dane do wykresu kolumnowego bieżącego roku (Sty–Gru). Zeruje się
// automatycznie z nadejściem nowego roku, bo liczy tylko miesiące
// mieszczące się w aktualnym roku kalendarzowym.
function computeMonthChartData(kind){
  const counts = computeMonthlyCounts(kind);
  const now = new Date();
  const year = now.getFullYear();
  const currentMonth = now.getMonth();
  const months = [];
  let max = 0;
  for (let m=0;m<12;m++){
    const key = `${year}-${String(m+1).padStart(2,"0")}`;
    const count = counts[key] || 0;
    if (count > max) max = count;
    months.push({label: MONTH_LABELS_PL[m], count, isCurrent: m===currentMonth});
  }
  return {months, max};
}

function renderMonthChart(elId, kind, totalElId){
  const el = document.getElementById(elId);
  if (!el) return;
  const {months, max} = computeMonthChartData(kind);
  const scaleMax = Math.max(max, 1);
  el.innerHTML = months.map(m=>{
    const pct = m.count>0 ? Math.max(Math.round((m.count/scaleMax)*100), 6) : 0;
    const cls = "week-chart-col month-col" + (m.count>0 ? " has-value" : "") + (m.isCurrent ? " today" : "");
    return `
      <div class="${cls}">
        <div class="week-chart-value">${m.count}</div>
        <div class="week-chart-bar-wrap"><div class="week-chart-bar" style="height:${pct}%;"></div></div>
        <div class="week-chart-label">${m.label}</div>
      </div>
    `;
  }).join("");
  if (totalElId) {
    const totalEl = document.getElementById(totalElId);
    if (totalEl) totalEl.textContent = months.reduce((acc,m)=>acc+m.count, 0);
  }
}

function isLeapYear(y){ return (y%4===0 && y%100!==0) || y%400===0; }

// Statystyki dla jednego (zakończonego) roku: liczba obejrzanych pozycji,
// łączny czas oraz średnia dzienna liczona jako liczba pozycji / liczba dni
// w tym roku (365 albo 366 dla lat przestępnych).
function computeYearStats(kind, year){
  const entries = collectWatchedEntries(kind).filter(e=>new Date(e.ts).getFullYear()===year);
  const count = entries.length;
  const minutes = entries.reduce((acc,e)=>acc+(e.duration||0),0);
  const daysInYear = isLeapYear(year) ? 366 : 365;
  const perDay = count / daysInYear;
  return {year, count, minutes, perDay};
}

// Statystyki bieżącego (jeszcze trwającego) roku, liczone na żywo — średnia
// dzienna dzieli liczbę obejrzanych pozycji przez liczbę dni, które już
// minęły od 1 stycznia (a nie przez pełne 365/366 dni), żeby była miarodajna
// w trakcie roku.
function computeCurrentYearLiveStats(kind){
  const year = new Date().getFullYear();
  const entries = collectWatchedEntries(kind).filter(e=>new Date(e.ts).getFullYear()===year);
  const count = entries.length;
  const minutes = entries.reduce((acc,e)=>acc+(e.duration||0),0);
  const startOfYear = new Date(year,0,1).getTime();
  const daysElapsed = Math.max(1, Math.floor((Date.now()-startOfYear)/86400000)+1);
  const perDay = count / daysElapsed;
  return {year, count, minutes, perDay};
}

// Gdy zaczyna się nowy rok, poprzedni rok jest "zamykany": jego statystyki
// (liczba obejrzanych pozycji, średnia dzienna, łączny czas) zostają
// policzone raz i zapisane na stałe w db.year_stats (a stamtąd trafiają do
// pliku JSON przy zapisie bazy). Bieżący, jeszcze trwający rok nigdy nie jest
// archiwizowany — wykres miesięczny dla niego liczy się na żywo i zeruje się
// automatycznie z nadejściem kolejnego roku.
function archiveCompletedYears(){
  if (!db.year_stats) db.year_stats = {movies: {}, episodes: {}};
  if (!db.year_stats.movies) db.year_stats.movies = {};
  if (!db.year_stats.episodes) db.year_stats.episodes = {};
  const currentYear = new Date().getFullYear();
  let changed = false;
  for (const kind of ["movies","episodes"]) {
    const years = new Set(collectWatchedDates(kind).map(ts=>new Date(ts).getFullYear()));
    for (const y of years) {
      if (y >= currentYear) continue;
      if (db.year_stats[kind][y]) continue;
      db.year_stats[kind][y] = computeYearStats(kind, y);
      changed = true;
    }
  }
  if (changed) setDirty(true);
}

// Renderuje listę rekordów rocznych jako HTML do okna modalnego.
// Pierwsza linia to zawsze bieżący, jeszcze trwający rok, liczony na żywo
// (dotychczasowy wynik "w trakcie"). Pod nim, każdy w nowej linii, kolejne
// zarchiwizowane (zakończone) lata — od najnowszego do najstarszego.
// Z nadejściem Nowego Roku bieżący wiersz zeruje się i zaczyna liczyć od
// nowa, a poprzedni rok "spada" na stałe do listy poniżej.
function buildYearRecordsHtml(kind){
  const unitLabel = kind==="movies" ? "filmów" : "odcinków";
  const rowHtml = (s, inProgress) => {
    const label = inProgress ? `${s.year} rok (w trakcie):` : `${s.year} rok:`;
    return `<div class="stats-row"><div class="label">${label}</div><div class="value">${s.count} ${unitLabel} · śr. ${formatAvgNumber(s.perDay)}/dzień · ${formatDuration(s.minutes)}</div></div>`;
  };

  const current = computeCurrentYearLiveStats(kind);
  let html = rowHtml(current, true);

  const data = (db.year_stats && db.year_stats[kind]) || {};
  const years = Object.keys(data).map(Number).filter(Number.isInteger).sort((a,b)=>b-a);
  html += years.map(y=>rowHtml(data[y], false)).join("");
  return html;
}

function openYearRecordsDialog(kind){
  const title = kind==="movies" ? "Rekordy roczne — Filmy" : "Rekordy roczne — Seriale";
  const overlay = openOverlay(`
    <div class="modal-header">${escapeHtml(title)}</div>
    <div class="modal-body">${buildYearRecordsHtml(kind)}</div>
    <div class="modal-footer">
      <button class="btn" id="year-records-close-btn">Zamknij</button>
    </div>
  `);
  function finish(){ closeOverlay(overlay); document.removeEventListener("keydown", onKey); }
  function onKey(e){ if (!isTopOverlay(overlay)) return; if (e.key==="Enter"||e.key==="Escape") finish(); }
  overlay.querySelector("#year-records-close-btn").addEventListener("click", finish);
  document.addEventListener("keydown", onKey);
}

document.getElementById("btn-year-records-movies")?.addEventListener("click", ()=>openYearRecordsDialog("movies"));
document.getElementById("btn-year-records-episodes")?.addEventListener("click", ()=>openYearRecordsDialog("episodes"));

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



// ============================================================
// Prognoza: kiedy nadgonię wszystkie zaległe odcinki
// ============================================================

// Zaległe = nieobejrzane odcinki, które już miały premierę (lub nie mają daty),
// w serialach oglądanych / wstrzymanych / zakończonych.
function countBacklogEpisodes(){
  let n = 0;
  for (const it of db.items) {
    if (it.type !== TYPE_SERIES) continue;
    if (!(it.status===STATUS_WATCHING || it.status===STATUS_PAUSED || it.status===STATUS_WATCHED)) continue;
    for (const season of it.seasons||[]) {
      for (const ep of season.episodes||[]) {
        if (ep.watched) continue;
        const d = daysUntil(ep.air_date);
        if (d !== null && d > 0) continue; // jeszcze nie wyemitowany
        n++;
      }
    }
  }
  return n;
}

function plDays(n){
  const last = n % 10, last2 = n % 100;
  if (n === 1) return "dzień";
  if (last >= 2 && last <= 4 && !(last2 >= 12 && last2 <= 14)) return "dni";
  return "dni";
}

function computeCatchUp(){
  const backlog = countBacklogEpisodes();
  const avg = computeAverageStats("episodes");
  if (backlog === 0) return {backlog, done: true, avg};
  if (!avg.hasData || avg.perDay <= 0) return {backlog, done: false, unknown: true, avg};
  const days = Math.ceil(backlog / avg.perDay);
  const date = new Date(Date.now() + days*86400000);
  const iso = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  return {backlog, done: false, days, dateText: formatDateDMY(iso), avg};
}

function renderCatchUpInfo(){
  const labelEl = document.getElementById("stat-catchup-label");
  const valueEl = document.getElementById("stat-catchup-value");
  const dateRow = document.getElementById("stat-catchup-date-row");
  const dateEl = document.getElementById("stat-catchup-date");
  if (!labelEl || !valueEl) return;
  const c = computeCatchUp();
  if (c.done) {
    labelEl.textContent = "Zaległe odcinki:";
    valueEl.textContent = "Nadgonione! 🎉";
    if (dateRow) dateRow.style.display = "none";
    return;
  }
  if (c.unknown) {
    labelEl.textContent = "Zaległe odcinki:";
    valueEl.textContent = `${c.backlog} (brak danych o średniej)`;
    if (dateRow) dateRow.style.display = "none";
    return;
  }
  labelEl.textContent = "Zaległe odcinki nadgonisz za:";
  valueEl.textContent = `${c.days} ${plDays(c.days)}`;
  if (dateRow) dateRow.style.display = "";
  if (dateEl) dateEl.textContent = c.dateText;
}
