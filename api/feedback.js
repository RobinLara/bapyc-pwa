// ─────────────────────────────────────────────────────────────────────────────
// BAPyC · API de comentarios (función serverless de Vercel)
//
//  POST /api/feedback   → guarda un comentario (valoración + categoría + texto +
//                         contexto anónimo). NUNCA datos de alumnos.
//  GET  /api/feedback?token=XXX → devuelve todos los comentarios + estadísticas
//                         (solo si token === process.env.ADMIN_TOKEN).
//
// Almacén: Upstash Redis (KV de Vercel) vía su API REST — sin dependencias npm.
// Variables de entorno esperadas (las inyecta la integración KV/Upstash de Vercel):
//   KV_REST_API_URL / KV_REST_API_TOKEN   (o UPSTASH_REDIS_REST_URL / _TOKEN)
//   ADMIN_TOKEN                            (contraseña de la página /admin)
// ─────────────────────────────────────────────────────────────────────────────

const KEY = "bapyc:feedback";
const MAX_ITEMS = 5000;
const CATEGORIES = ["error", "sugerencia", "contenido", "otro"];

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

async function redis(command) {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  return res.json();
}

const clip = (s, n) => (typeof s === "string" ? s.slice(0, n) : "");

function sanitizeContext(c) {
  c = c && typeof c === "object" ? c : {};
  return {
    version: clip(c.version, 40),
    screen: clip(c.screen, 40),
    device: clip(c.device, 24),
    ua: clip(c.ua, 300),
    lang: clip(c.lang, 20),
    tz: clip(c.tz, 60),
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({ ok: false, error: "storage_not_configured" });
  }

  // ── Guardar comentario ──────────────────────────────────────────────────
  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};

    // Honeypot anti-spam: si viene lleno, fingir éxito sin guardar.
    if (body.website) return res.status(200).json({ ok: true });

    const text = clip((body.text || "").trim(), 1000);
    let rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) rating = 0;
    const category = CATEGORIES.includes(body.category) ? body.category : "otro";

    if (text.length < 2 && rating === 0) {
      return res.status(400).json({ ok: false, error: "empty" });
    }

    const record = {
      id: (body.id && clip(body.id, 40)) || (Date.now() + "-" + Math.random().toString(36).slice(2, 8)),
      ts: new Date().toISOString(),
      rating,
      category,
      text,
      context: sanitizeContext(body.context),
    };

    try {
      await redis(["LPUSH", KEY, JSON.stringify(record)]);
      await redis(["LTRIM", KEY, "0", String(MAX_ITEMS - 1)]);
      return res.status(200).json({ ok: true, id: record.id });
    } catch (e) {
      return res.status(502).json({ ok: false, error: "store_failed" });
    }
  }

  // ── Leer comentarios + estadísticas (admin) ─────────────────────────────
  if (req.method === "GET") {
    const token = (req.query && req.query.token) || "";
    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    let items = [];
    try {
      const r = await redis(["LRANGE", KEY, "0", "-1"]);
      items = (r.result || []).map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
    } catch (e) {
      return res.status(502).json({ ok: false, error: "store_failed" });
    }

    const ratings = items.map((i) => i.rating).filter((n) => n >= 1);
    const stats = {
      total: items.length,
      avgRating: ratings.length ? +(ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2) : 0,
      byCategory: {},
      byRating: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      byVersion: {},
      byScreen: {},
      last7days: 0,
    };
    const weekAgo = Date.now() - 7 * 864e5;
    for (const i of items) {
      stats.byCategory[i.category] = (stats.byCategory[i.category] || 0) + 1;
      if (i.rating >= 1) stats.byRating[i.rating]++;
      const v = i.context?.version || "—"; stats.byVersion[v] = (stats.byVersion[v] || 0) + 1;
      const sc = i.context?.screen || "—"; stats.byScreen[sc] = (stats.byScreen[sc] || 0) + 1;
      if (Date.parse(i.ts) >= weekAgo) stats.last7days++;
    }
    return res.status(200).json({ ok: true, stats, items });
  }

  // ── Eliminar comentarios (admin) ────────────────────────────────────────
  if (req.method === "DELETE") {
    const token = (req.query && req.query.token) || "";
    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const all = req.query.all === "1" || req.query.all === "true";
    const id = req.query.id ? String(req.query.id) : "";

    try {
      if (all) {
        await redis(["DEL", KEY]);
        return res.status(200).json({ ok: true, deleted: "all" });
      }
      if (!id) return res.status(400).json({ ok: false, error: "missing_id" });

      // Reconstruir la lista sin el elemento indicado (conserva orden y contenido exacto).
      const r = await redis(["LRANGE", KEY, "0", "-1"]);
      const raw = r.result || [];
      const keep = raw.filter((s) => {
        try { return JSON.parse(s).id !== id; } catch { return true; }
      });
      await redis(["DEL", KEY]);
      if (keep.length) await redis(["RPUSH", KEY, ...keep]);
      return res.status(200).json({ ok: true, deleted: id, remaining: keep.length });
    } catch (e) {
      return res.status(502).json({ ok: false, error: "store_failed" });
    }
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
};
