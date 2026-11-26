// ============================================================
// stats-extra.js — dodatkowe kafelki pod istniejącymi statystykami
// Ogólne: ulubiony dzień, seria dni, pora dnia, miesiąc do miesiąca, rekordy
// Seriale/Filmy: dekady, odcinki/rekordy, oceny, sezony, porzucone, długość filmów
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


// Grupy wiekowe: polskie (7/12/16/18) i amerykańskie oznaczenia sprowadzone do wspólnych progów
const SX_AGE_MAP = {"0":"0+","AL":"0+","U":"0+","G":"0+","TV-Y":"0+","TV-G":"0+","7":"7+","TV-Y7":"7+","PG":"7+","TV-PG":"7+","12":"12+","PG-13":"12+","13":"12+","14":"16+","TV-14":"16+","15":"16+","16":"16+","R":"18+","17":"18+","18":"18+","NC-17":"18+","TV-MA":"18+"};
const SX_AGE_ORDER = ["0+","7+","12+","16+","18+"];
function sxAgeGroups(items){
  const c = {};
  for (const it of items) {
    const raw = String(it.age_certification||"").trim().toUpperCase().replace(/\s+/g, "").replace(/\+$/, "");
    const g = SX_AGE_MAP[raw];
    if (g) c[g] = (c[g]||0) + 1;
  }
  const present = SX_AGE_ORDER.filter(k=>c[k]);
  if (!present.length) return null;
  const lo = SX_AGE_ORDER.indexOf(present[0]), hi = SX_AGE_ORDER.indexOf(present[present.length-1]);
  return SX_AGE_ORDER.slice(lo, hi+1).map(k=>({label: k === "0+" ? "bez ogr." : k, value: c[k]||0}));
}

function sxCountedSeries(){
  const counted = [STATUS_WATCHED, STATUS_WATCHING, STATUS_PAUSED];
  return db.items.filter(i=>i.type===TYPE_SERIES && counted.includes(i.status));
}


// Ikony w stylu Ustawień (jednokolorowe, obrys)
const SX_IC = {
  morning:'<path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0"/><path d="M12 9V3M9.5 5.5 12 3l2.5 2.5"/>',
  day:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  evening:'<path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0"/><path d="M12 3v6M9.5 6.5 12 9l2.5-2.5"/>',
  night:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  marathon:'<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M10 9l4 2-4 2z" fill="currentColor"/>',
  fast:'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  long:'<path d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  movies:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
};
function sxIc(k){ return `<span class="sx-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${SX_IC[k]||""}</svg></span>`; }
const SX_EP_MIN = 45, SX_MOV_MIN = 110;   // gdy brak czasu trwania
function sxFmtDate(ts){ const d = new Date(ts); return `${d.getDate()}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()}`; }
function sxSpan(days){
  if (days < 1) return "1 dzień";
  if (days < 60) return `${days} ${days===1 ? "dzień" : "dni"}`;
  if (days < 365) { const m = Math.round(days/30); return `${m} ${polishPlural(m, "miesiąc", "miesiące", "miesięcy")}`; }
  const y = Math.round(days/365*10)/10;
  return `${String(y).replace(".", ",")} ${y < 2 ? "roku" : (y < 5 && Number.isInteger(y) ? "lata" : "lat")}`;
}

// Odcinki z tytułem serialu i filmy - do pory dnia, porównania miesięcy i rekordów
function sxEntriesDetailed(){
  const out = [];
  const counted = [STATUS_WATCHED, STATUS_WATCHING, STATUS_PAUSED];
  for (const it of db.items) {
    if (it.type === TYPE_SERIES && counted.includes(it.status)) {
      for (const se of it.seasons||[]) for (const e of se.episodes||[]) {
        if (e.watched && e.watchedAt) out.push({ts: e.watchedAt, min: e.duration > 0 ? e.duration : SX_EP_MIN, kind: "ep", item: it});
      }
    }
  }
  for (const m of collectWatchedEntries("movies")) out.push({ts: m.ts, min: m.duration > 0 ? m.duration : SX_MOV_MIN, kind: "mov"});
  return out;
}

