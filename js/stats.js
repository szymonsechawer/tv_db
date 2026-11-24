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
    seriesTotalCount: seriesWatched.length + seriesWatching.length,
    seriesPausedCount: seriesPaused.length,
    episodesWatched, episodesRemaining, moviesMinutes, episodesMinutes,
  };
}

function updateStats(){
  const s = computeStats();
  document.getElementById("stat-movies-count").textContent = s.moviesCount;
  document.getElementById("stat-series-total").textContent = s.seriesTotalCount;
  document.getElementById("stat-series-count").textContent = s.seriesCount;
  document.getElementById("stat-series-watching").textContent = s.seriesWatchingCount;
  document.getElementById("stat-episodes-watched").textContent = s.episodesWatched;
  document.getElementById("stat-episodes-remaining").textContent = s.episodesRemaining;
  document.getElementById("stat-movies-time").textContent = formatDuration(s.moviesMinutes);
  document.getElementById("stat-episodes-time").textContent = formatDuration(s.episodesMinutes);
  renderGenreStats();
  updateAverageStats();
  renderCatchUpInfo();
  renderTodoTime();
  renderGeneralTiles(s);
  renderPaneTiles("movies");
  renderPaneTiles("episodes");
  if (typeof renderStatsExtra === "function") renderStatsExtra(s);
  if (typeof activeMain !== "undefined" && activeMain === "summary") renderSummaryTab();
}

// ============================================================
// Seriale / Filmy: kafelki u góry + paski list względem największej wartości
// ============================================================
const MONTH_NAMES_LOC_PL = ["styczniu","lutym","marcu","kwietniu","maju","czerwcu","lipcu","sierpniu","wrześniu","październiku","listopadzie","grudniu"];
function renderPaneTiles(kind){
  const isMov = kind === "movies";
  const box = document.getElementById(isMov ? "stat-tiles-movies" : "stat-tiles-series");
  if (!box) return;
  const lines = (arr)=>arr.filter(Boolean).map(t=>`<span>${t}</span>`).join("");
  const week = computeWeekChartData(kind).days.reduce((a,d)=>a+d.count, 0);
  const weekRec = computeWeekRecord(kind);
  const {months} = computeMonthChartData(kind);
  const yearTotal = months.reduce((a,m)=>a+m.count, 0);
  let best = -1; months.forEach((m,i)=>{ if (m.count > 0 && (best < 0 || m.count > months[best].count)) best = i; });
  const r = computeAverageRating(isMov ? TYPE_MOVIE : TYPE_SERIES);
  const unit = (n)=> isMov ? polishPlural(n,"film","filmy","filmów") : polishPlural(n,"odcinek","odcinki","odcinków");
  const cls = isMov ? "st-mov" : "st-ser";
  let fourth;
  if (isMov) {
    const durs = db.items.filter(i=>i.type===TYPE_MOVIE && i.status===STATUS_WATCHED && i.duration>0).map(i=>i.duration);
    const avg = durs.length ? Math.round(durs.reduce((a,b)=>a+b,0)/durs.length) : 0;
    fourth = `<div class="st-t"><small>Średni czas</small><b>${avg ? escapeHtml(fmtSpanShort(avg)) : "—"}</b><div class="st-l">${lines(["na film"])}</div></div>`;
  } else {
    const a = computeAverageStats("episodes"), m = computeAverageMinutesPerDay("episodes");
    fourth = `<div class="st-t"><small>Dziennie</small><b>${a.hasData ? escapeHtml(String(formatAvgNumber(a.perDay)).replace(".", ",")) : "—"}</b><div class="st-l">${lines(["odcinka średnio", m.hasData ? `ok. ${escapeHtml(fmtSpanShort(m.perDay))}` : ""])}</div></div>`;
  }
  box.innerHTML = `
    <div class="st-t ${cls}"><small>Ten tydzień</small><b>${fmtNum(week)}</b><div class="st-l">${lines([unit(week), weekRec > 0 ? `najwięcej w tygodniu (${fmtNum(weekRec)}${isMov ? "" : " odc."})` : ""])}</div></div>
    <div class="st-t ${cls}"><small>Ten rok</small><b>${fmtNum(yearTotal)}</b><div class="st-l">${lines([unit(yearTotal), best >= 0 ? `najwięcej w ${MONTH_NAMES_LOC_PL[best]} (${fmtNum(months[best].count)}${isMov ? "" : " odc."})` : ""])}</div></div>
    <div class="st-t"><small>Średnia ocena</small><b>${r ? r.avg.toFixed(1).replace(".", ",") : "—"}</b><div class="st-l">${lines([r ? `z ${fmtNum(r.count)} ${r.count===1?"oceny":"ocen"}` : "brak ocen"])}</div></div>
    ${fourth}`;
  // paski list (gatunki, kraje) względem największej pozycji na liście
  const pane = box.closest(".status-pane");
  if (pane) pane.querySelectorAll(".genre-stats-list").forEach(list=>{
    const fills = [...list.querySelectorAll(".genre-bar-fill")];
    if (!fills.length) return;
    const vals = fills.map(f=>parseFloat(f.dataset.pct || f.style.width) || 0);
    fills.forEach((f,i)=>{ if (!f.dataset.pct) f.dataset.pct = vals[i]; });
    const max = Math.max(...vals, 0.0001);
    fills.forEach((f,i)=>{ f.style.width = (vals[i] / max * 100).toFixed(1) + "%"; });
  });
}

