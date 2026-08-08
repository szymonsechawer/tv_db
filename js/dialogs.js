// ============================================================
// dialogs.js — generyczne okna modalne (alert/confirm/prompt)
// ============================================================

function openOverlay(innerHtml, {wide=false}={}){
  const root = document.getElementById("modal-root");
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `<div class="modal${wide?' wide':''}">${innerHtml}</div>`;
  root.appendChild(overlay);
  return overlay;
}
function closeOverlay(overlay){
  overlay.remove();
}
function isTopOverlay(overlay){
  const root = document.getElementById("modal-root");
  return root.lastElementChild === overlay;
}

function showAlert(title, message, kind="info"){
  return new Promise(resolve=>{
    const icon = kind==="error" ? "⚠" : "ℹ";
    const overlay = openOverlay(`
      <div class="modal-header">${escapeHtml(title)}</div>
      <div class="modal-body">
        <div class="msg-box">
          <div class="msg-icon ${kind==="error"?"error":"info"}">${icon}</div>
          <div class="msg-text">${escapeHtml(message)}</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" id="ok-btn">OK</button>
      </div>
    `);
    const ok = overlay.querySelector("#ok-btn");
    ok.focus();
    function finish(){ closeOverlay(overlay); document.removeEventListener("keydown", onKey); resolve(); }
    function onKey(e){ if (!isTopOverlay(overlay)) return; if (e.key==="Enter"||e.key==="Escape") finish(); }
    ok.addEventListener("click", finish);
    document.addEventListener("keydown", onKey);
  });
}

function showConfirm(title, message){
  return new Promise(resolve=>{
    const overlay = openOverlay(`
      <div class="modal-header">${escapeHtml(title)}</div>
      <div class="modal-body">
        <div class="msg-box">
          <div class="msg-icon info">?</div>
          <div class="msg-text">${escapeHtml(message)}</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn secondary" id="no-btn">Nie</button>
        <button class="btn" id="yes-btn">Tak</button>
      </div>
    `);
    function finish(v){ closeOverlay(overlay); document.removeEventListener("keydown", onKey); resolve(v); }
    function onKey(e){ if (!isTopOverlay(overlay)) return; if (e.key==="Escape") finish(false); if (e.key==="Enter") finish(true); }
    overlay.querySelector("#yes-btn").addEventListener("click", ()=>finish(true));
    overlay.querySelector("#no-btn").addEventListener("click", ()=>finish(false));
    overlay.querySelector("#yes-btn").focus();
    document.addEventListener("keydown", onKey);
  });
}

function showAddSeasonPrompt(suggestedNumber){
  return new Promise(resolve=>{
    const overlay = openOverlay(`
      <div class="modal-header">Dodaj sezon</div>
      <div class="modal-body">
        <div class="form-row"><label style="min-width:150px;">Numer sezonu:</label>
          <input class="entry" id="add-season-number" type="number" min="1" value="${suggestedNumber}" style="flex:1;">
        </div>
        <div class="form-row"><label style="min-width:150px;">Liczba odcinków:</label>
          <input class="entry" id="add-season-count" type="number" min="0" value="1" style="flex:1;">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn secondary" id="cancel-add-season-btn">Anuluj</button>
        <button class="btn" id="confirm-add-season-btn">Dodaj</button>
      </div>
    `);
    const numInput = overlay.querySelector("#add-season-number");
    const countInput = overlay.querySelector("#add-season-count");
    function finish(v){ closeOverlay(overlay); document.removeEventListener("keydown", onKey); resolve(v); }
    function submit(){
      const number = parseInt(numInput.value, 10);
      const count = parseInt(countInput.value, 10);
      if (!Number.isFinite(number) || number < 1) { numInput.focus(); return; }
      if (!Number.isFinite(count) || count < 0) { countInput.focus(); return; }
      finish({number, count});
    }
    function onKey(e){ if (!isTopOverlay(overlay)) return; if (e.key==="Escape") finish(null); if (e.key==="Enter") submit(); }
    overlay.querySelector("#confirm-add-season-btn").addEventListener("click", submit);
    overlay.querySelector("#cancel-add-season-btn").addEventListener("click", ()=>finish(null));
    document.addEventListener("keydown", onKey);
    numInput.focus();
  });
}

