// ─────────────────────────────────────────────────────────────────────────────
// BAPyC · Comentarios (módulo cliente autónomo)
//
// - Inyecta un botón "Enviar comentarios" en Inicio y una hoja con valoración
//   (estrellas) + categoría + texto + contexto anónimo.
// - Pide permiso antes de enviar (nada se manda sin confirmar).
// - Cola offline en localStorage: si no hay internet, se guarda y se envía solo
//   al reconectar (evento 'online') o al volver a abrir la app.
// - NUNCA envía datos de alumnos: solo el comentario y contexto técnico anónimo.
//
// Independiente de app.js: se carga con su propio <script type="module">.
// ─────────────────────────────────────────────────────────────────────────────

const APP_VERSION = "PWA 1.1";
const ENDPOINT = "./api/feedback";
const QUEUE_KEY = "bapyc.feedback.queue";
const CATEGORIES = [
  { id: "error", label: "Error / falla" },
  { id: "sugerencia", label: "Sugerencia" },
  { id: "contenido", label: "Contenido / preguntas" },
  { id: "otro", label: "Otro" },
];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ── Cola offline ─────────────────────────────────────────────────────────────
const readQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; } };
const writeQueue = (q) => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {} };

let flushing = false;
async function flushQueue() {
  if (flushing || !navigator.onLine) return;
  const q = readQueue();
  if (!q.length) return;
  flushing = true;
  const remaining = [];
  for (const item of q) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      // Descartar SOLO si se guardó (2xx) o el dato es inválido (400).
      // Conservar en cualquier otro caso (404 sin desplegar, 503 sin almacén,
      // 5xx, etc.) para reintentar más tarde y no perder el comentario.
      if (!(res.ok || res.status === 400)) remaining.push(item);
    } catch {
      remaining.push(item); // sin red → mantener para reintentar
    }
  }
  writeQueue(remaining);
  flushing = false;
  return remaining.length === 0;
}

function deviceKind() {
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  return "Escritorio";
}
function currentScreen() {
  const v = document.querySelector(".view.active");
  return (v && v.dataset.view) || "—";
}

// ── UI ───────────────────────────────────────────────────────────────────────
function injectStyles() {
  const css = `
  .fb-stars{display:flex;gap:8px;margin:2px 0 4px}
  .fb-star{cursor:pointer;color:var(--line);transition:.12s;line-height:1}
  .fb-star svg{width:34px;height:34px;display:block}
  .fb-star.on{color:#F2B705}
  .fb-star:active{transform:scale(.9)}
  .fb-rlabel{font-size:12px;color:var(--ink3);min-height:16px;margin-bottom:12px}
  .fb-count{font-size:11px;color:var(--ink3);text-align:right;margin-top:-8px;margin-bottom:12px}
  .fb-priv{display:flex;gap:8px;align-items:flex-start;font-size:11.5px;color:var(--ink3);line-height:1.45;
    background:var(--soft);border-radius:12px;padding:11px 12px;margin-bottom:14px}
  .fb-priv svg{flex-shrink:0;margin-top:1px}
  .fb-confirm{background:color-mix(in srgb,var(--teal-ctr) 60%,#fff);border-radius:14px;padding:14px;margin-bottom:14px;
    font-size:13px;color:var(--teal-dark);line-height:1.5}
  .fb-confirm b{font-weight:800}
  `;
  const el = document.createElement("style"); el.textContent = css; document.head.appendChild(el);
}

const STAR = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.6 7L12 17.8 5.8 21.2l1.6-7L2 9.5l7.1-.6z"/></svg>';