// ============================================================
// Ogólne: kafelki z najważniejszymi liczbami
// ============================================================
function fmtNum(n){ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0"); }
function fmtSpanShort(minutes){
  let m = Math.round(minutes || 0);
  if (m <= 0) return "0 min";
  const y = Math.floor(m / (MIN_PER_DAY*365)); m -= y*MIN_PER_DAY*365;
  const mo = Math.floor(m / MIN_PER_MONTH); m -= mo*MIN_PER_MONTH;
  const d = Math.floor(m / MIN_PER_DAY); m -= d*MIN_PER_DAY;
  const h = Math.floor(m / 60); const mi = m - h*60;
  const parts = [];
  if (y) parts.push(`${y} ${polishPlural(y,"rok","lata","lat")}`);
  if (mo) parts.push(`${mo} mies.`);
  if (d) parts.push(`${d} ${d===1?"dzień":"dni"}`);
  if (h) parts.push(`${h} h`);
  if (mi) parts.push(`${mi} min`);
  return parts.slice(0, 2).join(" ");
}
function fmtDaysHours(minutes){
  const totalH = Math.round((minutes||0) / 60);
  const d = Math.floor(totalH / 24), h = totalH % 24;
  if (!d) return `${h} h`;
  return h ? `${fmtNum(d)} ${d===1?"dzień":"dni"} ${h} h` : `${fmtNum(d)} ${d===1?"dzień":"dni"}`;
}
function renderGeneralTiles(s){
  const box = document.getElementById("stat-tiles");
  if (!box) return;
  s = s || computeStats();
  const esc = escapeHtml;
  const lines = (arr)=>arr.filter(Boolean).map(t=>`<span>${t}</span>`).join("");
  const epAvg = computeAverageStats("episodes");
  const epMin = computeAverageMinutesPerDay("episodes");
  const total = s.episodesMinutes + s.moviesMinutes;
  const serPct = total ? Math.round(s.episodesMinutes / total * 100) : 0;
  const totalDays = Math.floor(total / MIN_PER_DAY);
  const t = computeTodoTime();
  const c = computeCatchUp();
  let catchBig, catchLines;
  if (c.done) { catchBig = "Nadgonione! 🎉"; catchLines = ["brak zaległych odcinków"]; }
  else if (c.unknown) { catchBig = `${fmtNum(c.backlog)} odc.`; catchLines = ["zaległych odcinków", "brak danych o średniej"]; }
  else { catchBig = esc(c.dateText); catchLines = [`za ${fmtNum(c.days)} ${plDays(c.days)}`, `${fmtNum(c.backlog)} zaległych odc.`, "przy obecnym tempie"]; }
  box.innerHTML = `
    <div class="st-t st-ser"><small>Seriale</small><b>${fmtNum(s.seriesTotalCount)}</b><div class="st-l">${lines([`${fmtNum(s.seriesCount)} zakończonych`, `${fmtNum(s.seriesWatchingCount)} oglądanych`])}</div></div>
    <div class="st-t st-mov"><small>Filmy</small><b>${fmtNum(s.moviesCount)}</b><div class="st-l">${lines(["obejrzanych"])}</div></div>
    <div class="st-t st-ser"><small>Odcinki</small><b>${fmtNum(s.episodesWatched)}</b><div class="st-l">${lines(["obejrzanych", `${fmtNum(s.episodesRemaining)} pozostało`])}</div></div>
    <div class="st-t"><small>Dziennie</small><b>${epAvg.hasData ? esc(String(formatAvgNumber(epAvg.perDay)).replace(".", ",")) : "—"}</b><div class="st-l">${lines(["odcinka średnio", epMin.hasData ? `ok. ${esc(fmtSpanShort(epMin.perDay))}` : ""])}</div></div>
    <div class="st-t st-w"><small>Łączny czas przed ekranem</small><b>${totalDays >= 1 ? `${fmtNum(totalDays)} ${totalDays===1?"dzień":"dni"}` : esc(fmtSpanShort(total))}</b>
      <div class="st-bar"><span class="st-bs" style="width:${serPct}%"></span><span class="st-bm" style="width:${100-serPct}%"></span></div>
      <div class="st-l">${lines([`<i class="st-dot st-ds"></i>Seriale: ${esc(fmtSpanShort(s.episodesMinutes))}`, `<i class="st-dot st-dm"></i>Filmy: ${esc(fmtSpanShort(s.moviesMinutes))}`])}</div></div>
    <div class="st-t st-w"><small>Do nadrobienia</small><b>${esc(fmtDaysHours(t.total))}</b><div class="st-l">${lines([
      `Odcinki w Oglądanych: ${fmtNum(t.watching.count)} odc. · ${esc(formatHoursShort(t.watching.minutes))}`,
      `Seriale w Planowanych: ${fmtNum(t.plannedSeries.count)} odc. · ${esc(formatHoursShort(t.plannedSeries.minutes))}`,
      `Filmy w Planowanych: ${fmtNum(t.movies.count)} ${polishPlural(t.movies.count,"film","filmy","filmów")} · ${esc(formatHoursShort(t.movies.minutes))}`])}</div>
      ${t.estimated ? `<div class="st-note">Dla ${fmtNum(t.estimated)} pozycji bez czasu trwania przyjęto średni czas.</div>` : ""}</div>
    <div class="st-t st-w"><small>Zaległe odcinki nadgonisz</small><b>${catchBig}</b><div class="st-l">${lines(catchLines)}</div></div>`;
}

// Zbiera wpisy {ts, duration} obejrzenia filmów albo odcinków (ts = timestamp
// obejrzenia, duration = czas trwania w minutach), na podstawie których liczone
// są średnie, wykresy tygodniowy/miesięczny oraz rekordy roczne.
function collectWatchedEntries(kind){
  const entries = [];
  if (kind === "movies") {
    for (const it of db.items) {
      if (it.type!==TYPE_MOVIE || it.status!==STATUS_WATCHED) continue;
      // Data zakończenia (jeśli ustawiona ręcznie na inny dzień) ma
      // pierwszeństwo przed momentem przeniesienia do Zakończonych.
      let ts = it.watchedAt || null;
      if (it.finished_date && (!ts || dayKeyLocal(ts) !== it.finished_date)) ts = finishedDateTimestamp(it.finished_date);
      if (ts) entries.push({ts, duration: it.duration||0});
    }
  } else {
    // Liczą się tylko seriale w Oglądanych/Zakończonych/Wstrzymanych - po
    // przeniesieniu do Planowanych (albo usunięciu) ich odcinki znikają ze
    // statystyk, tak samo jak w statystykach ogólnych.
    const counted = [STATUS_WATCHED, STATUS_WATCHING, STATUS_PAUSED];
    for (const it of db.items) {
      if (it.type !== TYPE_SERIES || !counted.includes(it.status)) continue;
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

// Rekordowy tydzień (pon–niedz): najwięcej odcinków / filmów w jednym tygodniu
function computeWeekRecord(kind){
  const weeks = new Map();
  for (const e of collectWatchedEntries(kind)) {
    const d = new Date(startOfDayLocal(e.ts));
    d.setDate(d.getDate() - ((d.getDay()+6)%7));
    const k = d.getTime();
    weeks.set(k, (weeks.get(k)||0) + 1);
  }
  let best = 0;
  for (const v of weeks.values()) if (v > best) best = v;
  return best;
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
  const isMov = kind === "movies";
  const short = (n)=> isMov ? "film." : "odc.";
  const unitFull = (n)=> isMov ? polishPlural(n,"film","filmy","filmów") : polishPlural(n,"odcinek","odcinki","odcinków");
  const current = computeCurrentYearLiveStats(kind);
  const data = (db.year_stats && db.year_stats[kind]) || {};
  const rows = [{...current, live: true}];
  Object.keys(data).map(Number).filter(y=>Number.isInteger(y) && y !== current.year).sort((a,b)=>b-a)
    .forEach(y=>rows.push({...data[y], year: y}));
  const max = Math.max(...rows.map(r=>r.count||0), 1);
  const yearsHtml = rows.map(r=>`
    <div class="yr-row">
      <span class="yr-y">${r.year}${r.live ? '<i>w trakcie</i>' : ''}</span>
      <span class="yr-bar"><span style="width:${((r.count||0)/max*100).toFixed(1)}%"></span></span>
      <span class="yr-v">${fmtNum(r.count||0)} ${short(r.count)}<i>${escapeHtml(fmtDaysHours(r.minutes||0))}</i></span>
    </div>`).join("");
  const best = rows.reduce((a,r)=> (r.count||0) > (a.count||0) ? r : a, rows[0]);
  const total = rows.reduce((a,r)=>a+(r.count||0), 0);
  const n = rows.length;
  return `<div class="yr-wrap ${isMov ? "st-mov" : "st-ser"}">
    <div class="st-t st-w"><small>Lata</small><div class="yr-list">${yearsHtml}</div></div>
    <div class="st-tiles" style="margin-top:8px;">
      <div class="st-t"><small>Rekordowy rok</small><b>${best.year}</b><div class="st-l"><span>${fmtNum(best.count||0)} ${unitFull(best.count||0)}</span></div></div>
      <div class="st-t"><small>Razem</small><b>${fmtNum(total)}</b><div class="st-l"><span>${unitFull(total)}</span><span>w ${n} ${polishPlural(n,"rok","lata","lat")}</span></div></div>
    </div>
  </div>`;
}

function openYearRecordsDialog(kind){
  const title = kind==="movies" ? "Podsumowanie — Filmy" : "Podsumowanie — Seriale";
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

// Karta „Podsumowanie” (z menu, pod „Statystyki”) — Seriale / Filmy,
// przełączane przyciskami u góry albo przesunięciem palca.
let activeSummaryKind = "episodes";
function renderSummaryTab(dir){
  const box = document.getElementById("summary-content");
  if (!box) return;
  box.innerHTML = buildYearRecordsHtml(activeSummaryKind);
  document.querySelectorAll("#subtabs-summary .tab-btn").forEach(b=>b.classList.toggle("active", b.dataset.sumTab === activeSummaryKind));
  box.classList.remove("swipe-in-l","swipe-in-r");
  if (dir) { void box.offsetWidth; box.classList.add(dir > 0 ? "swipe-in-l" : "swipe-in-r"); }
}
document.querySelectorAll("#subtabs-summary .tab-btn").forEach(b=>b.addEventListener("click", ()=>{
  const k = b.dataset.sumTab; if (k === activeSummaryKind) return;
  activeSummaryKind = k; renderSummaryTab(k === "movies" ? 1 : -1);
}));
(function(){
  const area = document.getElementById("subcontent-summary");
  if (!area) return;
  let x0 = 0, y0 = 0, t0 = 0;
  area.addEventListener("touchstart", e=>{ if (e.touches.length !== 1) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); }, {passive:true});
  area.addEventListener("touchend", e=>{
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - t0 > 800) return;
    if (dx < 0 && activeSummaryKind === "episodes") { activeSummaryKind = "movies"; renderSummaryTab(1); }
    else if (dx > 0 && activeSummaryKind === "movies") { activeSummaryKind = "episodes"; renderSummaryTab(-1); }
  }, {passive:true});
})();

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
    .sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name))
    .slice(0,10); // pokazuj tylko top 10
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

// Lista z paskami i procentami (gatunki, kraje): top 10 + „Pokaż wszystkie”
// w osobnym oknie z wyszukiwaniem; dwukrotne dotknięcie pokazuje tytuły.
function renderShareListInto(listId, emptyId, type, field){
  const list = document.getElementById(listId);
  const empty = document.getElementById(emptyId);
  if (!list) return;
  const all = computePersonStats(type, field, null);
  const moreBtnOld = list.nextElementSibling && list.nextElementSibling.classList.contains("person-more") ? list.nextElementSibling : null;
  if (!all.length) {
    list.innerHTML = "";
    if (moreBtnOld) moreBtnOld.remove();
    if (empty) empty.style.display = "";
    return;
  }
  if (empty) empty.style.display = "none";
  const total = all.reduce((a,x)=>a+x.count, 0);
  const rowsHtml = (arr)=>arr.map(c=>{
    const pct = total ? (c.count/total*100) : 0;
    return `<button type="button" class="genre-stat-row share-row person-link" data-name="${escapeHtml(c.name)}">
        <div class="genre-stat-name">${escapeHtml(c.name)}</div>
        <div class="genre-bar-track"><div class="genre-bar-fill" style="width:${pct.toFixed(1)}%;"></div></div>
        <div class="genre-stat-pct">${formatGenrePct(pct)}</div>
      </button>`;
  }).join("");
  const top = all.slice(0, 10);
  list.innerHTML = rowsHtml(top);
  const rawLabel = (list.closest(".stats-section")?.querySelector("h3")?.textContent || "").trim();
  const label = rawLabel ? rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1).toLowerCase() : "";
  list._personOpen = (name)=>openPersonTitlesDialog(type, field, null, name, label);
  if (!list.dataset.dblInit) { list.dataset.dblInit = "1"; personRowsDoubleTap(list, (name)=>list._personOpen(name)); }
  if (all.length > top.length) {
    let btn = moreBtnOld;
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button"; btn.className = "person-more";
      btn.addEventListener("click", ()=>btn._open && btn._open());
      list.after(btn);
    }
    btn.textContent = `Pokaż wszystkie (${fmtNum(all.length)}) ›`;
    btn._open = ()=>openPersonAllDialog(all, label, rowsHtml, list._personOpen);
  } else if (moreBtnOld) moreBtnOld.remove();
}

