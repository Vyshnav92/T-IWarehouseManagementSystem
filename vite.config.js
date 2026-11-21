import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Builds to ONE self-contained dist/index.html (logo, code, styles inlined) so the demo
// can be emailed or opened by double-click with no server.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { assetsInlineLimit: 100000000, chunkSizeWarningLimit: 4000 },
})
