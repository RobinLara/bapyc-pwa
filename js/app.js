// ─────────────────────────────────────────────────────────────────────────────
// BAPyC · PWA — controlador de la interfaz (flujo dinámico completo)
//
// Reutiliza la UI/interacción del prototipo, pero:
//   · carga el banco v2 REAL (34 preguntas, 11 condiciones) vía engine.loadBank
//   · calcula resultados y reporte con el motor portado (evaluate / buildReport)
//   · persiste el avance en localStorage y comparte con navigator.share (iPhone)
//
// Identidad de familia = KEY del banco (actitudinal, pedagogica, …) en todo el
// estado, para que las rutas/ejemplos adaptados por condición coincidan.
// ─────────────────────────────────────────────────────────────────────────────

import { loadBank, evaluate, buildReport, contextTag, scopeLabel as engineScopeLabel } from "./engine.js";

// ── Íconos SVG ───────────────────────────────────────────────────────────────
const IC = {
  act:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/></svg>',
  cul:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/></svg>',
  ped:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5a2 2 0 012-2h11a1 1 0 011 1v13"/><path d="M6 17h13"/><path d="M9 7h6"/></svg>',
  fis:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V10l8-6 8 6v11"/><path d="M4 21h16"/><path d="M14 21v-6a2 2 0 00-4 0v6"/></svg>',
  nor:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
  escolar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/></svg>',
  aulico:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5a2 2 0 012-2h11a1 1 0 011 1v13"/><path d="M6 17h13"/></svg>',
  sociofamiliar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M5 12l5 5L20 6"/></svg>',
  person:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
  group:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.3 3-5 6.5-5s6.5 1.7 6.5 5"/><path d="M16 4.6a3.2 3.2 0 010 6.8"/><path d="M17.6 15.1c2.6.4 4.4 2 4.4 4.9"/></svg>',
  school:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V9l7-4 7 4v12"/><path d="M9 21v-5h6v5"/><path d="M10 12h4"/></svg>',
};
const SCOPE_IC = { alumno:"person", grupo:"group", escuela:"school" };
// Presentación (color/fondo/ícono) por id de familia — no vive en el banco.
const PRES = {
  act:{ color:"--socio",   bg:"--socio-bg",  icon:"act" },
  cul:{ color:"--warn",    bg:"--warn-bg",   icon:"cul" },
  ped:{ color:"--escolar", bg:"--escolar-bg",icon:"ped" },
  fis:{ color:"--aulico",  bg:"--aulico-bg", icon:"fis" },
  nor:{ color:"--teal",    bg:"--teal-ctr",  icon:"nor" },
};
const cvar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const $ = (id) => document.getElementById(id);
const STORE_KEY = "bapyc.pwa.state.v1";

// ── Modelos de vista (derivados del banco) ───────────────────────────────────
let BANK, FAMS, CTX, SCOPES, CONDITIONS, FAM_BY_KEY;

function buildViewModels(bank) {
  FAMS = bank.families.map((f) => {
    const p = PRES[f.id] || PRES.ped;
    return {
      id: f.id, key: f.key, name: f.name, sing: f.sing, sub: f.sub,
      color: p.color, bg: p.bg, icon: IC[p.icon] || IC.ped,
      ev: f.evidenceChips,
      questions: f.questions,               // {id,text,expl,examples,strategy}
    };
  });
  FAM_BY_KEY = Object.fromEntries(FAMS.map((f) => [f.key, f]));
  CTX = bank.contexts.map((c) => ({ id: c.id, name: c.name, tag: c.tag, desc: c.desc }));
  SCOPES = bank.scopes.map((s) => ({ ...s, iconName: SCOPE_IC[s.id] || "person" }));
  CONDITIONS = bank.conditions.map((c) => ({ id: c.id, name: c.name, fams: c.fams, ex: c.ex, routes: c.routes, questions: c.questions, adapts: c.adapts }));
}

// ── Estado ───────────────────────────────────────────────────────────────────
const freshState = () => ({
  scope: { type: null, ref: "", cond: null },
  lights: {},            // famKey -> "green"|"amber"|"red"
  order: [],             // famKeys a explorar
  di: 0, qi: 0,
  answers: {},           // "famKey-qi" -> { questionId, familyId, q, val, ctx:[] }
  custom: [],            // { desc, famId(key|null), ctx:[] }
  pendingCard: null, pendingCtx: new Set(),
});
let state = freshState();

function persist() {
  const s = { ...state, pendingCtx: undefined, order: state.order };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {}
}
function restore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s || !s.scope) return false;
    state = { ...freshState(), ...s, pendingCtx: new Set() };
    state.order = Array.isArray(s.order) ? s.order : [];
    return !!state.scope.type;
  } catch { return false; }
}

// ── Navegación de vistas ─────────────────────────────────────────────────────
const views = {};
function go(name) {
  Object.values(views).forEach((v) => v.classList.remove("active"));
  views[name].classList.add("active");
  const b = views[name].querySelector(".body"); if (b) b.scrollTop = 0;
}

// ── Toast ────────────────────────────────────────────────────────────────────
let toastT;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("up");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("up"), 1900);
}

// ── Alcance (VIEW 0) ─────────────────────────────────────────────────────────
function scopeLabel() {
  if (!state.scope.type) return "";
  return engineScopeLabel(state.scope.type, state.scope.ref, BANK);
}
function updateScopeBadge() {
  const w = $("scopeBadgeWrap"); if (!w) return;
  const lbl = scopeLabel();
  w.innerHTML = lbl
    ? `<span class="scope-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/></svg>Valoración: ${esc(lbl)}</span>`
    : "";
}
function activeCond() {
  const id = state.scope.cond; if (!id) return null;
  const c = CONDITIONS.find((x) => x.id === id);
  return c && c.adapts ? c : null;
}

