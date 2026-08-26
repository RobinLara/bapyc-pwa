// ─────────────────────────────────────────────────────────────────────────────
// BAPyC · Motor de evaluación (port 1:1 de BapycEngine.kt → JavaScript)
//
// Determinista, sin backend, sin red. Carga el banco v2 y evalúa las respuestas
// "Sí lo veo" agrupándolas por familia + contexto, calcula prioridad/sistémica y
// adapta rutas/ejemplos según la condición del alumno.
//
// Principio rector: NO diagnostica al estudiante. Identifica barreras del contexto.
// ─────────────────────────────────────────────────────────────────────────────

const BANK_URL = "./data/banco_dinamico_bapyc.v2.json";

/**
 * Carga y normaliza el banco dinámico v2 (equivalente a BapycEngine.loadBank).
 * @returns {Promise<Bank>}
 */
export async function loadBank(url = BANK_URL) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`No se pudo cargar el banco (${res.status})`);
  const root = await res.json();

  const mkQuestions = (arr) =>
    (arr ?? []).map((q) => ({
      id: q.id,
      text: q.text,
      expl: q.help?.expl ?? "",
      examples: q.help?.ex ?? [],
      strategy: q.strategy ?? "",
    }));

  const families = (root.families ?? []).map((f) => ({
    id: f.id,
    key: f.key,
    name: f.name,
    sing: f.sing,
    sub: f.sub ?? "",
    evidenceChips: f.evidenceChips ?? [],
    routes: f.routes ?? [],
    questions: mkQuestions(f.questions),
  }));

  const scopes = (root.scopes ?? []).map((s) => ({
    id: s.id,
    short: s.short ?? s.name,
    name: s.name,
    sub: s.sub ?? "",
    ref: s.ref ?? "",
    allowsCondition: s.allowsCondition ?? false,
  }));

  const contexts = (root.contexts ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    tag: c.tag ?? c.name,
    desc: c.desc ?? "",
  }));

  const conditions = (root.conditions ?? []).map((c) => {
    const fams = c.fams ?? [];
    // questions: familyKey -> [preguntas propias de la condición]
    const questions = {};
    if (c.questions) for (const k of Object.keys(c.questions)) questions[k] = mkQuestions(c.questions[k]);
    return {
      id: c.id,
      name: c.name,
      fams,
      ex: c.ex ?? {},         // familyKey -> [ejemplos]
      routes: c.routes ?? {}, // familyKey -> [rutas]
      questions,              // familyKey -> [preguntas]
      // Solo adapta si tiene familias sugeridas ("Otra"/"No estoy seguro" no adaptan).
      adapts: fams.length > 0,
    };
  });

  const r = root.rules ?? {};
  const hp = r.highPriorityWhen ?? {};
  const rules = {
    candidateWhenYesAtLeast: r.candidateWhenYesAtLeast ?? 1,
    systemicContextsAtLeast: hp.systemicContextsAtLeast ?? 2,
    familyRedHigh: (hp.familySemaforo ?? "red") === "red",
    yesAtLeastHigh: hp.yesAnswersAtLeast ?? 2,
  };

  const lang = root.resultLanguage ?? {};

  return {
    families,
    scopes,
    contexts,
    conditions,
    rules,
    disclaimer:
      lang.noDiagnosisDisclaimer ??
      "Resultado orientativo — no diagnostica al estudiante. Requiere revisión con el colectivo escolar y la UDEI.",
    candidateTemplate: lang.candidateTemplate ?? "Se identifica una posible barrera {sing}",
    systemicNote: lang.systemicNote ?? "Barrera sistémica · aparece en {n} contextos",

    // Helpers (equivalentes a los métodos de DynBank)
    family(key) { return families.find((f) => f.key === key || f.id === key) ?? null; },
    context(id) { return contexts.find((c) => c.id === id) ?? null; },
    scope(id)   { return scopes.find((s) => s.id === id) ?? null; },
    condition(id) { return id ? (conditions.find((c) => c.id === id) ?? null) : null; },

    /** Preguntas de la baraja para una familia: las de la condición si existen, si no las genéricas. */
    deckQuestions(familyKey, condId) {
      const cond = this.condition(condId);
      const adapts = cond && cond.fams.length > 0;
      const condQ = adapts ? cond.questions?.[familyKey] : null;
      if (condQ && condQ.length) return condQ;
      const fam = this.family(familyKey);
      return fam ? fam.questions : [];
    },
  };
}

