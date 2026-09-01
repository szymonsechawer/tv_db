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
    if (s.ui_version === "v1" || s.ui_version === "v2" || s.ui_version === "v3") out.ui_version = s.ui_version;
  }
  return out;
}

function getUiVersion(){
  return (db.settings && db.settings.ui_version) || "v2";
}

// Zwraca true, jeśli w Ustawieniach wybrano wygląd v1: bez okładek na
// liście (za to z okładką w oknie informacji) i z klasycznym paskiem
// postępu (bez przycisku do odhaczania odcinków).
function isUiV1(){
  return getUiVersion() === "v1";
}

// Czy okładka ma być pokazywana na liście, po lewej stronie tytułu -
// dotyczy tylko wersji 2 (v1 i v3 pokazują okładkę w oknie informacji).
function showPosterInList(){
  return getUiVersion() === "v2";
}

// Czy lista ma używać klasycznego, nieinteraktywnego paska postępu zamiast
// przycisku do odhaczania kolejnego odcinka - dotyczy tylko wersji 1
// (wersje 2 i 3 mają przycisk odhaczania na liście).
function useProgressBarOnly(){
  return getUiVersion() === "v1";
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

// Sprowadza dowolną wartość oceny do liczby z zakresu 0-10, z dokładnością do
// jednego miejsca po przecinku (np. 7.8, 9.5). Nieprawidłowe/puste wartości
// dają 0 (brak oceny).
function normalizeRating(value){
  const n = parseFloat(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  const clamped = Math.min(n, 10);
  return Math.round(clamped * 10) / 10;
}

// Formatuje ocenę do wyświetlenia: zawsze z jedną cyfrą po przecinku
// (np. 7.0 zamiast 7, 7.2 pozostaje 7.2). Zwraca pusty string dla braku
// oceny (0).
function formatRating(value){
  const r = normalizeRating(value);
  if (!r) return "";
  return r.toFixed(1);
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

// Formatuje budżet (liczba całkowita w dolarach) do czytelnej postaci,
// np. 200000000 -> "200 000 000 $".
function formatMoney(amount){
  const n = Math.trunc(Number(amount) || 0);
  if (n <= 0) return "";
  return n.toLocaleString("pl-PL").replace(/\u00a0/g, " ") + " $";
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

// Odcinek uznajemy za "jeszcze niewyemitowany", jeśli ma znaną datę premiery
// i data ta jeszcze nie nadeszła (dzień premiery liczy się już jako dostępny).
// Używane, by zablokować odznaczanie takich odcinków jako obejrzane oraz
// pokazać w oknie informacji, za ile dni odcinek się pojawi.
function isEpisodeUnaired(ep){
  if (!ep || !ep.air_date) return false;
  const d = daysUntil(ep.air_date);
  return d !== null && d > 0;
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

// Mapa skrótów kategorii wiekowej (amerykańskie MPAA dla filmów oraz
// TV Parental Guidelines dla seriali) na ich pełne polskie znaczenie.
// Klucze są znormalizowane (wielkie litery, bez spacji).
const AGE_CERT_MEANINGS = {
  // MPAA (filmy, USA)
  "G": "bez ograniczeń wiekowych",
  "PG": "zalecana opieka rodziców",
  "PG-13": "niewskazane dla dzieci poniżej 13 lat",
  "R": "tylko dla widzów od 17 lat (z opiekunem)",
  "NC-17": "tylko dla dorosłych, od 18 lat",
  "NR": "brak klasyfikacji wiekowej",
  "UR": "wersja nieocenzurowana, brak klasyfikacji wiekowej",
  // TV Parental Guidelines (seriale, USA)
  "TV-Y": "dla wszystkich dzieci",
  "TV-Y7": "dla dzieci od 7 lat",
  "TV-Y7-FV": "dla dzieci od 7 lat (zawiera fantastyczną przemoc)",
  "TV-G": "dla całej rodziny",
  "TV-PG": "zalecana opieka rodziców",
  "TV-14": "dla widzów od 14 lat",
  "TV-MA": "tylko dla dorosłych",
};

// Zamienia surowy kod kategorii wiekowej (np. z TMDb) na czytelny tekst
// po polsku. Gdy nie ma lepszego odpowiednika i jest to skrót, pokazuje
// skrót wraz z jego znaczeniem w nawiasie; dla liczbowych kategorii (np.
// polskie "12", "16", "18") zwraca "od X lat".
function formatAgeCertification(raw){
  const cert = String(raw||"").trim();
  if (!cert) return "";
  const normalized = cert.toUpperCase().replace(/\s+/g, "");
  if (AGE_CERT_MEANINGS[normalized]) {
    return `${cert} (${AGE_CERT_MEANINGS[normalized]})`;
  }
  const numMatch = /^(\d{1,2})\+?$/.exec(cert);
  if (numMatch) {
    const age = parseInt(numMatch[1], 10);
    return age > 0 ? `od ${age} lat` : "bez ograniczeń wiekowych";
  }
  if (/^0\+?$/.test(cert) || /bez\s*ogranicze/i.test(cert)) {
    return "bez ograniczeń wiekowych";
  }
  // brak dopasowania - zwróć tekst tak, jak przyszedł (nie ma lepszej możliwości)
  return cert;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}

