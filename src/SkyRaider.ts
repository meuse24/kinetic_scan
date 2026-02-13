import { AudioManager } from './AudioManager';
import { getDifficultyPreset } from './Difficulty';
import type { DifficultyPreset } from './Difficulty';
import { SKY_RAIDER_VARIANT_TUNING } from './MainSceneTuning';

export type SkyRaiderVariant = 'stalker' | 'lancer' | 'phantom' | 'bomber' | 'interceptor';
type SkyRaiderState = 'enter' | 'engage' | 'dive' | 'retreat';

const SKY_RAIDER_STALKER_TEXTURE = 'sky_raider_stalker';
const SKY_RAIDER_LANCER_TEXTURE = 'sky_raider_lancer';
const SKY_RAIDER_PHANTOM_TEXTURE = 'sky_raider_phantom';
const SKY_RAIDER_BOMBER_TEXTURE = 'sky_raider_bomber';
const SKY_RAIDER_INTERCEPTOR_TEXTURE = 'sky_raider_interceptor';
const SKY_RAIDER_SHOT_TEXTURE = 'sky_raider_shot';

function colorToRgba(color: number, alpha: number) {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return `rgba(${c.red}, ${c.green}, ${c.blue}, ${alpha})`;
}

function createCanvasTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
) {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return;
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, width, height);
  draw(ctx, width, height);
  texture.refresh();
}

