# Kinetic Scan — 10 wichtigste Grafik-Optimierungen (Phaser 3)

> Fokus: **GPU-/Render-Performance** (Draw Calls, Overdraw, Shader/PostFX, Textur-Binds, Canvas-Resolution).
> Beispiele/Dateihinweise beziehen sich auf dein Repo-Stand aus `kinetic_scan-master.zip`.

---

## 0) Kurzdiagnose (was bei dir am teuersten ist)

In deinem Projekt sind die größten Render-Kostentreiber typischerweise:

- **PostFX**: CRT-Shader (`src/CRTPipeline.ts`) mit mehreren Texture-Samples pro Pixel.
- **RenderTexture Reflection**: Kopiert pro Frame `MainScene` in eine RenderTexture + Blur (`src/BezelScene.ts`).
- **Viele additive Partikel / Alpha-Overdraw** (`src/ExplosionManager.ts` und diverse VFX in `src/MainScene.ts`).
- **Kurzlebige Graphics-Objekte**, die pro Effekt neu erstellt und per Tween ständig neu gezeichnet werden
  (z. B. `spawnImpactRing` in `src/MainScene.ts`).

Die folgenden 10 Punkte sind nach **Impact** (hoch → mittel) sortiert.

---

## 1) CRT-PostFX günstiger machen (oder auf Low-Res rendern)

**Wo:** `src/CRTPipeline.ts`, Aktivierung in diversen Scenes (z. B. `MainScene.ts`, `AttractScene.ts`, ...)

**Warum:** Der Shader sampelt aktuell **3×** `uMainSampler` (RGB-Shift) + Scanlines + Noise.  
Das ist pro Pixel teuer (Fillrate + Texture Bandwidth).

**Vorschläge:**
- **Low-End Pfad:** nur **1 Sample** (keine Aberration), reduzierte Scanlines/Noise.
- **Low-Res Pfad:** rendere die Scene zuerst in eine **kleinere RenderTexture** (z. B. 0.75× oder 0.5×)
  und wende CRT nur darauf an (Upscale). Das spart massiv Fillrate.

**Wie (Minimal-Change):**
- In `CRTPipeline.ts` bei `uHighEnd == false`:
  - `shift` auf `0.0` setzen (nur 1 Sample),
  - Scanline-Frequenz reduzieren (`800.0 -> 400.0`) und Noise komplett aus (oder schwächer).

**Erwarteter Impact:** **hoch** (besonders auf iGPUs & mobilen GPUs).  
**Trade-off:** Weniger “CRT-Punch” auf Low-End (aber stabilere FPS).

---

## 2) Bezel-Reflection downsamplen + seltener updaten

**Wo:** `src/BezelScene.ts` (`RenderTexture.draw(mainScene.children.list)` + `preFX.addBlur(...)`)

**Warum:** Du zeichnest **jede Frame** die komplette MainScene in eine RenderTexture und blurst sie.
Das ist doppelte Arbeit (zusätzlicher Render-Pass) + Blur ist teuer.

**Vorschläge:**
1. **Downsample**: RenderTexture auf z. B. 0.5× anlegen und danach skalieren.
2. **Update-Intervall**: Reflection nur alle **2–4 Frames** aktualisieren.
3. **Blur reduzieren**: kleineren Radius/Steps nutzen oder Blur nur auf „High-End“ aktivieren.

**Wie (Beispielidee):**
- RT mit halber Auflösung:
  - `this.add.renderTexture(0,0, GAME_WIDTH/2, GAME_HEIGHT/2)` und dann `setScale(2)`.
- In `update()`:
  - `if (this.game.loop.frame % 3 !== 0) return;` (nur jede 3. Frame neu drawen)

**Erwarteter Impact:** **hoch** auf Desktop-iGPU / mittel auf dGPU.  
**Trade-off:** Reflection wirkt minimal „weniger smooth“, meistens egal.

---

## 3) Kurzlebige Ring-/Wave-VFX von Graphics → Sprite-Textures umstellen

**Wo:** `src/MainScene.ts`, z. B. `spawnImpactRing()` (erstellt `this.add.graphics()` und zeichnet pro Tween-Update)

