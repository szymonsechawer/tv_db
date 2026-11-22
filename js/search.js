// ============================================================
// search.js — pasek wyszukiwania i podpowiedzi tagów
// ============================================================

// Tryb wyszukiwania jest teraz wykrywany automatycznie na podstawie treści
// pola: jeśli tekst zaczyna się od "#" — szukamy po tagach, w przeciwnym
// razie — po tytule (fraza). Nie ma już osobnych przełączników.
function getSearchMode(query){
  return (query||"").trim().startsWith("#") ? "tags" : "phrase";
}

function updateSearchClearBtn(){
  const btn = document.getElementById("search-clear-btn");
  if (btn) btn.style.display = searchQuery ? "flex" : "none";
}

function updateSearchPlaceholder(){
  const searchInputEl = document.getElementById("search-input");
  if (!searchInputEl) return;
  searchInputEl.placeholder = "";
}

document.getElementById("search-input").addEventListener("input", (e)=>{
  searchQuery = e.target.value;
  searchMode = getSearchMode(searchQuery);
  updateSearchPlaceholder();
  updateSearchClearBtn();
  runSearchFilter();
});

document.getElementById("search-clear-btn").addEventListener("click", ()=>{
  const searchInputEl = document.getElementById("search-input");
  searchInputEl.value = "";
  searchQuery = "";
  searchMode = getSearchMode(searchQuery);
  updateSearchPlaceholder();
  updateSearchClearBtn();
  searchInputEl.focus();
  runSearchFilter();
});

function getAllTags(){
  const set = new Set();
  for (const it of db.items) {
    for (const t of (it.tags||[])) if (t) set.add(t);
  }
  return Array.from(set).sort((a,b)=>a.localeCompare(b,"pl"));
}

function runSearchFilter(){
  for (const type of [TYPE_MOVIE, TYPE_SERIES]) {
    for (const status of TYPE_STATUS_ORDER[type]) renderTable(type, status);
  }
  renderGlobalSearch();
}