function drawStalkerTexture(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const points = [
    { x: width * 0.5, y: 6 },
    { x: width * 0.88, y: height * 0.58 },
    { x: width * 0.72, y: height * 0.82 },
    { x: width * 0.5, y: height * 0.72 },
    { x: width * 0.28, y: height * 0.82 },
    { x: width * 0.12, y: height * 0.58 },
  ];
  const traceHull = (offsetX: number = 0, offsetY: number = 0) => {
    ctx.beginPath();
    ctx.moveTo(points[0].x + offsetX, points[0].y + offsetY);
    for (let i = 1; i < points.length; i++)
      ctx.lineTo(points[i].x + offsetX, points[i].y + offsetY);
    ctx.closePath();
  };

  traceHull(0.6, 1.6);
  ctx.fillStyle = 'rgba(0,0,0,0.36)';
  ctx.fill();

  traceHull();
  const hullGrad = ctx.createLinearGradient(width * 0.18, 8, width * 0.82, height * 0.86);
  hullGrad.addColorStop(0, '#6f7e95');
  hullGrad.addColorStop(0.45, '#2b3a50');
  hullGrad.addColorStop(1, '#101722');
  ctx.fillStyle = hullGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(214,233,255,0.9)';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(width * 0.5, 11);
  ctx.lineTo(width * 0.72, height * 0.56);
  ctx.lineTo(width * 0.62, height * 0.7);
  ctx.lineTo(width * 0.5, height * 0.63);
  ctx.lineTo(width * 0.38, height * 0.7);
  ctx.lineTo(width * 0.28, height * 0.56);
  ctx.closePath();
  const panelGrad = ctx.createLinearGradient(width * 0.5, 11, width * 0.5, height * 0.7);
  panelGrad.addColorStop(0, '#111b29');
  panelGrad.addColorStop(1, '#080d14');
  ctx.fillStyle = panelGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 160, 205, 0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const cockpitGlow = ctx.createRadialGradient(
    width * 0.5,
    height * 0.42,
    0.7,
    width * 0.5,
    height * 0.42,
    10,
  );
  cockpitGlow.addColorStop(0, 'rgba(236,249,255,1)');
  cockpitGlow.addColorStop(0.42, 'rgba(134,220,255,0.85)');
  cockpitGlow.addColorStop(1, 'rgba(30,119,201,0)');
  ctx.fillStyle = cockpitGlow;
  ctx.beginPath();
  ctx.moveTo(width * 0.5, height * 0.22);
  ctx.lineTo(width * 0.62, height * 0.5);
  ctx.lineTo(width * 0.38, height * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(163, 235, 255, 0.9)';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(205,228,255,0.28)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(width * 0.32, height * 0.36);
  ctx.lineTo(width * 0.68, height * 0.36);
  ctx.moveTo(width * 0.28, height * 0.58);
  ctx.lineTo(width * 0.72, height * 0.58);
  ctx.moveTo(width * 0.5, 10);
  ctx.lineTo(width * 0.5, height * 0.72);
  ctx.stroke();

  for (const engineX of [width * 0.3, width * 0.7]) {
    const engineGlow = ctx.createRadialGradient(
      engineX,
      height * 0.63,
      0.6,
      engineX,
      height * 0.63,
      6.5,
    );
    engineGlow.addColorStop(0, 'rgba(201,248,255,1)');
    engineGlow.addColorStop(1, 'rgba(67,190,255,0)');
    ctx.fillStyle = engineGlow;
    ctx.beginPath();
    ctx.arc(engineX, height * 0.63, 5.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = colorToRgba(0x6af0ff, 0.85);
  ctx.beginPath();
  ctx.arc(width * 0.3, height * 0.63, 3.2, 0, Math.PI * 2);
  ctx.arc(width * 0.7, height * 0.63, 3.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawLancerTexture(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const points = [
    { x: width * 0.5, y: 4 },
    { x: width * 0.92, y: height * 0.54 },
    { x: width * 0.76, y: height * 0.9 },
    { x: width * 0.5, y: height * 0.76 },
    { x: width * 0.24, y: height * 0.9 },
    { x: width * 0.08, y: height * 0.54 },
  ];
  const traceHull = (offsetX: number = 0, offsetY: number = 0) => {
    ctx.beginPath();
    ctx.moveTo(points[0].x + offsetX, points[0].y + offsetY);
    for (let i = 1; i < points.length; i++)
      ctx.lineTo(points[i].x + offsetX, points[i].y + offsetY);
    ctx.closePath();
  };

  traceHull(0.7, 1.7);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();

  traceHull();
  const hullGrad = ctx.createLinearGradient(width * 0.2, 6, width * 0.82, height * 0.9);
  hullGrad.addColorStop(0, '#8f6a95');
  hullGrad.addColorStop(0.45, '#482a58');
  hullGrad.addColorStop(1, '#170f24');
  ctx.fillStyle = hullGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 202, 248, 0.92)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(width * 0.5, 10);
  ctx.lineTo(width * 0.74, height * 0.52);
  ctx.lineTo(width * 0.64, height * 0.73);
  ctx.lineTo(width * 0.5, height * 0.64);
  ctx.lineTo(width * 0.36, height * 0.73);
  ctx.lineTo(width * 0.26, height * 0.52);
  ctx.closePath();
  const centerPlate = ctx.createLinearGradient(width * 0.5, 10, width * 0.5, height * 0.74);
  centerPlate.addColorStop(0, '#220f31');
  centerPlate.addColorStop(1, '#0b0612');
  ctx.fillStyle = centerPlate;
  ctx.fill();
  ctx.strokeStyle = 'rgba(208, 164, 222, 0.42)';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  const spearGlow = ctx.createRadialGradient(
    width * 0.5,
    height * 0.42,
    0.8,
    width * 0.5,
    height * 0.42,
    12,
  );
  spearGlow.addColorStop(0, 'rgba(255,246,209,1)');
  spearGlow.addColorStop(0.35, 'rgba(255,195,146,0.88)');
  spearGlow.addColorStop(1, 'rgba(255,130,170,0)');
  ctx.fillStyle = spearGlow;
  ctx.beginPath();
  ctx.moveTo(width * 0.5, height * 0.16);
  ctx.lineTo(width * 0.62, height * 0.52);
  ctx.lineTo(width * 0.38, height * 0.52);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 223, 179, 0.9)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 228, 246, 0.3)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(width * 0.5, 8);
  ctx.lineTo(width * 0.5, height * 0.76);
  ctx.moveTo(width * 0.28, height * 0.53);
  ctx.lineTo(width * 0.72, height * 0.53);
  ctx.moveTo(width * 0.26, height * 0.72);
  ctx.lineTo(width * 0.74, height * 0.72);
  ctx.stroke();

  for (const engineX of [width * 0.24, width * 0.76]) {
    const engineGlow = ctx.createRadialGradient(
      engineX,
      height * 0.6,
      0.5,
      engineX,
      height * 0.6,
      7,
    );
    engineGlow.addColorStop(0, 'rgba(255,223,245,1)');
    engineGlow.addColorStop(1, 'rgba(255,111,220,0)');
    ctx.fillStyle = engineGlow;
    ctx.beginPath();
    ctx.arc(engineX, height * 0.6, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = colorToRgba(0xff9fd8, 0.84);
  ctx.beginPath();
  ctx.arc(width * 0.24, height * 0.6, 3.2, 0, Math.PI * 2);
  ctx.arc(width * 0.76, height * 0.6, 3.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawPhantomTexture(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Diamond/rhombus hull shape — narrow and sleek
  const points = [
    { x: width * 0.5, y: 4 },
    { x: width * 0.82, y: height * 0.5 },
    { x: width * 0.5, y: height * 0.88 },
    { x: width * 0.18, y: height * 0.5 },
  ];
  const traceHull = (ox: number = 0, oy: number = 0) => {
    ctx.beginPath();
    ctx.moveTo(points[0].x + ox, points[0].y + oy);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x + ox, points[i].y + oy);
    ctx.closePath();
  };

  traceHull(0.6, 1.5);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fill();

  traceHull();
  const hullGrad = ctx.createLinearGradient(width * 0.2, 6, width * 0.8, height * 0.88);
  hullGrad.addColorStop(0, '#5a2d8a');
  hullGrad.addColorStop(0.5, '#2e1252');
  hullGrad.addColorStop(1, '#1a0a30');
  ctx.fillStyle = hullGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(179, 102, 255, 0.75)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Inner diamond panel
  ctx.beginPath();
  ctx.moveTo(width * 0.5, 12);
  ctx.lineTo(width * 0.68, height * 0.5);
  ctx.lineTo(width * 0.5, height * 0.78);
  ctx.lineTo(width * 0.32, height * 0.5);
  ctx.closePath();
  const panelGrad = ctx.createLinearGradient(width * 0.5, 12, width * 0.5, height * 0.78);
  panelGrad.addColorStop(0, '#1a0630');
  panelGrad.addColorStop(1, '#0a0318');
  ctx.fillStyle = panelGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(160, 120, 220, 0.4)';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  // Ghostly cockpit glow
  const cockpitGlow = ctx.createRadialGradient(
    width * 0.5,
    height * 0.38,
    0.6,
    width * 0.5,
    height * 0.38,
    12,
  );
  cockpitGlow.addColorStop(0, 'rgba(220, 180, 255, 0.9)');
  cockpitGlow.addColorStop(0.4, 'rgba(160, 100, 255, 0.6)');
  cockpitGlow.addColorStop(1, 'rgba(90, 45, 138, 0)');
  ctx.fillStyle = cockpitGlow;
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.38, 11, 0, Math.PI * 2);
  ctx.fill();

  // Seam lines
  ctx.strokeStyle = 'rgba(179, 102, 255, 0.25)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(width * 0.5, 6);
  ctx.lineTo(width * 0.5, height * 0.86);
  ctx.moveTo(width * 0.22, height * 0.5);
  ctx.lineTo(width * 0.78, height * 0.5);
  ctx.stroke();

  // Engine glows
  for (const engineX of [width * 0.34, width * 0.66]) {
    const eg = ctx.createRadialGradient(engineX, height * 0.68, 0.4, engineX, height * 0.68, 5.5);
    eg.addColorStop(0, 'rgba(200, 160, 255, 0.9)');
    eg.addColorStop(1, 'rgba(120, 60, 200, 0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(engineX, height * 0.68, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBomberTexture(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Wide hexagonal hull — heavy and broad
  const points = [
    { x: width * 0.5, y: 4 },
    { x: width * 0.9, y: height * 0.32 },
    { x: width * 0.92, y: height * 0.68 },
    { x: width * 0.7, y: height * 0.9 },
    { x: width * 0.3, y: height * 0.9 },
    { x: width * 0.08, y: height * 0.68 },
    { x: width * 0.1, y: height * 0.32 },
  ];
  const traceHull = (ox: number = 0, oy: number = 0) => {
    ctx.beginPath();
    ctx.moveTo(points[0].x + ox, points[0].y + oy);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x + ox, points[i].y + oy);
    ctx.closePath();
  };

  traceHull(0.7, 1.6);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fill();

  traceHull();
  const hullGrad = ctx.createLinearGradient(width * 0.15, 6, width * 0.85, height * 0.9);
  hullGrad.addColorStop(0, '#8f3a2a');
  hullGrad.addColorStop(0.5, '#4a1a10');
  hullGrad.addColorStop(1, '#2a0c08');
  ctx.fillStyle = hullGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 102, 51, 0.88)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Center armor plate
  ctx.beginPath();
  ctx.moveTo(width * 0.5, 10);
  ctx.lineTo(width * 0.76, height * 0.35);
  ctx.lineTo(width * 0.76, height * 0.65);
  ctx.lineTo(width * 0.5, height * 0.82);
  ctx.lineTo(width * 0.24, height * 0.65);
  ctx.lineTo(width * 0.24, height * 0.35);
  ctx.closePath();
  const plateGrad = ctx.createLinearGradient(width * 0.5, 10, width * 0.5, height * 0.82);
  plateGrad.addColorStop(0, '#2a1008');
  plateGrad.addColorStop(1, '#120604');
  ctx.fillStyle = plateGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 150, 80, 0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Cockpit glow — fiery
  const cockpitGlow = ctx.createRadialGradient(
    width * 0.5,
    height * 0.36,
    0.7,
    width * 0.5,
    height * 0.36,
    10,
  );
  cockpitGlow.addColorStop(0, 'rgba(255, 220, 160, 1)');
  cockpitGlow.addColorStop(0.4, 'rgba(255, 140, 60, 0.8)');
  cockpitGlow.addColorStop(1, 'rgba(180, 60, 20, 0)');
  ctx.fillStyle = cockpitGlow;
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.36, 9, 0, Math.PI * 2);
  ctx.fill();

  // Bomb bays — two rectangles at bottom
  ctx.fillStyle = 'rgba(40, 15, 8, 0.9)';
  ctx.fillRect(width * 0.32, height * 0.74, width * 0.12, height * 0.12);
  ctx.fillRect(width * 0.56, height * 0.74, width * 0.12, height * 0.12);
  ctx.strokeStyle = 'rgba(255, 120, 50, 0.5)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(width * 0.32, height * 0.74, width * 0.12, height * 0.12);
  ctx.strokeRect(width * 0.56, height * 0.74, width * 0.12, height * 0.12);

  // Seam lines
  ctx.strokeStyle = 'rgba(255, 140, 80, 0.22)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(width * 0.5, 6);
  ctx.lineTo(width * 0.5, height * 0.88);
  ctx.moveTo(width * 0.12, height * 0.5);
  ctx.lineTo(width * 0.88, height * 0.5);
  ctx.stroke();

  // Engine glows
  for (const engineX of [width * 0.3, width * 0.7]) {
    const eg = ctx.createRadialGradient(engineX, height * 0.64, 0.5, engineX, height * 0.64, 7);
    eg.addColorStop(0, 'rgba(255, 200, 140, 1)');
    eg.addColorStop(1, 'rgba(200, 80, 30, 0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(engineX, height * 0.64, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawInterceptorTexture(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Sharp delta-wing silhouette — sleek and pointed
  const points = [
    { x: width * 0.5, y: 3 },
    { x: width * 0.94, y: height * 0.72 },
    { x: width * 0.78, y: height * 0.88 },
    { x: width * 0.5, y: height * 0.74 },
    { x: width * 0.22, y: height * 0.88 },
    { x: width * 0.06, y: height * 0.72 },
  ];
  const traceHull = (ox: number = 0, oy: number = 0) => {
    ctx.beginPath();
    ctx.moveTo(points[0].x + ox, points[0].y + oy);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x + ox, points[i].y + oy);
    ctx.closePath();
  };

  traceHull(0.5, 1.5);
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.fill();

  traceHull();
  const hullGrad = ctx.createLinearGradient(width * 0.1, 5, width * 0.9, height * 0.88);
  hullGrad.addColorStop(0, '#2a6f5a');
  hullGrad.addColorStop(0.5, '#16402e');
  hullGrad.addColorStop(1, '#0a1f18');
  ctx.fillStyle = hullGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(51, 255, 170, 0.88)';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Inner body panel
  ctx.beginPath();
  ctx.moveTo(width * 0.5, 10);
  ctx.lineTo(width * 0.72, height * 0.62);
  ctx.lineTo(width * 0.62, height * 0.76);
  ctx.lineTo(width * 0.5, height * 0.68);
  ctx.lineTo(width * 0.38, height * 0.76);
  ctx.lineTo(width * 0.28, height * 0.62);
  ctx.closePath();
  const panelGrad = ctx.createLinearGradient(width * 0.5, 10, width * 0.5, height * 0.76);
  panelGrad.addColorStop(0, '#0f2820');
  panelGrad.addColorStop(1, '#06140f');
  ctx.fillStyle = panelGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(80, 200, 150, 0.38)';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  // Sleek cockpit glow — teal
  const cockpitGlow = ctx.createRadialGradient(
    width * 0.5,
    height * 0.38,
    0.6,
    width * 0.5,
    height * 0.38,
    10,
  );
  cockpitGlow.addColorStop(0, 'rgba(200, 255, 230, 1)');
  cockpitGlow.addColorStop(0.38, 'rgba(80, 255, 180, 0.8)');
  cockpitGlow.addColorStop(1, 'rgba(30, 140, 90, 0)');
  ctx.fillStyle = cockpitGlow;
  ctx.beginPath();
  ctx.moveTo(width * 0.5, height * 0.2);
  ctx.lineTo(width * 0.6, height * 0.46);
  ctx.lineTo(width * 0.4, height * 0.46);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 255, 200, 0.85)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Seam lines
  ctx.strokeStyle = 'rgba(80, 220, 160, 0.24)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(width * 0.5, 5);
  ctx.lineTo(width * 0.5, height * 0.72);
  ctx.moveTo(width * 0.1, height * 0.72);
  ctx.lineTo(width * 0.9, height * 0.72);
  ctx.stroke();

  // Engine glows — teal
  for (const engineX of [width * 0.28, width * 0.72]) {
    const eg = ctx.createRadialGradient(engineX, height * 0.66, 0.5, engineX, height * 0.66, 6);
    eg.addColorStop(0, 'rgba(180, 255, 220, 1)');
    eg.addColorStop(1, 'rgba(50, 200, 140, 0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(engineX, height * 0.66, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = colorToRgba(0x33ffaa, 0.82);
  ctx.beginPath();
  ctx.arc(width * 0.28, height * 0.66, 3, 0, Math.PI * 2);
  ctx.arc(width * 0.72, height * 0.66, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawSkyRaiderShotTexture(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const outer = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, width * 0.5);
  outer.addColorStop(0, 'rgba(226,255,249,1)');
  outer.addColorStop(0.35, 'rgba(153,255,228,0.82)');
  outer.addColorStop(1, 'rgba(54,176,170,0)');
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(cx, cy, width * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(224,255,246,0.92)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(cx, cy, width * 0.35, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(188,255,236,0.65)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx - width * 0.18, cy);
  ctx.lineTo(cx + width * 0.18, cy);
  ctx.moveTo(cx, cy - width * 0.18);
  ctx.lineTo(cx, cy + width * 0.18);
  ctx.stroke();
}

function ensureSkyRaiderTextures(scene: Phaser.Scene) {
  createCanvasTexture(scene, SKY_RAIDER_STALKER_TEXTURE, 64, 64, drawStalkerTexture);
  createCanvasTexture(scene, SKY_RAIDER_LANCER_TEXTURE, 64, 64, drawLancerTexture);
  createCanvasTexture(scene, SKY_RAIDER_PHANTOM_TEXTURE, 64, 64, drawPhantomTexture);
  createCanvasTexture(scene, SKY_RAIDER_BOMBER_TEXTURE, 64, 64, drawBomberTexture);
  createCanvasTexture(scene, SKY_RAIDER_INTERCEPTOR_TEXTURE, 64, 64, drawInterceptorTexture);
  createCanvasTexture(scene, SKY_RAIDER_SHOT_TEXTURE, 16, 16, drawSkyRaiderShotTexture);
}

export class SkyRaiderShot extends Phaser.Physics.Arcade.Sprite {
  private variant: SkyRaiderVariant = 'stalker';

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, SKY_RAIDER_SHOT_TEXTURE);
  }

  public fire(
    x: number,
    y: number,
    velocityX: number,
    velocityY: number,
    variant: SkyRaiderVariant,
  ) {
    this.variant = variant;
    this.enableBody(true, x, y, true, true);
    this.setActive(true);
    this.setVisible(true);
    const scale = variant === 'lancer' ? 1.2 : variant === 'bomber' ? 1.3 : 1;
    this.setScale(scale);
    this.clearTint();
    if (variant === 'lancer') this.setTint(0xffd8ff);
    else if (variant === 'bomber') this.setTint(0xffaa66);
    else if (variant === 'phantom') this.setTint(0xd4a8ff);
    else if (variant === 'interceptor') this.setTint(0x88ffd4);
    this.setVelocity(velocityX, velocityY);
    this.setRotation(Math.atan2(velocityY, velocityX) + Math.PI / 2);
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (!this.active) return;
    this.rotation += delta * (this.variant === 'lancer' ? 0.02 : 0.013);
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const pad = 130;
    if (this.x < -pad || this.x > width + pad || this.y < -pad || this.y > height + pad) {
      this.disableBody(true, true);
    }
  }
}

type SkyRaiderSpawnConfig = {
  variant: SkyRaiderVariant;
  level: number;
  preset: DifficultyPreset;
  target: Phaser.Physics.Arcade.Sprite | null;
};

export class SkyRaider extends Phaser.Physics.Arcade.Sprite {
  private audioManager: AudioManager;
  private projectilePool: Phaser.Physics.Arcade.Group;
  private variant: SkyRaiderVariant = 'stalker';
  private behaviorState: SkyRaiderState = 'enter';
  private combatTarget: Phaser.Physics.Arcade.Sprite | null = null;
  private level: number = 1;
  private preset: DifficultyPreset = getDifficultyPreset('normal');
  private speedScale: number = 1;
  private aggressionScale: number = 1;
  private projectileScale: number = 1;
  private hitPoints: number = 1;
  private maxHitPoints: number = 1;
  private enterTargetY: number = 120;
  private retreatAt: number = 0;
  private nextShotAt: number = 0;
  private nextManeuverAt: number = 0;
  private diveEndAt: number = 0;
  private movementSeed: number = 0;
  private strafeDir: 1 | -1 = 1;
  private retreatLateralDir: 1 | -1 = 1;

  // Phantom fields
  private isCloaked: boolean = false;
  private recloakAt: number = 0;
  private splinePoints: { x: number; y: number }[] = [];
  private splineProgress: number = 0;
  private splineRefreshAt: number = 0;

  // Bomber fields (uses existing patrol logic with sine wave)

  // Interceptor fields
  public formationPartner: SkyRaider | null = null;
  public formationSide: -1 | 1 = 1;
  private bezierStart: { x: number; y: number } = { x: 0, y: 0 };
  private bezierControl: { x: number; y: number } = { x: 0, y: 0 };
  private bezierEnd: { x: number; y: number } = { x: 0, y: 0 };
  private bezierProgress: number = 0;
  private bezierActive: boolean = false;
  private bezierDuration: number = 1800;
  private nextBezierAt: number = 0;
  private burstShotsRemaining: number = 0;
  private burstNextShotAt: number = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    audio: AudioManager,
    projectiles: Phaser.Physics.Arcade.Group,
  ) {
    ensureSkyRaiderTextures(scene);
    super(scene, x, y, SKY_RAIDER_STALKER_TEXTURE);
    this.audioManager = audio;
    this.projectilePool = projectiles;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(56);
    this.setBodySize(40, 24, true);
    this.disableBody(true, true);
  }

  public setCombatTarget(target: Phaser.Physics.Arcade.Sprite | null) {
    this.combatTarget = target;
  }

  public getVariant(): SkyRaiderVariant {
    return this.variant;
  }

  public getHealth() {
    return this.hitPoints;
  }

  public getMaxHealth() {
    return this.maxHitPoints;
  }

  public spawn(config: SkyRaiderSpawnConfig) {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    this.variant = config.variant;
    this.level = Math.max(1, Math.floor(config.level));
    this.preset = config.preset;
    this.combatTarget = config.target;
    this.behaviorState = 'enter';
    this.movementSeed = Phaser.Math.FloatBetween(0, Math.PI * 2);
    this.strafeDir = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
    this.retreatLateralDir = this.strafeDir;
    this.diveEndAt = 0;

    const levelScale = Phaser.Math.Clamp(1 + (this.level - 1) * 0.05, 1, 1.9);
    this.speedScale = levelScale * this.preset.enemySpeedScale;
    this.aggressionScale = levelScale * this.preset.enemySpawnScale;
    this.projectileScale = Phaser.Math.Clamp(
      (1 + (this.level - 1) * 0.04) * this.preset.bossProjectileSpeedScale,
      0.9,
      2.2,
    );

    const spawnX = Phaser.Math.Between(70, width - 70);
    this.enableBody(true, spawnX, -86, true, true);
    this.setActive(true);
    this.setVisible(true);

    // Variant config lookup
    const variantConfigs: Record<
      SkyRaiderVariant,
      {
        texture: string;
        bodyW: number;
        bodyH: number;
        hpBase: number;
        hpDiv: number;
        hpMax: number;
        enterYMin: number;
        enterYMaxRatio: number;
        lifetimeBase: number;
        firstShotMin: number;
        firstShotMax: number;
      }
    > = {
      stalker: {
        texture: SKY_RAIDER_STALKER_TEXTURE,
        bodyW: 40,
        bodyH: 24,
        hpBase: 1,
        hpDiv: 7,
        hpMax: 3,
        enterYMin: 104,
        enterYMaxRatio: 0.35,
        lifetimeBase: 9200,
        firstShotMin: 860,
        firstShotMax: 1320,
      },
      lancer: {
        texture: SKY_RAIDER_LANCER_TEXTURE,
        bodyW: 46,
        bodyH: 26,
        hpBase: 2,
        hpDiv: 6,
        hpMax: 5,
        enterYMin: 88,
        enterYMaxRatio: 0.28,
        lifetimeBase: 7600,
        firstShotMin: 640,
        firstShotMax: 980,
      },
      phantom: {
        texture: SKY_RAIDER_PHANTOM_TEXTURE,
        bodyW: 38,
        bodyH: 22,
        hpBase: 1,
        hpDiv: 7,
        hpMax: 3,
        enterYMin: 80,
        enterYMaxRatio: 0.3,
        lifetimeBase: 8500,
        firstShotMin: 800,
        firstShotMax: 1200,
      },
      bomber: {
        texture: SKY_RAIDER_BOMBER_TEXTURE,
        bodyW: 50,
        bodyH: 28,
        hpBase: 3,
        hpDiv: 5,
        hpMax: 7,
        enterYMin: 70,
        enterYMaxRatio: 0.22,
        lifetimeBase: 10000,
        firstShotMin: 1100,
        firstShotMax: 1600,
      },
      interceptor: {
        texture: SKY_RAIDER_INTERCEPTOR_TEXTURE,
        bodyW: 36,
        bodyH: 22,
        hpBase: 1,
        hpDiv: 8,
        hpMax: 3,
        enterYMin: 90,
        enterYMaxRatio: 0.32,
        lifetimeBase: 7800,
        firstShotMin: 720,
        firstShotMax: 1080,
      },
    };

    const vc = variantConfigs[this.variant];
    this.setTexture(vc.texture);
    this.setBodySize(vc.bodyW, vc.bodyH, true);
    this.maxHitPoints = Phaser.Math.Clamp(
      vc.hpBase + Math.floor((this.level - 1) / vc.hpDiv),
      vc.hpBase,
      vc.hpMax,
    );
    this.enterTargetY = Phaser.Math.Between(vc.enterYMin, Math.round(height * vc.enterYMaxRatio));
    this.hitPoints = this.maxHitPoints;

    const lifetimePenalty =
      (this.level - 1) * 125 * Phaser.Math.Clamp(this.preset.enemySpawnScale, 0.8, 1.3);
    const lifetime = Phaser.Math.Clamp(vc.lifetimeBase - lifetimePenalty, 5000, 9800);
    this.retreatAt =
      this.scene.time.now +
      Phaser.Math.Between(Math.round(lifetime * 0.86), Math.round(lifetime * 1.12));

    const firstShotDelay = Phaser.Math.Between(vc.firstShotMin, vc.firstShotMax);
    this.nextShotAt =
      this.scene.time.now +
      Math.round(firstShotDelay / Phaser.Math.Clamp(this.aggressionScale, 0.9, 2.2));
    this.nextManeuverAt = this.scene.time.now + Phaser.Math.Between(520, 980);
    this.setVelocity(0, 120 * this.speedScale);
    this.setRotation(Math.PI);
    this.clearTint();

    // Variant-specific init
    if (this.variant === 'phantom') {
      this.isCloaked = true;
      this.setAlpha(SKY_RAIDER_VARIANT_TUNING.phantom.cloakAlpha);
      this.recloakAt = 0;
      this.splinePoints = [];
      this.splineProgress = 0;
      this.splineRefreshAt = 0;
    } else {
      this.isCloaked = false;
      this.setAlpha(1);
    }
    this.bezierActive = false;
    this.burstShotsRemaining = 0;
    this.formationPartner = null;
  }

  public applyBulletHit(damage: number = 1) {
    if (!this.active) {
      return {
        destroyed: false,
        variant: this.variant,
        health: this.hitPoints,
        maxHealth: this.maxHitPoints,
      };
    }
    this.hitPoints = Math.max(0, this.hitPoints - damage);
    if (this.hitPoints <= 0) {
      const variant = this.variant;
      this.deactivate();
      return { destroyed: true, variant, health: 0, maxHealth: this.maxHitPoints };
    }
    this.setTint(0xffffff);
    this.scene.time.delayedCall(55, () => {
      if (this.active) this.clearTint();
    });
    return {
      destroyed: false,
      variant: this.variant,
      health: this.hitPoints,
      maxHealth: this.maxHitPoints,
    };
  }

  public deactivate() {
    // Clean up interceptor partner reference
    if (this.formationPartner) {
      if (this.formationPartner.formationPartner === this) {
        this.formationPartner.formationPartner = null;
      }
      this.formationPartner = null;
    }
    if (this.body) this.disableBody(true, true);
    else this.setActive(false).setVisible(false);
  }

  private getBody() {
    return this.body as Phaser.Physics.Arcade.Body | null;
  }

  private enterRetreat() {
    if (!this.active || this.behaviorState === 'retreat') return;
    const width = this.scene.scale.width;
    this.behaviorState = 'retreat';
    this.retreatLateralDir = this.x < width * 0.5 ? -1 : 1;
    this.nextShotAt = Number.MAX_SAFE_INTEGER;
    if (this.variant === 'phantom' && this.isCloaked) {
      this.setAlpha(1);
      this.isCloaked = false;
    }
    this.bezierActive = false;
    const speedLookup: Record<SkyRaiderVariant, number> = {
      stalker: 240,
      lancer: 300,
      phantom: 260,
      bomber: 200,
      interceptor: 280,
    };
    const exitSpeedY = (speedLookup[this.variant] ?? 240) * this.speedScale;
    this.setVelocity(this.retreatLateralDir * 120 * this.speedScale, -exitSpeedY);
  }

  private updateEnter(time: number) {
    const body = this.getBody();
    if (!body) return;
    const enterSpeedLookup: Record<SkyRaiderVariant, number> = {
      stalker: 140,
      lancer: 165,
      phantom: 130,
      bomber: 110,
      interceptor: 155,
    };
    const enterSpeed = (enterSpeedLookup[this.variant] ?? 140) * this.speedScale;
    const sway = Math.sin(time * 0.0023 + this.movementSeed) * 46;
    body.velocity.x = Phaser.Math.Linear(body.velocity.x, sway, 0.12);
    body.velocity.y = Phaser.Math.Linear(body.velocity.y, enterSpeed, 0.2);
    if (this.y >= this.enterTargetY) {
      this.behaviorState = 'engage';
      this.nextManeuverAt = time + Phaser.Math.Between(520, 980);
    }
  }

  private updateStalkerEngage(time: number) {
    const body = this.getBody();
    if (!body) return;
    const targetX = this.combatTarget?.x ?? this.scene.scale.width * 0.5;
    const dx = targetX - this.x;
    const trackSpeed =
      Phaser.Math.Clamp(dx * 1.35, -220, 220) * Phaser.Math.Clamp(this.aggressionScale, 0.9, 2.1);
    const weave = Math.sin(time * 0.003 + this.movementSeed) * 58;
    const driftY = Math.sin(time * 0.004 + this.movementSeed * 1.8) * 34;
    body.velocity.x = Phaser.Math.Linear(body.velocity.x, trackSpeed + weave, 0.13);
    body.velocity.y = Phaser.Math.Linear(body.velocity.y, driftY, 0.14);
  }

  private updateLancerEngage(time: number) {
    const body = this.getBody();
    if (!body) return;
    if (time >= this.nextManeuverAt) {
      const target = this.combatTarget;
      const diveChance = Phaser.Math.Clamp(0.2 + (this.level - 1) * 0.035, 0.2, 0.6);
      if (target && Phaser.Math.FloatBetween(0, 1) < diveChance) {
        this.behaviorState = 'dive';
        this.diveEndAt = time + Phaser.Math.Between(780, 1180);
        return;
      }
      this.strafeDir = target
        ? target.x >= this.x
          ? 1
          : -1
        : Phaser.Math.Between(0, 1) === 0
          ? -1
          : 1;
      const minStep = Math.round(780 / Phaser.Math.Clamp(this.aggressionScale, 0.8, 2));
      const maxStep = Math.round(1450 / Phaser.Math.Clamp(this.aggressionScale, 0.8, 2));
      this.nextManeuverAt = time + Phaser.Math.Between(minStep, Math.max(minStep + 120, maxStep));
    }

    const patrolSpeed = 190 * this.speedScale;
    const waveX = Math.sin(time * 0.0028 + this.movementSeed) * 38;
    const waveY = Math.sin(time * 0.0045 + this.movementSeed * 1.3) * 22;
    body.velocity.x = Phaser.Math.Linear(
      body.velocity.x,
      this.strafeDir * patrolSpeed + waveX,
      0.1,
    );
    body.velocity.y = Phaser.Math.Linear(body.velocity.y, waveY, 0.12);
  }

  private updateDive(time: number) {
    const body = this.getBody();
    if (!body) return;
    const target = this.combatTarget;
    const aimX = target?.x ?? this.x;
    const aimY = target?.y ?? this.scene.scale.height * 0.8;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, aimX, aimY);
    const diveSpeed = 360 * this.speedScale * Phaser.Math.Clamp(this.aggressionScale, 0.9, 2.3);
    body.velocity.x = Math.cos(angle) * diveSpeed * 0.82;
    body.velocity.y = Math.abs(Math.sin(angle)) * diveSpeed + 180;
    if (this.y >= this.scene.scale.height * 0.78 || time >= this.diveEndAt) {
      this.enterRetreat();
    }
  }

  private updateRetreat() {
    const body = this.getBody();
    if (!body) return;
    const retreatSpeedLookup: Record<SkyRaiderVariant, number> = {
      stalker: 245,
      lancer: 305,
      phantom: 265,
      bomber: 210,
      interceptor: 285,
    };
    const targetVY = -(retreatSpeedLookup[this.variant] ?? 245) * this.speedScale;
    const targetVX = this.retreatLateralDir * 130 * this.speedScale;
    body.velocity.x = Phaser.Math.Linear(body.velocity.x, targetVX, 0.06);
    body.velocity.y = Phaser.Math.Linear(body.velocity.y, targetVY, 0.08);
  }

  private fireShot(spread: number, speedMultiplier: number = 1) {
    const target = this.combatTarget;
    if (!target?.active) return;
    const targetBody = target.body as Phaser.Physics.Arcade.Body | null;
    if (!targetBody) return;

    const shot = this.projectilePool.get(this.x, this.y) as SkyRaiderShot | null;
    if (!shot) return;

    const leadTime = this.variant === 'lancer' ? 0.3 : 0.22;
    const tx = target.x + targetBody.velocity.x * leadTime;
    const ty = target.y + targetBody.velocity.y * leadTime;
    const aimAngle =
      Phaser.Math.Angle.Between(this.x, this.y, tx, ty) + Phaser.Math.FloatBetween(-spread, spread);
    const speed = (this.variant === 'lancer' ? 460 : 380) * this.projectileScale * speedMultiplier;
    shot.fire(this.x, this.y, Math.cos(aimAngle) * speed, Math.sin(aimAngle) * speed, this.variant);

    const pan = Phaser.Math.Clamp((this.x / Math.max(1, this.scene.scale.width)) * 2 - 1, -1, 1);
    this.audioManager.playUFOShoot('scout', pan);
  }

  private tryShoot(time: number) {
    if (!this.active || this.behaviorState === 'retreat') return;
    if (!this.combatTarget?.active) return;

    // Interceptor burst fire is handled separately
    if (this.variant === 'interceptor' && this.burstShotsRemaining > 0) {
      if (time >= this.burstNextShotAt) {
        this.fireShot(0.09);
        this.burstShotsRemaining--;
        this.burstNextShotAt = time + SKY_RAIDER_VARIANT_TUNING.interceptor.burstShotIntervalMs;
      }
      return;
    }

    if (time < this.nextShotAt) return;

    // Phantom: only shoot when decloaked
    if (this.variant === 'phantom') {
      if (this.isCloaked) return;
      const cfg = SKY_RAIDER_VARIANT_TUNING.phantom;
      this.fireShot(cfg.shotSpread, cfg.shotSpeedMultiplier);
      this.scheduleNextShot(time, 1400);
      return;
    }

    // Bomber: fire cluster bomb
    if (this.variant === 'bomber') {
      this.fireClusterBomb();
      const interval = 1140 * SKY_RAIDER_VARIANT_TUNING.bomber.fireRateMultiplier;
      this.scheduleNextShot(time, interval);
      return;
    }

    // Interceptor: initiate burst during bezier arcs
    if (this.variant === 'interceptor') {
      const cfg = SKY_RAIDER_VARIANT_TUNING.interceptor;
      if (
        this.bezierActive &&
        this.bezierProgress >= cfg.burstProgressRange[0] &&
        this.bezierProgress <= cfg.burstProgressRange[1]
      ) {
        this.burstShotsRemaining = cfg.burstShotCount;
        this.burstNextShotAt = time;
        this.scheduleNextShot(time, 1300);
        return;
      }
      this.fireShot(0.09);
      this.scheduleNextShot(time, 1100);
      return;
    }

    // Stalker / Lancer default
    const baseInterval = this.variant === 'lancer' ? 900 : 1140;
    this.scheduleNextShot(time, baseInterval);

    this.fireShot(this.variant === 'lancer' ? 0.07 : 0.11);
    if (this.variant === 'lancer' && this.behaviorState === 'dive') {
      this.scene.time.delayedCall(90, () => {
        if (!this.active || this.behaviorState !== 'dive') return;
        this.fireShot(0.06, 1.06);
      });
    }
  }

  private scheduleNextShot(time: number, baseInterval: number) {
    const intervalScale = Phaser.Math.Clamp(1 / this.aggressionScale, 0.5, 1.4);
    const nextMin = Math.round(baseInterval * 0.84 * intervalScale);
    const nextMax = Math.round(baseInterval * 1.26 * intervalScale);
    this.nextShotAt = time + Phaser.Math.Between(nextMin, Math.max(nextMin + 120, nextMax));
  }

  private fireClusterBomb() {
    const target = this.combatTarget;
    if (!target?.active) return;
    const cfg = SKY_RAIDER_VARIANT_TUNING.bomber;
    const count = Phaser.Math.Between(cfg.clusterCount[0], cfg.clusterCount[1]);
    const baseAngle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    const speed = 380 * this.projectileScale * cfg.clusterShotSpeedScale;

    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * ((cfg.clusterSpreadRad * 2) / Math.max(1, count - 1));
      const angle = baseAngle + (count > 1 ? spread : 0);
      const shot = this.projectilePool.get(this.x, this.y) as SkyRaiderShot | null;
      if (!shot) break;
      shot.fire(this.x, this.y, Math.cos(angle) * speed, Math.sin(angle) * speed, 'bomber');
    }

    const pan = Phaser.Math.Clamp((this.x / Math.max(1, this.scene.scale.width)) * 2 - 1, -1, 1);
    this.audioManager.playUFOShoot('scout', pan);
  }

  // --- Phantom AI ---
  private updatePhantomEngage(time: number, delta: number) {
    const body = this.getBody();
    if (!body) return;
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const cfg = SKY_RAIDER_VARIANT_TUNING.phantom;

    // Handle recloak timer
    if (!this.isCloaked && this.recloakAt > 0 && time >= this.recloakAt) {
      this.isCloaked = true;
      this.recloakAt = 0;
      this.scene.tweens.add({
        targets: this,
        alpha: cfg.cloakAlpha,
        duration: cfg.decloakDurationMs,
      });
    }

    // Refresh spline points
    if (time >= this.splineRefreshAt || this.splinePoints.length === 0) {
      this.splinePoints = [];
      for (let i = 0; i < cfg.splinePointCount; i++) {
        this.splinePoints.push({
          x: Phaser.Math.Between(60, width - 60),
          y: Phaser.Math.Between(Math.round(height * 0.08), Math.round(height * 0.55)),
        });
      }
      this.splineProgress = 0;
      this.splineRefreshAt = time + cfg.splineRefreshIntervalMs;
    }

    // Move along Catmull-Rom spline
    this.splineProgress += delta / 1000 / (cfg.splineRefreshIntervalMs / 1000);
    if (this.splineProgress >= 1) this.splineProgress = 0;

    const pos = this.catmullRomPoint(this.splinePoints, this.splineProgress);
    const moveSpeed = 200 * this.speedScale;
    body.velocity.x = Phaser.Math.Linear(body.velocity.x, (pos.x - this.x) * 3, 0.08);
    body.velocity.y = Phaser.Math.Linear(body.velocity.y, (pos.y - this.y) * 3, 0.08);
    const speed = Math.sqrt(body.velocity.x * body.velocity.x + body.velocity.y * body.velocity.y);
    if (speed > moveSpeed) {
      const scale = moveSpeed / speed;
      body.velocity.x *= scale;
      body.velocity.y *= scale;
    }

    // Decloak when near player and ready to shoot
    if (this.isCloaked && this.combatTarget?.active) {
      const dx = this.combatTarget.x - this.x;
      const dy = this.combatTarget.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < cfg.decloakRange && time >= this.nextShotAt) {
        this.isCloaked = false;
        this.recloakAt = time + cfg.recloakDelayMs;
        this.scene.tweens.add({
          targets: this,
          alpha: 1,
          duration: cfg.decloakDurationMs,
        });
        const pan = Phaser.Math.Clamp(
          (this.x / Math.max(1, this.scene.scale.width)) * 2 - 1,
          -1,
          1,
        );
        this.audioManager.playUFOShoot('scout', pan);
      }
    }
  }

  private catmullRomPoint(points: { x: number; y: number }[], t: number): { x: number; y: number } {
    const n = points.length;
    if (n < 2) return points[0] ?? { x: 0, y: 0 };
    const segT = t * n;
    const i = Math.floor(segT) % n;
    const f = segT - Math.floor(segT);
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i % n];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const tt = f * f;
    const ttt = tt * f;
    return {
      x:
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * f +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * ttt),
      y:
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * f +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * ttt),
    };
  }

  // --- Bomber AI ---
  private updateBomberEngage(time: number) {
    const body = this.getBody();
    if (!body) return;
    const cfg = SKY_RAIDER_VARIANT_TUNING.bomber;

    // Slow horizontal sine-wave patrol at enterTargetY, no dive behavior
    const waveX =
      Math.sin(time * cfg.patrolSineFrequency + this.movementSeed) * cfg.patrolSineAmplitudeX;
    const driftY = Math.sin(time * 0.002 + this.movementSeed * 1.4) * 18;

    body.velocity.x = Phaser.Math.Linear(body.velocity.x, waveX * this.speedScale, 0.06);
    body.velocity.y = Phaser.Math.Linear(body.velocity.y, driftY, 0.08);
  }

  // --- Interceptor AI ---
  private updateInterceptorEngage(time: number, delta: number) {
    const body = this.getBody();
    if (!body) return;
    const cfg = SKY_RAIDER_VARIANT_TUNING.interceptor;
    const targetX = this.combatTarget?.x ?? this.scene.scale.width * 0.5;

    if (this.bezierActive) {
      // Follow quadratic bezier curve
      this.bezierProgress += delta / this.bezierDuration;
      if (this.bezierProgress >= 1) {
        this.bezierActive = false;
        this.bezierProgress = 1;
      }
      const t = Phaser.Math.Clamp(this.bezierProgress, 0, 1);
      const invT = 1 - t;
      const bx =
        invT * invT * this.bezierStart.x +
        2 * invT * t * this.bezierControl.x +
        t * t * this.bezierEnd.x;
      const by =
        invT * invT * this.bezierStart.y +
        2 * invT * t * this.bezierControl.y +
        t * t * this.bezierEnd.y;
      body.velocity.x = (bx - this.x) * (1000 / Math.max(16, delta));
      body.velocity.y = (by - this.y) * (1000 / Math.max(16, delta));
      return;
    }

    // Formation hold: track player X with damping, keep formation spacing
    const centerX = targetX + this.formationSide * cfg.formationSpacing * 0.5;
    const dx = centerX - this.x;
    body.velocity.x = Phaser.Math.Linear(body.velocity.x, dx * 6, cfg.trackingLerp);
    const driftY = Math.sin(time * 0.003 + this.movementSeed) * 28;
    body.velocity.y = Phaser.Math.Linear(body.velocity.y, driftY, 0.1);

    // Initiate bezier arc attack
    if (time >= this.nextBezierAt) {
      this.bezierActive = true;
      this.bezierProgress = 0;
      this.bezierDuration = cfg.bezierDurationMs;
      this.bezierStart = { x: this.x, y: this.y };
      this.bezierControl = {
        x: this.x + this.formationSide * Phaser.Math.Between(100, 180),
        y: this.y + Phaser.Math.Between(40, 100),
      };
      this.bezierEnd = {
        x: targetX + Phaser.Math.Between(-60, 60),
        y: Math.min(this.y + Phaser.Math.Between(80, 160), this.scene.scale.height * 0.7),
      };
      this.nextBezierAt =
        time + Phaser.Math.Between(cfg.bezierIntervalMs[0], cfg.bezierIntervalMs[1]);
    }
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (!this.active) return;

    if (time >= this.retreatAt) {
      this.enterRetreat();
    }

    if (this.behaviorState === 'enter') this.updateEnter(time);
    else if (this.behaviorState === 'engage') {
      if (this.variant === 'stalker') this.updateStalkerEngage(time);
      else if (this.variant === 'lancer') this.updateLancerEngage(time);
      else if (this.variant === 'phantom') this.updatePhantomEngage(time, delta);
      else if (this.variant === 'bomber') this.updateBomberEngage(time);
      else if (this.variant === 'interceptor') this.updateInterceptorEngage(time, delta);
    } else if (this.behaviorState === 'dive') this.updateDive(time);
    else this.updateRetreat();

    this.tryShoot(time);

    const body = this.getBody();
    if (body) {
      this.rotation = Phaser.Math.Angle.RotateTo(
        this.rotation,
        Math.PI + Phaser.Math.Clamp(body.velocity.x * 0.0018, -0.42, 0.42),
        0.06,
      );
    }

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const pad = 150;
    if (this.x < -pad || this.x > width + pad || this.y < -pad || this.y > height + pad) {
      this.deactivate();
    }
  }
}