function setupScope() {
  const scopeList = $("scopeList");
  scopeList.innerHTML = "";
  SCOPES.forEach((s) => {
    const el = document.createElement("div");
    el.className = "scope-card"; el.dataset.s = s.id;
    if (state.scope.type === s.id) el.classList.add("on");
    el.innerHTML = `<div class="scope-ic">${IC[s.iconName]}</div>
      <div><div class="scope-tt">${esc(s.name)}</div>${s.sub ? `<div class="scope-sub">${esc(s.sub)}</div>` : ""}</div>
      <div class="scope-chk">${IC.check}</div>`;
    scopeList.appendChild(el);
  });

  const scopeRef = $("scopeRef"), scopeRefLbl = $("scopeRefLbl"), scopeRefInput = $("scopeRefInput"),
        toSemaforo = $("toSemaforo"), scopeNote = $("scopeNote"), scopeCond = $("scopeCond"),
        condLbl = $("condLbl"), condSelect = $("condSelect"), condSelectText = $("condSelectText"),
        condSheet = $("condSheet"), condScrim = $("condScrim"), condOptList = $("condOptList");

  const condCheck = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M5 12l5 5L20 6"/></svg>';
  const renderCondOpts = () => {
    const opts = [{ id: "", name: "Ninguna / no especificar" }].concat(CONDITIONS);
    condOptList.innerHTML = opts.map((o) =>
      `<div class="cond-opt${(state.scope.cond || "") === o.id ? " on" : ""}" data-cid="${o.id}">${esc(o.name)}<span class="rc">${condCheck}</span></div>`).join("");
  };
  const setCond = (id) => {
    state.scope.cond = id || null;
    const cn = id ? CONDITIONS.find((c) => c.id === id) : null;
    condSelectText.textContent = cn ? cn.name : "Selecciona una condición…";
    condSelectText.classList.toggle("ph", !cn);
    condSelect.classList.toggle("chosen", !!cn);
  };
  const refreshCondLbl = () => {
    const nm = state.scope.ref;
    condLbl.textContent = `¿${nm || "Este alumno o alumna"} enfrenta alguna condición? (opcional)`;
  };
  const closeCondSheet = () => { condSheet.classList.remove("up"); condScrim.classList.remove("up"); };

  condSelect.onclick = () => { renderCondOpts(); condSheet.classList.add("up"); condScrim.classList.add("up"); };
  condOptList.onclick = (e) => { const o = e.target.closest(".cond-opt"); if (!o) return; setCond(o.dataset.cid); closeCondSheet(); persist(); };
  condScrim.onclick = closeCondSheet;

  const selectScope = (id) => {
    scopeList.querySelectorAll(".scope-card").forEach((x) => x.classList.toggle("on", x.dataset.s === id));
    const s = SCOPES.find((x) => x.id === id);
    state.scope.type = s.id;
    scopeRef.style.display = "block"; scopeRefLbl.textContent = s.ref; scopeRefInput.value = state.scope.ref || "";
    const isAlumno = !!s.allowsCondition || s.id === "alumno";
    scopeCond.style.display = isAlumno ? "block" : "none";
    if (!isAlumno) setCond(null); else { refreshCondLbl(); setCond(state.scope.cond); }
    toSemaforo.disabled = false;
    scopeNote.textContent = "El identificador y la condición son opcionales — puedes continuar";
  };
  scopeList.onclick = (e) => { const c = e.target.closest(".scope-card"); if (!c) return; selectScope(c.dataset.s); persist(); };
  scopeRefInput.oninput = () => { state.scope.ref = scopeRefInput.value.trim(); refreshCondLbl(); persist(); };
  toSemaforo.onclick = () => { updateScopeBadge(); updateCondAdaptation(); go("semaforo"); };
  $("backScope").onclick = () => go("scope");
  $("backToInicio").onclick = () => go("inicio");

  // rehidratar si venimos de una sesión guardada
  if (state.scope.type) selectScope(state.scope.type);
}

// Adaptación por condición en el semáforo (nota + familias sugeridas)
function updateCondAdaptation() {
  const c = activeCond();
  const note = $("condNote");
  document.querySelectorAll(".fam .fam-sug").forEach((s) => (s.style.display = "none"));
  if (!c) { if (note) note.innerHTML = ""; return; }
  const names = c.fams.map((k) => (FAM_BY_KEY[k] ? FAM_BY_KEY[k].name : k)).join(" · ");
  c.fams.forEach((k) => { const card = document.querySelector(`.fam[data-fam="${k}"] .fam-sug`); if (card) card.style.display = "inline-block"; });
  if (note) note.innerHTML = `<div class="cond-note"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg><div>Adaptado a <b>${esc(c.name)}</b>. Suelen contener barreras que pasan desapercibidas — te sugerimos revisar <b>${esc(names)}</b>.</div></div>`;
}