function buildSheet() {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="ctxscrim" id="fbScrim"></div>
    <div class="ctxsheet" id="fbSheet">
      <div id="fbForm">
        <h3>Enviar un comentario</h3>
        <p>Ayúdanos a mejorar la app. Cuéntanos qué falló, qué te gustaría o qué mejorarías.</p>

        <div class="sheet-lbl">¿Cómo la calificarías?</div>
        <div class="fb-stars" id="fbStars">
          ${[1,2,3,4,5].map((n) => `<span class="fb-star" data-n="${n}" role="button" aria-label="${n} estrellas">${STAR}</span>`).join("")}
        </div>
        <div class="fb-rlabel" id="fbRlabel"></div>

        <div class="sheet-lbl">Tipo de comentario</div>
        <div class="chip-row" id="fbCats">
          ${CATEGORIES.map((c) => `<span class="fchip" data-c="${c.id}">${esc(c.label)}</span>`).join("")}
        </div>

        <div class="sheet-lbl">Tu comentario</div>
        <textarea class="sheet-txt" id="fbText" maxlength="1000" placeholder="Escribe aquí… (no incluyas datos de alumnos)"></textarea>
        <div class="fb-count" id="fbCount">0 / 1000</div>

        <input type="text" id="fbWebsite" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;opacity:0" aria-hidden="true">

        <div class="fb-priv">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/></svg>
          Se envía a ARTHYON solo para mejorar la app, junto con datos técnicos anónimos (versión y dispositivo). No se envía ningún dato de alumnos ni tu evaluación.
        </div>
        <button class="cta" id="fbSend" disabled>Enviar comentario</button>
      </div>

      <div id="fbConfirm" style="display:none">
        <h3>¿Enviar el comentario?</h3>
        <div class="fb-confirm">
          Vas a enviar tu comentario a <b>ARTHYON</b> para mejorar la app. Se incluyen datos técnicos anónimos (versión y tipo de dispositivo). <b>No se envía ningún dato de alumnos.</b>
        </div>
        <div style="display:flex;gap:10px;align-items:stretch">
          <button class="cta ghost" id="fbBack" style="flex:0 0 90px">Atrás</button>
          <button class="cta" id="fbConfirmSend" style="flex:1">Enviar</button>
        </div>
      </div>
    </div>`;
  const app = $("app") || document.body;
  while (wrap.firstChild) app.appendChild(wrap.firstChild);
}

function injectButton(open) {
  const list = document.querySelector('.view[data-view="inicio"] .home-list');
  if (!list) return false;
  const btn = document.createElement("button");
  btn.className = "home-item"; btn.id = "homeFeedback"; btn.type = "button";
  btn.innerHTML = `
    <div class="hic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 01-12.3 7.5L3 21l2.1-5.6A8.4 8.4 0 1121 11.5z"/></svg></div>
    <div><div class="ht">Enviar comentarios</div><div class="hs">Reporta fallas o sugiere mejoras</div></div>
    <svg class="harrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`;
  btn.addEventListener("click", open);
  list.appendChild(btn);
  return true;
}

function toast(msg) {
  const t = $("toast");
  if (!t) { return; }
  t.textContent = msg; t.classList.add("up");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("up"), 2400);
}

function setup() {
  injectStyles();
  buildSheet();

  const sheet = $("fbSheet"), scrim = $("fbScrim");
  const form = $("fbForm"), confirm = $("fbConfirm");
  const stars = $("fbStars"), rlabel = $("fbRlabel"), cats = $("fbCats");
  const text = $("fbText"), count = $("fbCount"), send = $("fbSend");

  const state = { rating: 0, category: null };
  const RLABELS = { 1: "Muy mala", 2: "Mala", 3: "Regular", 4: "Buena", 5: "Excelente" };

  const refresh = () => {
    stars.querySelectorAll(".fb-star").forEach((s) => s.classList.toggle("on", Number(s.dataset.n) <= state.rating));
    rlabel.textContent = state.rating ? RLABELS[state.rating] : "";
    count.textContent = `${text.value.length} / 1000`;
    send.disabled = !(text.value.trim().length >= 2 || state.rating >= 1);
  };

  stars.addEventListener("click", (e) => { const s = e.target.closest(".fb-star"); if (!s) return; state.rating = Number(s.dataset.n); refresh(); });
  cats.addEventListener("click", (e) => {
    const c = e.target.closest(".fchip"); if (!c) return;
    const on = c.classList.contains("on");
    cats.querySelectorAll(".fchip").forEach((x) => x.classList.remove("on"));
    if (!on) { c.classList.add("on"); state.category = c.dataset.c; } else { state.category = null; }
  });
  text.addEventListener("input", refresh);

  const showForm = () => { form.style.display = "block"; confirm.style.display = "none"; };
  const open = () => { showForm(); sheet.classList.add("up"); scrim.classList.add("up"); };
  const close = () => { sheet.classList.remove("up"); scrim.classList.remove("up"); };
  scrim.addEventListener("click", close);

  send.addEventListener("click", () => {
    if (send.disabled) return;
    // Paso de permiso/confirmación antes de enviar.
    form.style.display = "none"; confirm.style.display = "block";
  });
  $("fbBack").addEventListener("click", showForm);

  $("fbConfirmSend").addEventListener("click", async () => {
    // Honeypot
    if ($("fbWebsite").value) { close(); return; }
    const record = {
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      rating: state.rating,
      category: state.category || "otro",
      text: text.value.trim().slice(0, 1000),
      context: {
        version: APP_VERSION,
        screen: currentScreen(),
        device: deviceKind(),
        ua: (navigator.userAgent || "").slice(0, 300),
        lang: navigator.language || "",
        tz: (Intl.DateTimeFormat().resolvedOptions().timeZone) || "",
      },
    };
    // Encolar SIEMPRE (garantiza que no se pierda) y tratar de enviar ya.
    const q = readQueue(); q.push(record); writeQueue(q);
    // limpiar formulario
    state.rating = 0; state.category = null; text.value = ""; refresh();
    cats.querySelectorAll(".fchip").forEach((x) => x.classList.remove("on"));
    close();

    if (navigator.onLine) {
      const done = await flushQueue();
      toast(done === false ? "Guardado — se enviará al reconectar" : "¡Gracias por tu comentario!");
    } else {
      toast("Sin internet — se enviará al reconectar");
    }
  });

  injectButton(open);

  // Reintentos de la cola: al reconectar y al cargar.
  window.addEventListener("online", flushQueue);
  if (navigator.onLine) setTimeout(flushQueue, 1500);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
else setup();