export class SkyRaiderManager {
  private scene: Phaser.Scene;
  private audioManager: AudioManager;
  private raiders: Phaser.Physics.Arcade.Group;
  private projectiles: Phaser.Physics.Arcade.Group;
  private spawnTimerMs: number = 0;
  private difficultyLevel: number = 1;
  private preset: DifficultyPreset = getDifficultyPreset('normal');
  private runtimeIntensity: number = 1;
  private combatTarget: Phaser.Physics.Arcade.Sprite | null = null;

  constructor(scene: Phaser.Scene, audio: AudioManager) {
    ensureSkyRaiderTextures(scene);
    this.scene = scene;
    this.audioManager = audio;
    this.raiders = this.scene.physics.add.group({
      runChildUpdate: true,
      maxSize: 12,
    });
    this.projectiles = this.scene.physics.add.group({
      classType: SkyRaiderShot,
      runChildUpdate: true,
      maxSize: 56,
    });
    this.spawnTimerMs = this.computeNextSpawnDelay();
  }

  private hasGroupChildren(group: Phaser.Physics.Arcade.Group | null | undefined) {
    const anyGroup = group as any;
    return Boolean(anyGroup?.children && typeof anyGroup.children.size === 'number');
  }

  public setDifficultyLevel(level: number) {
    this.difficultyLevel = Math.max(1, Math.floor(level));
  }

