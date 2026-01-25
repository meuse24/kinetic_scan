import { defineConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

export default defineConfig({
	plugins: [viteSingleFile()],
	build: {
		assetsInlineLimit: 100000000, // Maximale Größe für Inlining (sehr hoch gesetzt)
		chunkSizeWarningLimit: 100000000,
		cssCodeSplit: false,
		rollupOptions: {
			output: {
				inlineDynamicImports: true,
			},
		},
	},
})
