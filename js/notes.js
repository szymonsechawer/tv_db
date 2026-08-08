// ============================================================
// notes.js — zakładka notatek
// ============================================================

function initNotesAutosave(){
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
    setDirty(true);
    renderNotesTab();
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

