import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:    ['react', 'react-dom'],
          cytoscape: ['cytoscape', 'cytoscape-cola'],
          icons:     ['react-icons'],
        },
      },
    },
  },
})