**Warum:** `Graphics.clear()+strokeCircle()` pro Frame erzeugt CPU- und (je nach Renderer) Upload-Overhead.
Bei vielen Hits/Explosions wird das schnell teuer.

**Vorschlag:** Ring einmal als Textur generieren (oder SpriteSheet) und dann nur
`setScale()/setAlpha()` tweaken.

**Wie:**
- Einmalige Textur (ähnlich wie du es bereits bei `createGraphics()` machst):
  - `ringG.generateTexture('ring', size, size)`
- Beim Trigger:
  - `const s = this.add.image(x,y,'ring').setBlendMode(ADD).setScale(start).setAlpha(0.9)`
  - Tween auf `scale` + `alpha`, am Ende `setActive(false)` (Pooling, siehe Punkt 7)

**Erwarteter Impact:** **hoch** in Stressmomenten.  
**Trade-off:** Ring-Varianten brauchen ggf. mehrere Texturen (oder Shader/Atlas).

---

## 4) „Overdraw“ reduzieren: additive Partikel & große Alpha-Flächen budgetieren

**Wo:** `src/ExplosionManager.ts` + diverse Effekte in `src/MainScene.ts`

**Warum:** Additive Partikel (`blendMode: 'ADD'`) mit großen Sprites erzeugen massiven Overdraw.
Auf mobilen GPUs killt das die Fillrate.

**Vorschläge:**
- Auf Low-End automatisch:
  - **kleinere** Partikel (`scale.start` runter),
  - **kürzere** Lebensdauer,
  - ggf. `blendMode: 'NORMAL'` statt `'ADD'` (oder seltener ADD).
- Partikel **nicht** „zu groß“ (große Flächen sind teuer).
- Für besonders teure FX: statt viele Partikel lieber **1–2 animierte Explosion-Sprites**.

**Erwarteter Impact:** **hoch** (Fillrate).  
**Trade-off:** Explosionen wirken weniger „glowy“ auf Low-End.

---

## 5) Textur-Binds senken: (Dynamic-)Atlas statt viele Einzel-Textures

**Wo:** Runtime-generierte Texturen: `asteroid_0..4` (`EnemyManager.ts`), `bullet`, `star`, `ufo_shard`, `elite_drone`, `shield_bunker` (`MainScene.ts:createGraphics()`)

**Warum:** Jede **eigene Texture** kann zusätzliche Texture-Binds verursachen → mehr „flushes“ im WebGL-Batch.
Viele Binds = mehr GPU-Overhead.

**Vorschlag:**  
- Packe statische Assets in ein **Texture Atlas** (Build-Time).
- Für runtime-generierte Texturen: lege sie auf eine **DynamicTexture / RenderTexture Atlas-Fläche** (ein großes Sheet)
  und verwende Frames/UVs daraus.

**Erwarteter Impact:** **mittel–hoch** (abhängig von gleichzeitigen Texturen).  
**Trade-off:** Mehr Aufwand (Atlas-Management), aber sehr lohnend bei vielen Draws.

---

## 6) Depth/Sort-Kosten reduzieren: Layer statt überall `setDepth()`

**Wo:** `MainScene.ts` und Scenes allgemein (viele `setDepth(...)`)

**Warum:** Phaser sortiert Display-Listen nach Depth; sehr viele Objekte mit wechselnden Depths erhöhen Sorting/Flushes.

**Vorschlag:**
- Nutze wenige feste **Layer/Container**:
  - Background-Layer
  - Gameplay-Layer
  - FX-Layer (ADD)
  - UI-Layer
- Innerhalb eines Layers möglichst **ohne** viele individuelle Depths arbeiten.

**Erwarteter Impact:** **mittel** (CPU + oft besseres Batching).  
**Trade-off:** Etwas Umstrukturierung im Scene-Setup.

---

## 7) Pooling nicht nur für Bullets: auch VFX-Sprites, Deko, Fragmente

**Wo:** VFX werden teils `destroy()`ed (z. B. `spawnImpactRing`, Boss-Waves etc. in `MainScene.ts`),
Background-Decor wird erstellt/zerstört (`spawnBackgroundDecor/updateBackgroundDecor`).

