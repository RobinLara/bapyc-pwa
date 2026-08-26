// ─────────────────────────────────────────────────────────────────────────────
// Pruebas de funcionalidad del motor BAPyC (Node, sin dependencias).
//
// Ejecutar:  node pwa/tests/engine.test.mjs
//
// engine.js es ESM pero vive como .js sin package.json "type":"module"; para
// importarlo en Node sin alterar el empaquetado ni el deploy, se copia a un
// archivo .mjs temporal (los .mjs siempre se cargan como ESM) y se importa.
// El motor solo usa `fetch` dentro de loadBank(), que aquí no se invoca.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, copyFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const enginePath = join(ROOT, "js", "engine.js");
const tmpEngine = join(tmpdir(), `bapyc-engine-${process.pid}.mjs`);
copyFileSync(enginePath, tmpEngine);
const { buildBank, evaluate, buildReport } = await import(pathToFileURL(tmpEngine).href);

const bankJson = JSON.parse(readFileSync(join(ROOT, "data", "banco_dinamico_bapyc.v2.json"), "utf8"));
const bank = buildBank(bankJson);

// ── mini framework ───────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond) {
  if (cond) { pass++; } else { fail++; fails.push(name); }
}
function eq(name, got, exp) {
  ok(`${name} (esperado ${JSON.stringify(exp)}, obtenido ${JSON.stringify(got)})`, got === exp);
}

// Helper para armar una respuesta "sí".
const yes = (questionId, familyId, contexts, freq) => ({ questionId, familyId, contexts, value: "yes", freq });
const evalWith = (answers, opts = {}) =>
  evaluate({ answers, customs: opts.customs ?? [], semaphores: opts.semaphores ?? {}, bank,
    scopeType: opts.scopeType ?? "alumno", scopeRef: opts.scopeRef ?? "", scopeCond: opts.scopeCond ?? null });

// ── 1. Estructura del banco ──────────────────────────────────────────────────
eq("familias = 5", bank.families.length, 5);
ok("escala de frecuencia cargada", bank.frequency.length === 3);
eq("peso 'mucho' = 3", bank.freqWeight("mucho"), 3);
eq("peso 'poco' = 1", bank.freqWeight("poco"), 1);
eq("peso desconocido = 0", bank.freqWeight("zzz"), 0);

const condIds = bank.conditions.map((c) => c.id);
ok("condición 'di' presente", condIds.includes("di"));
ok("condición 'down' eliminada (fusionada)", !condIds.includes("down"));
ok("condición 'dea' añadida", condIds.includes("dea"));
ok("condición 'emo' añadida", condIds.includes("emo"));
eq("nombre unificado DI/Down", bank.condition("di").name, "Discapacidad intelectual / Síndrome Down");

// ── 2. Remapeo de TEA (cultural → pedagogica) ────────────────────────────────
const tea = bank.condition("tea");
ok("TEA incluye familia pedagógica", tea.fams.includes("pedagogica"));
ok("TEA ya no usa familia cultural", !tea.fams.includes("cultural"));
ok("TEA tiene preguntas pedagógicas", (tea.questions.pedagogica || []).length >= 3);
ok("deckQuestions(TEA, pedagogica) usa preguntas de la condición",
  bank.deckQuestions("pedagogica", "tea").some((q) => q.id.startsWith("tea-ped")));
ok("deckQuestions genérica sin condición",
  bank.deckQuestions("pedagogica", null).every((q) => q.id.startsWith("ped-")));

// ── 3. Prioridad por impacto/frecuencia ──────────────────────────────────────
// Un solo "sí" con frecuencia "poco" (impacto 1) → baja.
let r = evalWith([yes("act-01", "act", "escolar", "poco")]);
eq("1 sí + poco → baja", r.barriers[0].priority, "baja");
eq("impacto reflejado = 1", r.barriers[0].impact, 1);