function askAddType(){
  return new Promise(resolve=>{
    const overlay = openOverlay(`
      <div class="modal-header">Co chcesz dodać?</div>
      <div class="modal-body">
        <div class="form-row" style="gap:10px;">
          <button class="btn" id="add-type-movie" style="flex:1;padding:16px;font-size:15px;">Film</button>
          <button class="btn" id="add-type-series" style="flex:1;padding:16px;font-size:15px;">Serial</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn secondary" id="add-type-cancel">Anuluj</button>
      </div>
    `);
    function finish(v){ closeOverlay(overlay); document.removeEventListener("keydown", onKey); resolve(v); }
    function onKey(e){ if (!isTopOverlay(overlay)) return; if (e.key==="Escape") finish(null); }
    overlay.querySelector("#add-type-movie").addEventListener("click", ()=>finish(TYPE_MOVIE));
    overlay.querySelector("#add-type-series").addEventListener("click", ()=>finish(TYPE_SERIES));
    overlay.querySelector("#add-type-cancel").addEventListener("click", ()=>finish(null));
    document.addEventListener("keydown", onKey);
  });
}

function askInt({title, prompt, initial=null, min=null, max=null}){
  return new Promise(resolve=>{
    const overlay = openOverlay(`
      <div class="modal-header">${escapeHtml(title)}</div>
      <div class="modal-body">
        <div class="msg-text" style="margin-bottom:10px;">${escapeHtml(prompt)}</div>
        <input class="entry" id="int-input" type="number" inputmode="numeric" style="width:100%;text-align:center;" value="${initial===null?'':initial}">
        <div class="error-text" id="int-error"></div>
      </div>
      <div class="modal-footer">
        <button class="btn secondary" id="cancel-btn">Anuluj</button>
        <button class="btn" id="ok-btn">OK</button>
      </div>
    `);
    const input = overlay.querySelector("#int-input");
    const errorEl = overlay.querySelector("#int-error");
    input.focus();
    input.select();

    function finish(v){ closeOverlay(overlay); document.removeEventListener("keydown", onKey); resolve(v); }
    function onOk(){
      const raw = input.value.trim();
      if (raw === "") { finish(null); return; }
      const val = parseInt(raw,10);
      if (!Number.isFinite(val) || String(val)!==raw.replace(/^\+/,"")) {
        errorEl.textContent = "Wpisz liczbę całkowitą.";
        return;
      }
      if (min!==null && val < min) { errorEl.textContent = `Wartość musi być ≥ ${min}.`; return; }
      if (max!==null && val > max) { errorEl.textContent = `Wartość musi być ≤ ${max}.`; return; }
      finish(val);
    }
    function onKey(e){
      if (!isTopOverlay(overlay)) return;
      if (e.key==="Escape") finish(null);
    }
    input.addEventListener("keydown", e=>{ if (e.key==="Enter") onOk(); });
    overlay.querySelector("#ok-btn").addEventListener("click", onOk);
    overlay.querySelector("#cancel-btn").addEventListener("click", ()=>finish(null));
    document.addEventListener("keydown", onKey);
  });
}

function askText({title, prompt, initial="", password=false}){
  return new Promise(resolve=>{
    const overlay = openOverlay(`
      <div class="modal-header">${escapeHtml(title)}</div>
      <div class="modal-body">
        <div class="msg-text" style="margin-bottom:10px;">${escapeHtml(prompt)}</div>
        <input class="entry" id="txt-input" type="${password?"password":"text"}" style="width:100%;" value="${escapeHtml(initial)}">
      </div>
      <div class="modal-footer">
        <button class="btn secondary" id="cancel-btn">Anuluj</button>
        <button class="btn" id="ok-btn">OK</button>
      </div>
    `);
    const input = overlay.querySelector("#txt-input");
    input.focus(); input.select();
    function finish(v){ closeOverlay(overlay); document.removeEventListener("keydown", onKey); resolve(v); }
    function onOk(){ finish(input.value.trim() || null); }
    function onKey(e){ if (!isTopOverlay(overlay)) return; if (e.key==="Escape") finish(null); }
    input.addEventListener("keydown", e=>{ if (e.key==="Enter") onOk(); });
    overlay.querySelector("#ok-btn").addEventListener("click", onOk);
    overlay.querySelector("#cancel-btn").addEventListener("click", ()=>finish(null));
    document.addEventListener("keydown", onKey);
  });
}

