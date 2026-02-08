import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  resolve: {
    // Use the smaller Phaser build that keeps Arcade physics and removes unused physics engines.
    alias: {
      phaser: 'phaser/dist/phaser-arcade-physics.min.js',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) {
            return 'phaser';
          }
          return undefined;
        },
      },
    },
  },
});
