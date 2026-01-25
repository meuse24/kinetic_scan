import Phaser from 'phaser';

const fragShader = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTime;
uniform vec2 uResolution;
uniform bool uHighEnd;

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

    // Chromatic Aberration (RGB Shift)
    float shift = 0.0015;
    vec4 color;
    color.r = texture2D(uMainSampler, vec2(uv.x + shift, uv.y)).r;
    color.g = texture2D(uMainSampler, uv).g;
    color.b = texture2D(uMainSampler, vec2(uv.x - shift, uv.y)).b;
    color.a = 1.0;

    // Scanlines
    float scanline = sin(uv.y * 800.0) * 0.04;
    color.rgb -= scanline;

    // Flimmern (leichtes Rauschen)
    float noise = (fract(sin(dot(uv, vec2(12.9898, 78.233) * uTime)) * 43758.5453)) * 0.02;
    color.rgb += noise;

    // Vignette
    if (uHighEnd) {
        float dist = length(uv - 0.5);
        color.rgb *= smoothstep(0.8, 0.4, dist);
    }

    gl_FragColor = color;
}
`;

export default class CRTPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game: Phaser.Game) {
    super({
      game,
      name: 'CRTPipeline',
      fragShader,
    });
  }

  onPreRender() {
    this.set1f('uTime', this.game.loop.time / 1000);
    this.set2f('uResolution', this.renderer.width, this.renderer.height);
    this.set1i('uHighEnd', this.game.device.os.desktop ? 1 : 0);
  }
}
