import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Detect if building for Electron
const isElectron = process.env.ELECTRON === 'true'

export default defineConfig({
  plugins: [react()],
  // Use relative paths for Electron (file:// protocol), but use absolute for web
  base: isElectron ? './' : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Allow all hosts (useful for tunnels like cloudflared)
    allowedHosts: true,
    // Proxy requests to ComfyUI to avoid CORS issues
    proxy: {
      '/system_stats': {
        target: 'http://127.0.0.1:8188',
        changeOrigin: true,
        secure: false,
        router: (req) => {
          // This is only for the dev server. Real Electron app bypasses this
          // via localComfyConnection.js which points directly to the server.
          return 'http://127.0.0.1:8188';
        }
      },
      '/prompt': {
        target: 'http://127.0.0.1:8188',
        changeOrigin: true,
        secure: false,
      },
      '/history': {
        target: 'http://127.0.0.1:8188',
        changeOrigin: true,
        secure: false,
      },
      '/queue': {
        target: 'http://127.0.0.1:8188',
        changeOrigin: true,
        secure: false,
      },
      '/interrupt': {
        target: 'http://127.0.0.1:8188',
        changeOrigin: true,
        secure: false,
      },
      '/view': {
        target: 'http://127.0.0.1:8188',
        changeOrigin: true,
        secure: false,
      },
      '/upload': {
        target: 'http://127.0.0.1:8188',
        changeOrigin: true,
        secure: false,
      },
      '/workflow_templates': {
        target: 'http://127.0.0.1:8188',
        changeOrigin: true,
        secure: false,
      },
      '/extensions': {
        target: 'http://127.0.0.1:8188',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8188',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    // Ensure assets are relative for Electron
    assetsDir: 'assets',
    // Generate sourcemaps for debugging (optional, can disable for production)
    sourcemap: isElectron ? false : true,
    // Rollup options for better chunking
    rollupOptions: {
      output: {
        // Consistent chunk naming
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  // Optimize deps for Electron
  optimizeDeps: {
    exclude: [],
  },
})
