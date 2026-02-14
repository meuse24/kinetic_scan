import Phaser from 'phaser';
import { performanceMonitor } from './PerformanceMonitor';

const fragShader = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTime;
uniform vec2 uResolution;
uniform bool uHighEnd;
uniform float uMatrixIntensity;

varying vec2 outTexCoord;

void main() {
    vec2 uv = outTexCoord;

    if (uHighEnd) {
        // Curvature (Monitor-Wölbung)
        vec2 centeredUv = uv * 2.0 - 1.0;
        centeredUv *= 1.0 + pow(length(centeredUv) * 0.15, 2.0);
        uv = (centeredUv + 1.0) * 0.5;
    }

    // Out of bounds check for curvature
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    vec4 color = texture2D(uMainSampler, uv);

    if (uHighEnd) {
        // Chromatic Aberration (RGB Shift) - boosted during matrix mode
        float shift = mix(0.0015, 0.006, uMatrixIntensity);
        color.r = texture2D(uMainSampler, vec2(uv.x + shift, uv.y)).r;
        color.b = texture2D(uMainSampler, vec2(uv.x - shift, uv.y)).b;
        color.a = 1.0;

        // Scanlines — boosted during matrix mode
        float scanlineStrength = mix(0.04, 0.07, uMatrixIntensity);
        float scanline = sin(uv.y * 800.0) * scanlineStrength;
        color.rgb -= scanline;

        // Flimmern (leichtes Rauschen)
        float noise = (fract(sin(dot(uv, vec2(12.9898, 78.233) * uTime)) * 43758.5453)) * 0.02;
        color.rgb += noise;

        // Vignette
        float dist = length(uv - 0.5);
        color.rgb *= smoothstep(0.8, 0.4, dist);
    } else {
        // Low-end path: keep only a light scanline pass (single texture sample total).
        float scanline = sin(uv.y * 400.0) * 0.02;
        color.rgb -= scanline;
    }

    // Matrix color tint (purple shift) — applies on both paths
    color.rgb = mix(color.rgb, color.rgb * vec3(0.7, 0.6, 1.2), uMatrixIntensity * 0.4);

    gl_FragColor = color;
}
`;

export default class CRTPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private matrixIntensity: number = 0;

  constructor(game: Phaser.Game) {
    super({
      game,
      name: 'CRTPipeline',
      fragShader,
    });
  }

  setMatrixIntensity(value: number) {
    this.matrixIntensity = Phaser.Math.Clamp(value, 0, 1);
  }

  onPreRender() {
    this.set1f('uTime', this.game.loop.time / 1000);
    this.set2f('uResolution', this.renderer.width, this.renderer.height);
    this.set1i('uHighEnd', performanceMonitor.crtHighEndEnabled ? 1 : 0);
    this.set1f('uMatrixIntensity', this.matrixIntensity);
  }
}
