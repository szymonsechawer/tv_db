// ============================================================
// home.js — Strona główna: 3 ostatnio oglądane seriale i 3 ostatnio
// obejrzane filmy (najnowszy w dużej karcie, dwa kolejne pod nim).
// ============================================================
function homeRecentSeries(n){
  const out = [];
  for (const it of db.items) {
    if (it.type !== TYPE_SERIES) continue;
    let last = 0;
    for (const s of it.seasons||[]) for (const e of s.episodes||[]) if (e.watched && e.watchedAt && e.watchedAt > last) last = e.watchedAt;
    if (last) out.push({it, last});
  }
  return out.sort((a,b)=>b.last-a.last).slice(0, n);
}
function homeRecentMovies(n){
  return db.items.filter(i=>i.type===TYPE_MOVIE && i.status===STATUS_WATCHED && i.watchedAt)
    .sort((a,b)=>b.watchedAt-a.watchedAt).slice(0, n).map(it=>({it, last: it.watchedAt}));
}
function homeDate(ts){ const d = new Date(ts); return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}`; }

// komórka postępu taka sama jak w Seriale → Oglądane (dotknięcie odhacza)
function homeProgressCell(item){
  const p = formatProgress(item);
  let total = 0, watched = 0;
  for (const s of item.seasons||[]) for (const e of s.episodes||[]) { total++; if (e.watched) watched++; }
  const wrap = document.createElement("div");
  wrap.className = "progress-cell";
  const finished = item.status === STATUS_WATCHED;
  wrap.innerHTML = `<div class="prog-toprow"><span class="prog-next"></span><span class="prog-counts"></span></div><div class="progress-bar-track"><div class="progress-bar-fill"></div></div>`;
  wrap.querySelector(".prog-next").textContent = finished ? "" : p.next;
  wrap.querySelector(".prog-counts").textContent = p.counts;
  wrap.querySelector(".progress-bar-fill").style.width = (total ? Math.round(watched/total*100) : 0) + "%";
  if (!finished && p.next && p.next !== "✓") {
    wrap.classList.add("prog-tappable");
    wrap.addEventListener("click", async (e)=>{
      e.stopPropagation();
      if (wrap.classList.contains("prog-busy")) return;
      wrap.classList.add("prog-busy");
      try { await markNextFromList(item.id, wrap); } finally { wrap.classList.remove("prog-busy"); renderHomeTab(); }
    });
    wrap.addEventListener("dblclick", (e)=>e.stopPropagation());
    wrap.addEventListener("touchend", (e)=>e.stopPropagation());
  }
  return wrap;
}
function homeMovieMeta(it){
  const parts = [];
  const y = String(it.premiere_date||"").slice(0,4); if (y) parts.push(y);
  if (it.duration) parts.push(it.duration >= 60 ? `${Math.floor(it.duration/60)} h ${it.duration%60} min` : `${it.duration} min`);
  return parts.join(" · ");
}

function renderHomeTab(){
  const box = document.getElementById("home-content");
  if (!box || typeof db === "undefined" || !db) return;
  const poster = (it, size)=> it.poster_path ? tmdbPosterUrl(it.poster_path, size||"w342") : "";
  const esc = escapeHtml;
  box.innerHTML = "";
  const section = (title, sub)=>{ const h = document.createElement("div"); h.className = "home-sh"; h.innerHTML = `<b>${esc(title)}</b><span>${esc(sub)}</span>`; box.appendChild(h); };
  const bigCard = (it, kind, last, smaller)=>{
    const c = document.createElement("div");
    c.className = "home-big" + (smaller ? " home-mid" : "");
    const p = poster(it);
    c.innerHTML = `${p ? `<div class="home-bg" style="background-image:url('${p}')"></div>` : ""}
      <div class="home-in">
        <span class="home-poster">${p ? `<img src="${p}" alt="">` : ""}</span>
        <div class="home-txt"><b>${esc(it.title)}</b><div class="home-slot"></div></div>
      </div>`;
    const slot = c.querySelector(".home-slot");
    if (kind === "s") {
      const yr = String(it.premiere_date||"").slice(0,4);
      if (yr) slot.insertAdjacentHTML("beforeend", `<span class="home-meta home-year">${esc(yr)}</span>`);
      slot.appendChild(homeProgressCell(it));
    }
    else { const y = String(it.premiere_date||"").slice(0,4); slot.innerHTML = y ? `<span class="home-meta">${esc(y)}</span>` : ""; }
    addDoubleActivation(c, ()=>openViewDialog(it.id));
    box.appendChild(c);
  };
  const smallCards = (list, kind)=>{
    if (!list.length) return;
    const g = document.createElement("div"); g.className = "home-two";
    for (const {it, last} of list) {
      const c = document.createElement("div"); c.className = "home-sm";
      const p = poster(it, "w154");
      c.innerHTML = `<span class="home-poster sm">${p ? `<img src="${p}" alt="" loading="lazy">` : ""}</span><div class="home-txt"><b>${esc(it.title)}</b><div class="home-slot"></div></div>`;
      const slot = c.querySelector(".home-slot");
      if (kind === "s") slot.appendChild(homeProgressCell(it));
      else slot.innerHTML = `<span class="home-meta">${esc(homeMovieMeta(it))}</span><span class="home-meta">${homeDate(last)}</span>`;
      addDoubleActivation(c, ()=>openViewDialog(it.id));
      g.appendChild(c);
    }
    box.appendChild(g);
  };
  const ser = homeRecentSeries(3), mov = homeRecentMovies(3);
  section("Seriale", "ostatnio oglądane");
  if (ser.length) ser.forEach((x, i)=>bigCard(x.it, "s", x.last, i > 0));
  else box.insertAdjacentHTML("beforeend", '<div class="muted home-empty">Brak obejrzanych odcinków.</div>');
  section("Filmy", "ostatnio obejrzane");
  if (mov.length) mov.forEach((x, i)=>bigCard(x.it, "m", x.last, i > 0));
  else box.insertAdjacentHTML("beforeend", '<div class="muted home-empty">Brak obejrzanych filmów.</div>');
  requestAnimationFrame(homeFit);
  // ponowne dopasowanie po wczytaniu okładek i czcionek
  let t = null; const refit = ()=>{ clearTimeout(t); t = setTimeout(homeFit, 60); };
  box.querySelectorAll("img").forEach(img=>{ if (!img.complete) img.addEventListener("load", refit, {once:true}); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
}

// Dopasuj wielkość kart tak, żeby cała strona główna zmieściła się na ekranie
// bez przewijania (okładki zmniejszają się stopniowo, do rozsądnego minimum).
function homeFit(){
  const box = document.getElementById("home-content");
  if (!box || activeMain !== "home" || !box.offsetParent) return;
  // wszystkie przodki (łącznie z body i html) muszą zmieścić zawartość bez przewijania
  const chain = [];
  for (let el = box.parentElement; el; el = el.parentElement) chain.push(el);
  const fits = ()=> chain.every(el=> el.scrollHeight <= el.clientHeight + 1 || getComputedStyle(el).overflowY === "visible" && el !== document.documentElement && el !== document.body);
  let hp = 120;
  box.style.setProperty("--hp", hp + "px");
  let guard = 40;
  while (!fits() && hp > 54 && guard--) { hp -= 4; box.style.setProperty("--hp", hp + "px"); }
}
window.addEventListener("resize", ()=>{ if (typeof activeMain !== "undefined" && activeMain === "home") homeFit(); });
