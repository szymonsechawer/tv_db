// ============================================================
// utils.js — funkcje pomocnicze (formatowanie, daty, notatki, id)
// ============================================================

function splitOriginalTitle(title){
  const m = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(String(title||""));
  return m ? {title: m[1], original_title: m[2]} : {title: String(title||""), original_title: null};
}

function normalizeUpcoming(u){
  if (!Array.isArray(u)) return [];
  return u.filter(e=>e && typeof e==="object" && e.title).map(e=>{
    const split = e.original_title ? {title: String(e.title), original_title: String(e.original_title)} : splitOriginalTitle(e.title);
    return {
      item_id: e.item_id || null,
      title: split.title,
      original_title: split.original_title || null,
      season_number: Number(e.season_number) || 0,
      air_date: e.air_date || null,
      episode_count: Number(e.episode_count) || 0,
    };
  });
}

function normalizeSettings(s){
  const out = {...DEFAULT_SETTINGS};
  if (s && typeof s === "object") {
    if (typeof s.tmdb_key === "string") out.tmdb_key = s.tmdb_key;
    if (typeof s.tmdb_auto === "boolean") out.tmdb_auto = s.tmdb_auto;
  }
  return out;
}

// Waliduje/porzadkuje archiwum rekordow rocznych ({movies:{rok:{...}}, episodes:{rok:{...}}}),
// tak zeby nieprawidlowe/uszkodzone dane z pliku JSON nie wywalily aplikacji.
function normalizeYearStats(ys){
  const out = {movies: {}, episodes: {}};
  if (ys && typeof ys === "object") {
    for (const kind of ["movies","episodes"]) {
      const src = ys[kind];
      if (src && typeof src === "object") {
        for (const [year, s] of Object.entries(src)) {
          const y = parseInt(year, 10);
          if (!Number.isInteger(y) || !s || typeof s !== "object") continue;
          out[kind][y] = {
            year: y,
            count: Number(s.count) || 0,
            minutes: Number(s.minutes) || 0,
            perDay: Number(s.perDay) || 0,
          };
        }
      }
    }
  }
  return out;
}

function makeNote(title, content){
  return {id: uuidv4(), title: title || "Nowa notatka", content: content || "", updated: Date.now()};
}

function normalizeNotes(n){
  const out = [];
  if (Array.isArray(n)) {
    for (const raw of n) {
      if (!raw || typeof raw !== "object") continue;
      out.push({
        id: raw.id || uuidv4(),
        title: String(raw.title || "Bez nazwy"),
        content: typeof raw.content === "string" ? raw.content : "",
        updated: Number(raw.updated) || Date.now(),
      });
    }
    return out;
  }
  if (n && typeof n === "object") {
    if (typeof n[TYPE_MOVIE] === "string" && n[TYPE_MOVIE].trim()) out.push(makeNote("Planowane filmy", n[TYPE_MOVIE]));
    if (typeof n[TYPE_SERIES] === "string" && n[TYPE_SERIES].trim()) out.push(makeNote("Planowane seriale", n[TYPE_SERIES]));
  }
  return out;
}

function normalizePlanned(p){
  const out = [];
  if (Array.isArray(p)) {
    for (const raw of p) {
      if (!raw || typeof raw !== "object") continue;
      const title = String(raw.title || "").trim();
      if (!title) continue;
      const type = (raw.type === TYPE_SERIES) ? TYPE_SERIES : TYPE_MOVIE;
      out.push({id: raw.id || uuidv4(), title, type});
    }
  }
  return out;
}

function findPlanned(id){ return (db.planned||[]).find(p=>p.id===id) || null; }