// ── Semáforo (VIEW 1) ────────────────────────────────────────────────────────
function setupSemaforo() {
  const famList = $("famList");
  famList.innerHTML = "";
  FAMS.forEach((f) => {
    const el = document.createElement("div");
    el.className = "fam"; el.dataset.fam = f.key;
    el.innerHTML = `
      <div class="fam-top">
        <div class="fam-ic" style="background:${cvar(f.bg)};color:${cvar(f.color)}">${f.icon}</div>
        <div><div class="fam-tt">${esc(f.name)}<span class="fam-sug" style="display:none">sugerida</span></div><div class="fam-sub">${esc(f.sub)}</div></div>
      </div>
      <div class="light-row">
        <div class="light" data-v="green" data-f="${f.key}"><span class="bulb"></span><span class="lbl">Sin señal</span></div>
        <div class="light" data-v="amber" data-f="${f.key}"><span class="bulb"></span><span class="lbl">Con dudas</span></div>
        <div class="light" data-v="red" data-f="${f.key}"><span class="bulb"></span><span class="lbl">Me preocupa</span></div>
      </div>`;
    famList.appendChild(el);
    // rehidratar selección
    if (state.lights[f.key]) el.querySelector(`.light[data-v="${state.lights[f.key]}"]`)?.classList.add("sel");
  });

  const toSwipe = $("toSwipe"), semNote = $("semNote");
  const refreshSem = () => {
    const flagged = FAMS.filter((f) => state.lights[f.key] === "amber" || state.lights[f.key] === "red");
    const anyMarked = Object.keys(state.lights).length > 0;
    toSwipe.disabled = flagged.length === 0;
    if (flagged.length) semNote.textContent = `${flagged.length} familia(s) por explorar · ${FAMS.length - flagged.length} se omiten`;
    else if (anyMarked) semNote.textContent = "Todo sin señal — marca 🟡 o 🔴 para explorar";
    else semNote.textContent = "Marca al menos una familia para continuar";
  };

  famList.onclick = (e) => {
    const l = e.target.closest(".light"); if (!l) return;
    l.parentElement.querySelectorAll(".light").forEach((x) => x.classList.remove("sel"));
    l.classList.add("sel"); state.lights[l.dataset.f] = l.dataset.v;
    refreshSem(); persist();
  };
  toSwipe.onclick = () => {
    const order = FAMS.filter((f) => state.lights[f.key] === "amber" || state.lights[f.key] === "red").map((f) => f.key);
    if (!order.length) return;
    state.order = order;
    state.di = 0; state.qi = 0; persist(); go("swipe"); renderDeck();
  };
  $("backSem").onclick = () => go("semaforo");
  $("addBarBtn").onclick = openBarSheet;
  refreshSem();
  updateCondAdaptation();
}

// ── Swipe / Deck (VIEW 2) ────────────────────────────────────────────────────
const orderFams = () => state.order.map((k) => FAM_BY_KEY[k]).filter(Boolean);
// Preguntas de la baraja para una familia: propias de la condición si existen, si no las genéricas.
const deckQs = (fam) => (fam ? BANK.deckQuestions(fam.key, state.scope.cond) : []);
const totalCards = () => orderFams().reduce((a, f) => a + deckQs(f).length, 0);
const doneCards = () => { const of = orderFams(); let n = 0; for (let i = 0; i < state.di; i++) n += deckQs(of[i]).length; return n + state.qi; };

function renderDeck() {
  const of = orderFams();
  const fam = of[state.di];
  if (!fam) { buildEvidence(); go("evidencia"); return; }
  const qs = deckQs(fam);
  const deck = $("deck");
  $("swKicker").textContent = `Paso 2 de 4 · Familia ${state.di + 1} de ${of.length}`;
  $("deckFam").innerHTML = `<span class="d" style="background:${cvar(fam.bg)};color:${cvar(fam.color)}">${fam.icon}</span>Barreras ${esc(fam.name.toLowerCase())}`;
  $("deckCount").textContent = `${state.qi + 1}/${qs.length}`;
  $("swBar").style.width = (doneCards() / totalCards() * 100) + "%";
  const pv = $("prevCardBtn"); if (pv) pv.style.display = (state.di > 0 || state.qi > 0) ? "flex" : "none";
  deck.innerHTML = "";
  for (let k = Math.min(qs.length - 1, state.qi + 1); k >= state.qi; k--) {
    const c = document.createElement("div"); c.className = "swcard";
    const depth = k - state.qi;
    c.style.transform = `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`;
    c.style.zIndex = 10 - depth; c.style.opacity = depth ? 0.6 : 1;
    c.innerHTML = `
      <span class="chip" style="background:${cvar(fam.bg)};color:${cvar(fam.color)}">Barreras ${esc(fam.name.toLowerCase())}</span>
      <div class="q">${esc(qs[k].text)}</div>
      <button class="card-help" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 0c0 1.7-2.5 2-2.5 4"/><path d="M12 17h.01"/></svg>¿Qué observar? · ejemplos</button>
      <div class="hint"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 8v5M12 16h.01"/><circle cx="12" cy="12" r="9"/></svg>¿Esta barrera está presente en tu contexto?</div>
      <div class="stamp yes">Sí</div><div class="stamp no">No</div>`;
    deck.appendChild(c);
  }
  attachDrag();
}
const topCard = () => $("deck").querySelector(".swcard:last-child");
const gone = (card) => card && (card.classList.contains("gone-yes") || card.classList.contains("gone-no") || card.classList.contains("gone-idk"));

function answer(val) {
  const fam = orderFams()[state.di], card = topCard();
  if (!card || !fam || gone(card)) return;
  const q = deckQs(fam)[state.qi];
  if (val === "yes") {
    state.pendingCard = { questionId: q.id, familyId: fam.key, q: q.text };
    state.pendingCtx = new Set(); openCtx();
    const st = card.querySelector(".stamp.yes"); if (st) st.style.opacity = 1;
    return;
  }
  card.classList.add(val === "no" ? "gone-no" : "gone-idk");
  const st = card.querySelector(".stamp.no"); if (val === "no" && st) st.style.opacity = 1;
  state.answers[fam.key + "-" + state.qi] = { questionId: q.id, familyId: fam.key, q: q.text, val, ctx: [] };
  persist(); setTimeout(nextCard, 300);
}
function nextCard() {
  const of = orderFams(); const fam = of[state.di];
  if (!fam) { renderDeck(); return; }
  state.qi++;
  if (state.qi >= deckQs(fam).length) { state.di++; state.qi = 0; }
  persist(); renderDeck();
}
function prevCard() {
  const of = orderFams();
  if (state.qi > 0) state.qi--;
  else if (state.di > 0) { state.di--; state.qi = deckQs(of[state.di]).length - 1; }
  else return;
  const fam = orderFams()[state.di];
  delete state.answers[fam.key + "-" + state.qi];
  persist(); renderDeck();
}

