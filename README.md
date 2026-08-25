# BAPyC · PWA (versión web instalable)

Versión web de la app BAPyC para que **docentes con iPhone** (y cualquier dispositivo)
puedan usarla **sin App Store, sin costo y sin internet**, instalándola desde el
navegador con *Compartir → Agregar a inicio de pantalla*.

La app nativa Android no cambia. Esta PWA reutiliza **los mismos datos y la misma
lógica**, reescritos en web.

---

## Estado actual — FLUJO COMPLETO FUNCIONANDO ✅

| Pieza | Archivo | Estado |
|---|---|---|
| Banco de preguntas v2 (fuente única de verdad) | `data/banco_dinamico_bapyc.v2.json` | ✅ copiado del APK |
| Motor de evaluación (port 1:1 de `BapycEngine.kt`) | `js/engine.js` | ✅ `loadBank` + `evaluate` + `buildReport` |
| Interfaz completa (5 pantallas + hojas) | `index.html`, `styles.css`, `js/app.js` | ✅ Scope→Semáforo→Deck→Evidencia→Resultados |
| Íconos PNG (192/512/maskable) | `icons/` | ✅ generados |
| Manifiesto PWA (ícono, nombre, standalone) | `manifest.webmanifest` | ✅ |
| Service worker (offline) | `sw.js` | ✅ (registra en HTTPS/host real) |

**Verificado end-to-end en viewport móvil:** carga el banco real (34 preguntas /
5 familias / 11 condiciones), corre el flujo completo (alcance + condición →
semáforo con familias sugeridas → tarjetas Sí/No/No sé con contexto → resultados),
y el motor calcula prioridad, barrera sistémica y adaptación por condición
idénticas a la app Android. Copiar/Compartir usan portapapeles y `navigator.share`.
Persiste el avance en `localStorage`.

> Regenerar íconos: `python3 gen_icons.py` (script en el scratchpad; sin dependencias).

---

## El motor (lo importante ya está portado)

`js/engine.js` expone, como módulo ES:

- `loadBank(url?)` → carga y normaliza el banco v2 (equivale a `BapycEngine.loadBank`).
- `evaluate({ answers, customs, semaphores, bank, scopeType, scopeRef, scopeCond })`
  → agrupa los "Sí" por familia + contexto, calcula prioridad/sistémica y adapta por
  condición (equivale a `BapycEngine.evaluate`).
- `buildReport(result, bank)` → genera el reporte de texto compartible (equivale a
  `buildDynReport`).
- Helpers `contextTag`, `scopeLabel`.

**Reglas idénticas a la app:** candidata si ≥1 "Sí"; prioridad **alta** si es
sistémica (≥2 contextos), la familia está en 🔴, o hay ≥2 "Sí".

---

## Flujo a portar (mapa pantalla nativa → PWA)

Origen: `app/.../MainActivity.kt` (`sealed class Screen`).

| # | Pantalla nativa | Qué hace | Estado PWA |
|---|---|---|---|
| 1 | `LoginScreen` | Entrada / bienvenida | ⏳ |
| 2 | `MainScaffold` (tabs: Inicio · Evaluación · Resultados · Acerca de) | Home con barra inferior | ⏳ |
| 3 | `FundamentosScreen` | Principios rectores (no diagnostica) | ⏳ |
| 4 | `ScopeScreen` | Elegir alcance (alumno/grupo/escuela) + referencia + **condición** (si alumno) | ⏳ |
| 5 | `SemaforoScreen` | Semáforo por familia (verde/ámbar/rojo) | ⏳ |
| 6 | `DeckScreen` | Tarjetas de preguntas: *Sí lo veo · No · No sé* + ayuda | ⏳ |
| 7 | `EvidenciaScreen` | Evidencia + barreras personalizadas | ⏳ |
| 8 | `ResultadosScreen` | Barreras, prioridad, rutas + **copiar/compartir reporte** | ⏳ |

El estado (respuestas, semáforo, alcance) vive en memoria + `localStorage`
(reemplaza a Room). El reporte se comparte con `navigator.share()` — funciona en iPhone.

---

## Reutilizables ya disponibles

- **CSS y diseño visual:** `../prototipo-bapyc-dinamico.html` ya tiene el sistema de
  estilos completo (tokens, tarjetas, semáforo, deck con swipe, hoja de ayuda) y
  gran parte de la interacción. Se adapta quitando el marco de "teléfono" y
  conectándolo al motor + banco real (el prototipo usa datos abreviados inline).
- **Textos "Acerca de" / contacto / política de privacidad:** de `MainActivity.kt`
  y `docs/privacy-policy.html`.

---

## Cómo probar localmente

```bash
cd pwa
python3 -m http.server 8731
# abrir http://localhost:8731
```

> El service worker (offline) requiere `https://` o `localhost`. En navegadores de
> vista previa embebidos puede fallar el registro; en un host real funciona.

## Publicar (gratis, sin App Store)

Cualquiera de estos sirve un sitio estático con HTTPS:

- **Vercel** — `vercel deploy` apuntando a `pwa/` (hay integración disponible en el proyecto).
- **GitHub Pages** — publicar la carpeta `pwa/`.
- **Netlify** — arrastrar la carpeta.

Luego el docente abre el enlace en **Safari (iPhone)** → *Compartir* →
*Agregar a inicio de pantalla*. Queda como app con ícono, a pantalla completa y offline.

---

## Siguiente fase

1. **Desplegar a Vercel** (o GitHub Pages) y probar en un iPhone real la
   instalación (*Compartir → Agregar a inicio*) y el modo offline.
2. Pantallas secundarias opcionales (paridad con la app Android): Login/Inicio,
   Fundamentos, Acerca de (con contacto `arthyonapps@gmail.com`) e historial.
3. Pulido: gesto de swipe en iOS real, exportar PDF con mejor formato, y afinar
   textos/íconos con docentes.

<!-- deploy test: 23:59 -->