function sxDaypartCard(entries){
  if (!entries.length) return sxCard("Kiedy oglądasz", sxEmpty("Brak dat obejrzenia."));
  const parts = [["morning","Rano",6,12],["day","Popołudnie",12,18],["evening","Wieczór",18,24],["night","Noc",0,6]];
  const cnt = [0,0,0,0], hours = new Array(24).fill(0);
  for (const e of entries) {
    const h = new Date(e.ts).getHours(); hours[h]++;
    const i = parts.findIndex(p=>h >= p[2] && h < p[3]); if (i >= 0) cnt[i]++;
  }
  const total = cnt.reduce((a,b)=>a+b,0) || 1;
  const top = Math.max(...cnt);
  const pct = cnt.map(c=>Math.round(c/total*100));
  const rows = parts.map((p,i)=>`<div class="sx-hb sx-dp"><span class="sx-hb-t">${sxIc(p[0])}${p[1]}</span><span class="sx-bar"><i class="${cnt[i]===top ? "hi" : ""}" style="width:${Math.max(2, Math.round(cnt[i]/top*100))}%"></i></span><span class="sx-hb-v">${pct[i]}%</span></div>`).join("");
  const peak = hours.indexOf(Math.max(...hours));
  const pi = cnt.indexOf(top);
  const when = ["rano","po południu","wieczorem","w nocy"][pi];
  return sxCard("Kiedy oglądasz", rows + `<div class="sx-foot">Najczęściej <b>${when}</b>, ok. <b>${peak}:00</b></div>`);
}

function sxMonthCard(entries){
  const now = new Date();
  const curStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const prevStart = new Date(now.getFullYear(), now.getMonth()-1, 1).getTime();
  // ten sam okres poprzedniego miesiąca (1..dzisiejszy dzień), żeby porównanie było uczciwe
  const prevDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const prevEnd = new Date(now.getFullYear(), now.getMonth()-1, Math.min(now.getDate(), prevDays), 23, 59, 59, 999).getTime();
  const sum = (from, to)=>{
    const r = {eps:0, min:0, mov:0, started:new Set()};
    for (const e of entries) {
      if (e.ts < from || e.ts > to) continue;
      r.min += e.min;
      if (e.kind === "mov") r.mov++; else r.eps++;
    }
    return r;
  };
  const a = sum(curStart, now.getTime()), b = sum(prevStart, prevEnd);
  // nowe seriale = pierwszy obejrzany odcinek przypada na dany okres
  const first = new Map();
  for (const e of entries) if (e.kind === "ep") { const f = first.get(e.item.id); if (!f || e.ts < f) first.set(e.item.id, e.ts); }
  let ns = 0, nsPrev = 0;
  for (const ts of first.values()) { if (ts >= curStart) ns++; else if (ts >= prevStart && ts <= prevEnd) nsPrev++; }
  const diff = (x, y, fmt)=>{
    const d = x - y;
    if (Math.round(d) === 0) return `<span class="sx-d eq">= tyle samo</span>`;
    return `<span class="sx-d ${d > 0 ? "up" : "down"}">${d > 0 ? "▲ +" : "▼ −"}${fmt(Math.abs(d))}</span>`;
  };
  const h = (m)=>`${Math.round(m/60)} h`;
  const mName = SX_MONTHS[now.getMonth()];
  const tile = (label, val, d)=>`<div class="sx-mini sx-mm"><small>${label}</small><b>${val}</b>${d}</div>`;
  return sxCard(`${mName.charAt(0).toUpperCase() + mName.slice(1)} a ${SX_MONTHS[(now.getMonth()+11)%12]}`,
    `<div class="sx-two">${tile("Odcinki", sxNum(a.eps), diff(a.eps, b.eps, sxNum))}${tile("Czas", h(a.min), diff(a.min/60, b.min/60, v=>`${Math.round(v)} h`))}${tile("Filmy", sxNum(a.mov), diff(a.mov, b.mov, sxNum))}${tile("Nowe seriale", sxNum(ns), diff(ns, nsPrev, sxNum))}</div>` +
    `<div class="sx-foot">Porównanie z 1–${Math.min(now.getDate(), prevDays)} ${SX_MONTHS_GEN[(now.getMonth()+11)%12]}</div>`);
}

