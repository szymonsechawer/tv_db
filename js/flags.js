// ============================================================
// flags.js — „Flagi świata”: wszystkie kraje szare, kolorowe po
// obejrzeniu filmu lub serialu z danego kraju pochodzenia
// ============================================================

// Państwa członkowskie ONZ + Watykan, Palestyna, Kosowo, Tajwan, Hongkong
const FLAG_CODES = ("AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW VA PS XK TW HK").split(" ");
// Nazwy używane przez TMDb, które różnią się od standardowych polskich nazw
const FLAG_ALIASES = {
  "rpa":"ZA", "republika poludniowej afryki":"ZA", "hongkong":"HK", "hong kong":"HK", "wielka brytania":"GB", "zjednoczone krolestwo":"GB",
  "stany zjednoczone":"US", "usa":"US", "korea poludniowa":"KR", "korea polnocna":"KP", "rosja":"RU", "czechy":"CZ", "czechoslowacja":"CZ",
  "zsrr":"RU", "zwiazek radziecki":"RU", "jugoslawia":"RS", "serbia i czarnogora":"RS", "niemcy zachodnie":"DE", "rfn":"DE", "nrd":"DE",
  "macedonia":"MK", "macedonia polnocna":"MK", "birma":"MM", "mjanma":"MM", "watykan":"VA", "palestyna":"PS", "tajwan":"TW", "kosowo":"XK",
  "wybrzeze kosci sloniowej":"CI", "eswatini":"SZ", "suazi":"SZ", "republika czeska":"CZ", "iran":"IR", "syria":"SY", "laos":"LA", "wietnam":"VN",
  "boliwia":"BO", "wenezuela":"VE", "tanzania":"TZ", "mołdawia":"MD", "moldawia":"MD", "kongo":"CG", "demokratyczna republika konga":"CD",
  "zea":"AE", "zjednoczone emiraty arabskie":"AE", "timor wschodni":"TL", "brunei":"BN", "turcja":"TR", "turkiye":"TR",
};
const FLAG_REGION = { "EU":["AL","AD","AT","BY","BE","BA","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IS","IE","IT","LV","LI","LT","LU","MT","MD","MC","ME","NL","MK","NO","PL","PT","RO","RU","SM","RS","SK","SI","ES","SE","CH","UA","GB","VA","XK"],
  "NA":["AG","BS","BB","BZ","CA","CR","CU","DM","DO","SV","GD","GT","HT","HN","JM","MX","NI","PA","KN","LC","VC","TT","US"],
  "SA":["AR","BO","BR","CL","CO","EC","GY","PY","PE","SR","UY","VE"],
  "AS":["AF","AM","AZ","BH","BD","BT","BN","KH","CN","GE","IN","ID","IR","IQ","IL","JP","JO","KZ","KW","KG","LA","LB","MY","MV","MN","MM","NP","KP","KR","OM","PK","PS","PH","QA","SA","SG","LK","SY","TJ","TH","TL","TR","TM","AE","UZ","VN","YE","TW","HK"],
  "AF":["DZ","AO","BJ","BW","BF","BI","CV","CM","CF","TD","KM","CG","CD","CI","DJ","EG","GQ","ER","SZ","ET","GA","GM","GH","GN","GW","KE","LS","LR","LY","MG","MW","ML","MR","MU","MA","MZ","NA","NE","NG","RW","ST","SN","SC","SL","SO","ZA","SS","SD","TZ","TG","TN","UG","ZM","ZW"],
  "OC":["AU","FJ","KI","MH","FM","NR","NZ","PW","PG","WS","SB","TO","TV","VU"] };
const FLAG_REGION_NAMES = {EU:"Europa", AS:"Azja", AF:"Afryka", NA:"Ameryka Północna", SA:"Ameryka Południowa", OC:"Australia i Oceania"};
let activeFlagRegion = "all";

function flagNorm(t){ return String(t||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/\s+/g, " ").trim(); }
function flagEmoji(code){ if (code === "XK") return "🇽🇰"; return String.fromCodePoint(...[...code].map(c=>0x1F1E6 + c.charCodeAt(0) - 65)); }
let _flagNames = null;
function flagNames(){
  if (_flagNames) return _flagNames;
  let dn = null;
  try { dn = new Intl.DisplayNames(["pl"], {type:"region"}); } catch(e) {}
  const names = {}, lookup = {};
  for (const c of FLAG_CODES) {
    let n = "";
    try { n = dn ? dn.of(c) : ""; } catch(e) {}
    if (c === "XK") n = "Kosowo";
    if (c === "HK") n = "Hongkong";
    if (c === "GB") n = "Wielka Brytania";
    if (c === "US") n = "Stany Zjednoczone";
    if (c === "CI") n = "Wybrzeże Kości Słoniowej";
    names[c] = n || c;
    lookup[flagNorm(names[c])] = c;
    lookup[c.toLowerCase()] = c;
  }
  for (const [k,v] of Object.entries(FLAG_ALIASES)) lookup[flagNorm(k)] = v;
  _flagNames = {names, lookup};
  return _flagNames;
}
function countryToCode(name){ const {lookup} = flagNames(); return lookup[flagNorm(name)] || null; }