function renderGenreStats(){
  renderShareListInto("stat-genres-movies-list", "stat-genres-movies-empty", TYPE_MOVIE, "genres");
  renderShareListInto("stat-genres-series-list", "stat-genres-series-empty", TYPE_SERIES, "genres");
  renderCountryStats();
  renderExtraStats();
}

// Zlicza wystąpienia wartości pola krajowego (production_countries / origin_country)
// wśród pozycji uznanych za oglądane/obejrzane (analogicznie do computeGenreStats).
function computeCountryStats(type, field){
  const relevant = db.items.filter(i=>{
    if (i.type !== type) return false;
    if (type === TYPE_MOVIE) return i.status === STATUS_WATCHED;
    return i.status===STATUS_WATCHED || i.status===STATUS_WATCHING || i.status===STATUS_PAUSED;
  });
  const counts = {};
  for (const it of relevant) {
    for (const c of (it[field]||[])) {
      if (!c) continue;
      counts[c] = (counts[c]||0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([name,count])=>({name, count}))
    .sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name));
}

function renderCountryListInto(listId, emptyId, type, field){
  const list = document.getElementById(listId);
  const empty = document.getElementById(emptyId);
  if (!list) return;
  const data = computeCountryStats(type, field);
  if (!data.length) {
    list.innerHTML = "";
    if (empty) empty.style.display = "";
    return;
  }
  if (empty) empty.style.display = "none";
  // Procent liczony względem WSZYSTKICH krajów, ale wyświetlamy tylko top 10.
  const total = data.reduce((acc,x)=>acc+x.count,0);
  list.innerHTML = data.slice(0,10).map(c=>{
    const pct = total ? (c.count/total*100) : 0;
    return `
      <div class="genre-stat-row">
        <div class="genre-stat-name">${escapeHtml(c.name)}</div>
        <div class="genre-bar-track"><div class="genre-bar-fill" style="width:${pct.toFixed(1)}%;"></div></div>
        <div class="genre-stat-pct">${formatGenrePct(pct)}</div>
      </div>
    `;
  }).join("");
}