// Gesto de arrastre en la tarjeta superior (derecha=Sí, izquierda=No, abajo=No sé)
function attachDrag() {
  const card = topCard(); if (!card) return;
  let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false;
  const stampYes = card.querySelector(".stamp.yes"), stampNo = card.querySelector(".stamp.no");
  const down = (x, y) => { sx = x; sy = y; dragging = true; card.style.transition = "none"; };
  const move = (x, y) => {
    if (!dragging) return;
    dx = x - sx; dy = y - sy;
    card.style.transform = `translate(${dx}px, ${Math.max(dy, -40)}px) rotate(${dx * 0.04}deg)`;
    if (stampYes) stampYes.style.opacity = dx > 30 ? Math.min(dx / 120, 1) : 0;
    if (stampNo) stampNo.style.opacity = dx < -30 ? Math.min(-dx / 120, 1) : 0;
  };
  const up = () => {
    if (!dragging) return; dragging = false; card.style.transition = "";
    const TH = 90;
    if (dx > TH) { answer("yes"); }
    else if (dx < -TH) { answer("no"); }
    else if (dy > TH * 1.4) { openHelp(); card.style.transform = ""; }
    else { card.style.transform = ""; if (stampYes) stampYes.style.opacity = 0; if (stampNo) stampNo.style.opacity = 0; }
  };
  card.addEventListener("pointerdown", (e) => { if (e.target.closest(".card-help")) return; card.setPointerCapture?.(e.pointerId); down(e.clientX, e.clientY); });
  card.addEventListener("pointermove", (e) => move(e.clientX, e.clientY));
  card.addEventListener("pointerup", up);
  card.addEventListener("pointercancel", up);
}

// Contexto (hoja)
function setupContextSheet() {
  const ctxOpts = $("ctxOpts");
  ctxOpts.innerHTML = "";
  CTX.forEach((c) => {
    const bg = c.id === "escolar" ? "--escolar-bg" : c.id === "aulico" ? "--aulico-bg" : "--socio-bg";
    const fg = c.id === "escolar" ? "--escolar" : c.id === "aulico" ? "--aulico" : "--socio";
    const o = document.createElement("div"); o.className = "ctx-opt"; o.dataset.c = c.id;
    o.innerHTML = `<div class="cic" style="background:${cvar(bg)};color:${cvar(fg)}">${IC[c.id]}</div>
      <div><div class="cn">${esc(c.name)}</div><div class="cd">${esc(c.desc)}</div></div><div class="chk">${IC.check}</div>`;
    ctxOpts.appendChild(o);
  });
  ctxOpts.onclick = (e) => {
    const o = e.target.closest(".ctx-opt"); if (!o) return;
    const id = o.dataset.c;
    if (state.pendingCtx.has(id)) { state.pendingCtx.delete(id); o.classList.remove("on"); }
    else { state.pendingCtx.add(id); o.classList.add("on"); }
  };
  $("ctxConfirm").onclick = () => {
    const fam = orderFams()[state.di], card = topCard();
    state.answers[fam.key + "-" + state.qi] = { ...state.pendingCard, val: "yes", ctx: [...state.pendingCtx] };
    $("ctxSheet").classList.remove("up"); $("ctxScrim").classList.remove("up");
    if (card) card.classList.add("gone-yes");
    persist(); setTimeout(nextCard, 300);
  };
  const cancelCtx = () => {
    $("ctxSheet").classList.remove("up"); $("ctxScrim").classList.remove("up");
    const st = topCard() && topCard().querySelector(".stamp.yes"); if (st) st.style.opacity = 0;
  };
  $("ctxCancel").onclick = cancelCtx; $("ctxScrim").onclick = cancelCtx;
}
function openCtx() { $("ctxOpts").querySelectorAll(".ctx-opt").forEach((o) => o.classList.remove("on")); $("ctxSheet").classList.add("up"); $("ctxScrim").classList.add("up"); }

// Ayuda por pregunta
function openHelp() {
  const fam = orderFams()[state.di]; if (!fam) return;
  const q = deckQs(fam)[state.qi];
  $("helpFam").innerHTML = `<span class="d" style="background:${cvar(fam.bg)};color:${cvar(fam.color)}">${fam.icon}</span><span style="color:${cvar(fam.color)}">Barreras ${esc(fam.name.toLowerCase())}</span>`;
  $("helpFam").style.background = cvar(fam.bg);
  $("helpQ").textContent = q.text;
  $("helpExpl").textContent = q.expl || "";
  const c = activeCond();
  // Si la pregunta ya es propia de la condición, sus ejemplos ya son específicos;
  // si es genérica, aplicamos el override de ejemplos de la condición (ex) si existe.
  const usingCondQ = !!(c && c.questions && c.questions[fam.key] && c.questions[fam.key].length);
  const condEx = (!usingCondQ && c && c.ex) ? c.ex[fam.key] : null;
  const exList = (condEx && condEx.length) ? condEx : (q.examples || []);
  const adapted = (condEx && condEx.length) || usingCondQ;
  $("helpExLbl").innerHTML = adapted ? `Ejemplos <span class="ad">· ${esc(c.name)}</span>` : "Ejemplos";
  $("helpEx").innerHTML = exList.map((x) => `<li>${esc(x)}</li>`).join("");
  $("helpSheet").classList.add("up"); $("helpScrim").classList.add("up");
}
function setupHelpSheet() {
  const close = () => { $("helpSheet").classList.remove("up"); $("helpScrim").classList.remove("up"); };
  $("helpScrim").onclick = close;
  $("helpSheet").onclick = (e) => { const b = e.target.closest("[data-a]"); if (!b) return; close(); setTimeout(() => answer(b.dataset.a), 60); };
  $("deck").addEventListener("click", (e) => { if (e.target.closest(".card-help")) openHelp(); });
  $("btnNo").onclick = () => answer("no");
  $("btnIdk").onclick = () => openHelp();
  $("btnYes").onclick = () => answer("yes");
  $("prevCardBtn").onclick = prevCard;
}

