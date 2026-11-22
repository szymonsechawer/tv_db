// ============================================================
// add-wizard.js — dodawanie filmów i seriali krok po kroku
// 1) rodzaj + lista, 2) wyszukanie tytułu w TMDb, 3) podsumowanie
// ============================================================

const AW_ICON_FILM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>';
const AW_ICON_TV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 21h8M9 2l3 4 3-4"/></svg>';
const AW_STATUS_INFO = {
  [STATUS_WATCHING]: {color:"#3b8fd9", sub:"Zaczynasz oglądać teraz"},
  [STATUS_WATCHED]:  {color:"#3ba55d", sub:"Już obejrzane"},
  [STATUS_PLANNED]:  {color:"#e0a43c", sub:"Na później"},
};

function awStatusChoices(type){
  return TYPE_STATUS_ORDER[type].filter(s=>s!==STATUS_UPCOMING);
}

function openAddWizard(){
  let type = (activeMain === TYPE_MOVIE || activeMain === TYPE_SERIES) ? activeMain : TYPE_SERIES;
  let status = null;
  let hit = null;
  let rating = 0;
  let tags = [];
  let step = 1;
  let searchSeq = 0;

  const overlay = openOverlay(`<div class="aw" id="aw">
    <div class="aw-hd"><button type="button" class="aw-back" id="aw-back">‹ Wstecz</button><span class="aw-sp"></span><button type="button" class="aw-cancel" id="aw-cancel">Anuluj</button></div>
    <div class="aw-steps"><i></i><i></i><i></i></div>
    <div class="aw-body" id="aw-body"></div>
    <div class="aw-foot" id="aw-foot"></div>
  </div>`);
  const modal = overlay.querySelector(".modal") || overlay.firstElementChild;
  if (modal) modal.classList.add("aw-modal");
  const body = overlay.querySelector("#aw-body");
  const foot = overlay.querySelector("#aw-foot");
  const backBtn = overlay.querySelector("#aw-back");

  function close(){ closeOverlay(overlay); document.removeEventListener("keydown", onKey); }
  function onKey(e){ if (!isTopOverlay(overlay)) return; if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  overlay.querySelector("#aw-cancel").addEventListener("click", close);
  backBtn.addEventListener("click", ()=>{ if (step > 1) { step--; render(); } });

  function defaultStatusFor(t){
    const ch = awStatusChoices(t);
    const cur = activeMain === t ? activeStatus[t] : null;
    return ch.includes(cur) ? cur : ch[0];
  }
  status = defaultStatusFor(type);

  function render(){
    body.classList.remove("aw-hero-mode");
    overlay.querySelectorAll(".aw-steps i").forEach((el, i)=>el.classList.toggle("on", i < step));
    backBtn.style.visibility = step > 1 ? "visible" : "hidden";
    if (step === 1) renderStep1();
    else if (step === 2) renderStep2();
    else renderStep3();
  }

  function renderStep1(){
    const ch = awStatusChoices(type);
    if (!ch.includes(status)) status = defaultStatusFor(type);
    body.innerHTML = `<div class="aw-q">Co dodajesz?</div>
      <div class="aw-big">
        <button type="button" class="aw-bt${type===TYPE_MOVIE?" on":""}" data-t="${TYPE_MOVIE}">${AW_ICON_FILM}<span>Film</span></button>
        <button type="button" class="aw-bt${type===TYPE_SERIES?" on":""}" data-t="${TYPE_SERIES}">${AW_ICON_TV}<span>Serial</span></button>
      </div>
      <div class="aw-q aw-q2">Na którą listę?</div>
      <div class="aw-stl">${ch.map(s=>`<button type="button" class="aw-st${s===status?" on":""}" data-s="${s}"><span class="aw-dot" style="background:${(AW_STATUS_INFO[s]||{}).color||"#9aa5b1"}"></span><span class="aw-stt">${escapeHtml(STATUS_LABELS[s])}<small>${escapeHtml((AW_STATUS_INFO[s]||{}).sub||"")}</small></span><span class="aw-radio"></span></button>`).join("")}</div>`;
    body.querySelectorAll(".aw-bt").forEach(b=>b.addEventListener("click", ()=>{ if (type !== b.dataset.t) { type = b.dataset.t; hit = null; } renderStep1(); }));
    body.querySelectorAll(".aw-st").forEach(b=>b.addEventListener("click", ()=>{ status = b.dataset.s; renderStep1(); }));
    foot.innerHTML = `<button type="button" class="btn aw-main" id="aw-next">Dalej: wyszukaj tytuł ›</button>`;
    foot.querySelector("#aw-next").addEventListener("click", ()=>{ step = 2; render(); });
  }

  function renderStep2(){
    body.innerHTML = `<div class="aw-q">${type===TYPE_MOVIE ? "Jaki film?" : "Jaki serial?"}</div>
      <div class="aw-sb"><span class="aw-sbi">⌕</span><input type="text" id="aw-q" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
      <div class="aw-res" id="aw-res"></div>`;
    foot.innerHTML = `<button type="button" class="btn secondary aw-main" id="aw-manual">Wpisz ręcznie</button>`;
    foot.querySelector("#aw-manual").addEventListener("click", ()=>{ close(); openManual(null); });
    const q = body.querySelector("#aw-q");
    const res = body.querySelector("#aw-res");
    let t = null;
    q.addEventListener("input", ()=>{ clearTimeout(t); t = setTimeout(()=>runSearch(q.value, res), 300); });
    if (hit) { q.value = awHitTitle(hit); runSearch(q.value, res); }
    setTimeout(()=>q.focus(), 60);
  }

  async function runSearch(text, res){
    const seq = ++searchSeq;
    const query = String(text||"").trim();
    if (!query) { res.innerHTML = ""; return; }
    if (!getStoredTmdbKey()) {
      res.innerHTML = `<div class="aw-note">Brak klucza TMDb — dodaj go w Ustawieniach albo wpisz ręcznie.</div>`; return;
    }
    res.innerHTML = `<div class="aw-note">Szukam…</div>`;
    let list = [];
    try { list = await tmdbSearchList(type, query); }
    catch(err) { if (seq === searchSeq) res.innerHTML = `<div class="aw-note err">${escapeHtml(err.message || String(err))}</div>`; return; }
    if (seq !== searchSeq) return;
    if (!list.length) { res.innerHTML = `<div class="aw-note">Nic nie znaleziono w TMDb.</div>`; return; }
    res.innerHTML = "";
    for (const r of list) {
      const have = findItemByTmdbId(type, r.id);
      const year = String(r.release_date || r.first_air_date || "").slice(0,4);
      const row = document.createElement("button");
      row.type = "button"; row.className = "aw-r";
      const img = r.poster_path ? `<img src="${tmdbPosterUrl(r.poster_path, "w92")}" alt="" loading="lazy">` : `<span class="aw-ph"></span>`;
      row.innerHTML = `${img}<span class="aw-rt"><b></b><small></small></span>${have ? `<span class="aw-have gs-st gs-${escapeHtml(have.status||STATUS_WATCHING)}">${escapeHtml((typeof GS_STATUS !== "undefined" && GS_STATUS[have.status||STATUS_WATCHING]) || STATUS_LABELS[have.status||STATUS_WATCHING] || "")}</span>` : ""}`;
      row.querySelector("b").textContent = awHitTitle(r);
      const orig = r.original_title || r.original_name || "";
      row.querySelector("small").textContent = [year, orig && orig !== awHitTitle(r) ? orig : ""].filter(Boolean).join(" · ");
      addDoubleActivation(row, async ()=>{
        if (have) {
          const ok = await showConfirm("Już masz ten tytuł", `„${have.title}” jest już w bazie (${STATUS_LABELS[have.status||STATUS_WATCHING]}). Dodać mimo to?`);
          if (!ok) return;
        }
        hit = r; step = 3; render();
      });
      res.appendChild(row);
    }
  }

  function renderStep3(){
    const year = String(hit.release_date || hit.first_air_date || "").slice(0,4);
    const poster = hit.poster_path ? tmdbPosterUrl(hit.poster_path, "w342") : "";
    const bg = hit.poster_path ? tmdbPosterUrl(hit.poster_path, "w185") : "";
    body.classList.add("aw-hero-mode");
    body.innerHTML = `<div class="vd-page-hero aw-hero"><div class="vd-hero"><div class="vd-top${bg ? " has-bg" : ""}">
        ${bg ? `<div class="vd-bg" style="background-image:url('${bg}')"></div>` : ""}
        <div class="vd-top-in">
          <div class="vd-poster">${poster ? `<img src="${poster}" alt="Okładka">` : `<span></span>`}</div>
          <div class="vd-info"><div class="vd-title"></div><div class="vd-meta"><span>${escapeHtml(year)}</span><span id="aw-fi"></span></div></div>
        </div></div></div></div>`;
    body.querySelector(".vd-title").textContent = awHitTitle(hit);
    const fi = body.querySelector("#aw-fi");
    const want = hit.id;
    (async ()=>{
      try {
        if (type === TYPE_MOVIE) {
          const d = await tmdbFetch("/movie/" + hit.id, {});
          const m = d && d.runtime ? d.runtime : 0;
          if (hit.id !== want || !fi.isConnected) return;
          fi.textContent = m ? (year ? " · " : "") + (m >= 60 ? `${Math.floor(m/60)} h ${m%60} min` : `${m} min`) : "";
        } else {
          const d = await tmdbFetch("/tv/" + hit.id, {});
          if (hit.id !== want || !fi.isConnected) return;
          const ns = d && d.number_of_seasons, ne = d && d.number_of_episodes;
          fi.textContent = ns ? (year ? " · " : "") + `${ns} ${polishPlural(ns,"sezon","sezony","sezonów")}${ne ? ` · ${ne} odc.` : ""}` : "";
        }
      } catch(e) { if (fi.isConnected) fi.textContent = ""; }
    })();
    foot.innerHTML = `<div class="aw-two"><button type="button" class="btn secondary aw-main" id="aw-undo">‹ Cofnij</button><button type="button" class="btn aw-main" id="aw-add">✓ Potwierdź</button></div>`;
    foot.querySelector("#aw-undo").addEventListener("click", ()=>{ step = 2; render(); });
    foot.querySelector("#aw-add").addEventListener("click", ()=>{ close(); openManual(hit, true); });
  }

  async function openManual(h, autoSave){
    const result = await openItemDialog({item:null, itemType:type, prefillTmdb:h || undefined, preset:{status, rating, tags, autoSave: !!(h && autoSave)}});
    if (result) {
      db.items.push(result);
      setDirty(true);
      renderAll();
      if (typeof showToast === "function") showToast(`Dodano: ${result.title}`);
    }
  }

  render();
}

function awHitTitle(r){ return (r && (r.title || r.name)) || ""; }
