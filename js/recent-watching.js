// ============================================================
// recent-watching.js — Seriale · Oglądane: sekcja "Kontynuuj" nad listą
// z 3 ostatnio oglądanymi serialami (duży kafel + 2 mniejsze). Cały kafel
// działa jak komórka postępu: podwójne dotknięcie odhacza kolejny odcinek.
// ============================================================

function recentWatchingItems(limit){
  const out = [];
  for (const it of db.items) {
    if (it.type !== TYPE_SERIES || (it.status || STATUS_WATCHING) !== STATUS_WATCHING) continue;
    let last = 0;
    for (const s of it.seasons || []) for (const e of s.episodes || []) {
      if (e.watched && (e.watchedAt || 0) > last) last = e.watchedAt;
    }
    if (last > 0) out.push({ item: it, last });
  }
  out.sort((a, b) => b.last - a.last);
  return out.slice(0, limit).map(x => x.item);
}

function buildRecentCard(item, big){
  const p = formatProgress(item);
  let total = 0, watched = 0;
  for (const s of item.seasons || []) for (const e of s.episodes || []) { total++; if (e.watched) watched++; }
  const pct = total ? Math.round((watched / total) * 100) : 0;
  const card = document.createElement("div");
  card.className = "rw-card progress-cell" + (big ? " rw-big" : "");
  const title = document.createElement("div");
  title.className = "rw-title";
  title.textContent = item.title || "";
  const year = document.createElement("div");
  year.className = "rw-year";
  year.textContent = item.premiere_date || "";
  const top = document.createElement("div");
  top.className = "prog-toprow";
  const next = document.createElement("span");
  next.className = "prog-next";
  next.textContent = p.next;
  const cnt = document.createElement("span");
  cnt.className = "prog-counts";
  cnt.textContent = p.counts;
  top.appendChild(next); top.appendChild(cnt);
  const track = document.createElement("div");
  track.className = "progress-bar-track";
  const fill = document.createElement("div");
  fill.className = "progress-bar-fill";
  fill.style.width = pct + "%";
  track.appendChild(fill);
  card.append(title, year, top, track);
  if (p.next && p.next !== "✓") {
    card.classList.add("prog-tappable");
    card.title = p.nextTitle ? `Odhacz: ${p.nextTitle}` : "Odhacz kolejny odcinek";
    addDoubleActivation(card, async ()=>{
      if (card.classList.contains("prog-busy")) return;
      card.classList.add("prog-busy");
      try { await markNextFromList(item.id, card); }
      finally { card.classList.remove("prog-busy"); }
    });
  }
  return card;
}

function renderRecentWatching(pane, show){
  let box = pane.querySelector(".rw-box");
  const items = show ? recentWatchingItems(3) : [];
  if (!items.length) { if (box) box.remove(); return; }
  if (!box) {
    box = document.createElement("div");
    box.className = "rw-box";
    pane.insertBefore(box, pane.querySelector(".table-wrap"));
  }
  box.innerHTML = "";
  const head = document.createElement("div");
  head.className = "rw-head";
  head.textContent = "Kontynuuj";
  box.appendChild(head);
  box.appendChild(buildRecentCard(items[0], true));
  if (items.length > 1) {
    const row = document.createElement("div");
    row.className = "rw-row";
    for (const it of items.slice(1)) row.appendChild(buildRecentCard(it, false));
    box.appendChild(row);
  }
}