function renderCountryStats(){
  renderShareListInto("stat-countries-movies-list", "stat-countries-movies-empty", TYPE_MOVIE, "production_countries");
  renderShareListInto("stat-countries-series-list", "stat-countries-series-empty", TYPE_SERIES, "production_countries");
  renderShareListInto("stat-origin-movies-list", "stat-origin-movies-empty", TYPE_MOVIE, "origin_country");
  renderShareListInto("stat-origin-series-list", "stat-origin-series-empty", TYPE_SERIES, "origin_country");
}

// ============================================================
// Dodatkowe statystyki: średnia ocena, dekady, reżyserzy/twórcy, obsada
// ============================================================

// Pozycje uznane za "oglądane/obejrzane" dla danego typu — ta sama reguła,
// co w computeGenreStats/computeCountryStats (filmy: zakończone; seriale:
// oglądane/zakończone/wstrzymane).
const TYPE_ALL = "all";
function relevantWatchedItems(type){
  if (type === TYPE_ALL) return [...relevantWatchedItems(TYPE_MOVIE), ...relevantWatchedItems(TYPE_SERIES)];
  return db.items.filter(i=>{
    if (i.type !== type) return false;
    if (type === TYPE_MOVIE) return i.status === STATUS_WATCHED;
    return i.status===STATUS_WATCHED || i.status===STATUS_WATCHING || i.status===STATUS_PAUSED;
  });
}