function sxRecordsCard(entries){
  const rows = [];
  // Maraton jednego dnia (odcinki)
  const day = new Map();
  for (const e of entries) if (e.kind === "ep") {
    const k = dayKeyLocal(e.ts); let d = day.get(k); if (!d) { d = {n:0, ts:e.ts, by:new Map()}; day.set(k, d); }
    d.n++; d.by.set(e.item.title, (d.by.get(e.item.title)||0) + 1);
  }
  let bestDay = null; for (const d of day.values()) if (!bestDay || d.n > bestDay.n) bestDay = d;
  if (bestDay) {
    const main = [...bestDay.by.entries()].sort((x,y)=>y[1]-x[1])[0][0];
    rows.push(["marathon", "Maraton jednego dnia", `${sxNum(bestDay.n)} odc.`, `${main} · ${sxFmtDate(bestDay.ts)}`]);
  }
  // Najszybciej skończony i najdłużej oglądany serial (od pierwszego do ostatniego odcinka)
  const spans = [];
  for (const it of db.items) {
    if (it.type !== TYPE_SERIES || ![STATUS_WATCHED, STATUS_WATCHING, STATUS_PAUSED].includes(it.status)) continue;
    let lo = 0, hi = 0, n = 0;
    for (const se of it.seasons||[]) for (const e of se.episodes||[]) if (e.watched && e.watchedAt) { n++; if (!lo || e.watchedAt < lo) lo = e.watchedAt; if (e.watchedAt > hi) hi = e.watchedAt; }
    if (n >= 5) spans.push({it, n, days: Math.max(1, Math.ceil((hi - lo)/864e5)), done: it.status === STATUS_WATCHED});
  }
  const fast = spans.filter(x=>x.done).sort((a,b)=>a.days-b.days || b.n-a.n)[0];
  if (fast) rows.push(["fast", "Najszybciej skończony", sxSpan(fast.days), `${fast.it.title} · ${fast.n} odc.`]);
  const long = spans.slice().sort((a,b)=>b.days-a.days)[0];
  if (long) rows.push(["long", "Najdłużej oglądany", sxSpan(long.days), long.it.title]);
  // Najwięcej filmów jednego dnia
  const mday = new Map();
  for (const e of entries) if (e.kind === "mov") { const k = dayKeyLocal(e.ts); const d = mday.get(k) || {n:0, ts:e.ts}; d.n++; mday.set(k, d); }
  let bm = null; for (const d of mday.values()) if (!bm || d.n > bm.n) bm = d;
  if (bm && bm.n > 1) rows.push(["movies", "Filmy jednego dnia", `${bm.n} ${polishPlural(bm.n, "film", "filmy", "filmów")}`, sxFmtDate(bm.ts)]);
  if (!rows.length) return sxCard("Twoje rekordy", sxEmpty("Brak dat obejrzenia."));
  return sxCard("Twoje rekordy", rows.map(([ic, label, val, sub])=>`<div class="sx-rec">${sxIc(ic)}<div class="sx-rec-l">${escapeHtml(label)}<small>${escapeHtml(sub)}</small></div><b>${escapeHtml(val)}</b></div>`).join(""));
}

function sxRenderGeneral(s){
  const el = document.getElementById("sx-general");
  if (!el) return;
  let html = "";

  // Wpisy z datą obejrzenia (filmy + odcinki)
  const entries = [...collectWatchedEntries("movies"), ...collectWatchedEntries("episodes")];
  const perDay = new Map();
  for (const e of entries) { const k = dayKeyLocal(e.ts); perDay.set(k, (perDay.get(k)||0) + 1); }

  const today = new Date(); today.setHours(0,0,0,0);
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

  const detailed = sxEntriesDetailed();
  html += sxDaypartCard(detailed);
  html += sxMonthCard(detailed);
  html += sxRecordsCard(detailed);

  el.innerHTML = html;
}

function sxAgo(ts){
  const d = Math.floor((Date.now() - ts)/864e5);
  if (d < 1) return "dziś";
  if (d < 2) return "wczoraj";
  if (d < 14) return `${d} dni temu`;
  if (d < 60) return `${Math.round(d/7)} tyg. temu`;
  if (d < 365) return `${Math.round(d/30)} mies. temu`;
  const y = Math.round(d/365);
  return `${y} ${polishPlural(y, "rok", "lata", "lat")} temu`;
}
function sxLastWatched(it){
  let last = 0;
  for (const se of it.seasons||[]) for (const e of se.episodes||[]) if (e.watched && (e.watchedAt||0) > last) last = e.watchedAt;
  return last;
}
const SX_STALE_DAYS = 60;

