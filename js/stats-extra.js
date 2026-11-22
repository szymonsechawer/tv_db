// ============================================================
// stats-extra.js — dodatkowe kafelki pod istniejącymi statystykami
// Ogólne: kamienie milowe, kalendarz, ulubiony dzień, seria dni
// Seriale/Filmy: najwięcej czasu, dekady, odcinki/rekordy, oceny
// ============================================================

const SX_MONTHS = ["styczeń","luty","marzec","kwiecień","maj","czerwiec","lipiec","sierpień","wrzesień","październik","listopad","grudzień"];
const SX_MONTHS_GEN = ["stycznia","lutego","marca","kwietnia","maja","czerwca","lipca","sierpnia","września","października","listopada","grudnia"];
const SX_WD = ["Pn","Wt","Śr","Cz","Pt","So","Nd"];

function sxCard(title, body){ return `<div class="sx-card"><h3>${escapeHtml(title)}</h3>${body}</div>`; }
function sxEmpty(text){ return `<div class="sx-empty">${escapeHtml(text)}</div>`; }
function sxHm(min){ min = Math.round(min||0); const h = Math.floor(min/60), m = min%60; return h ? `${h} h${m ? ` ${String(m).padStart(2,"0")}` : ""}` : `${m} min`; }
function sxHmLong(min){ min = Math.round(min||0); const h = Math.floor(min/60), m = min%60; return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`; }
function sxNum(n){ return typeof fmtNum === "function" ? fmtNum(n) : String(n); }

function sxNextMilestone(n){
  for (const s of [10,25,50,100,250,500,1000]) if (n < s) return s;
  const base = n < 10000 ? 1000 : 5000;
  return (Math.floor(n/base)+1)*base;
}

// Pionowe słupki: [{label, value}], największa wartość wyróżniona
function sxVBars(rows){
  const max = Math.max(1, ...rows.map(r=>r.value));
  const top = Math.max(...rows.map(r=>r.value));
  return `<div class="sx-vb">${rows.map(r=>`<div class="sx-vc"><b>${sxNum(r.value)}</b><i class="${r.value && r.value===top ? "hi" : ""}" style="height:${r.value ? Math.max(4, Math.round(r.value/max*56)) : 2}px"></i><small>${escapeHtml(r.label)}</small></div>`).join("")}</div>`;
}
// Poziome paski: [{label, value, text}]
function sxHBars(rows){
  const max = Math.max(1, ...rows.map(r=>r.value));
  return rows.map(r=>`<div class="sx-hb"><span class="sx-hb-t">${escapeHtml(r.label)}</span><span class="sx-bar"><i style="width:${Math.max(2, Math.round(r.value/max*100))}%"></i></span><span class="sx-hb-v">${escapeHtml(r.text)}</span></div>`).join("");
}

function sxDecades(items){
  const c = {};
  for (const it of items) {
    const y = parseInt(String(it.premiere_date||"").slice(0,4), 10);
    if (!y || y < 1900) continue;
    const d = Math.floor(y/10)*10;
    c[d] = (c[d]||0) + 1;
  }
  const keys = Object.keys(c).map(Number).sort((a,b)=>a-b);
  if (!keys.length) return null;
  const rows = [];
  for (let d = keys[0]; d <= keys[keys.length-1]; d += 10) rows.push({label: `${String(d).slice(2)}.`, value: c[d]||0});
  return rows;
}

function sxRatings(items){
  const c = {};
  for (const it of items) { const r = Number(it.rating)||0; if (r <= 0) continue; const k = Math.min(10, Math.max(1, Math.floor(r))); c[k] = (c[k]||0) + 1; }
  const keys = Object.keys(c).map(Number);
  if (!keys.length) return null;
  const lo = Math.min(...keys), hi = Math.max(...keys);
  const rows = [];
  for (let k = lo; k <= hi; k++) rows.push({label: String(k), value: c[k]||0});
  return rows;
}

function sxCountedSeries(){
  const counted = [STATUS_WATCHED, STATUS_WATCHING, STATUS_PAUSED];
  return db.items.filter(i=>i.type===TYPE_SERIES && counted.includes(i.status));
}

function sxRenderGeneral(s){
  const el = document.getElementById("sx-general");
  if (!el) return;
  let html = "";

  // Kamienie milowe
  const totalHours = Math.floor(((s.moviesMinutes||0) + (s.episodesMinutes||0)) / 60);
  const ms = [
    {name:"filmów", cur: s.moviesCount||0},
    {name:"odcinków", cur: s.episodesWatched||0},
    {name:"godzin", cur: totalHours},
  ].map(m=>{
    const goal = sxNextMilestone(m.cur);
    return `<div class="sx-ms"><div class="sx-ms-r"><b>${sxNum(goal)} ${m.name}</b><span>${sxNum(m.cur)} / ${sxNum(goal)} · zostało ${sxNum(goal-m.cur)}</span></div><div class="sx-bar"><i style="width:${Math.min(100, m.cur/goal*100).toFixed(1)}%"></i></div></div>`;
  }).join("");
  html += sxCard("Kamienie milowe", ms);

  // Wpisy z datą obejrzenia (filmy + odcinki)
  const entries = [...collectWatchedEntries("movies"), ...collectWatchedEntries("episodes")];
  const perDay = new Map();
  for (const e of entries) { const k = dayKeyLocal(e.ts); perDay.set(k, (perDay.get(k)||0) + 1); }

  // Kalendarz: ostatnie 17 tygodni, kolumny = tygodnie (Pn–Nd)
  const WEEKS = 17;
  const today = new Date(); today.setHours(0,0,0,0);
  const dow = (today.getDay()+6)%7; // 0 = poniedziałek
  const start = new Date(today); start.setDate(start.getDate() - dow - (WEEKS-1)*7);
  const vals = [...perDay.values()].sort((a,b)=>a-b);
  const q = (p)=> vals.length ? vals[Math.min(vals.length-1, Math.floor(p*(vals.length-1)))] : 1;
  const t1 = q(.25), t2 = q(.5), t3 = q(.8);
  let cells = "", monthsRow = "", lastMonth = -1;
  for (let w = 0; w < WEEKS; w++) {
    const wkStart = new Date(start); wkStart.setDate(start.getDate() + w*7);
    const m = wkStart.getMonth();
    monthsRow += `<span>${m !== lastMonth && wkStart.getDate() <= 7 ? SX_MONTHS[m].slice(0,3) : (w===0 ? SX_MONTHS[m].slice(0,3) : "")}</span>`;
    if (m !== lastMonth) lastMonth = m;
    for (let d = 0; d < 7; d++) {
      const day = new Date(wkStart); day.setDate(wkStart.getDate() + d);
      if (day > today) { cells += `<i class="fut"></i>`; continue; }
      const n = perDay.get(dayKeyLocal(day.getTime())) || 0;
      const lvl = !n ? 0 : n <= t1 ? 1 : n <= t2 ? 2 : n <= t3 ? 3 : 4;
      cells += `<i class="l${lvl}" title="${day.getDate()} ${SX_MONTHS_GEN[day.getMonth()]}: ${n}"></i>`;
    }
  }
  html += sxCard("Kalendarz oglądania", entries.length
    ? `<div class="sx-hm-m">${monthsRow}</div><div class="sx-hm">${cells}</div><div class="sx-hm-leg"><span>mniej</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>więcej</span></div>`
    : sxEmpty("Brak dat obejrzenia — kalendarz wypełni się, gdy będziesz odhaczać odcinki i filmy."));

  // Ulubiony dzień tygodnia
  const wd = [0,0,0,0,0,0,0];
  for (const e of entries) wd[(new Date(e.ts).getDay()+6)%7]++;
  html += sxCard("Ulubiony dzień tygodnia", entries.length ? sxVBars(SX_WD.map((l,i)=>({label:l, value:wd[i]}))) : sxEmpty("Brak dat obejrzenia."));

  // Seria dni
  const keys = [...perDay.keys()].sort();
  let best = 0, bestEnd = null, run = 0, prev = null;
  for (const k of keys) {
    const d = new Date(k + "T00:00:00");
    run = (prev && Math.round((d - prev)/86400000) === 1) ? run + 1 : 1;
    if (run > best) { best = run; bestEnd = d; }
    prev = d;
  }
  let cur = 0;
  const probe = new Date(today);
  if (!perDay.has(dayKeyLocal(probe.getTime()))) probe.setDate(probe.getDate()-1);
  while (perDay.has(dayKeyLocal(probe.getTime()))) { cur++; probe.setDate(probe.getDate()-1); }
  const dni = (n)=>`${n} ${n===1 ? "dzień" : "dni"}`;
  html += sxCard("Seria dni", entries.length
    ? `<div class="sx-two"><div class="sx-mini"><b>${dni(cur)}</b><small>obecna seria oglądania</small></div><div class="sx-mini"><b>${dni(best)}</b><small>najdłuższa seria${bestEnd ? `<br>(${SX_MONTHS[bestEnd.getMonth()]} ${bestEnd.getFullYear()})` : ""}</small></div></div>`
    : sxEmpty("Brak dat obejrzenia."));

  el.innerHTML = html;
}

function sxRenderSeries(){
  const el = document.getElementById("sx-series");
  if (!el) return;
  const series = sxCountedSeries();
  let html = "";
  const time = series.map(it=>{
    let min = 0, n = 0;
    for (const s of it.seasons||[]) for (const e of s.episodes||[]) if (e.watched) { min += (e.duration||0); n++; }
    return {it, min, n};
  });
  const topTime = time.filter(x=>x.min>0).sort((a,b)=>b.min-a.min).slice(0,5);
  html += sxCard("Najwięcej czasu", topTime.length ? sxHBars(topTime.map(x=>({label:x.it.title, value:x.min, text:`${Math.round(x.min/60)} h`}))) : sxEmpty("Brak obejrzanych odcinków."));
  const dec = sxDecades(series);
  html += sxCard("Seriale wg dekady premiery", dec ? sxVBars(dec) : sxEmpty("Brak dat premiery."));
  const durs = [];
  for (const it of series) for (const s of it.seasons||[]) for (const e of s.episodes||[]) if (e.watched && e.duration > 0) durs.push(e.duration);
  const avg = durs.length ? Math.round(durs.reduce((a,b)=>a+b,0)/durs.length) : 0;
  const most = time.slice().sort((a,b)=>b.n-a.n)[0];
  html += sxCard("Odcinki", `<div class="sx-two"><div class="sx-mini"><b>${avg ? sxHmLong(avg) : "—"}</b><small>średnia długość odcinka</small></div><div class="sx-mini"><b>${most && most.n ? sxNum(most.n) : "—"}</b><small>najwięcej obejrzanych odcinków${most && most.n ? `<br>${escapeHtml(most.it.title)}` : ""}</small></div></div>`);
  const rat = sxRatings(series);
  html += sxCard("Rozkład ocen", rat ? sxVBars(rat) : sxEmpty("Brak ocenionych seriali."));
  el.innerHTML = html;
}

function sxRenderMovies(){
  const el = document.getElementById("sx-movies");
  if (!el) return;
  const movies = db.items.filter(i=>i.type===TYPE_MOVIE && i.status===STATUS_WATCHED);
  const withDur = movies.filter(m=>m.duration > 0).sort((a,b)=>b.duration-a.duration);
  let html = "";
  html += sxCard("Najwięcej czasu", withDur.length ? sxHBars(withDur.slice(0,5).map(m=>({label:m.title, value:m.duration, text:sxHm(m.duration)}))) : sxEmpty("Brak czasu trwania filmów."));
  const dec = sxDecades(movies);
  html += sxCard("Filmy wg dekady premiery", dec ? sxVBars(dec) : sxEmpty("Brak dat premiery."));
  if (withDur.length) {
    const lo = withDur[withDur.length-1], hi = withDur[0];
    html += sxCard("Rekordy długości", `<div class="sx-two"><div class="sx-mini"><b>${sxHmLong(hi.duration)}</b><small>najdłuższy<br>${escapeHtml(hi.title)}</small></div><div class="sx-mini"><b>${sxHmLong(lo.duration)}</b><small>najkrótszy<br>${escapeHtml(lo.title)}</small></div></div>`);
  } else html += sxCard("Rekordy długości", sxEmpty("Brak czasu trwania filmów."));
  const rat = sxRatings(movies);
  html += sxCard("Rozkład ocen", rat ? sxVBars(rat) : sxEmpty("Brak ocenionych filmów."));
  el.innerHTML = html;
}

function renderStatsExtra(s){
  try { sxRenderGeneral(s || computeStats()); } catch(e) { console.error(e); }
  try { sxRenderSeries(); } catch(e) { console.error(e); }
  try { sxRenderMovies(); } catch(e) { console.error(e); }
}