// ─── Utilidades internas ─────────────────────────────────────────────────────

const splitCsv = (s) =>
  (s ?? "").split(",").map((x) => x.trim()).filter((x) => x.length > 0);

function orderContexts(ctx, bank) {
  const order = bank.contexts.map((c) => c.id);
  const uniq = [...new Set(ctx)];
  return uniq.sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
  });
}

/**
 * Etiqueta corta de un contexto (Escolar / Áulico / Familiar).
 */
export function contextTag(id, bank) {
  const t = bank?.context(id)?.tag;
  if (t) return t;
  return { escolar: "Escolar", aulico: "Áulico", sociofamiliar: "Familiar" }[id] ?? id;
}

/**
 * Etiqueta del alcance para el reporte ("Alumno/a · Juan").
 */
export function scopeLabel(scopeType, scopeRef, bank) {
  const short =
    bank?.scope(scopeType)?.short ??
    { alumno: "Alumno/a", grupo: "Grupo", escuela: "Escuela" }[scopeType] ??
    scopeType;
  return (scopeRef ?? "").trim() === "" ? short : `${short} · ${scopeRef}`;
}

// ─── Evaluación (port de BapycEngine.evaluate) ───────────────────────────────

/**
 * Agrupa las respuestas "yes" por familia + contexto y calcula prioridad.
 * candidata si ≥1 "Sí"; alta si sistémica (2+ contextos), familia en 🔴, o ≥2 "Sí".
 *
 * @param {Object}   p
 * @param {Answer[]} p.answers      { questionId, familyId, contexts:"csv", value:"yes"|"no"|"idk" }
 * @param {Custom[]} p.customs      { familyId?, description, contexts:"csv" }
 * @param {Object}   p.semaphores   familyId -> "green"|"amber"|"red"
 * @param {Bank}     p.bank
 * @param {string}   p.scopeType    "alumno"|"grupo"|"escuela"
 * @param {string}   p.scopeRef
 * @param {?string}  p.scopeCond    id de condición (solo alcance=alumno)
 * @returns {Result}
 */
