// ============================================================
// notes.js — zakładka notatek
// ============================================================

function initNotesAutosave(){
  document.getElementById("btn-notes-back").addEventListener("click", ()=>{ notesView = "grid"; renderNotesTab(); });
  const ta = document.getElementById("note-content");
  const titleInput = document.getElementById("note-title");

  ta.addEventListener("input", ()=>{
    const note = findNote(activeNoteId);
    if (!note) return;
    note.content = ta.value;
    note.updated = Date.now();
    setDirty(true);
    renderNotesList();
  });

  const commitTitle = ()=>{
    const note = findNote(activeNoteId);
    if (!note) return;
    const val = titleInput.value.trim() || "Bez nazwy";
    if (val === note.title) return;
    note.title = val;
    note.updated = Date.now();
    setDirty(true);
    renderNotesList();
  };
  titleInput.addEventListener("blur", commitTitle);
  titleInput.addEventListener("keydown", (e)=>{ if (e.key==="Enter") { e.preventDefault(); titleInput.blur(); } });

  document.getElementById("btn-rename-note").addEventListener("click", async ()=>{
    const note = findNote(activeNoteId);
    if (!note) return;
    const val = await askText({title:"Zmień nazwę", prompt:"Nowa nazwa notatki:", initial: note.title});
    if (val===null) return;
    note.title = val.trim() || "Bez nazwy";
    note.updated = Date.now();
    setDirty(true);
    renderNotesTab();
  });

  document.getElementById("btn-new-note").addEventListener("click", async ()=>{
    const val = await askText({title:"Nowa notatka", prompt:"Nazwa notatki:", initial:""});
    if (val===null) return;
    const note = makeNote(val.trim() || "Nowa notatka", "");
    db.notes.push(note);
    activeNoteId = note.id;
    notesView = "edit";
    setDirty(true);
    renderNotesTab();
    document.getElementById("note-content").focus();
  });

  document.getElementById("btn-delete-note").addEventListener("click", async ()=>{
    const note = findNote(activeNoteId);
    if (!note) return;
    const ok = await showConfirm("Usuń notatkę", `Czy na pewno usunąć notatkę „${note.title}”?`);
    if (!ok) return;
    db.notes = db.notes.filter(n=>n.id!==note.id);
    activeNoteId = db.notes.length ? db.notes[0].id : null;
    notesView = "grid";
    setDirty(true);
    renderNotesTab();
  });
}

// Widok notatek: "grid" — kafelki-karteczki, "edit" — otwarta notatka
let notesView = "grid";
const NOTE_COLORS = ["#3b8fd9","#e0a43c","#d9534f","#7b5cd6","#3ba55d","#17bebb","#f28482","#2e86ab","#c4492f"];
const NOTE_MON = ["sty","lut","mar","kwi","maj","cze","lip","sie","wrz","paź","lis","gru"];
function noteShortDate(ts){ if (!ts) return ""; const d = new Date(ts); return `${d.getDate()} ${NOTE_MON[d.getMonth()]}`; }
function noteLines(note){ return (note.content||"").split("\n").filter(l=>l.trim()).length; }
function notePosWord(n){ return n===1 ? "pozycja" : (n%10>=2 && n%10<=4 && !(n%100>=12 && n%100<=14)) ? "pozycje" : "pozycji"; }

function renderNotesGrid(){
  const grid = document.getElementById("notes-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const add = document.createElement("button");
  add.type = "button"; add.className = "note-tile note-add";
  add.innerHTML = `<span class="na-plus">+</span><span>Nowa notatka</span>`;
  add.addEventListener("click", ()=>document.getElementById("btn-new-note").click());
  grid.appendChild(add);
  db.notes.forEach((note, idx)=>{
    const t = document.createElement("button");
    t.type = "button"; t.className = "note-tile";
    t.style.setProperty("--c", NOTE_COLORS[idx % NOTE_COLORS.length]);
    const prev = (note.content||"").split("\n").map(l=>l.trim().replace(/^[-—•]\s*/, "")).filter(Boolean).slice(0, 6).join(" · ") || "Pusta notatka";
    const n = noteLines(note);
    t.innerHTML = `<b></b><p></p><small>${escapeHtml(noteShortDate(note.updated))} · ${n} ${notePosWord(n)}</small>`;
    t.querySelector("b").textContent = note.title;
    t.querySelector("p").textContent = prev;
    t.addEventListener("click", ()=>{ activeNoteId = note.id; notesView = "edit"; renderNotesTab(); });
    grid.appendChild(t);
  });
}

function renderNotesList(){
  const list = document.getElementById("notes-list");
  if (!list) return;
  list.innerHTML = "";
  const notes = [...db.notes];
  for (const note of notes) {
    const div = document.createElement("div");
    div.className = "note-item" + (note.id===activeNoteId ? " active" : "");
    const preview = (note.content||"").split("\n").map(s=>s.trim()).find(Boolean) || "Pusta notatka";
    div.innerHTML = `${escapeHtml(note.title)}<span class="note-sub">${escapeHtml(preview.slice(0,40))}</span>`;
    div.addEventListener("click", ()=>{ activeNoteId = note.id; renderNotesTab(); });
    list.appendChild(div);
  }
}

function renderNotesTab(){
  const editor = document.getElementById("notes-editor");
  const empty = document.getElementById("notes-empty");
  if (!editor) return;
  if (activeNoteId && !findNote(activeNoteId)) activeNoteId = null;
  if (!activeNoteId && db.notes.length) activeNoteId = db.notes[0].id;
  const note = findNote(activeNoteId);
  renderNotesList();
  const layout = document.getElementById("notes-layout");
  if (!note) notesView = "grid";
  if (layout) {
    layout.classList.toggle("notes-grid-mode", notesView === "grid");
    layout.classList.toggle("notes-edit-mode", notesView === "edit");
  }
  if (notesView === "grid") { renderNotesGrid(); editor.style.display = "none"; empty.style.display = "none"; return; }
  const dEl = document.getElementById("note-date");
  if (dEl && note) dEl.textContent = note.updated ? "Zmieniono " + formatDateDMY(new Date(note.updated).toISOString().slice(0,10)) : "";
  if (!note) {
    editor.style.display = "none";
    empty.style.display = "flex";
    return;
  }
  editor.style.display = "flex";
  empty.style.display = "none";
  const titleInput = document.getElementById("note-title");
  const ta = document.getElementById("note-content");
  if (titleInput !== document.activeElement) titleInput.value = note.title;
  if (ta !== document.activeElement) ta.value = note.content || "";
}