  public setDifficultyPreset(preset: DifficultyPreset) {
    this.preset = preset;
  }

  public setRuntimeIntensity(intensity: number) {
    this.runtimeIntensity = Phaser.Math.Clamp(intensity, 0.6, 1.25);
  }

  public setCombatTarget(target: Phaser.Physics.Arcade.Sprite | null) {
    this.combatTarget = target;
  }

  public resetSpawnController(initialDelayMs?: number) {
    this.spawnTimerMs =
      initialDelayMs !== undefined
        ? Math.max(0, Math.round(initialDelayMs))
        : this.computeNextSpawnDelay();
  }

  public getRaiders() {
    return this.raiders;
  }

  public getProjectiles() {
    return this.projectiles;
  }

  public getActiveRaiderCount() {
    if (!this.hasGroupChildren(this.raiders)) return 0;
    return this.raiders.countActive(true);
  }

  public getActiveProjectileCount() {
    if (!this.hasGroupChildren(this.projectiles)) return 0;
    return this.projectiles.countActive(true);
  }

  public deactivateAll() {
    if (this.hasGroupChildren(this.raiders)) {
      const raiders = this.raiders.getChildren() as unknown as SkyRaider[];
      for (const raider of raiders) {
        if (raider.active) raider.deactivate();
      }
    }
    if (this.hasGroupChildren(this.projectiles)) {
      const shots = this.projectiles.getChildren() as SkyRaiderShot[];
      for (const shot of shots) {
        if (shot.active) shot.disableBody(true, true);
      }
    }
  }