function findNote(id){ return db.notes.find(n=>n.id===id) || null; }
function noteByTitle(title){ return db.notes.find(n=>n.title===title) || null; }
function appendToNote(title, lines){
  let note = noteByTitle(title);
  if (!note) { note = makeNote(title, lines); db.notes.push(note); return note; }
  note.content = note.content ? `${note.content}\n${lines}` : lines;
  note.updated = Date.now();
  return note;
}
// Ustawia flagę "obejrzane" na odcinku i zapisuje/czyści datę obejrzenia
// (używaną do liczenia średniej liczby oglądanych odcinków/dzień-tydzień-miesiąc).
function markEpisodeWatched(ep, watched){
  ep.watched = !!watched;
  if (ep.watched) {
    if (!ep.watchedAt) ep.watchedAt = Date.now();
  } else {
    delete ep.watchedAt;
  }
}

function polishPlural(n, singular, few, many){
  if (n === 1) return singular;
  const mod100 = n % 100;
  const mod10 = n % 10;
  if ((mod10===2||mod10===3||mod10===4) && !(mod100>=12 && mod100<=14)) return few;
  return many;
}

function formatDuration(totalMinutesRaw){
  let totalMinutes = Math.trunc(Number(totalMinutesRaw) || 0);
  if (totalMinutes <= 0) return "0 minut";
  let years = Math.floor(totalMinutes / MIN_PER_YEAR); totalMinutes -= years*MIN_PER_YEAR;
  let months = Math.floor(totalMinutes / MIN_PER_MONTH); totalMinutes -= months*MIN_PER_MONTH;
  let days = Math.floor(totalMinutes / MIN_PER_DAY); totalMinutes -= days*MIN_PER_DAY;
  let hours = Math.floor(totalMinutes / MIN_PER_HOUR); totalMinutes -= hours*MIN_PER_HOUR;
  let minutes = totalMinutes;

  const parts = [];
  if (years) parts.push(`${years} ${polishPlural(years,"rok","lata","lat")}`);
  if (months) parts.push(`${months} ${polishPlural(months,"miesiąc","miesiące","miesięcy")}`);
  if (days) parts.push(`${days} ${polishPlural(days,"dzień","dni","dni")}`);
  if (hours) parts.push(`${hours} ${polishPlural(hours,"godzina","godziny","godzin")}`);
  if (minutes || parts.length===0) parts.push(`${minutes} ${polishPlural(minutes,"minuta","minuty","minut")}`);
  return parts.join(", ");
}

function uuidv4(){
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c=>{
    const r = Math.random()*16|0, v = c==="x"?r:(r&0x3|0x8);
    return v.toString(16);
  });
}

function compareKeys(a, b){
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a[0] !== b[0]) return a[0]<b[0] ? -1 : 1;
    return compareKeys(a[1], b[1]);
  }
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  return (a<b) ? -1 : (a>b ? 1 : 0);
}

function formatDateDMY(dateStr){
  if (!dateStr) return "—";
  const parts = String(dateStr).split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return dateStr;
}

function daysUntil(dateStr){
  if (!dateStr) return null;
  const d = new Date(String(dateStr) + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0,0,0,0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function formatDaysLabel(days){
  if (days === null) return "data nieznana";
  if (days < 0) return "Już jest!";
  if (days === 0) return "dziś";
  if (days === 1) return "za 1 dzień";
  return `za ${days} dni`;
}

function upcomingKeyOf(entry){
  return `${entry.item_id || entry.title}:${entry.season_number || 0}`;
}

function upcomingSortKey(row, column){
  if (column === "title") return (row.title||"").toLowerCase();
  if (column === "date") return String(row.air_date||"").toLowerCase();
  if (column === "days") return row.days === null ? Infinity : row.days;
  return 0;
}

function addDoubleActivation(element, handler){
  element.addEventListener("dblclick", handler);
  let lastTap = 0;
  let touchMoved = false;
  element.addEventListener("touchstart", ()=>{ touchMoved = false; }, {passive:true});
  element.addEventListener("touchmove", ()=>{ touchMoved = true; }, {passive:true});
  element.addEventListener("touchend", (event)=>{
    if (touchMoved) { lastTap = 0; return; }
    const now = Date.now();
    if (now - lastTap < 400) {
      event.preventDefault();
      lastTap = 0;
      handler();
    } else {
      lastTap = now;
    }
  }, {passive:false});
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}