export function evaluate({
  answers = [],
  customs = [],
  semaphores = {},
  bank,
  scopeType,
  scopeRef,
  scopeCond = null,
}) {
  const condRaw = bank.condition(scopeCond);
  const cond = condRaw && condRaw.adapts ? condRaw : null;

  // Rutas afinadas a la condición van primero (override), luego las base de la familia.
  const routesFor = (familyKey, fam) => {
    const merged = [...(cond?.routes?.[familyKey] ?? []), ...(fam?.routes ?? [])];
    const seen = new Set();
    return merged.filter((rt) => {
      const k = rt.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const yes = answers.filter((a) => a.value === "yes");
  const byFamily = yes.reduce((m, a) => {
    (m[a.familyId] ??= []).push(a);
    return m;
  }, {});

  const familyBarriers = Object.entries(byFamily)
    .map(([familyId, items]) => {
      if (items.length < bank.rules.candidateWhenYesAtLeast) return null;
      const contexts = [...new Set(items.flatMap((a) => splitCsv(a.contexts)))];
      const systemic = contexts.length >= bank.rules.systemicContextsAtLeast;
      const red = bank.rules.familyRedHigh && semaphores[familyId] === "red";
      const high = systemic || red || items.length >= bank.rules.yesAtLeastHigh;
      const fam = bank.family(familyId);
      const deckQs = bank.deckQuestions(familyId, scopeCond);

      const seenBarrier = new Set();
      const barrierItems = items
        .map((ans) => {
          const q = deckQs.find((qq) => qq.id === ans.questionId);
          return {
            // Texto/estrategia: la pregunta encontrada; si no, el texto que trae la
            // propia respuesta (robusto); en último caso, el id (nunca debería verse).
            barrier: q?.text ?? ans.text ?? ans.questionId,
            strategy: q?.strategy ?? ans.strategy ?? "",
            contexts: orderContexts(splitCsv(ans.contexts), bank),
          };
        })
        .filter((bi) => {
          if (seenBarrier.has(bi.barrier)) return false;
          seenBarrier.add(bi.barrier);
          return true;
        });

      return {
        familyKey: familyId,
        familyName: fam?.name ?? familyId,
        sing: fam?.sing ?? familyId,
        contexts: orderContexts(contexts, bank),
        yesCount: items.length,
        systemic,
        priority: high ? "alta" : "media",
        routes: routesFor(familyId, fam),
        items: barrierItems,
        custom: false,
        description: null,
      };
    })
    .filter(Boolean);

  const customBarriers = customs.map((c) => {
    const ctx = splitCsv(c.contexts);
    const systemic = ctx.length >= bank.rules.systemicContextsAtLeast;
    const fam = c.familyId ? bank.family(c.familyId) : null;
    return {
      familyKey: c.familyId ?? "",
      familyName: fam?.name ?? "Sin clasificar",
      sing: fam?.sing ?? "(sin clasificar)",
      contexts: orderContexts(ctx, bank),
      yesCount: 1,
      systemic,
      priority: systemic ? "alta" : "media",
      routes: c.familyId ? routesFor(c.familyId, fam) : [],
      items: [],
      custom: true,
      description: c.description,
    };
  });

  const all = [...familyBarriers, ...customBarriers].sort((a, b) => {
    const pa = a.priority === "alta" ? 1 : 0;
    const pb = b.priority === "alta" ? 1 : 0;
    if (pb !== pa) return pb - pa;
    return b.yesCount - a.yesCount;
  });

  return {
    scopeType,
    scopeRef,
    barriers: all,
    familiesExplored: Object.values(semaphores).filter((v) => v === "amber" || v === "red").length,
    highCount: all.filter((b) => b.priority === "alta").length,
    systemicCount: all.filter((b) => b.systemic).length,
    pendingCount: answers.filter((a) => a.value === "idk").length,
    adaptedLabel: cond?.name ?? null,
  };
}

// ─── Reporte de texto compartible (port de buildDynReport) ───────────────────

/**
 * Genera el reporte de texto (idéntico al de la app Android) para copiar/compartir
 * vía Web Share API (navigator.share) o portapapeles.
 */
export function buildReport(result, bank) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const fecha = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const lines = [
    "REPORTE BAPyC",
    "Resultado orientativo: no diagnostica al estudiante.",
    `Fecha: ${fecha}`,
    "",
  ];

  if (!result || result.barriers.length === 0) {
    lines.push("Sin barreras candidatas identificadas con la captura actual.");
    lines.push("Mantener observación sistemática.");
    return lines.join("\n");
  }

  lines.push(`Valoración: ${scopeLabel(result.scopeType, result.scopeRef, bank)}`);
  if (result.adaptedLabel) lines.push(`Adaptado a: ${result.adaptedLabel}`);
  lines.push(`Barreras candidatas: ${result.barriers.length}`);
  lines.push(
    `Prioridad alta: ${result.highCount} · Prioridad media: ${result.barriers.length - result.highCount} · Familias exploradas: ${result.familiesExplored}`,
  );
  if (result.pendingCount > 0) lines.push(`Pendientes por revisar ("No sé"): ${result.pendingCount}`);
  lines.push("");
  lines.push("── BARRERAS IDENTIFICADAS ──");

  result.barriers.forEach((b, i) => {
    lines.push("");
    lines.push(`${i + 1}. Barrera ${b.sing}  [${b.priority.toUpperCase()}]`);
    if (b.custom) {
      if (b.contexts.length > 0)
        lines.push(`   Contextos: ${b.contexts.map((c) => contextTag(c, bank)).join(", ")}`);
      if (b.description && b.description.trim() !== "")
        lines.push(`   Descripción: ${b.description}`);
    } else {
      b.items.forEach((it) => {
        const ctx = it.contexts.length > 0
          ? ` (${it.contexts.map((c) => contextTag(c, bank)).join(", ")})`
          : "";
        lines.push(`   • Barrera: ${it.barrier}${ctx}`);
        if (it.strategy.trim() !== "") lines.push(`     Estrategia: ${it.strategy}`);
      });
    }
  });

  lines.push("");
  lines.push(bank?.disclaimer ?? "Resultado orientativo — requiere revisión con el colectivo escolar y la UDEI.");
  return lines.join("\n");
}