// ── Evidencia (VIEW 3) ───────────────────────────────────────────────────────
const presentBarriers = () => Object.values(state.answers).filter((a) => a.val === "yes");
function buildEvidence() {
  const evList = $("evList"); evList.innerHTML = "";
  const yes = presentBarriers();
  if (!yes.length) {
    const d = document.createElement("div"); d.className = "ev-card";
    d.innerHTML = '<div class="ev-q" style="text-align:center;color:var(--ink3)">No marcaste barreras como presentes. Puedes ir a resultados o regresar a explorar.</div>';
    evList.appendChild(d); return;
  }
  yes.forEach((a) => {
    const fam = FAM_BY_KEY[a.familyId];
    const card = document.createElement("div"); card.className = "ev-card";
    const ctxTags = (a.ctx || []).map((c) => `<span class="tag ${c}">${esc(contextTag(c, BANK))}</span>`).join("");
    const chips = (fam ? fam.ev : []).map((e) => `<span class="ev-chip" data-e="${esc(e)}">${esc(e)}</span>`).join("")
      + '<span class="ev-chip ev-otro" data-e="__otro">+ Otro</span>';
    card.innerHTML = `
      <div class="ev-q">${esc(a.q)}</div>
      <div class="ev-ctx">${ctxTags}</div>
      <div class="ev-lbl">Evidencia observable</div>
      <div class="ev-chips">${chips}</div>
      <textarea class="ev-otro-txt" placeholder="Describe qué pasó…" style="display:none"></textarea>`;
    evList.appendChild(card);
  });
}
function setupEvidence() {
  $("evList").onclick = (e) => {
    const otro = e.target.closest(".ev-otro");
    if (otro) { otro.classList.toggle("on"); const tx = otro.closest(".ev-card").querySelector(".ev-otro-txt");
      const on = otro.classList.contains("on"); tx.style.display = on ? "block" : "none"; if (on) tx.focus(); return; }
    const chip = e.target.closest(".ev-chip"); if (chip) chip.classList.toggle("on");
  };
  $("backSwipe").onclick = () => { go("swipe"); renderDeck(); };
  $("toResults").onclick = () => { buildResults(); go("resultados"); };
}