// Kraj → lista obejrzanych tytułów (filmy zakończone, seriale oglądane/zakończone/wstrzymane)
function computeFlagData(){
  const by = {};
  const items = [...relevantWatchedItems(TYPE_MOVIE), ...relevantWatchedItems(TYPE_SERIES)];
  for (const it of items) {
    const seen = new Set();
    for (const raw of it.origin_country || []) {
      const code = countryToCode(raw);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      (by[code] = by[code] || {movies:0, series:0, items:[], raw:new Set()});
      by[code].items.push(it); by[code].raw.add(raw);
      if (it.type === TYPE_MOVIE) by[code].movies++; else by[code].series++;
    }
  }
  return by;
}

function renderFlagsTab(){
  const box = document.getElementById("flags-content");
  if (!box) return;
  const {names} = flagNames();
  const data = computeFlagData();
  const codes = activeFlagRegion === "all" ? FLAG_CODES : FLAG_REGION[activeFlagRegion] || [];
  const have = codes.filter(c=>data[c]).length;
  const totalHave = FLAG_CODES.filter(c=>data[c]).length;
  const sorted = codes.slice().sort((a,b)=> (data[b]?1:0)-(data[a]?1:0) || names[a].localeCompare(names[b], "pl"));
  const regions = [["all","Wszystkie"], ...Object.entries(FLAG_REGION_NAMES)];
  box.innerHTML = `
    <div class="fl-sum"><div class="fl-big">${totalHave}<span> / ${FLAG_CODES.length}</span></div><div class="fl-sub">odkrytych krajów</div><div class="fl-bar"><i style="width:${(totalHave/FLAG_CODES.length*100).toFixed(1)}%"></i></div></div>
    <div class="fl-regs">${regions.map(([k,l])=>{ const cs = k==="all" ? FLAG_CODES : FLAG_REGION[k]; const n = cs.filter(c=>data[c]).length; return `<button type="button" class="fl-reg${k===activeFlagRegion?" on":""}" data-r="${k}">${escapeHtml(l)} <small>${n}/${cs.length}</small></button>`; }).join("")}</div>
    <div class="fl-grid">${sorted.map(c=>{ const d = data[c]; return `<button type="button" class="fl${d?" on":""}" data-c="${c}" title="${escapeHtml(names[c])}"><span class="fl-e">${flagEmoji(c)}</span><span class="fl-n">${escapeHtml(names[c])}</span>${d ? `<span class="fl-c">${d.items.length}</span>` : ""}</button>`; }).join("")}</div>
    <div class="fl-note">Flaga zapala się, gdy obejrzysz film lub serial pochodzący z tego kraju. Dotknij dwukrotnie flagi, aby zobaczyć tytuły.</div>`;
  box.querySelectorAll(".fl-reg").forEach(b=>b.addEventListener("click", ()=>{ activeFlagRegion = b.dataset.r; renderFlagsTab(); }));
  box.querySelectorAll(".fl").forEach(b=>addDoubleActivation(b, ()=>openFlagDialog(b.dataset.c, data[b.dataset.c])));
}

function openFlagDialog(code, d){
  const {names} = flagNames();
  const name = names[code];
  if (!d) {
    const ov = openOverlay(`<div class="modal-header pt-head"><div>${flagEmoji(code)} ${escapeHtml(name)}</div><small>jeszcze nieodkryty</small></div>
      <div class="modal-body pt-body"><div class="muted">Obejrzyj film lub serial z tego kraju, aby zapalić flagę.</div></div>
      <div class="modal-footer"><button class="btn" id="fl-close">Zamknij</button></div>`);
    ov.classList.add("pt-overlay");
    ov.querySelector("#fl-close").addEventListener("click", ()=>closeOverlay(ov));
    ov.addEventListener("click", (e)=>{ if (e.target === ov) closeOverlay(ov); });
    return;
  }
  const items = d.items.slice().sort((a,b)=>String(b.premiere_date||"").localeCompare(String(a.premiere_date||"")) || a.title.localeCompare(b.title));
  const parts = [];
  if (d.movies) parts.push(`${d.movies} ${polishPlural(d.movies,"film","filmy","filmów")}`);
  if (d.series) parts.push(`${d.series} ${polishPlural(d.series,"serial","seriale","seriali")}`);
  const rows = items.map(it=>`<div class="pt-row fl-row"><span>${escapeHtml(it.title)}</span><small>${it.type===TYPE_MOVIE?"Film":"Serial"}${it.premiere_date ? " · " + escapeHtml(String(it.premiere_date).slice(0,4)) : ""}</small></div>`).join("");
  const ov = openOverlay(`<div class="modal-header pt-head"><div>${flagEmoji(code)} ${escapeHtml(name)}</div><small>${parts.join(" · ")}</small></div>
    <div class="modal-body pt-body">${rows}</div>
    <div class="modal-footer"><button class="btn" id="fl-close">Zamknij</button></div>`);
  ov.classList.add("pt-overlay");
  ov.querySelector("#fl-close").addEventListener("click", ()=>closeOverlay(ov));
  ov.addEventListener("click", (e)=>{ if (e.target === ov) closeOverlay(ov); });
}