  public destroy() {
    this.deactivateAll();
    if (this.hasGroupChildren(this.raiders)) {
      this.raiders.clear(true, true);
    }
    if (this.hasGroupChildren(this.projectiles)) {
      this.projectiles.clear(true, true);
    }
  }

  private getActiveCap() {
    let cap = this.difficultyLevel >= 7 ? 2 : 1;
    if (this.preset.key === 'hard' && this.difficultyLevel >= 11) cap = 3;
    // Allow an extra slot for interceptor pairs
    if (this.difficultyLevel >= 8) cap = Math.max(cap, 3);
    return cap;
  }

  private pickVariant(): SkyRaiderVariant {
    const level = this.difficultyLevel;
    const roll = Phaser.Math.FloatBetween(0, 1);
    let cumulative = 0;

    // Interceptor: available from level 8
    if (level >= 8) {
      const chance = Phaser.Math.Clamp(0.03 + (level - 8) * 0.02, 0.03, 0.18);
      cumulative += chance;
      if (roll < cumulative) return 'interceptor';
    }

    // Bomber: available from level 6
    if (level >= 6) {
      const chance = Phaser.Math.Clamp(0.04 + (level - 6) * 0.025, 0.04, 0.2);
      cumulative += chance;
      if (roll < cumulative) return 'bomber';
    }

    // Phantom: available from level 4
    if (level >= 4) {
      const chance = Phaser.Math.Clamp(0.05 + (level - 4) * 0.03, 0.05, 0.25);
      cumulative += chance;
      if (roll < cumulative) return 'phantom';
    }

    // Lancer: existing logic
    const levelChance = Phaser.Math.Clamp(0.08 + (level - 1) * 0.05, 0.08, 0.6);
    const presetBonus = Phaser.Math.Clamp((this.preset.enemySpawnScale - 1) * 0.35, -0.12, 0.22);
    const lancerChance = Phaser.Math.Clamp(levelChance + presetBonus, 0.1, 0.7);
    const lancerRoll = Phaser.Math.FloatBetween(0, 1);
    return lancerRoll < lancerChance ? 'lancer' : 'stalker';
  }