// Wyszukiwanie globalne: niezależnie od otwartej zakładki pokazuje wszystkie
// pasujące filmy i seriale, z rodzajem i statusem po prawej.
const GS_STATUS = { watching: "Oglądany", watched: "Zakończony", paused: "Wstrzymany", planned: "Planowany" };
function globalSearchItems(q){
  const search = (q||"").trim().toLowerCase();
  if (!search) return [];
  let items = db.items.slice();
  if (getSearchMode(search) === "tags") {
    const tokens = search.replace(/#/g, "").split(/[,]+/).map(t=>t.trim()).filter(Boolean);
    if (!tokens.length) return [];
    items = items.filter(i => { const hay = (i.tags||[]).join(" ").toLowerCase(); return tokens.every(tok => hay.includes(tok)); });
  } else {
    const tokens = search.split(/[,]+|\s+/).map(t=>t.trim()).filter(Boolean);
    items = items.filter(i => tokens.every(tok => (i.title||"").toLowerCase().includes(tok)));
  }
  const starts = (i)=> (i.title||"").toLowerCase().startsWith(search) ? 0 : 1;
  return items.sort((a,b)=> starts(a)-starts(b) || (a.title||"").localeCompare(b.title||"", "pl"));
}
function renderGlobalSearch(){
  const on = !!searchQuery.trim();
  document.body.classList.toggle("gsearch-on", on);
  const body = document.getElementById("gs-body");
  if (!body) return;
  body.innerHTML = "";
  if (!on) return;
  const items = globalSearchItems(searchQuery);
  document.getElementById("gs-head").textContent = `Wyniki (${items.length})`;
  if (!items.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="2">Nic nie znaleziono.</td></tr>`;
    return;
  }
  for (const it of items) {
    const tr = document.createElement("tr");
    tr.dataset.id = it.id;
    const year = String(it.premiere_date||"").slice(0,4);
    const isSeries = it.type === TYPE_SERIES;
    const st = it.status || STATUS_WATCHING;
    tr.innerHTML = `<td class="col-title"><span class="gs-t"></span>${year ? `<span class="gs-y">${escapeHtml(year)}</span>` : ""}</td>
      <td class="col-gs"><span class="gs-kind">${isSeries ? "Serial" : "Film"}</span><span class="gs-st gs-${escapeHtml(st)}">${escapeHtml(GS_STATUS[st] || STATUS_LABELS[st] || "")}</span></td>`;
    tr.querySelector(".gs-t").textContent = it.title || "";
    addDoubleActivation(tr, ()=>openViewDialog(it.id));
    body.appendChild(tr);
  }
}

(function initTagAutocomplete(){
  const searchInput = document.getElementById("search-input");
  const suggestBox = document.getElementById("search-tag-suggest");
  let suggestItems = [];
  let suggestActive = -1;
  let suggestTimer = null;

  function closeSuggest(){
    suggestBox.style.display = "none";
    suggestBox.innerHTML = "";
    suggestItems = [];
    suggestActive = -1;
  }

  function getCurrentToken(){
    const val = searchInput.value;
    const pos = searchInput.selectionStart || val.length;
    const before = val.slice(0, pos);
    const after = val.slice(pos);
    const beforeMatch = before.match(/[^,]*$/);
    const afterMatch = after.match(/^[^,]*/);
    return {
      before: beforeMatch ? beforeMatch[0] : "",
      after: afterMatch ? afterMatch[0] : "",
      start: beforeMatch ? before.length - beforeMatch[0].length : 0,
      end: afterMatch ? pos + afterMatch[0].length : pos,
    };
  }

  function renderSuggest(matches){
    suggestItems = matches;
    suggestActive = -1;
    suggestBox.innerHTML = "";
    if (!matches.length) { closeSuggest(); return; }
    matches.forEach((tag, idx)=>{
      const el = document.createElement("div");
      el.className = "sug";
      el.textContent = tag;
      el.addEventListener("mousedown", (e)=>{
        e.preventDefault();
        applySuggestion(tag);
      });
      suggestBox.appendChild(el);
    });
    suggestBox.style.display = "";
  }

  function applySuggestion(tag){
    const val = searchInput.value;
    const pos = searchInput.selectionStart || val.length;
    const before = val.slice(0, pos);
    const after = val.slice(pos);
    const beforeMatch = before.match(/[^,]*$/);
    const afterMatch = after.match(/^[^,]*/);
    const start = beforeMatch ? before.length - beforeMatch[0].length : 0;
    const end = afterMatch ? pos + afterMatch[0].length : pos;
    const prefix = val.slice(0, start);
    const suffix = val.slice(end);
    const needCommaBefore = prefix.trim() && !prefix.trim().endsWith(",");
    const needCommaAfter = suffix.trim() && !suffix.trim().startsWith(",");
    let newVal = prefix;
    if (needCommaBefore) newVal = newVal.replace(/[\s,]*$/, "") + ", ";
    newVal += "#" + tag;
    if (needCommaAfter) newVal += ", ";
    newVal += suffix;
    searchInput.value = newVal;
    searchQuery = newVal;
    searchMode = getSearchMode(newVal);
    updateSearchPlaceholder();
    const cursorPos = (prefix.replace(/[\s,]*$/,"") + (needCommaBefore ? ", " : "") + "#" + tag).length;
    searchInput.focus();
    searchInput.setSelectionRange(cursorPos, cursorPos);
    closeSuggest();
    runSearchFilter();
  }

  function runSuggest(){
    if (getSearchMode(searchInput.value) !== "tags") { closeSuggest(); return; }
    const tok = getCurrentToken();
    const query = tok.before.trim().replace(/^#/, "").toLowerCase();
    const allTags = getAllTags();
    const used = searchInput.value.split(/[,]+/).map(t=>t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean);
    let matches;
    if (query) {
      matches = allTags.filter(t => t.toLowerCase().includes(query) && !used.includes(t.toLowerCase()));
    } else {
      matches = allTags.filter(t => !used.includes(t.toLowerCase()));
    }
    if (matches.length === 0) { closeSuggest(); return; }
    renderSuggest(matches.slice(0, 12));
  }

  function highlightSuggest(dir){
    if (!suggestItems.length) return;
    suggestActive = (suggestActive + dir + suggestItems.length) % suggestItems.length;
    [...suggestBox.children].forEach((c,i)=>c.classList.toggle("active", i===suggestActive));
  }

  searchInput.addEventListener("input", ()=>{
    if (suggestTimer) clearTimeout(suggestTimer);
    suggestTimer = setTimeout(runSuggest, 150);
  });
  searchInput.addEventListener("focus", ()=>{
    if (getSearchMode(searchInput.value) !== "tags") return;
    if (suggestTimer) clearTimeout(suggestTimer);
    suggestTimer = setTimeout(runSuggest, 0);
  });
  searchInput.addEventListener("keydown", (e)=>{
    if (suggestBox.style.display === "none") return;
    if (e.key === "ArrowDown") { e.preventDefault(); highlightSuggest(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); highlightSuggest(-1); }
    else if (e.key === "Enter" && suggestActive >= 0) { e.preventDefault(); applySuggestion(suggestItems[suggestActive]); }
    else if (e.key === "Escape") { e.stopPropagation(); closeSuggest(); }
  });
  searchInput.addEventListener("blur", ()=>{ setTimeout(closeSuggest, 150); });
})();

