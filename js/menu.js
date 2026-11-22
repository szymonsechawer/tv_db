// ============================================================
// menu.js — tryb "menu hamburger": wszystkie przyciski i zakładki są
// w wysuwanym menu, a na ekranie zostaje tylko lista rekordów.
// Pozycje menu wywołują istniejące przyciski/funkcje (bez dublowania logiki).
// ============================================================
(function(){
  // Ikony brane z istniejących przycisków (te same pliki, działa też offline).
  const iconOf = (id)=>{ const img = document.querySelector(`#${id} img`); return img ? img.src : ""; };
  const ICONS = {add:iconOf("btn-add"), sort:iconOf("btn-sort"), filter:iconOf("btn-filter"), view:iconOf("btn-view"), check:iconOf("btn-check"), save:iconOf("btn-save"), open:iconOf("btn-open"), stats:iconOf("btn-stats"), settings:iconOf("btn-settings")};

  const top = document.createElement("div");
  top.id = "menu-topbar";
  top.innerHTML = `
    <button type="button" class="menu-icon-btn" id="menu-open" aria-label="Menu"><span class="hamburger"><i></i><i></i><i></i></span></button>
    <div class="menu-title" id="menu-title"></div>
    <button type="button" class="menu-icon-btn" id="menu-search" aria-label="Szukaj">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>
    </button>`;
  const app = document.getElementById("app");
  app.insertBefore(top, app.firstChild);

  const drawer = document.createElement("div");
  drawer.id = "menu-drawer";
  drawer.innerHTML = `<div class="menu-backdrop"></div><nav class="menu-panel" aria-label="Menu"><div class="menu-panel-head"><span>tv_db</span><button type="button" class="menu-close" aria-label="Zamknij">×</button></div><div class="menu-items"></div></nav>`;
  document.body.appendChild(drawer);
  const itemsEl = drawer.querySelector(".menu-items");

  function countFor(type, status){
    if (status === STATUS_UPCOMING) return (db.upcoming||[]).filter(e=>daysUntil(e.air_date)!==null).length;
    return db.items.filter(i=>i.type===type && (i.status||STATUS_WATCHING)===status).length;
  }
  function locationTitle(){
    if (activeMain===TYPE_SERIES && activeStatus[TYPE_SERIES]===STATUS_UPCOMING && upcomingMode==="episodes") return "Seriale · Nadchodzące";
    if (activeMain===TYPE_MOVIE || activeMain===TYPE_SERIES) return `${TYPE_LABELS[activeMain]} · ${STATUS_LABELS[activeStatus[activeMain]]}`;
    return ({notes:"Notatki", stats:"Statystyki", settings:"Ustawienia"})[activeMain] || "";
  }
  function section(label){
    const h = document.createElement("div"); h.className = "menu-section"; h.textContent = label; itemsEl.appendChild(h);
  }
  function item({label, icon, count, active, onClick, disabled, sub}){
    const b = document.createElement("button");
    b.type = "button";
    b.className = "menu-item" + (active ? " active" : "") + (sub ? " menu-sub" : "");
    if (disabled) b.disabled = true;
    b.innerHTML = `${icon ? `<img src="${icon}" alt="">` : `<span class="menu-dot"></span>`}<span class="menu-label"></span>${count!=null ? `<span class="menu-count">${count}</span>` : ""}`;
    b.querySelector(".menu-label").textContent = label;
    b.addEventListener("click", ()=>{ closeMenu(); setTimeout(onClick, 180); });
    itemsEl.appendChild(b);
  }
  function clickBtn(id){ const el = document.getElementById(id); if (el) el.click(); }

  function buildMenu(){
    itemsEl.innerHTML = "";
    const onList = activeMain===TYPE_MOVIE || activeMain===TYPE_SERIES;
    const isUpcoming = activeMain===TYPE_SERIES && activeStatus[TYPE_SERIES]===STATUS_UPCOMING;
    section("Lista");
    item({label:"Dodaj", icon:ICONS.add, onClick:()=>clickBtn("btn-add")});
    if (onList) item({label:"Widok", icon:ICONS.view, onClick:()=>clickBtn("btn-view")});
    for (const type of [TYPE_SERIES, TYPE_MOVIE]) {
      section(TYPE_LABELS[type]);
      for (const st of TYPE_STATUS_ORDER[type]) {
        if (st === STATUS_UPCOMING) {
          // Nowości = nowe sezony, Nadchodzące = nadchodzące odcinki
          const onUp = activeMain===type && activeStatus[type]===st;
          item({label: "Nowości", count: countFor(type, st), active: onUp && upcomingMode!=="episodes",
            onClick: ()=>{ setUpcomingMode("seasons"); switchMainTab(type); switchStatusTab(type, st); }});
          item({label: "Nadchodzące", count: collectEpisodesFeed().length, active: onUp && upcomingMode==="episodes",
            onClick: ()=>{ setUpcomingMode("episodes"); switchMainTab(type); switchStatusTab(type, st); }});
          continue;
        }
        item({label: STATUS_LABELS[st], count: countFor(type, st), active: activeMain===type && activeStatus[type]===st,
          onClick: ()=>{ switchMainTab(type); switchStatusTab(type, st); }});
      }
    }
    section("Więcej");
    item({label:"Notatki", active: activeMain==="notes", onClick:()=>switchMainTab("notes")});
    item({label:"Statystyki", icon:ICONS.stats, active: activeMain==="stats", onClick:()=>switchMainTab("stats")});
    const sv = window.SUMMARY_MENU_VARIANT || "A";
    if (sv === "B") {
      item({label:"Podsumowanie seriali", sub:true, onClick:()=>openSummaryDialog("episodes", "single")});
      item({label:"Podsumowanie filmów", sub:true, onClick:()=>openSummaryDialog("movies", "single")});
    } else {
      item({label:"Podsumowanie", sub:true, onClick:()=>openSummaryDialog("episodes", sv === "C" ? "both" : "tabs")});
    }
    item({label:"Ustawienia", icon:ICONS.settings, active: activeMain==="settings", onClick:()=>switchMainTab("settings")});
    section("Baza danych");
    item({label:"Zapisz do pliku", icon:ICONS.save, onClick:()=>clickBtn("btn-save")});
    item({label:"Otwórz plik", icon:ICONS.open, onClick:()=>clickBtn("btn-open")});
    const ver = document.createElement("div");
    ver.className = "menu-version";
    ver.textContent = "Wersja " + (typeof APP_BUILD !== "undefined" ? APP_BUILD : "");
    itemsEl.appendChild(ver);
  }

  function openMenu(){ buildMenu(); drawer.classList.add("open"); }
  function closeMenu(){ drawer.classList.remove("open"); }
  function refreshTitle(){
    const t = document.getElementById("menu-title"); if (t) t.textContent = locationTitle();
    const onUp = activeMain===TYPE_SERIES && activeStatus[TYPE_SERIES]===STATUS_UPCOMING;
    document.body.classList.toggle("on-upcoming", onUp);
    document.body.classList.toggle("on-upcoming-seasons", onUp && upcomingMode!=="episodes");
    const chkBtn = document.getElementById("btn-check");
    if (chkBtn && !chkBtn.disabled) {
      const lbl = chkBtn.querySelector(".btn-label");
      if (lbl) lbl.textContent = (onUp && upcomingMode==="episodes") ? "Sprawdź nadchodzące" : "Sprawdź nowości";
    }
  }

  top.querySelector("#menu-open").addEventListener("click", openMenu);
  drawer.querySelector(".menu-backdrop").addEventListener("click", closeMenu);
  drawer.querySelector(".menu-close").addEventListener("click", closeMenu);
  document.addEventListener("keydown", (e)=>{ if (e.key==="Escape" && drawer.classList.contains("open")) closeMenu(); });
  top.querySelector("#menu-search").addEventListener("click", ()=>{
    const on = document.body.classList.toggle("search-open");
    const i = document.getElementById("search-input");
    if (on) setTimeout(()=>{ if (i) i.focus(); }, 30);
    else if (i && i.value) { i.value = ""; i.dispatchEvent(new Event("input", {bubbles:true})); }   // schowanie = wyczyszczenie
  });

  // Tytuł nad listą aktualizowany przy każdej zmianie zakładki.
  const _sm = switchMainTab, _ss = switchStatusTab;
  switchMainTab = function(t){ _sm(t); refreshTitle(); };
  switchStatusTab = function(t, s){ _ss(t, s); refreshTitle(); };
  const _sum = setUpcomingMode;
  setUpcomingMode = function(m){ _sum(m); refreshTitle(); };
  document.body.classList.add("menu-mode");
  refreshTitle();
})();