  private getOrCreateRaider() {
    if (!this.hasGroupChildren(this.raiders)) return null;
    let raider = this.raiders.getFirstDead(false) as SkyRaider | null;
    if (raider) return raider;
    if (this.raiders.getLength() >= 12) return null;
    raider = new SkyRaider(this.scene, -120, -120, this.audioManager, this.projectiles);
    this.raiders.add(raider, true);
    return raider;
  }

  private spawnRaider() {
    const variant = this.pickVariant();

    // Interceptor spawns as a pair
    if (variant === 'interceptor') {
      const r1 = this.getOrCreateRaider();
      const r2 = this.getOrCreateRaider();
      if (!r1 || !r2) return false;
      const config = {
        variant: 'interceptor' as SkyRaiderVariant,
        level: this.difficultyLevel,
        preset: this.preset,
        target: this.combatTarget,
      };
      r1.spawn(config);
      r2.spawn(config);
      r1.formationPartner = r2;
      r2.formationPartner = r1;
      r1.formationSide = -1;
      r2.formationSide = 1;
      return true;
    }

    const raider = this.getOrCreateRaider();
    if (!raider) return false;
    raider.spawn({
      variant,
      level: this.difficultyLevel,
      preset: this.preset,
      target: this.combatTarget,
    });
    return true;
  }