// ── Agregar barrera (salida de escape) ───────────────────────────────────────
let barPick = { famId: null, ctx: new Set() };
function setupBarSheet() {
  const barFamOpts = $("barFamOpts"), barCtxOpts = $("barCtxOpts"), barDesc = $("barDesc"), barConfirm = $("barConfirm");
  barFamOpts.innerHTML = ""; barCtxOpts.innerHTML = "";
  FAMS.concat([{ key: null, name: "No estoy seguro" }]).forEach((f) => {
    const c = document.createElement("span"); c.className = "fchip"; c.dataset.f = (f.key === null ? "__none" : f.key);
    c.textContent = f.name; barFamOpts.appendChild(c);
  });
  CTX.forEach((c) => {
    const bg = c.id === "escolar" ? "--escolar-bg" : c.id === "aulico" ? "--aulico-bg" : "--socio-bg";
    const fg = c.id === "escolar" ? "--escolar" : c.id === "aulico" ? "--aulico" : "--socio";
    const o = document.createElement("div"); o.className = "ctx-opt"; o.dataset.c = c.id;
    o.innerHTML = `<div class="cic" style="background:${cvar(bg)};color:${cvar(fg)}">${IC[c.id]}</div>
      <div><div class="cn">${esc(c.name)}</div><div class="cd">${esc(c.desc)}</div></div><div class="chk">${IC.check}</div>`;
    barCtxOpts.appendChild(o);
  });
  const barUpdate = () => { barConfirm.disabled = barDesc.value.trim().length < 4; };
  barDesc.oninput = barUpdate;
  barFamOpts.onclick = (e) => { const c = e.target.closest(".fchip"); if (!c) return;
    barFamOpts.querySelectorAll(".fchip").forEach((x) => x.classList.remove("on")); c.classList.add("on");
    barPick.famId = c.dataset.f === "__none" ? null : c.dataset.f; };
  barCtxOpts.onclick = (e) => { const o = e.target.closest(".ctx-opt"); if (!o) return;
    const id = o.dataset.c; if (barPick.ctx.has(id)) { barPick.ctx.delete(id); o.classList.remove("on"); }
    else { barPick.ctx.add(id); o.classList.add("on"); } };
  barConfirm.onclick = () => {
    state.custom.push({ desc: barDesc.value.trim(), famId: barPick.famId, ctx: [...barPick.ctx] });
    $("barSheet").classList.remove("up"); $("barScrim").classList.remove("up");
    const b = $("addBarBtn"); b.classList.add("done");
    b.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg> Barrera añadida (${state.custom.length}) · toca para agregar otra`;
    persist();
  };
  $("barScrim").onclick = () => { $("barSheet").classList.remove("up"); $("barScrim").classList.remove("up"); };
}
function openBarSheet() {
  barPick = { famId: null, ctx: new Set() };
  $("barDesc").value = "";
  $("barFamOpts").querySelectorAll(".fchip").forEach((x) => x.classList.remove("on"));
  $("barCtxOpts").querySelectorAll(".ctx-opt").forEach((x) => x.classList.remove("on"));
  $("barConfirm").disabled = true;
  $("barSheet").classList.add("up"); $("barScrim").classList.add("up");
}

// ── Resultados (VIEW 4) ──────────────────────────────────────────────────────
let lastResult = null;
function computeResult() {
  const answers = Object.values(state.answers).map((a) => ({
    questionId: a.questionId, familyId: a.familyId, contexts: (a.ctx || []).join(","), value: a.val,
  }));
  const customs = state.custom.map((c) => ({ familyId: c.famId, description: c.desc, contexts: (c.ctx || []).join(",") }));
  return evaluate({
    answers, customs, semaphores: state.lights, bank: BANK,
    scopeType: state.scope.type, scopeRef: state.scope.ref, scopeCond: state.scope.cond,
  });
}
function ctxTagsHtml(list) { return (list || []).map((c) => `<span class="tag ${c}">${esc(contextTag(c, BANK))}</span>`).join(""); }

function buildResults() {
  const result = computeResult(); lastResult = result;
  const rb = $("resBody");
  const total = result.barriers.length;
  if (!total) {
    rb.innerHTML = `<div class="res-hero"><div class="k">Recorrido completo</div><div class="big">0</div><div class="sm">No se identificaron barreras candidatas con la información capturada.</div></div>
      <div class="disclaimer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--teal-dark)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg><p>${esc(BANK.disclaimer)}</p></div>`;
    return;
  }
  const altas = result.highCount;
  let html = `
    <div class="res-hero">
      <div class="k">Barreras candidatas del contexto</div>
      <div class="big">${total}</div>
      <div class="sm">Barreras del entorno que el alumnado enfrenta. Se ubican en el contexto, nunca como una condición del estudiante.</div>
      ${scopeLabel() ? `<div style="margin-top:13px;display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.16);padding:6px 12px;border-radius:9px;font-size:12px;font-weight:700"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/></svg>Valoración: ${esc(scopeLabel())}</div>` : ""}
      ${result.adaptedLabel ? `<div class="adapt-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6 4.3 2.3 7.3-6.3-4.6L5.7 21 8 14 2 9.4h7.6z"/></svg>Adaptado a: ${esc(result.adaptedLabel)}</div>` : ""}
    </div>
    <div class="res-stats">
      <div class="res-stat"><div class="num" style="color:var(--risk)">${altas}</div><div class="cap">Prioridad alta</div></div>
      <div class="res-stat"><div class="num" style="color:var(--warn)">${total - altas}</div><div class="cap">Prioridad media</div></div>
      <div class="res-stat"><div class="num" style="color:var(--teal)">${result.familiesExplored}</div><div class="cap">Familias exploradas</div></div>
    </div>`;

  result.barriers.forEach((b) => {
    if (b.custom) {
      html += `
        <div class="bar-card review ${b.priority}">
          <div class="review-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg> Barrera añadida · para revisar con UDEI</div>
          <div class="bar-top"><div class="bar-name">Se identifica una posible barrera ${esc(b.sing)}</div><span class="pri ${b.priority}">${esc(b.priority)}</span></div>
          ${b.contexts.length ? `<div class="bar-ctx">${ctxTagsHtml(b.contexts)}</div>` : ""}
          ${b.description ? `<div style="font-size:12.5px;color:var(--ink2);line-height:1.45;margin-top:6px">“${esc(b.description)}”</div>` : ""}
        </div>`;
      return;
    }
    const itemsHtml = b.items.map((it) => `
      <div style="border-top:1px solid var(--line);padding-top:10px;margin-top:10px">
        <div style="font-size:10.5px;font-weight:800;color:var(--risk);text-transform:uppercase;letter-spacing:.04em">Barrera</div>
        <div style="font-size:13.5px;color:var(--ink);line-height:1.4;margin:3px 0 ${it.contexts.length ? "7px" : "8px"}">${esc(it.barrier)}</div>
        ${it.contexts.length ? `<div class="bar-ctx" style="margin-bottom:9px">${ctxTagsHtml(it.contexts)}</div>` : ""}
        ${it.strategy ? `<div style="font-size:10.5px;font-weight:800;color:var(--teal);text-transform:uppercase;letter-spacing:.04em">Estrategia</div><div style="font-size:13px;color:var(--ink2);line-height:1.45;margin-top:3px">${esc(it.strategy)}</div>` : ""}
      </div>`).join("");
    html += `
      <div class="bar-card ${b.priority}">
        <div class="bar-top"><div class="bar-name">Se identifica una posible barrera ${esc(b.sing)}</div><span class="pri ${b.priority}">${esc(b.priority)}</span></div>
        <div class="bar-ctx">${ctxTagsHtml(b.contexts)}</div>
        ${itemsHtml}
      </div>`;
  });

  html += `<div class="disclaimer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--teal-dark)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg><p>${esc(BANK.disclaimer)}</p></div>`;
  rb.innerHTML = html;
}