// Średnia z własnych ocen (pole rating, 0.1-10 co 0.1; 0 = brak oceny — pomijane).
function computeAverageRating(type){
  const rated = relevantWatchedItems(type).map(i=>normalizeRating(i.rating)).filter(r=>r>0);
  if (!rated.length) return null;
  const sum = rated.reduce((a,b)=>a+b, 0);
  return {avg: sum/rated.length, count: rated.length};
}

function renderAverageRatingInto(elId, type){
  const el = document.getElementById(elId);
  if (!el) return;
  const r = computeAverageRating(type);
  el.textContent = r ? `${r.avg.toFixed(1)}/10 (${r.count} ${r.count===1?"ocena":"ocen"})` : "—";
}

function renderAverageRatingStats(){
  renderAverageRatingInto("stat-avgrating-movies", TYPE_MOVIE);
  renderAverageRatingInto("stat-avgrating-series", TYPE_SERIES);
}



// Usuwa dopisaną nazwę postaci z wpisu obsady, np. "Jan Kowalski (Postać)" -> "Jan Kowalski".
function stripCastCharacter(raw){
  // od pierwszego " (" — obsługuje też zagnieżdżone nawiasy, np. "Leslie Mann (Linda (voice))"
  return String(raw||"").replace(/\s*\(.*\)\s*$/, "").trim();
}

