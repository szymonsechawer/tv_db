// ============================================================
// info-layout.js — nowy układ okna informacji: nagłówek z okładką,
// szybkie akcje, najważniejsze informacje na wierzchu, reszta zwinięta.
// Nakłada się na istniejące okno (te same
// pola i funkcje), więc łatwo wrócić do starego układu.
// Stopka okna zostaje jak dawniej: Zamknij, Edytuj, Usuń.
// ============================================================

function vdFmtMinutes(min){
  min = Math.round(min||0);
  if (min <= 0) return "";
  const h = Math.floor(min/60), m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

// Film z Planowanych -> Zakończone (z pytaniem o ocenę), na górę listy.
async function quickMarkMovieWatched(id){
  const item = findItem(id);
  if (!item || item.type !== TYPE_MOVIE || item.status === STATUS_WATCHED) return false;
  if (normalizeRating(item.rating) === 0) {
    const r = await showRatingPrompt(item.title, true);
    if (r === null) return false;
    if (r > 0) item.rating = r;
  }
  item.status = STATUS_WATCHED;
  item.watchedAt = Date.now();
  item.finished_date = todayISODate();
  db.items = db.items.filter(i=>i.id!==id);
  db.items.push(item);
  setDirty(true);
  renderAll();
  return true;
}

function applyNewInfoLayout(overlay, ctx){
  const {id, item, type, readOnly, preview, onMarkNext} = ctx;
  const cur = ()=> findItem(id) || item;
  const modal = overlay.querySelector(".modal") || overlay.firstElementChild;
  overlay.classList.add("vd-new");
  const body = overlay.querySelector(".modal-body");
  const scroll = overlay.querySelector(".tab-scroll");
  const tabs = overlay.querySelector(".inner-tabs");
  const infoBox = overlay.querySelector("#vpane-info .info-box");
  if (!body || !scroll || !infoBox) return;

  // --- nagłówek ---
  const hero = document.createElement("div");
  hero.className = "vd-hero";
  scroll.insertBefore(hero, scroll.firstChild);
  if (tabs) {
    if (type === TYPE_SERIES) hero.after(tabs);   // zakładki pod nagłówkiem
    else tabs.style.display = "none";            // film: jedna zakładka - bez paska
  }
  const oldPoster = overlay.querySelector("#view-poster-wrap");
  if (oldPoster) oldPoster.style.display = "none";

  // --- przestawienie wierszy ---
  const rowOf = (sel)=>{ const el = overlay.querySelector(sel); return el ? el.closest(".view-row") || el : null; };
  const hideRows = ["#view-cert-row","#view-genres-row","#view-status-row","#view-rating-row","#view-links-text"];
  for (const s of hideRows) { const r = rowOf(s); if (r) r.classList.add("vd-hidden"); }
  [...infoBox.querySelectorAll(".view-row")].forEach(r=>{
    const lbl = (r.querySelector(".vlabel")||{}).textContent || "";
    if (/^(Typ|Tytuł|Tytuł org\.|Czas|Data \(rok\)):$/.test(lbl.trim())) r.classList.add("vd-hidden");
  });
  const order = ["#view-watch-text","#view-desc-text","#view-cast-text","#view-creators-text"];
  let anchor = null;
  for (const s of order) {
    const r = rowOf(s); if (!r) continue;
    if (!anchor) infoBox.insertBefore(r, infoBox.firstChild); else anchor.after(r);
    anchor = r;
  }
  // tagi i data zakończenia zaraz za nimi
  const tagsRow = [...infoBox.querySelectorAll(".view-row")].find(r=>((r.querySelector(".vlabel")||{}).textContent||"").trim()==="Tagi:");
  if (tagsRow && anchor) { anchor.after(tagsRow); anchor = tagsRow; }
  const finRow = overlay.querySelector("#view-finished-row");
  if (finRow && anchor) { anchor.after(finRow); anchor = finRow; }
  // Szczegóły - zawsze widoczne, w tym samym stylu co Opis
  for (const sel of ["#view-countries-text","#view-origin-text","#view-language-text","#view-companies-text","#view-budget-row"]) {
    const r = rowOf(sel); if (!r) continue;
    infoBox.appendChild(r);
    r.classList.add("vd-stack");
  }
  // etykieta "Twórcy/Reżyseria" i obsada jako przyciski
  const castRow = rowOf("#view-cast-text"), creatorsRow = rowOf("#view-creators-text");
  for (const r of [castRow, creatorsRow]) if (r) { r.classList.add("vd-stack"); const c = document.createElement("div"); c.className = "vd-chips"; r.appendChild(c); }
  const watchRow = rowOf("#view-watch-text"); if (watchRow) watchRow.classList.add("vd-stack");
  const descRow = rowOf("#view-desc-text");
  if (descRow) descRow.classList.add("vd-stack");   // opis zawsze w całości
  if (tagsRow) tagsRow.classList.add("vd-stack");
  if (finRow) finRow.classList.add("vd-stack");

  // --- stopka: bez zmian (Zamknij, Edytuj, Usuń) ---

  // --- render nagłówka ---
  function plural(n, a, b, c){ return typeof polishPlural === "function" ? polishPlural(n, a, b, c) : c; }
  function render(){
    const c = cur();
    const year = String(c.premiere_date||"").slice(0,4);
    const meta = [];
    if (year) meta.push(year);
    if (type === TYPE_MOVIE) { const d = vdFmtMinutes(c.duration); if (d) meta.push(d); }
    else { const n = (c.seasons||[]).filter(s=>(s.number||0)>0).length; if (n) meta.push(`${n} ${plural(n,"sezon","sezony","sezonów")}`); }
    if (c.age_certification) meta.push(c.age_certification);
    const r = normalizeRating(c.rating);
    let statusTxt = STATUS_LABELS[c.status] || "";
    if (preview) statusTxt = "";
    if (c.status === STATUS_PLANNED && typeof plannedSinceShort === "function") { const s = plannedSinceShort(c.addedAt); if (s) statusTxt += ` · ${s}`; }
    const poster = c.poster_path ? tmdbPosterUrl(c.poster_path, "w342") : "";

    let progress = "";
    let nextCode = "";
    if (type === TYPE_SERIES) {
      const eps = (c.seasons||[]).flatMap(s=>s.episodes||[]);
      const total = eps.length, watched = eps.filter(e=>e.watched).length;
      const left = eps.filter(e=>!e.watched && !isEpisodeUnaired(e));
      const known = eps.filter(e=>e.duration>0).map(e=>e.duration);
      const avg = known.length ? known.reduce((a,b)=>a+b,0)/known.length : 0;
      const leftMin = left.reduce((a,e)=>a+(e.duration>0 ? e.duration : avg), 0);
      const pct = total ? Math.round(watched/total*100) : 0;
      if (total) progress = `<div class="vd-prog"><div class="vd-prog-row"><b>Postęp ${watched}/${total}</b><span>${left.length ? `zostało ${left.length} odc.${leftMin ? ` · ok. ${vdFmtMinutes(leftMin)}` : ""}` : "wszystko obejrzane"}</span></div><div class="vd-bar"><i style="width:${pct}%"></i></div></div>`;
      const p = formatProgress(c);
      if (p.next && p.next !== "✓") nextCode = p.next.replace(" ", "");
    }
    const actions = [];
    if (!readOnly && !preview) {
      if (type === TYPE_SERIES && nextCode) actions.push(`<button type="button" class="vd-act primary" data-act="next">✔ Odhacz ${escapeHtml(nextCode)}</button>`);
      if (type === TYPE_MOVIE && c.status !== STATUS_WATCHED) actions.push(`<button type="button" class="vd-act primary" data-act="watched">✓ Obejrzane</button>`);
    }
    if (c.trailer_key) actions.push(`<a class="vd-act" href="https://www.youtube.com/watch?v=${escapeHtml(c.trailer_key)}" target="_blank" rel="noopener">▶ Zwiastun</a>`);

    hero.innerHTML = `
      <div class="vd-top">
        <div class="vd-top-in">
          <div class="vd-poster">${poster ? `<img src="${poster}" alt="Okładka">` : `<span>${escapeHtml(c.title||"")}</span>`}</div>
          <div class="vd-info">
            <div class="vd-title">${escapeHtml(c.title||"")}</div>
            ${c.original_title ? `<div class="vd-orig">${escapeHtml(c.original_title)}</div>` : ""}
            ${meta.length ? `<div class="vd-meta">${meta.map(m=>`<span>${escapeHtml(m)}</span>`).join(" · ")}</div>` : ""}
            ${(c.genres||[]).length ? `<div class="vd-genres">${c.genres.map(g=>`<span>${escapeHtml(g)}</span>`).join("")}</div>` : ""}
            ${r ? `<div class="vd-rate">Ocena: <b>${formatRating(r).replace(".", ",")}</b></div>` : ""}
            ${statusTxt ? `<span class="vd-status">${escapeHtml(statusTxt)}</span>` : ""}
          </div>
        </div>
      </div>
      ${progress}
      ${actions.length ? `<div class="vd-actions">${actions.join("")}</div>` : ""}`;
    const img = hero.querySelector(".vd-poster img");
    if (img) {
      img.addEventListener("error", ()=>{ img.remove(); hero.querySelector(".vd-poster").innerHTML = `<span>${escapeHtml(c.title||"")}</span>`; });
      img.addEventListener("click", ()=>{ if (typeof openPosterLightbox === "function") openPosterLightbox(tmdbPosterUrl(c.poster_path, "w780")); });
    }
    const nb = hero.querySelector('[data-act="next"]');
    if (nb) nb.addEventListener("click", async ()=>{ nb.disabled = true; nb.textContent = "Odhaczanie…"; await onMarkNext(); render(); });
    const wb = hero.querySelector('[data-act="watched"]');
    if (wb) wb.addEventListener("click", async ()=>{ wb.disabled = true; await quickMarkMovieWatched(id); render(); if (ctx.onChange) ctx.onChange(); });

    // obsada / twórcy jako przyciski
    const chipList = (row, list, limit)=>{
      if (!row) return;
      const box = row.querySelector(".vd-chips");
      const names = (list||[]).map(x=>String(x).replace(/\s*\(.*\)\s*$/, "")).filter(Boolean);
      row.classList.toggle("vd-has-chips", names.length > 0);
      box.innerHTML = "";
      const show = row.classList.contains("vd-chips-all") ? names : names.slice(0, limit);
      for (const n of show) { const s = document.createElement("span"); s.textContent = n; box.appendChild(s); }
      if (names.length > show.length) {
        const m = document.createElement("button"); m.type = "button"; m.textContent = `+${names.length - show.length}`;
        m.addEventListener("click", ()=>{ row.classList.add("vd-chips-all"); render(); });
        box.appendChild(m);
      }
    };
    chipList(castRow, c.cast, 4);
    chipList(creatorsRow, c.creators, 4);
    // kolekcja: ile obejrzanych
    const colTitle = overlay.querySelector("#view-collection-title");
    if (colTitle && Array.isArray(c.collection) && c.collection.length) {
      const total = c.collection.length;
      const seen = c.collection.filter(p=>{ const it = findItemByTmdbId(TYPE_MOVIE, p.id); return it && it.status === STATUS_WATCHED; }).length;
      const base = c.collection_title ? (/kolekcja/i.test(c.collection_title) ? c.collection_title : `Kolekcja: ${c.collection_title}`) : "Kolekcja";
      colTitle.textContent = `${base} (${seen} z ${total} ${seen === 1 ? "obejrzany" : "obejrzanych"})`;
    }
  }
  render();

  // Odświeżanie nagłówka, gdy okno doczyta dane z TMDb.
  let t = null;
  const mo = new MutationObserver(()=>{ clearTimeout(t); t = setTimeout(render, 60); });
  for (const s of ["#view-desc-text","#view-cast-text","#view-creators-text","#view-genres-row","#view-cert-row","#view-status-row","#view-rating-row","#view-poster-img","#view-collection-content"]) {
    const el = overlay.querySelector(s);
    if (el) mo.observe(el, {childList:true, subtree:true, characterData:true, attributes:true});
  }
  ctx.rerender = render;
}
