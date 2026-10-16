import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/firebase')) {
            return 'vendor-firebase'
          }
          if (id.includes('node_modules/@monaco-editor')) {
            return 'vendor-monaco'
          }
          if (id.includes('node_modules/@tensorflow')) {
            return 'vendor-tensorflow'
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons'
          }
        },
      },
    },
  },
})