// Zlicza wystąpienia osób (reżyserów/twórców albo obsady) wśród pozycji
// oglądanych/obejrzanych — analogicznie do computeGenreStats, ale bez
// procentów względem sumy (osoba może wystąpić w wielu pozycjach naraz).
function computePersonStats(type, field, extractFn){
  const relevant = relevantWatchedItems(type);
  const counts = {};
  for (const it of relevant) {
    for (const raw of (it[field]||[])) {
      const name = extractFn ? extractFn(raw) : String(raw||"").trim();
      if (!name) continue;
      counts[name] = (counts[name]||0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([name,count])=>({name, count}))
    .sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name));
}

function renderPersonListInto(listId, emptyId, type, field, extractFn, limit){
  const list = document.getElementById(listId);
  const empty = document.getElementById(emptyId);
  if (!list) return;
  const all = computePersonStats(type, field, extractFn);
  let top = all;
  // Pomijamy osoby, które pojawiły się tylko raz, gdy lista jest bardzo długa —
  // inaczej ranking "najczęściej oglądanych" tonie w jednorazowych wpisach.
  if (top.length > limit && top.some(p=>p.count>1)) top = top.filter(p=>p.count>1);
  top = top.slice(0, limit);
  const moreBtnOld = list.nextElementSibling && list.nextElementSibling.classList.contains("person-more") ? list.nextElementSibling : null;
  if (!top.length) {
    list.innerHTML = "";
    if (moreBtnOld) moreBtnOld.remove();
    if (empty) empty.style.display = "";
    return;
  }
  if (empty) empty.style.display = "none";
  const rowsHtml = (arr)=>arr.map(p=>`
      <button type="button" class="genre-stat-row person-stat-row person-link" data-name="${escapeHtml(p.name)}">
        <div class="genre-stat-name">${escapeHtml(p.name)}</div>
        <div class="genre-stat-pct">${p.count}× <span class="person-chev">›</span></div>
      </button>`).join("");
  list.innerHTML = rowsHtml(top);
  const rawLabel = (list.closest(".stats-section")?.querySelector("h3")?.textContent || "").trim();
  const label = rawLabel ? rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1).toLowerCase() : "";
  list._personOpen = (name)=>openPersonTitlesDialog(type, field, extractFn, name, label);
  if (!list.dataset.dblInit) { list.dataset.dblInit = "1"; personRowsDoubleTap(list, (name)=>list._personOpen(name)); }
  // przycisk rozwijania pełnej listy
  if (all.length > top.length) {
    let btn = moreBtnOld;
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button"; btn.className = "person-more";
      btn.addEventListener("click", ()=>btn._open && btn._open());
      list.after(btn);
    }
    btn.textContent = `Pokaż wszystkie (${fmtNum(all.length)}) ›`;
    btn._open = ()=>openPersonAllDialog(all, label, rowsHtml, list._personOpen);
  } else if (moreBtnOld) moreBtnOld.remove();
}

// dwukrotne dotknięcie wiersza osoby (obsługa zbiorcza dla całej listy)
function personRowsDoubleTap(container, open){
  let lastName = null, lastT = 0, moved = false;
  container.addEventListener("touchstart", ()=>{ moved = false; }, {passive:true});
  container.addEventListener("touchmove", ()=>{ moved = true; }, {passive:true});
  container.addEventListener("touchend", (e)=>{
    const row = e.target.closest(".person-link"); if (!row || moved) { lastName = null; return; }
    const now = Date.now();
    if (lastName === row.dataset.name && now - lastT < 400) { e.preventDefault(); lastName = null; open(row.dataset.name); }
    else { lastName = row.dataset.name; lastT = now; }
  }, {passive:false});
  container.addEventListener("dblclick", (e)=>{ const row = e.target.closest(".person-link"); if (row) open(row.dataset.name); });
}

