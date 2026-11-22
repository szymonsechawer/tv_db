// ============================================================
// add-wizard.js — dodawanie filmów i seriali krok po kroku
// 1) rodzaj + lista, 2) wyszukanie tytułu w TMDb, 3) tagi
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
      row.innerHTML = `${img}<span class="aw-rt"><b></b><small></small></span>${have ? `<span class="aw-have">✓ Masz</span>` : `<span class="aw-plus">+</span>`}`;
      row.querySelector("b").textContent = awHitTitle(r);
      const orig = r.original_title || r.original_name || "";
      row.querySelector("small").textContent = [year, orig && orig !== awHitTitle(r) ? orig : ""].filter(Boolean).join(" · ");
      row.addEventListener("click", async ()=>{
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
    const poster = hit.poster_path ? tmdbPosterUrl(hit.poster_path, "w185") : "";
    const allTags = getAllTags();
    body.innerHTML = `<div class="aw-pick">${poster ? `<img src="${poster}" alt="">` : `<span class="aw-ph big"></span>`}<div><b></b><small>${escapeHtml([year, type===TYPE_MOVIE?"Film":"Serial", STATUS_LABELS[status]].filter(Boolean).join(" · "))}</small></div></div>
      <div class="aw-lbl">Tagi</div>
      <div class="aw-tags" id="aw-tags">${allTags.map(t=>`<button type="button" class="aw-tag${tags.includes(t)?" on":""}" data-t="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("")}<button type="button" class="aw-tag aw-tag-new" id="aw-tag-new">+ nowy</button></div>
      <button type="button" class="aw-more" id="aw-more">Więcej pól (opis, obsada, data…)<span>›</span></button>`;
    body.querySelector(".aw-pick b").textContent = awHitTitle(hit);
    body.querySelectorAll(".aw-tag[data-t]").forEach(b=>b.addEventListener("click", ()=>{ const t = b.dataset.t; tags = tags.includes(t) ? tags.filter(x=>x!==t) : [...tags, t]; b.classList.toggle("on"); }));
    body.querySelector("#aw-tag-new").addEventListener("click", async ()=>{
      const v = await askText({title:"Nowy tag", prompt:"Nazwa tagu:", initial:""});
      const t = String(v||"").trim();
      if (t && !tags.includes(t)) { tags.push(t); renderStep3(); const extra = body.querySelector(`.aw-tag[data-t="${CSS.escape(t)}"]`); if (!extra) { const b = document.createElement("button"); b.type="button"; b.className="aw-tag on"; b.textContent=t; body.querySelector("#aw-tags").insertBefore(b, body.querySelector("#aw-tag-new")); } }
    });
    body.querySelector("#aw-more").addEventListener("click", ()=>{ close(); openManual(hit, false); });
    foot.innerHTML = `<button type="button" class="btn aw-main" id="aw-add">Dodaj do listy</button>`;
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
