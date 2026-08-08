// ============================================================
// main.js — dodawanie/edycja/usuwanie pozycji, skróty klawiszowe,
// punkt wejścia aplikacji (uruchamiany jako ostatni)
// ============================================================

document.getElementById("btn-add").addEventListener("click", async ()=>{
  const type = await askAddType();
  if (type) addItem(type);
});

async function addItem(type){
  const result = await openItemDialog({item:null, itemType:type});
  if (result) {
    db.items.push(result);
    setDirty(true);
    renderAll();
  }
}

function hasNewlyWatchedEpisode(oldSeasons, newSeasons){
  for (const ns of newSeasons) {
    const os = oldSeasons.find(s=>s.number===ns.number);
    if (!os) continue;
    for (const ep of (ns.episodes||[])) {
      const oe = (os.episodes||[]).find(e=>e.number===ep.number);
      if (ep.watched && (!oe || !oe.watched)) return true;
    }
  }
  return false;
}

async function openEditDialog(id){
  const item = findItem(id);
  if (!item) return;
  const beforeSeasons = item.type === TYPE_SERIES ? JSON.parse(JSON.stringify(item.seasons||[])) : null;
  const result = await openItemDialog({item, itemType:item.type});
  if (result) {
    if (item.type === TYPE_SERIES && beforeSeasons && hasNewlyWatchedEpisode(beforeSeasons, result.seasons||[])) {
      db.items = db.items.filter(i=>i.id!==id);
      db.items.unshift(result);
    }
    setDirty(true);
    renderAll();
  }
}

async function deleteItem(id){
  const item = findItem(id);
  if (!item) return;
  const ok = await showConfirm("Usuń pozycję", `Czy na pewno usunąć „${item.title||""}”?`);
  if (!ok) return;
  db.items = db.items.filter(i=>i.id!==id);
  setDirty(true);
  renderAll();
}

document.addEventListener("keydown", (e)=>{
  if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="s") {
    e.preventDefault();
    saveDb();
  }
  if (e.key === "Delete") {
    const active = document.activeElement;
    if (active && (active.tagName==="INPUT" || active.tagName==="SELECT")) return;
    const id = getSelectedItemId();
    if (id) deleteItem(id);
  }
});

window.addEventListener("beforeunload", (e)=>{
  if (dirty) { e.preventDefault(); e.returnValue = ""; }
});

// Wynik loadFromLocalStorage() nie wpływa na dalszy przebieg — w obu
// przypadkach (baza wczytana lub pusta) trzeba wyrenderować interfejs.
initTabs();
initSettingsTab();
applyButtonStyle();
loadFromLocalStorage();
renderAll();
