// BAPyC · Panel de comentarios — lógica (externa por la CSP: script-src 'self').
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const TKEY = "bapyc.admin.token";

  const fmtDate = (iso) => {
    const d = new Date(iso); if (isNaN(d)) return iso || "";
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const stars = (n) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);

  function barChart(title, obj, color) {
    const entries = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return "";
    const max = Math.max(...entries.map((e) => e[1]), 1);
    const rows = entries.map(([k, v]) =>
      `<div class="bar-row"><span class="k">${esc(k)}</span><span class="track"><span class="fill" style="width:${(v / max * 100).toFixed(0)}%;background:${color}"></span></span><span class="n">${v}</span></div>`
    ).join("");
    return `<div class="card"><h2 style="margin:0 0 10px">${esc(title)}</h2><div class="bars">${rows}</div></div>`;
  }

  function render(data) {
    const s = data.stats || {};
    $("stats").innerHTML = [
      ["Total", s.total ?? 0],
      ["Promedio", (s.avgRating ?? 0) ? `${s.avgRating} ★` : "—"],
      ["Últimos 7 días", s.last7days ?? 0],
    ].map(([cap, num]) => `<div class="stat"><div class="num">${esc(String(num))}</div><div class="cap">${esc(cap)}</div></div>`).join("");

    $("charts").innerHTML =
      barChart("Por categoría", s.byCategory, "var(--teal)") +
      barChart("Por valoración (estrellas)", s.byRating, "var(--star)") +
      barChart("Por versión", s.byVersion, "var(--ink2)") +
      barChart("Por pantalla", s.byScreen, "var(--ink3)");

    const items = data.items || [];
    $("list").innerHTML = items.length
      ? items.map((it) => {
          const c = it.context || {};
          return `<div class="item">
            <div class="item-top">
              ${it.rating >= 1 ? `<span class="stars" title="${it.rating}/5">${stars(it.rating)}</span>` : ""}
              <span class="chip">${esc(it.category || "otro")}</span>
              <span class="when">${esc(fmtDate(it.ts))}</span>
              <button class="del" data-id="${esc(it.id)}" title="Eliminar comentario" aria-label="Eliminar">🗑</button>
            </div>
            ${it.text ? `<div class="txt">${esc(it.text)}</div>` : '<div class="txt muted">(sin texto)</div>'}
            <div class="meta">
              <span>v: ${esc(c.version || "—")}</span>
              <span>pantalla: ${esc(c.screen || "—")}</span>
              <span>disp: ${esc(c.device || "—")}</span>
              <span>${esc(c.lang || "")}</span>
            </div>
          </div>`;
        }).join("")
      : '<div class="empty">Aún no hay comentarios.</div>';

    $("updated").textContent = "Actualizado " + fmtDate(new Date().toISOString());
  }

  async function load(token) {
    try {
      const res = await fetch(`./api/feedback?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      if (res.status === 401) { fail("Contraseña incorrecta."); return; }
      if (res.status === 503) { showDash(); $("list").innerHTML = '<div class="empty">El almacén de datos aún no está conectado en Vercel.</div>'; $("stats").innerHTML = ""; $("charts").innerHTML = ""; return; }
      if (!res.ok) { fail("Error del servidor (" + res.status + ")."); return; }
      const data = await res.json();
      sessionStorage.setItem(TKEY, token);
      showDash();
      render(data);
    } catch (e) {
      fail("No se pudo conectar. Revisa tu internet.");
    }
  }

  function fail(msg) { $("loginErr").textContent = msg; }
  function showDash() { $("login").style.display = "none"; $("dash").style.display = "block"; }
  function showLogin() { $("dash").style.display = "none"; $("login").style.display = "block"; }

  async function del(url, okMsg) {
    const t = sessionStorage.getItem(TKEY); if (!t) return;
    try {
      const res = await fetch(url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(t), { method: "DELETE" });
      if (res.ok) { load(t); } else { alert("No se pudo eliminar (" + res.status + ")."); }
    } catch { alert("No se pudo conectar."); }
  }

  $("loginBtn").addEventListener("click", () => { const t = $("pw").value.trim(); if (t) load(t); });
  $("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") $("loginBtn").click(); });
  $("reload").addEventListener("click", () => { const t = sessionStorage.getItem(TKEY); if (t) load(t); });
  $("logout").addEventListener("click", () => { sessionStorage.removeItem(TKEY); showLogin(); $("pw").value = ""; });

  // Eliminar un comentario (delegación en la lista).
  $("list").addEventListener("click", (e) => {
    const b = e.target.closest(".del"); if (!b) return;
    if (confirm("¿Eliminar este comentario? No se puede deshacer.")) {
      del("./api/feedback?id=" + encodeURIComponent(b.dataset.id));
    }
  });
  // Borrar todos.
  $("delAll").addEventListener("click", () => {
    if (confirm("¿Borrar TODOS los comentarios? Esta acción no se puede deshacer.")) {
      del("./api/feedback?all=1");
    }
  });

  const saved = sessionStorage.getItem(TKEY);
  if (saved) load(saved);
})();
