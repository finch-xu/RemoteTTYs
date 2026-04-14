import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'fs'
import { resolve } from 'path'

// Copy ghostty WASM to public/ for runtime loading
try {
  copyFileSync(
    resolve(__dirname, 'node_modules/ghostty-web/ghostty-vt.wasm'),
    resolve(__dirname, 'public/ghostty-vt.wasm'),
  )
} catch {
  // WASM file might already be in place or node_modules hoisted
  try {
    copyFileSync(
      resolve(__dirname, '../../node_modules/ghostty-web/ghostty-vt.wasm'),
      resolve(__dirname, 'public/ghostty-vt.wasm'),
    )
  } catch {
    // Already copied or will be available at runtime
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION || 'dev'),
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'http://localhost:8080',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:8080',
      },
    },
  },
})