// Seriale: dokończone a porzucone (w Oglądanych bez ruchu ponad 2 miesiące)
function sxFinishedVsStaleCard(){
  const done = db.items.filter(i=>i.type===TYPE_SERIES && i.status===STATUS_WATCHED).length;
  const stale = db.items.filter(i=>i.type===TYPE_SERIES && i.status===STATUS_WATCHING)
    .map(it=>({it, last: sxLastWatched(it)}))
    .filter(x=>x.last && (Date.now() - x.last) > SX_STALE_DAYS*864e5)
    .sort((a,b)=>a.last-b.last);
  let html = `<div class="sx-two"><div class="sx-mini"><b>${sxNum(done)}</b><small>dokończone seriale</small></div><div class="sx-mini"><b>${sxNum(stale.length)}</b><small>w Oglądanych bez ruchu ponad 2 mies.</small></div></div>`;
  if (stale.length) html += `<div class="sx-recs">` + stale.slice(0, 5).map(x=>`<div class="sx-rec">${sxIc("clock")}<div class="sx-rec-l">${escapeHtml(x.it.title)}<small>ostatnio ${sxAgo(x.last)}</small></div></div>`).join("") + `</div>`;
  if (stale.length > 5) html += `<div class="sx-foot">i ${stale.length - 5} ${polishPlural(stale.length - 5, "inny", "inne", "innych")}</div>`;
  return sxCard("Dokończone a porzucone", html);
}

// Seriale: średni czas od pierwszego do ostatniego odcinka (dokończone seriale z datami wszystkich odcinków)
function sxAvgFinishCard(){
  const rows = [];
  for (const it of db.items) {
    if (it.type !== TYPE_SERIES || it.status !== STATUS_WATCHED) continue;
    let lo = 0, hi = 0, n = 0, undated = 0;
    for (const se of it.seasons||[]) for (const e of se.episodes||[]) {
      if (!e.watched) continue;
      if (!e.watchedAt) { undated++; continue; }
      n++; if (!lo || e.watchedAt < lo) lo = e.watchedAt; if (e.watchedAt > hi) hi = e.watchedAt;
    }
    if (n >= 3 && !undated) rows.push({it, n, days: Math.max(1, Math.ceil((hi - lo)/864e5))});
  }
  if (!rows.length) return sxCard("Średni czas na serial", sxEmpty("Brak dokończonych seriali z datami obejrzenia odcinków."));
  const avg = Math.round(rows.reduce((a,r)=>a + r.days, 0) / rows.length);
  const fast = rows.slice().sort((a,b)=>a.days-b.days || b.n-a.n)[0];
  return sxCard("Średni czas na serial", `<div class="sx-two"><div class="sx-mini"><b>${sxSpan(avg)}</b><small>od pierwszego do ostatniego odcinka</small></div><div class="sx-mini"><b>${sxSpan(fast.days)}</b><small>najszybciej<br>${escapeHtml(fast.it.title)}</small></div></div><div class="sx-foot">Na podstawie ${sxNum(rows.length)} ${polishPlural(rows.length, "serialu", "seriali", "seriali")} z datami wszystkich odcinków</div>`);
}

// Seriale: rozkład liczby sezonów
function sxSeasonCountCard(series){
  const c = [0,0,0,0,0];
  for (const it of series) {
    const n = (it.seasons||[]).filter(se=>(se.number||0) > 0).length;
    if (n > 0) c[Math.min(n, 5) - 1]++;
  }
  if (!c.some(Boolean)) return sxCard("Liczba sezonów", sxEmpty("Brak danych o sezonach."));
  const labels = ["1","2","3","4","5+"];
  const top = c.indexOf(Math.max(...c));
  const desc = ["jednosezonowe","dwusezonowe","trzysezonowe","czterosezonowe","z 5 i więcej sezonami"][top];
  return sxCard("Liczba sezonów", sxVBars(labels.map((l,i)=>({label:l, value:c[i]}))) + `<div class="sx-foot">Najczęściej oglądasz seriale <b>${desc}</b></div>`);
}

