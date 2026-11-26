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

  // --- strona 2 / Informacje: grupy wierszy jak w Ustawieniach iPhone'a ---
  const vlist = document.createElement("div");
  vlist.className = "vd-list";
  infoBox.before(vlist);
  infoBox.classList.add("vd-hidden");
  const vlistOpen = {};   // rozwinięte listy (np. cała obsada)
  function buildInfoList(){
    const c = cur();
    const esc = (t)=>escapeHtml(String(t));
    const groups = [];
    const row = (label, value, extra)=> value ? `<div class="vl-row${extra||""}"><span class="vl-k">${esc(label)}</span><span class="vl-v">${value}</span></div>` : "";
    // Gdzie obejrzeć
    const wp = c.watch_providers;
    if (wp && ((wp.flatrate||[]).length || (wp.rent||[]).length || (wp.buy||[]).length)) {
      const many = (key, list)=>{
        if (!list || !list.length) return "";
        return esc(list.join(", "));
      };
      groups.push(["Gdzie obejrzeć",
        row("Streaming", (wp.flatrate||[]).length ? esc(wp.flatrate.join(", ")) : "") +
        row("Wypożyczenie", many("rent", wp.rent)) +
        row("Zakup", many("buy", wp.buy))]);
    }
    // Szczegóły
    let det = "";
    const creators = (c.creators||[]).filter(Boolean);
    if (creators.length) det += row(type === TYPE_MOVIE ? (creators.length > 1 ? "Reżyseria" : "Reżyser") : (creators.length > 1 ? "Twórcy" : "Twórca"), esc(creators.join(", ")));
    if (type === TYPE_MOVIE && c.duration) det += row("Czas trwania", esc(c.duration >= 60 ? `${Math.floor(c.duration/60)} h ${c.duration%60} min` : `${c.duration} min`));
    if (type === TYPE_SERIES && Array.isArray(c.seasons) && c.seasons.length) {
      const eps = c.seasons.reduce((a, se)=>a + ((se.episodes||[]).length), 0);
      det += row("Sezony", esc(String(c.seasons.length)));
      det += row("Odcinki", esc(String(eps)));
    }
    if (c.tmdb_rating > 0) det += row("Ocena TMDb", `${esc(formatTmdbRating(c.tmdb_rating))}${c.tmdb_votes > 0 ? ` <span class="vl-muted">· ${esc(fmtNum(c.tmdb_votes))} ${polishPlural(c.tmdb_votes, "głos", "głosy", "głosów")}</span>` : ""}`);
    const pc = c.production_countries||[], oc = c.origin_country||[];
    if (pc.length) det += row(pc.length > 1 ? "Kraje produkcji" : "Kraj produkcji", esc(pc.join(", ")));
    if (oc.length && oc.join(",") !== pc.join(",")) det += row("Kraj pochodzenia", esc(oc.join(", ")));
    if (c.original_language) det += row("Język", esc(c.original_language));
    if (c.age_certification && String(c.age_certification).trim()) det += row("Wiek", esc(formatAgeCertification(c.age_certification)));
    const comp = (c.production_companies||[]).filter(Boolean);
    if (comp.length) {
      det += row(comp.length > 1 ? "Wytwórnie" : "Wytwórnia", esc(comp.join(", ")));
    }
    if (c.budget) det += row("Budżet", esc(formatMoney(c.budget)));
    if (c.status === STATUS_WATCHED && c.finished_date) det += row("Data zakończenia", esc(formatDateDMY(c.finished_date)));
    if (c.tags && c.tags.length) det += row("Tagi", c.tags.map(t=>`<span class="view-tag">${esc(t)}</span>`).join(" "));
    if (det) groups.push(["Szczegóły", det]);
    // Obsada
    const cast = (c.cast||[]).filter(Boolean).map(x=>{
      const m = String(x).match(/^(.*?)\s*\((.*)\)\s*$/);
      return m ? [m[1], m[2]] : [String(x), ""];
    });
    if (cast.length) {
      const h = cast.map(([n, r])=>`<div class="vl-row"><span class="vl-k vl-name">${esc(n)}</span><span class="vl-v vl-role">${esc(r)}</span></div>`).join("");
      groups.push(["Obsada", h]);
    }
    // Opis
    if (c.description && c.description.trim()) groups.push(["Opis", `<div class="vl-desc">${esc(c.description)}</div>`]);
    vlist.innerHTML = groups.length
      ? groups.map(([t, h])=>`<div class="vl-gh">${esc(t)}</div><div class="vl-grp">${h}</div>`).join("")
      : `<div class="vl-grp"><div class="vl-desc muted">Brak pobranych informacji o tym tytule.</div></div>`;
    vlist.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click", ()=>{ vlistOpen[b.dataset.open] = true; buildInfoList(); }));
  }
  ctx.buildInfoList = buildInfoList;
  buildInfoList();
  // dane dociągane w tle (TMDb) - przebuduj listę, gdy stare pola się zmienią
  if (typeof MutationObserver !== "undefined") {
    let pend = false;
    new MutationObserver(()=>{ if (pend) return; pend = true; requestAnimationFrame(()=>{ pend = false; buildInfoList(); }); })
      .observe(infoBox, {subtree:true, childList:true, characterData:true});
  }

  // --- stopka: bez zmian (Zamknij, Edytuj, Usuń) ---

  // --- dwie strony: 1) duży nagłówek, 2) reszta (przesunięcie w lewo) ---
  const pages = document.createElement("div");
  pages.className = "vd-pages";
  const page1 = document.createElement("div");
  page1.className = "vd-page vd-page-hero";
  const page2 = document.createElement("div");
  page2.className = "vd-page vd-page-rest";
  page1.appendChild(hero);
  while (scroll.firstChild) page2.appendChild(scroll.firstChild);
  pages.append(page1, page2);
  // nagłówek strony z nazwą (zamiast przycisków zakładek)
  const mkPageTitle = (t)=>{ const h = document.createElement("div"); h.className = "vd-page-title"; h.textContent = t; return h; };
  if (tabs) tabs.style.display = "none";
  page2.insertBefore(mkPageTitle("Informacje"), page2.firstChild);
  // Serial: "Sezony i odcinki" jako osobna, trzecia strona (przesunięcie w lewo)
  const seasonsPane = page2.querySelector("#vpane-seasons");
  const infoPane = page2.querySelector("#vpane-info");
  let page3 = null;
  if (type === TYPE_SERIES && seasonsPane && tabs) {
    page3 = document.createElement("div");
    page3.className = "vd-page vd-page-rest vd-page-seasons";
    tabs.style.display = "none";
    page3.appendChild(mkPageTitle("Sezony i odcinki"));
    page3.appendChild(seasonsPane);
    pages.appendChild(page3);
  }
  const pageCount = page3 ? 3 : 2;
  scroll.appendChild(pages);
  scroll.classList.add("vd-paged");
  const dotsEl = document.createElement("div");
  dotsEl.className = "vd-page-dots";
  dotsEl.innerHTML = Array.from({length: pageCount}, (_, i)=>`<button type="button" aria-label="Strona ${i+1}"${i===0 ? ' class="on"' : ''}></button>`).join("");
  const footerEl = overlay.querySelector(".modal-footer");
  if (footerEl) footerEl.insertBefore(dotsEl, footerEl.firstChild);
  const goPage = (i)=>pages.scrollTo({left: i * pages.clientWidth, behavior: "smooth"});
  dotsEl.querySelectorAll("button").forEach((b,i)=>b.addEventListener("click", ()=>goPage(i)));
  // obie zakładki (Informacje i Sezony) zawsze widoczne na swoich stronach
  const vtabInfoBtn = overlay.querySelector("#vtab-info"), vtabSeasonsBtn = overlay.querySelector("#vtab-seasons");
  const showBothPanes = ()=>{ if (infoPane) infoPane.style.display = ""; if (seasonsPane) seasonsPane.style.display = ""; };
  let lastPage = 0;
  pages.addEventListener("scroll", ()=>{
    const i = Math.round(pages.scrollLeft / Math.max(1, pages.clientWidth));
    dotsEl.querySelectorAll("button").forEach((b,j)=>b.classList.toggle("on", i===j));
    if (page3 && i !== lastPage) {
      // odśwież sezony przy wejściu na stronę 3 (np. po odhaczeniu odcinka)
      if (i === 2 && vtabSeasonsBtn) { vtabSeasonsBtn.click(); showBothPanes(); }
      else if (vtabInfoBtn) { vtabInfoBtn.click(); showBothPanes(); }
    }
    lastPage = i;
  }, {passive:true});
  if (page3) setTimeout(()=>{ if (vtabSeasonsBtn) vtabSeasonsBtn.click(); if (vtabInfoBtn) vtabInfoBtn.click(); showBothPanes(); }, 0);
  // Strona 1 zawsze mieści się bez przewijania: okładka dopasowuje swoją
  // wysokość do miejsca, które zostaje po tekście, postępie i przyciskach.
  function fitHero(){
    vdFitProgRow(page1);
    const poster = page1.querySelector(".vd-poster");
    if (!poster || !page1.clientHeight) return;
    const wide = window.matchMedia("(min-width:700px)").matches;
    poster.style.height = ""; poster.style.width = "";
    const title = page1.querySelector(".vd-title");
    if (title) title.style.fontSize = "";
    const pageH = page1.clientHeight;
    const pageW = page1.clientWidth;
    // wysokość wszystkiego poza okładką
    const topIn = page1.querySelector(".vd-top-in");
    const info = page1.querySelector(".vd-info");
    const csTop = getComputedStyle(topIn);
    const padV = parseFloat(csTop.paddingTop) + parseFloat(csTop.paddingBottom);
    const gap = parseFloat(csTop.rowGap || csTop.gap) || 0;
    const outside = [...page1.children].filter(el=>!el.contains(poster)).reduce((a,el)=>a+el.getBoundingClientRect().height + (parseFloat(getComputedStyle(el).marginTop)||0) + (parseFloat(getComputedStyle(el).marginBottom)||0), 0);
    const heroExtras = [...hero.children].filter(el=>!el.contains(poster)).reduce((a,el)=>a+el.getBoundingClientRect().height + (parseFloat(getComputedStyle(el).marginTop)||0) + (parseFloat(getComputedStyle(el).marginBottom)||0), 0);
    const topMargin = parseFloat(getComputedStyle(hero.querySelector(".vd-top")).marginBottom)||0;
    let avail;
    if (wide) avail = pageH - outside - heroExtras - topMargin - padV - 4;                       // okładka obok tekstu
    else avail = pageH - outside - heroExtras - topMargin - padV - gap - info.getBoundingClientRect().height - 4;   // okładka nad tekstem
    // Na telefonie okładka zawsze nad tekstem - jeśli brakuje miejsca,
    // najpierw zmniejszamy okładkę, potem czcionkę tytułu.
    const maxW = wide ? Math.min(pageW * 0.5, 440) : Math.min(pageW * 0.62, 260);
    let h = Math.max(Math.min(avail, maxW * 1.5), 90);
    const apply = ()=>{ poster.style.height = Math.floor(h) + "px"; poster.style.width = Math.floor(h / 1.5) + "px"; };
    apply();
    const fits = ()=> page1.scrollHeight <= page1.clientHeight + 1;
    let guard = 60;
    while (!fits() && h > 90 && guard--) { h -= 6; apply(); }
    if (!fits() && title) {
      let fs = parseFloat(getComputedStyle(title).fontSize) || 24;
      while (!fits() && fs > 15 && guard-- > -40) { fs -= 1; title.style.fontSize = fs + "px"; }
      while (!fits() && h > 60 && guard-- > -80) { h -= 4; apply(); }
    }
  }
  ctx.fitHero = fitHero;
  const ro = (typeof ResizeObserver !== "undefined") ? new ResizeObserver(()=>fitHero()) : null;
  if (ro) ro.observe(page1); else window.addEventListener("resize", fitHero);
  requestAnimationFrame(()=>requestAnimationFrame(fitHero));

  // kliknięcie zakładki "Sezony i odcinki" z innego miejsca - przejdź na stronę 2
  if (!page3) overlay.querySelectorAll(".inner-tabs .tab-btn").forEach(b=>b.addEventListener("click", ()=>goPage(1)));

  // --- render nagłówka ---
  function plural(n, a, b, c){ return typeof polishPlural === "function" ? polishPlural(n, a, b, c) : c; }
  let render = function(){
    const c = cur();
    const year = String(c.premiere_date||"").slice(0,4);
    const meta = [];
    if (year) meta.push(year);
    const r = normalizeRating(c.rating);
    let statusTxt = STATUS_LABELS[c.status] || "";
    if (preview) statusTxt = "";
    if (c.status === STATUS_PLANNED && typeof plannedSinceShort === "function") { const s = plannedSinceShort(c.addedAt); if (s) statusTxt += ` · ${s}`; }
    const poster = c.poster_path ? tmdbPosterUrl(c.poster_path, "w342") : "";
    const bg = c.poster_path ? tmdbPosterUrl(c.poster_path, "w185") : "";

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
      if (type === TYPE_SERIES && nextCode) actions.push(`<button type="button" class="vd-act primary" data-act="next">✔ ${escapeHtml(nextCode)}</button>`);
      if (type === TYPE_MOVIE && c.status !== STATUS_WATCHED) actions.push(`<button type="button" class="vd-act primary" data-act="watched">✓ Obejrzane</button>`);
    }
    if (c.trailer_key) actions.push(`<a class="vd-act" href="https://www.youtube.com/watch?v=${escapeHtml(c.trailer_key)}" target="_blank" rel="noopener">▶ Zwiastun</a>`);

    hero.innerHTML = `
      <div class="vd-top${bg ? " has-bg" : ""}">
        ${bg ? `<div class="vd-bg" style="background-image:url('${bg}')"></div>` : ""}
        <div class="vd-top-in">
          <div class="vd-poster">${poster ? `<img src="${poster}" alt="Okładka">` : `<span>${escapeHtml(c.title||"")}</span>`}</div>
          <div class="vd-info">
            <div class="vd-title">${escapeHtml(c.title||"")}</div>
            ${c.original_title ? `<div class="vd-orig">${escapeHtml(c.original_title)}</div>` : ""}
            ${meta.length ? `<div class="vd-meta">${meta.map(m=>`<span>${escapeHtml(m)}</span>`).join(" · ")}</div>` : ""}
            ${(c.genres||[]).length ? `<div class="vd-genres">${c.genres.map(g=>`<span>${escapeHtml(g)}</span>`).join("")}</div>` : ""}
            ${(r || c.tmdb_rating > 0) ? `<div class="vd-rate">${r ? `Ocena: <b>${formatRating(r).replace(".", ",")}</b>` : ""}${c.tmdb_rating > 0 ? `<span class="vd-tmdb">TMDb <b>${formatTmdbRating(c.tmdb_rating)}</b></span>` : ""}</div>` : ""}
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
  };
  render();
  // po przerysowaniu nagłówka dopasuj okładkę ponownie
  const _render = render;
  render = function(){ _render(); if (ctx.buildInfoList) ctx.buildInfoList(); if (ctx.fitHero) requestAnimationFrame(ctx.fitHero); };

  // Odświeżanie nagłówka, gdy okno doczyta dane z TMDb.
  let t = null;
  const mo = new MutationObserver(()=>{ clearTimeout(t); t = setTimeout(render, 60); });
  for (const s of ["#view-desc-text","#view-cast-text","#view-creators-text","#view-genres-row","#view-cert-row","#view-status-row","#view-rating-row","#view-poster-img","#view-collection-content"]) {
    const el = overlay.querySelector(s);
    if (el) mo.observe(el, {childList:true, subtree:true, characterData:true, attributes:true});
  }
  ctx.rerender = render;
}


// Wiersz „Postęp … · zostało …” zawsze w jednej linii: zmniejsza czcionkę, aż się zmieści
function vdFitProgRow(root){
  if (!root) return;
  root.querySelectorAll(".vd-prog-row").forEach(row=>{
    row.style.fontSize = "";
    let fs = parseFloat(getComputedStyle(row).fontSize) || 12.5;
    let guard = 40;
    while (row.scrollWidth > row.clientWidth + 1 && fs > 8 && guard--) { fs -= 0.5; row.style.fontSize = fs + "px"; }
  });
}