  private computeNextSpawnDelay() {
    const levelRamp = (this.difficultyLevel - 1) * 520;
    const rateScale = Phaser.Math.Clamp(1 / this.preset.enemySpawnScale, 0.72, 1.3);
    const minBase = Math.max(6800, Math.round((15800 - levelRamp) * rateScale));
    const maxBase = Math.max(minBase + 3600, Math.round((25200 - levelRamp) * rateScale));
    const openingScale = Phaser.Math.Linear(1.35, 1, this.runtimeIntensity);
    return Math.round(Phaser.Math.Between(minBase, maxBase) * openingScale);
  }

  public update(_time: number, delta: number) {
    if (!this.hasGroupChildren(this.raiders) || !this.hasGroupChildren(this.projectiles)) return;
    const activeRaiders = this.raiders.getChildren() as unknown as SkyRaider[];
    for (const raider of activeRaiders) {
      if (!raider.active) continue;
      raider.setCombatTarget(this.combatTarget);
    }

    this.spawnTimerMs -= delta;
    if (this.spawnTimerMs > 0) return;

    const activeCount = this.raiders.countActive(true);
    if (activeCount >= this.getActiveCap()) {
      this.spawnTimerMs = Phaser.Math.Between(850, 1350);
      return;
    }

    const spawned = this.spawnRaider();
    this.spawnTimerMs = spawned ? this.computeNextSpawnDelay() : 700;
  }
}