// Filmy: rozkład długości
function sxMovieLengthCard(movies){
  const b = [0,0,0,0];
  for (const m of movies) { const d = m.duration||0; if (d <= 0) continue; b[d < 90 ? 0 : d < 120 ? 1 : d < 150 ? 2 : 3]++; }
  if (!b.some(Boolean)) return sxCard("Długość filmów", sxEmpty("Brak czasu trwania filmów."));
  const labels = ["<90","90–120","120–150","150+"];
  const top = b.indexOf(Math.max(...b));
  return sxCard("Długość filmów", sxVBars(labels.map((l,i)=>({label:l, value:b[i]}))) + `<div class="sx-foot">Najczęściej <b>${labels[top]} min</b></div>`);
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
  const dec = sxDecades(series);
  html += sxCard("Seriale wg dekady premiery", dec ? sxVBars(dec) : sxEmpty("Brak dat premiery."));
  const durs = [];
  for (const it of series) for (const s of it.seasons||[]) for (const e of s.episodes||[]) if (e.watched && e.duration > 0) durs.push(e.duration);
  const avg = durs.length ? Math.round(durs.reduce((a,b)=>a+b,0)/durs.length) : 0;
  const most = time.slice().sort((a,b)=>b.n-a.n)[0];
  const rat = sxRatings(series);
  html += sxCard("Rozkład ocen", rat ? sxVBars(rat) : sxEmpty("Brak ocenionych seriali."));
  const ageS = sxAgeGroups(series);
  html += sxCard("Grupy wiekowe", ageS ? sxVBars(ageS) : sxEmpty("Brak danych o wieku — użyj „Sprawdź ponownie i zaktualizuj” w Ustawieniach."));
  html += sxSeasonCountCard(series);
  html += sxCard("Odcinki", `<div class="sx-two"><div class="sx-mini"><b>${avg ? sxHmLong(avg) : "—"}</b><small>średnia długość odcinka</small></div><div class="sx-mini"><b>${most && most.n ? sxNum(most.n) : "—"}</b><small>najwięcej obejrzanych odcinków${most && most.n ? `<br>${escapeHtml(most.it.title)}` : ""}</small></div></div>`);
  html += sxFinishedVsStaleCard();
  html += sxAvgFinishCard();
  el.innerHTML = html;
}

function sxRenderMovies(){
  const el = document.getElementById("sx-movies");
  if (!el) return;
  const movies = db.items.filter(i=>i.type===TYPE_MOVIE && i.status===STATUS_WATCHED);
  const withDur = movies.filter(m=>m.duration > 0).sort((a,b)=>b.duration-a.duration);
  let html = "";
  if (withDur.length) {
    const lo = withDur[withDur.length-1], hi = withDur[0];
    html += sxCard("Rekordy długości", `<div class="sx-two"><div class="sx-mini"><b>${sxHmLong(hi.duration)}</b><small>najdłuższy<br>${escapeHtml(hi.title)}</small></div><div class="sx-mini"><b>${sxHmLong(lo.duration)}</b><small>najkrótszy<br>${escapeHtml(lo.title)}</small></div></div>`);
  } else html += sxCard("Rekordy długości", sxEmpty("Brak czasu trwania filmów."));
  const dec = sxDecades(movies);
  html += sxCard("Filmy wg dekady premiery", dec ? sxVBars(dec) : sxEmpty("Brak dat premiery."));
  const rat = sxRatings(movies);
  html += sxCard("Rozkład ocen", rat ? sxVBars(rat) : sxEmpty("Brak ocenionych filmów."));
  const ageM = sxAgeGroups(movies);
  html += sxCard("Grupy wiekowe", ageM ? sxVBars(ageM) : sxEmpty("Brak danych o wieku — użyj „Sprawdź ponownie i zaktualizuj” w Ustawieniach."));
  html += sxMovieLengthCard(movies);
  el.innerHTML = html;
}

function renderStatsExtra(s){
  try { sxRenderGeneral(s || computeStats()); } catch(e) { console.error(e); }
  try { sxRenderSeries(); } catch(e) { console.error(e); }
  try { sxRenderMovies(); } catch(e) { console.error(e); }
}