// Osobne okno z pełną listą osób / wytwórni
function openPersonAllDialog(all, label, rowsHtml, openPerson){
  const norm = (t)=>String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");
  const keyed = all.map(p=>({p, k: norm(p.name)}));
  const overlay = openOverlay(`
    <div class="modal-header pt-head"><div>${escapeHtml(label)}</div><small id="pa-count">wszystkie · ${fmtNum(all.length)}</small></div>
    <div class="pa-search"><input class="entry" id="pa-q" type="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></div>
    <div class="modal-body pt-body pa-body">${rowsHtml(all)}</div>
    <div class="modal-footer"><button class="btn" id="pa-close">Zamknij</button></div>
  `);
  overlay.classList.add("pt-overlay");
  const body = overlay.querySelector(".pa-body"), q = overlay.querySelector("#pa-q"), cnt = overlay.querySelector("#pa-count");
  let timer = null;
  q.addEventListener("input", ()=>{
    clearTimeout(timer);
    timer = setTimeout(()=>{
      const v = norm(q.value.trim());
      const list = v ? keyed.filter(x=>x.k.includes(v)).map(x=>x.p) : all;
      body.innerHTML = list.length ? rowsHtml(list) : '<div class="muted" style="padding:10px 2px;">Brak wyników.</div>';
      body.scrollTop = 0;
      cnt.textContent = v ? `znaleziono · ${fmtNum(list.length)} z ${fmtNum(all.length)}` : `wszystkie · ${fmtNum(all.length)}`;
    }, 120);
  });
  overlay.querySelector("#pa-close").addEventListener("click", ()=>closeOverlay(overlay));
  overlay.addEventListener("click", (e)=>{ if (e.target === overlay) closeOverlay(overlay); });
  personRowsDoubleTap(body, openPerson);
}

// Okno z tytułami, w których występuje dana osoba / wytwórnia
function openPersonTitlesDialog(type, field, extractFn, name, label){
  const isMov = type === TYPE_MOVIE;
  const items = relevantWatchedItems(type).map(it=>{
    const hit = (it[field]||[]).find(raw=>(extractFn ? extractFn(raw) : String(raw||"").trim()) === name);
    if (!hit) return null;
    let role = "";
    if (field === "cast") { const m = String(hit).match(/\((.*)\)\s*$/); role = m ? m[1] : ""; }
    return {it, role};
  }).filter(Boolean).sort((a,b)=>String(b.it.premiere_date||"").localeCompare(String(a.it.premiere_date||"")) || a.it.title.localeCompare(b.it.title));
  const n = items.length;
  let unit;
  if (type === TYPE_ALL) {
    const nm = items.filter(x=>x.it.type===TYPE_MOVIE).length, ns = n - nm;
    unit = [nm ? `${nm} ${polishPlural(nm,"film","filmy","filmów")}` : "", ns ? `${ns} ${polishPlural(ns,"serial","seriale","seriali")}` : ""].filter(Boolean).join(" · ");
  } else unit = `${n} ${isMov ? polishPlural(n,"film","filmy","filmów") : polishPlural(n,"serial","seriale","seriali")}`;
  const rows = items.map(({it})=> type === TYPE_ALL
    ? `<div class="pt-row fl-row"><span>${escapeHtml(it.title)}</span><small>${it.type===TYPE_MOVIE ? "Film" : "Serial"}</small></div>`
    : `<div class="pt-row">${escapeHtml(it.title)}</div>`).join("");
  const overlay = openOverlay(`
    <div class="modal-header pt-head"><div>${escapeHtml(name)}</div><small>${escapeHtml(label)} · ${unit}</small></div>
    <div class="modal-body pt-body">${rows || '<div class="muted">Brak tytułów.</div>'}</div>
    <div class="modal-footer"><button class="btn" id="pt-close">Zamknij</button></div>
  `);
  overlay.classList.add("pt-overlay");
  overlay.querySelector("#pt-close").addEventListener("click", ()=>closeOverlay(overlay));
  overlay.addEventListener("click", (e)=>{ if (e.target === overlay) closeOverlay(overlay); });
}