**Warum:** Häufiges Erzeugen/Destroy → GC + interner Phaser-Overhead; erzeugt Stottern.

**Vorschlag:**
- Pools für:
  - Ring/Wave-Sprites (siehe Punkt 3)
  - Fragments/kleine Debris (falls nicht schon gepoolt)
  - Background-Decor (wenn Spawnrate hoch ist)
- „Despawn“ = `setActive(false).setVisible(false).body.enable=false` statt destroy.

**Erwarteter Impact:** **mittel–hoch** (Frametimes stabilisieren).  
**Trade-off:** Reset-Logik nötig (Alpha/Scale/Velocity/Tweens).

---

## 8) Canvas-/Framebuffer-Auflösung dynamisch begrenzen (HiDPI-Fillrate!)

**Wo:** `src/gameConfig.ts`

**Warum:** Auf High-DPI Geräten kann die effektive Render-Auflösung sehr hoch werden.
Das erhöht Fillrate-Kosten massiv, selbst wenn die Szene „einfach“ ist.

**Vorschlag:**
- Prüfe, ob dein Canvas intern größer als die CSS-Größe ist (DevicePixelRatio).
- Falls ja: **Resolution/Zoom clampen** (z. B. auf 1.0 oder 1.5).

**Wie (konzeptionell):**
- Phaser hat eine `resolution`-Option; alternativ kannst du deine `GAME_WIDTH/GAME_HEIGHT` niedriger wählen
  und über FIT hochskalieren.

**Erwarteter Impact:** **hoch** auf mobilen Geräten.  
**Trade-off:** Etwas weniger Schärfe (bei PixelArt oft egal oder sogar besser).

---

## 9) Offscreen-Culling & Update-Intervals für FX/Decor (nicht pro Frame alles anfassen)

**Wo:** z. B. `MainScene.ts` BackgroundDecor, BlackHole Visual, diverse Gruppen-Iterationen

**Warum:** Auch wenn GPU der Bottleneck ist: CPU-Work pro Frame kann Draw-Calls indirekt steigern
(z. B. durch zu viele aktive Objekte).

**Vorschlag:**
- Culling/Checks nur alle **N ms** (du machst das schon bei Enemies über `OFFSCREEN_CULL_INTERVAL_MS`).
- Für FX-Gruppen: nur alle 50–100 ms Offscreen prüfen.
- Für seltene Graphics: zeichne nur „on interval“ (machst du beim BlackHole bereits gut).

**Erwarteter Impact:** **mittel**.  
**Trade-off:** Kaum sichtbar, solange Interval klein bleibt.

---

## 10) BlendMode-Wechsel bündeln (ADD-Layer), um Batches weniger zu flushen

**Wo:** Bullets/Particles/FX setzen teils `BlendModes.ADD` (z. B. `ExplosionManager.ts`, `MainScene.ts`)

**Warum:** Jeder BlendMode-Wechsel kann einen Batch flushen.

**Vorschlag:**
- Halte additive Objekte in einem **dedizierten FX-Layer** und zeichne ihn „am Stück“.
- Für weniger wichtige FX auf Low-End: NORMAL statt ADD.

**Erwarteter Impact:** **mittel** (stark abhängig von Szene/Objektanzahl).  
**Trade-off:** kleine Umorganisation (Layer).

---

# Quick Wins (wenn du heute nur 30 Minuten hast)

1. **Bezel-Reflection**: Update nur jede 3. Frame + Blur runter (Punkt 2).  
2. **Impact-Rings**: Graphics → Sprite-Texture (Punkt 3).  
3. **CRT Low-End**: 1 Sample statt 3 (Punkt 1).  
4. **HiDPI clamp**: interne Auflösung reduzieren (Punkt 8).

---

# Messung: Woran erkennst du, dass es wirkt?

- In Chrome DevTools → Performance:
  - weniger „purple“ (Rendering) + weniger große „GC“ Blöcke.
- In-game:
  - stabilere Frametimes (weniger Micro-Stutter), insbesondere bei Boss/Explosion-Spikes.

Wenn du willst, kann ich dir als nächsten Schritt **konkrete Patch-Diffs** für (2) und (3) bauen,
weil die am einfachsten sind und meistens sofort FPS bringen.