function setupResultActions() {
  $("copyBtn").onclick = async () => {
    const txt = buildReport(lastResult || computeResult(), BANK);
    try { await navigator.clipboard.writeText(txt); toast("Reporte copiado"); }
    catch { fallbackCopy(txt); toast("Reporte copiado"); }
  };
  $("shareBtn").onclick = async () => {
    const txt = buildReport(lastResult || computeResult(), BANK);
    if (navigator.share) {
      try { await navigator.share({ title: "Reporte BAPyC", text: txt }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(txt); toast("Copiado (compartir no disponible)"); }
      catch { fallbackCopy(txt); toast("Reporte copiado"); }
    }
  };
  $("printBtn").onclick = () => window.print();
  $("newBtn").onclick = resetAll;
}
function fallbackCopy(txt) {
  const ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch {} ta.remove();
}

function resetAll() {
  state = freshState();
  try { localStorage.removeItem(STORE_KEY); } catch {}
  setupScope(); setupSemaforo();
  const abb = $("addBarBtn");
  if (abb) { abb.classList.remove("done"); abb.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg> ¿No encuentras la barrera? Agrégala'; }
  $("scopeRef").style.display = "none"; $("toSemaforo").disabled = true;
  $("scopeNote").textContent = "Elige un alcance para continuar";
  $("scopeCond").style.display = "none";
  updateScopeBadge(); go("scope");
}

// ── Inicio + Fundamentos + Acerca de ─────────────────────────────────────────
const FUND = [
  { n: "1", t: "¿Qué son las BAPyC?", body: [
    { p: "Las BAPyC son los obstáculos que surgen de la interacción entre el estudiante y su contexto (personas, políticas, culturas, prácticas e infraestructura) y que limitan su acceso, permanencia, aprendizaje, participación y convivencia." },
    { p: "El principio rector es el modelo social: la barrera no está en el alumno, está en el contexto. Por eso no se diagnostica al estudiante; se identifican y se eliminan o minimizan las barreras del entorno." },
  ]},
  { n: "2", t: "Origen del concepto", body: [
    { p: "El término original es «Barreras para el Aprendizaje y la Participación» (BAP), acuñado por Tony Booth y Mel Ainscow en el Index for Inclusion (Reino Unido, 2000)." },
    { p: "Sustituye la idea de «necesidades educativas especiales» para mover el foco del déficit del alumno hacia el contexto. Organiza la mejora escolar en tres dimensiones:" },
    { ul: ["Culturas inclusivas: valores, actitudes y sentido de comunidad.", "Políticas inclusivas: organización, normas y recursos del centro.", "Prácticas inclusivas: enseñanza, evaluación y participación en el aula."] },
  ]},
  { n: "3", t: "Marco legal en México", body: [
    { p: "La educación inclusiva se sustenta en la Ley General de Educación, Capítulo VIII «De la Educación Inclusiva» (artículos 61 a 68; reforma vigente, actualizada el 7 de junio de 2024)." },
    { p: "El artículo 61 la define como el conjunto de acciones para identificar, prevenir y reducir las barreras que limitan el acceso, permanencia, participación y aprendizaje de todas y todos los educandos, eliminando prácticas de discriminación, exclusión y segregación." },
    { p: "En la Nueva Escuela Mexicana se opera con el Diseño Universal para el Aprendizaje (DUA) y los ajustes razonables. A nivel federal la SEP usa la sigla BAP (sin «convivencia»)." },
  ]},
  { n: "4", t: "La particularidad de Nuevo León", body: [
    { p: "El estándar nacional es BAP (aprendizaje + participación). Nuevo León agrega explícitamente «la Convivencia» → BAPyC." },
    { p: "¿Qué aporta «convivencia»? Un alumno puede tener acceso y participar formalmente y aun así estar en desventaja porque el entorno no le permite convivir con dignidad e igualdad (acoso, exclusión entre pares, rechazo familiar, clima escolar hostil, discriminación)." },
    { p: "La convivencia se vuelve una dimensión de impacto propia, conectada con la dimensión de culturas inclusivas del Index." },
  ]},
  { n: "5", t: "Marco institucional en Nuevo León", body: [
    { p: "Actores y servicios que operan el enfoque en el estado:" },
    { ul: ["UDEI — Unidad de Educación Inclusiva: orienta, asesora y acompaña a las escuelas para prevenir, minimizar y eliminar barreras del contexto.", "CAM — Centros de Atención Múltiple: servicios escolarizados de educación especial.", "CTE — Consejo Técnico Escolar: espacio colegiado donde el diagnóstico alimenta la identificación de BAPyC."] },
    { p: "Documentos rectores: «Marco de la Educación Inclusiva», «ABC del apoyo de la UDEI», «Enriquecer la Educación: Alumnado CAST», «Sugerencias para la identificación de BAPyC» y los cuadernillos de educación inclusiva." },
  ]},
  { n: "6", t: "Los 5 tipos de BAPyC", body: [
    { p: "La clasificación oficial de Nuevo León organiza las barreras en cinco tipos. Lo administrativo/de gestión queda subsumido en las Normativas." },
    { it: "1. Actitudinales", p: "Prejuicios y actitudes de rechazo, sobreprotectoras, de segregación o exclusión." },
    { it: "2. Culturales", p: "Prácticas de la comunidad educativa con enfoque homogéneo, no intercultural." },
    { it: "3. Pedagógicas", p: "Currículo poco flexible, sin actividades diversificadas ni metodologías con DUA." },
    { it: "4. Físicas / de infraestructura", p: "Condiciones u obstáculos del entorno escolar carentes de diseño universal." },
    { it: "5. Normativas", p: "Disposiciones administrativas que obstaculizan el acceso, permanencia y participación." },
  ]},
  { n: "7", t: "Los 3 contextos de análisis", body: [
    { p: "Cada BAPyC se ubica en el contexto donde se origina el obstáculo, no donde el alumno siente el impacto:" },
    { it: "Contexto Escolar", p: "Origen en la gestión institucional, la cultura, la organización y los recursos del plantel. Actor principal: dirección y colectivo docente (CTE)." },
    { it: "Contexto Áulico", p: "Origen en la práctica docente, la planeación, la evaluación y el ambiente del aula. Actor principal: docente de grupo." },
    { it: "Contexto Sociofamiliar", p: "Origen en la relación escuela-familia, los apoyos en casa y el entorno comunitario. Actor principal: familia y comunidad." },
    { p: "Regla clave: el impacto en el alumno define la urgencia/prioridad, no el contexto. Una misma barrera activa en dos o más contextos se considera sistémica y eleva la prioridad." },
  ]},
  { n: "8", t: "Cómo se identifican", body: [
    { ul: ["Diagnóstico integral en el CTE y observación en aula, escuela y familia.", "Valoración inicial por la UDEI.", "Identificación de BAPyC a partir de indicadores observables (no de etiquetas sobre el alumno).", "Informe Individual de Valoración Educativa.", "Plan de Intervención en los tres contextos.", "Seguimiento y ajuste."] },
    { p: "Regla de redacción: nunca «el alumno presenta…»; siempre «se identifica una posible barrera en…» el contexto correspondiente." },
  ]},
  { n: "9", t: "Estrategias para eliminar o minimizar", body: [
    { p: "En orden, de lo universal a lo individual:" },
    { ul: ["DUA: rediseñar la enseñanza para que sea accesible a todos (múltiples formas de representar, expresar y motivar).", "Ajustes razonables: apoyos específicos y proporcionales cuando el DUA no basta.", "Transformar culturas: altas expectativas, lenguaje inclusivo, convivencia sana, combate al acoso.", "Transformar políticas: acuerdos de CTE, protocolos, revisión de normas y accesibilidad.", "Corresponsabilidad con la familia: comunicación accesible y bidireccional."] },
  ]},
  { n: "10", t: "Fuentes principales", body: [
    { ul: ["Booth, T. & Ainscow, M. — Index for Inclusion / Índice de Inclusión.", "Ley General de Educación, arts. 61–68 (reforma DOF 07/06/2024).", "SEP — Instrumento de registro de las BAP (CTE).", "Secretaría de Educación de Nuevo León — Marco de la Educación Inclusiva y cuadernillos UDEI/CAST.", "Clasificación de BAPyC (Nuevo León): tabla oficial de tipos × contextos."] },
  ]},
];

function renderFundamentos() {
  const el = $("fundBody");
  let html = `<div class="fund-hero">
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
    <h3>Marco conceptual, legal e institucional</h3><p>México y Nuevo León · educación inclusiva</p></div>`;
  FUND.forEach((s) => {
    let inner = "";
    s.body.forEach((b) => {
      if (b.it) inner += `<div class="fc-it">${esc(b.it)}</div>`;
      if (b.p) inner += `<p>${esc(b.p)}</p>`;
      if (b.ul) inner += `<ul>${b.ul.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
    });
    html += `<div class="fund-card"><div class="fc-top"><div class="fc-n">${s.n}</div><div class="fc-t">${esc(s.t)}</div></div>${inner}</div>`;
  });
  html += `<div class="fund-note"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--teal-dark)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg><p>Material de referencia. No sustituye la lectura de los documentos rectores oficiales ni el juicio profesional del personal UDEI.</p></div>`;
  el.innerHTML = html;
}

function setupHome() {
  $("homeStart").onclick = () => go("scope");
  $("homeFund").onclick = () => go("fundamentos");
  $("homeAbout").onclick = () => go("acerca");
  $("backFund").onclick = () => go("inicio");
  $("backAbout").onclick = () => go("inicio");
}

// ── Instalar en pantalla de inicio — SOLO iPhone/iPad ────────────────────────
// En Android/escritorio el navegador ofrece su propia instalación, así que el
// botón solo se muestra en dispositivos Apple, donde no hay instalación automática
// y hay que guiar el "Compartir → Agregar a inicio".
function setupInstall() {
  const btn = $("installBtn");
  const sheet = $("installSheet"), scrim = $("installScrim");
  const ua = navigator.userAgent || "";
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  // Ocultar en todo lo que no sea iPhone/iPad, o si ya está instalada.
  if (!isIOS || standalone) { btn.style.display = "none"; return; }

  const shareIco = '<span class="install-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/></svg></span>';
  const plusIco = '<span class="install-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span>';

  const openSheet = () => {
    $("installTitle").textContent = "Instalar en tu iPhone";
    $("installIntro").textContent = "Para tenerla como app —con ícono propio, a pantalla completa y funcionando sin internet— agrégala a tu pantalla de inicio desde Safari:";
    $("installSteps").innerHTML =
      `<li>Toca ${shareIco} <b>Compartir</b> (abajo, al centro).</li>` +
      `<li>Desliza y toca ${plusIco} <b>Agregar a inicio</b>.</li>` +
      `<li>Toca <b>Agregar</b> (arriba a la derecha).</li>`;
    sheet.classList.add("up"); scrim.classList.add("up");
  };
  const closeSheet = () => { sheet.classList.remove("up"); scrim.classList.remove("up"); };
  $("installClose").onclick = closeSheet;
  scrim.onclick = closeSheet;
  btn.onclick = openSheet;

  window.addEventListener("appinstalled", () => { btn.style.display = "none"; closeSheet(); });

  btn.style.display = "flex";
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  document.querySelectorAll(".view").forEach((v) => (views[v.dataset.view] = v));
  try {
    BANK = await loadBank();
  } catch (err) {
    $("app").innerHTML = `<div style="padding:40px 24px;font-family:system-ui"><h2>No se pudo cargar el banco</h2><p style="color:#586462;margin-top:8px">${esc(String(err))}</p></div>`;
    return;
  }
  buildViewModels(BANK);
  restore();
  setupScope();
  setupSemaforo();
  setupContextSheet();
  setupHelpSheet();
  setupEvidence();
  setupBarSheet();
  setupResultActions();
  setupHome();
  setupInstall();
  renderFundamentos();
  updateScopeBadge();
  go("inicio");

  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  }
}
init();