function renderPersonStats(){
  renderPersonListInto("stat-creators-movies-list", "stat-creators-movies-empty", TYPE_MOVIE, "creators", null, 10);
  renderPersonListInto("stat-cast-movies-list", "stat-cast-movies-empty", TYPE_MOVIE, "cast", stripCastCharacter, 10);
  renderPersonListInto("stat-companies-movies-list", "stat-companies-movies-empty", TYPE_MOVIE, "production_companies", null, 10);
  renderPersonListInto("stat-creators-series-list", "stat-creators-series-empty", TYPE_SERIES, "creators", null, 10);
  renderPersonListInto("stat-cast-series-list", "stat-cast-series-empty", TYPE_SERIES, "cast", stripCastCharacter, 10);
  renderPersonListInto("stat-companies-series-list", "stat-companies-series-empty", TYPE_SERIES, "production_companies", null, 10);
  renderPersonListInto("stat-cast-all-list", "stat-cast-all-empty", TYPE_ALL, "cast", stripCastCharacter, 10);
  renderShareListInto("stat-genres-all-list", "stat-genres-all-empty", TYPE_ALL, "genres");
}

function renderExtraStats(){
  renderAverageRatingStats();
  renderPersonStats();
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


// ============================================================
// Czas do nadrobienia: filmy w Planowanych, wyemitowane nieobejrzane
// odcinki w Oglądanych i w serialach z Planowanych.
// Brakujący czas trwania szacujemy średnią (serialu / wszystkich filmów).
// ============================================================
function computeTodoTime(){
  const movieDurations = db.items.filter(i=>i.type===TYPE_MOVIE && i.duration>0).map(i=>i.duration);
  const avgMovie = movieDurations.length ? movieDurations.reduce((a,b)=>a+b,0)/movieDurations.length : 110;
  const allEpDurations = [];
  for (const it of db.items) if (it.type===TYPE_SERIES) for (const s of it.seasons||[]) for (const e of s.episodes||[]) if (e.duration>0) allEpDurations.push(e.duration);
  const avgEpGlobal = allEpDurations.length ? allEpDurations.reduce((a,b)=>a+b,0)/allEpDurations.length : 45;

  let estimated = 0;
  const movies = {count:0, minutes:0};
  for (const it of db.items) {
    if (it.type!==TYPE_MOVIE || it.status!==STATUS_PLANNED) continue;
    movies.count++;
    if (it.duration>0) movies.minutes += it.duration; else { movies.minutes += avgMovie; estimated++; }
  }
  function seriesTodo(status){
    const r = {count:0, minutes:0, series:0};
    for (const it of db.items) {
      if (it.type!==TYPE_SERIES || it.status!==status) continue;
      const eps = (it.seasons||[]).flatMap(s=>s.episodes||[]);
      const known = eps.filter(e=>e.duration>0).map(e=>e.duration);
      const avg = known.length ? known.reduce((a,b)=>a+b,0)/known.length : avgEpGlobal;
      let n = 0;
      for (const e of eps) {
        if (e.watched || isEpisodeUnaired(e)) continue;
        n++;
        if (e.duration>0) r.minutes += e.duration; else { r.minutes += avg; estimated++; }
      }
      r.count += n;
      if (n) r.series++;
    }
    return r;
  }
  const watching = seriesTodo(STATUS_WATCHING);
  const plannedSeries = seriesTodo(STATUS_PLANNED);
  return {movies, watching, plannedSeries, estimated, total: movies.minutes + watching.minutes + plannedSeries.minutes};
}

function formatHoursShort(minutes){
  const h = Math.round(minutes/60);
  if (h < 1) return `${Math.round(minutes)} min`;
  return `${h.toLocaleString("pl-PL")} h`;
}

function renderTodoTime(){
  const el = (id)=>document.getElementById(id);
  if (!el("stat-todo-total")) return;
  const t = computeTodoTime();
  el("stat-todo-movies").textContent = `${t.movies.count} ${polishPlural(t.movies.count,"film","filmy","filmów")} · ${formatHoursShort(t.movies.minutes)}`;
  el("stat-todo-watching").textContent = `${t.watching.count} odc. · ${formatHoursShort(t.watching.minutes)}`;
  el("stat-todo-planned-series").textContent = `${t.plannedSeries.count} odc. · ${formatHoursShort(t.plannedSeries.minutes)}`;
  const totalHours = Math.round(t.total / 60);
  const d = Math.floor(totalHours / 24), h = totalHours % 24;
  const parts = [];
  if (d) parts.push(`${d} ${polishPlural(d,"dzień","dni","dni")}`);
  if (h || !d) parts.push(`${h} ${polishPlural(h,"godzina","godziny","godzin")}`);
  el("stat-todo-total").textContent = parts.join(" i ");
  el("stat-todo-note").textContent = t.estimated ? `Dla ${t.estimated} pozycji bez czasu trwania przyjęto średni czas.` : "";
}