// Un solo "sí" con frecuencia "mucho" (impacto 3) → alta.
r = evalWith([yes("act-01", "act", "escolar", "mucho")]);
eq("1 sí + mucho → alta", r.barriers[0].priority, "alta");

// Un solo "sí" con frecuencia "medio" (impacto 2), no sistémica → media.
r = evalWith([yes("act-01", "act", "escolar", "medio")]);
eq("1 sí + medio → media", r.barriers[0].priority, "media");

// Dos "sí" en la misma familia, ambos "medio" → alta (recurrencia + impacto).
r = evalWith([yes("act-01", "act", "escolar", "medio"), yes("act-02", "act", "escolar", "medio")]);
eq("2 sí + medio → alta", r.barriers[0].priority, "alta");

// Sistémica: mismo tipo en 2 contextos, aunque sea "poco" → alta.
r = evalWith([yes("act-01", "act", "escolar,aulico", "poco")]);
eq("sistémica (2 contextos) → alta", r.barriers[0].priority, "alta");
ok("marcada como sistémica", r.barriers[0].systemic === true);

// Sin frecuencia capturada → usa impacto por defecto (2 = media).
r = evalWith([yes("act-01", "act", "escolar", undefined)]);
eq("sin frecuencia → impacto por defecto 2", r.barriers[0].impact, 2);
eq("sin frecuencia → media", r.barriers[0].priority, "media");

// ── 4. Conteos y orden ───────────────────────────────────────────────────────
r = evalWith([
  yes("act-01", "act", "escolar", "mucho"),   // alta
  yes("ped-01", "ped", "aulico", "poco"),     // baja
  yes("nor-01", "nor", "escolar", "medio"),   // media
]);
eq("highCount", r.highCount, 1);
eq("mediumCount", r.mediumCount, 1);
eq("lowCount", r.lowCount, 1);
eq("orden: alta primero", r.barriers[0].priority, "alta");
eq("orden: baja al final", r.barriers[r.barriers.length - 1].priority, "baja");

// ── 5. "No sé" e "idk" no cuentan como barrera; pendientes sí ────────────────
r = evalWith([
  { questionId: "act-01", familyId: "act", contexts: "escolar", value: "idk" },
  { questionId: "act-02", familyId: "act", contexts: "escolar", value: "no" },
]);
eq("idk/no no generan barreras", r.barriers.length, 0);
eq("pendientes contados", r.pendingCount, 1);

// ── 6. Barreras personalizadas ───────────────────────────────────────────────
r = evalWith([], { customs: [{ familyId: "ped", description: "Caso especial", contexts: "escolar,aulico" }] });
eq("barrera custom creada", r.barriers.length, 1);
ok("custom sistémica → alta", r.barriers[0].priority === "alta" && r.barriers[0].custom === true);

// ── 7. Adaptación por condición e ítems con frecuencia en el reporte ─────────
r = evalWith([yes("di-ped-01", "ped", "aulico", "mucho")], { scopeCond: "di", scopeRef: "Ana" });
eq("etiqueta adaptada", r.adaptedLabel, "Discapacidad intelectual / Síndrome Down");
const rep = buildReport(r, bank);
ok("reporte incluye 'REPORTE BAPyC'", rep.includes("REPORTE BAPyC"));
ok("reporte incluye frecuencia [Casi siempre]", rep.includes("[Casi siempre]"));
ok("reporte incluye disclaimer no-diagnóstico", /no diagnostica/i.test(rep));

// ── 8. Reporte vacío ─────────────────────────────────────────────────────────
const repEmpty = buildReport(evalWith([]), bank);
ok("reporte vacío es coherente", /Sin barreras candidatas/.test(repEmpty));

// ── resultado ────────────────────────────────────────────────────────────────
console.log(`\n${pass} pruebas OK, ${fail} fallidas`);
if (fail) { console.error("FALLAS:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("✓ Todas las pruebas del motor pasaron.");
