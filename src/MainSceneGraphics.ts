import Phaser from 'phaser';

export interface MainSceneGraphicsConfig {
  proximityMineTextureKey: string;
  impactRingTextureKey: string;
  impactRingTextureSize: number;
  impactRingTextureRadius: number;
  wingmanDroneTextureKey: string;
}

export function bootstrapMainSceneGraphics(
  scene: Phaser.Scene,
  config: MainSceneGraphicsConfig,
): void {
  const starG = scene.add.graphics();
  starG.setVisible(false);
  starG.fillStyle(0xffffff, 1);
  starG.fillRect(0, 0, 2, 2);
  starG.generateTexture('star', 2, 2);
  starG.destroy();
  const bulletG = scene.add.graphics();
  bulletG.setVisible(false);
  bulletG.fillStyle(0xffff00, 1);
  bulletG.fillRect(0, 0, 8, 20);
  bulletG.generateTexture('bullet', 8, 20);
  bulletG.destroy();

  if (!scene.textures.exists(config.proximityMineTextureKey)) {
    const texture = scene.textures.createCanvas(config.proximityMineTextureKey, 30, 30);
    if (texture) {
      const ctx = texture.getContext();
      ctx.clearRect(0, 0, 30, 30);

      const shadow = ctx.createRadialGradient(15, 16.5, 2, 15, 16.5, 13.5);
      shadow.addColorStop(0, 'rgba(0, 0, 0, 0.52)');
      shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(15, 16.5, 13.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(15, 15, 9.6, 0, Math.PI * 2);
      const hullGrad = ctx.createLinearGradient(7, 6, 23, 24);
      hullGrad.addColorStop(0, '#7f8996');
      hullGrad.addColorStop(0.46, '#37414f');
      hullGrad.addColorStop(1, '#171e28');
      ctx.fillStyle = hullGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(226, 236, 248, 0.88)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(15, 15, 5.9, 0, Math.PI * 2);
      const coreGrad = ctx.createRadialGradient(15, 14, 0.8, 15, 15, 6.2);
      coreGrad.addColorStop(0, 'rgba(255, 247, 217, 1)');
      coreGrad.addColorStop(0.35, 'rgba(255, 210, 126, 0.95)');
      coreGrad.addColorStop(1, 'rgba(255, 120, 52, 0.5)');
      ctx.fillStyle = coreGrad;
      ctx.fill();

      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const ix = 15 + Math.cos(angle) * 9.6;
        const iy = 15 + Math.sin(angle) * 9.6;
        const ox = 15 + Math.cos(angle) * 13.1;
        const oy = 15 + Math.sin(angle) * 13.1;
        ctx.strokeStyle = 'rgba(232, 242, 255, 0.86)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(ix, iy);
        ctx.lineTo(ox, oy);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(245, 171, 92, 0.8)';
      ctx.lineWidth = 0.95;
      ctx.beginPath();
      ctx.arc(15, 15, 3.1, 0, Math.PI * 2);
      ctx.stroke();

      texture.refresh();
    }
  }

  if (!scene.textures.exists(config.impactRingTextureKey)) {
    const ringG = scene.add.graphics();
    ringG.setVisible(false);
    ringG.lineStyle(8, 0xffffff, 1);
    ringG.strokeCircle(
      config.impactRingTextureSize / 2,
      config.impactRingTextureSize / 2,
      config.impactRingTextureRadius,
    );
    ringG.generateTexture(
      config.impactRingTextureKey,
      config.impactRingTextureSize,
      config.impactRingTextureSize,
    );
    ringG.destroy();
  }

  if (!scene.textures.exists('ufo_shard')) {
    const shardG = scene.add.graphics();
    shardG.fillStyle(0xffffff, 1);
    shardG.beginPath();
    shardG.moveTo(8, 0);
    shardG.lineTo(14, 6);
    shardG.lineTo(10, 16);
    shardG.lineTo(2, 14);
    shardG.lineTo(0, 6);
    shardG.closePath();
    shardG.fillPath();
    shardG.lineStyle(1, 0xd7f8ff, 1);
    shardG.strokePath();
    shardG.generateTexture('ufo_shard', 16, 16);
    shardG.destroy();
  }

  if (!scene.textures.exists('elite_drone')) {
    const texture = scene.textures.createCanvas('elite_drone', 32, 28);
    if (texture) {
      const ctx = texture.getContext();
      ctx.clearRect(0, 0, 32, 28);

      const bodyGradient = ctx.createLinearGradient(4, 6, 28, 22);
      bodyGradient.addColorStop(0, '#63778d');
      bodyGradient.addColorStop(0.45, '#2a394d');
      bodyGradient.addColorStop(1, '#10161f');
      ctx.fillStyle = bodyGradient;
      ctx.beginPath();
      ctx.moveTo(8, 6);
      ctx.lineTo(24, 6);
      ctx.quadraticCurveTo(30, 6, 30, 12);
      ctx.lineTo(30, 16);
      ctx.quadraticCurveTo(30, 22, 24, 22);
      ctx.lineTo(8, 22);
      ctx.quadraticCurveTo(2, 22, 2, 16);
      ctx.lineTo(2, 12);
      ctx.quadraticCurveTo(2, 6, 8, 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(226, 241, 255, 0.88)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.fillStyle = 'rgba(13, 20, 31, 0.92)';
      ctx.beginPath();
      ctx.moveTo(9, 9);
      ctx.lineTo(23, 9);
      ctx.lineTo(25, 14);
      ctx.lineTo(23, 19);
      ctx.lineTo(9, 19);
      ctx.lineTo(7, 14);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(123, 162, 199, 0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const eyeGlow = ctx.createRadialGradient(16, 14, 0.7, 16, 14, 6.3);
      eyeGlow.addColorStop(0, 'rgba(236, 251, 255, 1)');
      eyeGlow.addColorStop(0.35, 'rgba(142, 240, 255, 0.82)');
      eyeGlow.addColorStop(1, 'rgba(76, 191, 255, 0)');
      ctx.fillStyle = eyeGlow;
      ctx.beginPath();
      ctx.arc(16, 14, 6.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(214, 248, 255, 0.95)';
      ctx.beginPath();
      ctx.arc(16, 14, 2.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(188, 224, 255, 0.35)';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(6.5, 14);
      ctx.lineTo(25.5, 14);
      ctx.moveTo(9, 18.5);
      ctx.lineTo(23, 18.5);
      ctx.stroke();

      const topBeacon = ctx.createRadialGradient(16, 4, 0.4, 16, 4, 3.3);
      topBeacon.addColorStop(0, 'rgba(241, 255, 255, 1)');
      topBeacon.addColorStop(0.5, 'rgba(154, 255, 238, 0.9)');
      topBeacon.addColorStop(1, 'rgba(90, 205, 175, 0)');
      ctx.fillStyle = topBeacon;
      ctx.beginPath();
      ctx.arc(16, 4, 3.1, 0, Math.PI * 2);
      ctx.fill();

      texture.refresh();
    }
  }

  const drawRescueAstronautTexture = (textureKey: string, waveArmRaised: boolean) => {
    if (scene.textures.exists(textureKey)) return;
    const texture = scene.textures.createCanvas(textureKey, 44, 54);
    if (!texture) return;
    const ctx = texture.getContext();
    ctx.clearRect(0, 0, 44, 54);

    const shadow = ctx.createRadialGradient(22, 48, 3, 22, 48, 14);
    shadow.addColorStop(0, 'rgba(0,0,0,0.42)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(22, 48, 14, 4.8, 0, 0, Math.PI * 2);
    ctx.fill();

    const backpackGrad = ctx.createLinearGradient(10, 20, 18, 40);
    backpackGrad.addColorStop(0, '#5e6976');
    backpackGrad.addColorStop(1, '#1f2833');
    ctx.fillStyle = backpackGrad;
    ctx.beginPath();
    ctx.roundRect(11, 23, 7, 13, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(214,230,246,0.38)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    const suitGrad = ctx.createLinearGradient(16, 16, 29, 44);
    suitGrad.addColorStop(0, '#f4f9ff');
    suitGrad.addColorStop(0.48, '#b9cadf');
    suitGrad.addColorStop(1, '#6a7f9a');
    ctx.fillStyle = suitGrad;
    ctx.beginPath();
    ctx.roundRect(16, 18, 14, 22, 4.6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(236,246,255,0.86)';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    const torsoGlow = ctx.createLinearGradient(18, 19, 18, 40);
    torsoGlow.addColorStop(0, 'rgba(255,255,255,0.44)');
    torsoGlow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = torsoGlow;
    ctx.fillRect(18, 19, 4.5, 21);

    const armGrad = ctx.createLinearGradient(0, 0, 0, 14);
    armGrad.addColorStop(0, '#e6f2ff');
    armGrad.addColorStop(1, '#7f93ad');
    ctx.fillStyle = armGrad;
    ctx.beginPath();
    ctx.roundRect(12, 24, 4, 11, 2.2);
    if (waveArmRaised) {
      ctx.save();
      ctx.translate(31.8, 29.5);
      ctx.rotate(-0.92);
      ctx.roundRect(-2, -8.7, 4, 11, 2.2);
      ctx.restore();
    } else {
      ctx.roundRect(30, 24, 4, 11, 2.2);
    }
    ctx.fill();
    ctx.strokeStyle = 'rgba(226,240,255,0.7)';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    const gloveGrad = ctx.createLinearGradient(0, 0, 0, 6);
    gloveGrad.addColorStop(0, '#5ec9ff');
    gloveGrad.addColorStop(1, '#1e7cad');
    ctx.fillStyle = gloveGrad;
    ctx.beginPath();
    ctx.arc(13.8, 36.5, 1.9, 0, Math.PI * 2);
    ctx.arc(waveArmRaised ? 35.8 : 32.2, waveArmRaised ? 16.8 : 36.5, 1.9, 0, Math.PI * 2);
    ctx.fill();

    if (waveArmRaised) {
      ctx.strokeStyle = 'rgba(150, 223, 255, 0.78)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(38.9, 13.7, 1.9, -0.88, -0.1);
      ctx.arc(39.9, 17, 2.6, -1.02, -0.14);
      ctx.stroke();
    }

    const legGrad = ctx.createLinearGradient(0, 37, 0, 49);
    legGrad.addColorStop(0, '#d7e6f7');
    legGrad.addColorStop(1, '#748aa5');
    ctx.fillStyle = legGrad;
    ctx.beginPath();
    ctx.roundRect(18, 37, 5, 10, 2);
    ctx.roundRect(23, 37, 5, 10, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,243,255,0.65)';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    const bootGrad = ctx.createLinearGradient(0, 0, 0, 6);
    bootGrad.addColorStop(0, '#4a5f7b');
    bootGrad.addColorStop(1, '#1c2531');
    ctx.fillStyle = bootGrad;
    ctx.beginPath();
    ctx.roundRect(17, 45.5, 6.2, 3.6, 1.2);
    ctx.roundRect(22.8, 45.5, 6.2, 3.6, 1.2);
    ctx.fill();

    const helmetRim = ctx.createLinearGradient(0, 0, 0, 26);
    helmetRim.addColorStop(0, '#f0f8ff');
    helmetRim.addColorStop(1, '#879bb4');
    ctx.fillStyle = helmetRim;
    ctx.beginPath();
    ctx.ellipse(22, 15.2, 10.6, 11.2, 0, 0, Math.PI * 2);
    ctx.fill();

    const visor = ctx.createRadialGradient(20, 12.8, 1.2, 22, 15.5, 9.8);
    visor.addColorStop(0, 'rgba(223,251,255,0.95)');
    visor.addColorStop(0.42, 'rgba(124,214,255,0.78)');
    visor.addColorStop(1, 'rgba(38,92,133,0.92)');
    ctx.fillStyle = visor;
    ctx.beginPath();
    ctx.ellipse(22, 15.5, 8.7, 9.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,247,255,0.88)';
    ctx.lineWidth = 0.95;
    ctx.stroke();

    const visorHighlight = ctx.createLinearGradient(14, 9, 24, 19);
    visorHighlight.addColorStop(0, 'rgba(255,255,255,0.62)');
    visorHighlight.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = visorHighlight;
    ctx.beginPath();
    ctx.ellipse(18.7, 11.7, 3.6, 2.4, -0.45, 0, Math.PI * 2);
    ctx.fill();

    const beacon = ctx.createRadialGradient(22, 3.8, 0.4, 22, 3.8, 3.2);
    beacon.addColorStop(0, 'rgba(255,255,255,0.95)');
    beacon.addColorStop(0.52, 'rgba(136,245,255,0.92)');
    beacon.addColorStop(1, 'rgba(76,171,224,0)');
    ctx.fillStyle = beacon;
    ctx.beginPath();
    ctx.arc(22, 3.8, 3, 0, Math.PI * 2);
    ctx.fill();

    texture.refresh();
  };

  drawRescueAstronautTexture('rescue_astronaut', false);
  drawRescueAstronautTexture('rescue_astronaut_wave', true);

  if (!scene.textures.exists(config.wingmanDroneTextureKey)) {
    const texture = scene.textures.createCanvas(config.wingmanDroneTextureKey, 34, 26);
    if (texture) {
      const ctx = texture.getContext();
      const hullPoints = [
        { x: 17, y: 2 },
        { x: 30, y: 8 },
        { x: 27, y: 21 },
        { x: 17, y: 24 },
        { x: 7, y: 21 },
        { x: 4, y: 8 },
      ];
      const traceHull = (xOffset: number = 0, yOffset: number = 0) => {
        ctx.beginPath();
        ctx.moveTo(hullPoints[0].x + xOffset, hullPoints[0].y + yOffset);
        for (let i = 1; i < hullPoints.length; i++) {
          ctx.lineTo(hullPoints[i].x + xOffset, hullPoints[i].y + yOffset);
        }
        ctx.closePath();
      };
      ctx.clearRect(0, 0, 34, 26);

      traceHull(0.4, 1.2);
      ctx.fillStyle = 'rgba(0,0,0,0.36)';
      ctx.fill();

      traceHull();
      const bodyGradient = ctx.createLinearGradient(6, 3, 28, 22);
      bodyGradient.addColorStop(0, '#58677c');
      bodyGradient.addColorStop(0.45, '#253246');
      bodyGradient.addColorStop(1, '#0d121a');
      ctx.fillStyle = bodyGradient;
      ctx.fill();
      ctx.strokeStyle = 'rgba(212, 233, 255, 0.88)';
      ctx.lineWidth = 1.35;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(17, 5);
      ctx.lineTo(25, 9);
      ctx.lineTo(23.5, 17.5);
      ctx.lineTo(17, 20);
      ctx.lineTo(10.5, 17.5);
      ctx.lineTo(9, 9);
      ctx.closePath();
      const panelGradient = ctx.createLinearGradient(17, 5, 17, 20);
      panelGradient.addColorStop(0, '#111a28');
      panelGradient.addColorStop(1, '#080c12');
      ctx.fillStyle = panelGradient;
      ctx.fill();
      ctx.strokeStyle = 'rgba(124, 159, 194, 0.45)';
      ctx.lineWidth = 0.9;
      ctx.stroke();

      const eyeGlow = ctx.createRadialGradient(17, 12, 0.6, 17, 12, 5.2);
      eyeGlow.addColorStop(0, 'rgba(206, 244, 255, 1)');
      eyeGlow.addColorStop(0.4, 'rgba(110, 217, 255, 0.82)');
      eyeGlow.addColorStop(1, 'rgba(36, 145, 220, 0)');
      ctx.beginPath();
      ctx.arc(17, 12, 5, 0, Math.PI * 2);
      ctx.fillStyle = eyeGlow;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(17, 12, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(235, 250, 255, 0.94)';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(8, 10.5);
      ctx.lineTo(14, 9);
      ctx.moveTo(26, 10.5);
      ctx.lineTo(20, 9);
      ctx.moveTo(9.5, 17.5);
      ctx.lineTo(14.5, 16.7);
      ctx.moveTo(24.5, 16.7);
      ctx.lineTo(19.5, 17.5);
      ctx.strokeStyle = 'rgba(222, 240, 255, 0.42)';
      ctx.lineWidth = 0.85;
      ctx.stroke();

      ctx.fillStyle = 'rgba(145, 190, 228, 0.66)';
      ctx.fillRect(8.5, 21.2, 17, 1);
      ctx.fillStyle = 'rgba(255, 187, 108, 0.78)';
      ctx.beginPath();
      ctx.arc(11.2, 22.4, 1.15, 0, Math.PI * 2);
      ctx.arc(22.8, 22.4, 1.15, 0, Math.PI * 2);
      ctx.fill();

      texture.refresh();
    }
  }

  if (!scene.textures.exists('shield_bunker')) {
    const texture = scene.textures.createCanvas('shield_bunker', 140, 52);
    if (texture) {
      const ctx = texture.getContext();
      ctx.clearRect(0, 0, 140, 52);

      const traceRoundedRect = (
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number,
      ) => {
        const r = Math.min(radius, width * 0.5, height * 0.5);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + width - r, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + r);
        ctx.lineTo(x + width, y + height - r);
        ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        ctx.lineTo(x + r, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      };

      traceRoundedRect(5, 5, 130, 42, 10);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.33)';
      ctx.fill();

      traceRoundedRect(4, 3, 132, 44, 10);
      const hullGradient = ctx.createLinearGradient(6, 3, 132, 47);
      hullGradient.addColorStop(0, '#8f9dac');
      hullGradient.addColorStop(0.38, '#4c5868');
      hullGradient.addColorStop(1, '#1f2935');
      ctx.fillStyle = hullGradient;
      ctx.fill();
      ctx.strokeStyle = 'rgba(219, 235, 255, 0.82)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      traceRoundedRect(8, 7, 124, 36, 8);
      const innerPlateGradient = ctx.createLinearGradient(8, 7, 8, 43);
      innerPlateGradient.addColorStop(0, 'rgba(21, 30, 41, 0.93)');
      innerPlateGradient.addColorStop(1, 'rgba(8, 12, 18, 0.95)');
      ctx.fillStyle = innerPlateGradient;
      ctx.fill();
      ctx.strokeStyle = 'rgba(124, 148, 174, 0.58)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const topGlow = ctx.createLinearGradient(0, 8, 0, 18);
      topGlow.addColorStop(0, 'rgba(175, 234, 255, 0.54)');
      topGlow.addColorStop(1, 'rgba(175, 234, 255, 0)');
      ctx.fillStyle = topGlow;
      ctx.fillRect(14, 9, 112, 8);

      ctx.strokeStyle = 'rgba(210, 226, 244, 0.32)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(24, 14);
      ctx.lineTo(116, 14);
      ctx.moveTo(44, 8);
      ctx.lineTo(44, 42);
      ctx.moveTo(96, 8);
      ctx.lineTo(96, 42);
      ctx.stroke();

      const ventXs = [24, 61, 98];
      for (const x of ventXs) {
        const ventGradient = ctx.createLinearGradient(x, 22, x, 50);
        ventGradient.addColorStop(0, 'rgba(2, 6, 11, 0.95)');
        ventGradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
        ctx.fillStyle = ventGradient;
        ctx.fillRect(x, 22, 18, 28);

        ctx.strokeStyle = 'rgba(145, 168, 198, 0.44)';
        ctx.lineWidth = 0.9;
        ctx.strokeRect(x + 0.5, 22.5, 17, 27);

        ctx.strokeStyle = 'rgba(102, 122, 152, 0.5)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x + 6, 23);
        ctx.lineTo(x + 6, 49);
        ctx.moveTo(x + 12, 23);
        ctx.lineTo(x + 12, 49);
        ctx.stroke();

        const diodeGlow = ctx.createRadialGradient(x + 9, 21, 0.6, x + 9, 21, 4.8);
        diodeGlow.addColorStop(0, 'rgba(153, 241, 255, 0.95)');
        diodeGlow.addColorStop(1, 'rgba(45, 175, 225, 0)');
        ctx.fillStyle = diodeGlow;
        ctx.beginPath();
        ctx.arc(x + 9, 21, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(154, 203, 227, 0.75)';
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.moveTo(13, 17);
      ctx.lineTo(127, 17);
      ctx.stroke();

      const rivets = [18, 33, 48, 63, 78, 93, 108, 123];
      ctx.fillStyle = 'rgba(218, 235, 255, 0.72)';
      for (const x of rivets) {
        ctx.beginPath();
        ctx.arc(x, 6.8, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      texture.refresh();
    }
  }
}
