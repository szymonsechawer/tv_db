// ============================================================
// config.js — stałe aplikacji oraz globalny stan (współdzielony)
// ============================================================

const APP_VERSION = "1.8";
const DEFAULT_DB_FILENAME = "tv_db.json";
const STORAGE_KEY = "tv_db_data";
const STORAGE_NAME_KEY = "tv_db_filename";

const STATUS_WATCHING = "watching";
const STATUS_WATCHED  = "watched";
const STATUS_PAUSED   = "paused";
const STATUS_PLANNED  = "planned";
const STATUS_UPCOMING = "upcoming";

const STATUS_LABELS = {
  [STATUS_WATCHING]: "Oglądane",
  [STATUS_WATCHED]:  "Zakończone",
  [STATUS_PAUSED]:   "Wstrzymane",
  [STATUS_PLANNED]:  "Planowane",
  [STATUS_UPCOMING]: "Nadchodzące",
};
const LABEL_TO_STATUS = Object.fromEntries(Object.entries(STATUS_LABELS).map(([k,v])=>[v,k]));

const TYPE_MOVIE = "movie";
const TYPE_SERIES = "series";
const TYPE_LABELS = {[TYPE_MOVIE]:"Filmy", [TYPE_SERIES]:"Seriale"};

const TYPE_STATUS_ORDER = {
  [TYPE_MOVIE]: [STATUS_WATCHED],
  [TYPE_SERIES]: [STATUS_WATCHING, STATUS_WATCHED, STATUS_UPCOMING],
};

const MIN_PER_HOUR = 60;
const MIN_PER_DAY = 60*24;
const MIN_PER_MONTH = MIN_PER_DAY*30;
const MIN_PER_YEAR = MIN_PER_DAY*365;

const COL_LABELS = {lp:"Lp", title:"Tytuł", date:"Data", time:"Czas", progress:"Postęp", rating:"Ocena", days:"Do premiery", del:""};

const DEFAULT_SETTINGS = {tmdb_key: "", tmdb_auto: true};
let db = {version: APP_VERSION, items: [], settings: {...DEFAULT_SETTINGS}, notes: [], upcoming: [], upcoming_ignored: [], year_stats: {movies: {}, episodes: {}}};

let currentDbName = DEFAULT_DB_FILENAME;
let dirty = false;

let activeMain = TYPE_MOVIE;
let activeNoteId = null;
let activeStatus = {
  [TYPE_MOVIE]: TYPE_STATUS_ORDER[TYPE_MOVIE][0],
  [TYPE_SERIES]: TYPE_STATUS_ORDER[TYPE_SERIES][0],
};
let selectedId = {};
let sortState = {};
let searchQuery = "";
let searchMode = "phrase";

for (const t of [TYPE_MOVIE, TYPE_SERIES]) {
  for (const s of TYPE_STATUS_ORDER[t]) {
    const defaultReverse = (s === STATUS_WATCHED);
    sortState[`${t}:${s}`] = ["lp", defaultReverse];
    selectedId[`${t}:${s}`] = null;
  }
}

let currentFileHandle = null;
const supportsFSAccess = typeof window !== "undefined"
  && typeof window.showOpenFilePicker === "function"
  && typeof window.showSaveFilePicker === "function";

const TMDB_KEY_STORAGE = "tv_db_tmdb_key";
const BUTTON_STYLE_STORAGE = "tv_db_button_style";
const tmdbSeasonCache = new Map();

const tmdbSeriesOrigLangCache = new Map();
