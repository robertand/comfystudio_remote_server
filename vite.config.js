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
      // Dynamic proxy for arbitrary ComfyUI servers.
      // Format: /comfy-proxy/{protocol}/{host}/{port}/...
      // Example: /comfy-proxy/https/pro5091.proai123.com/443/system_stats
      '^/comfy-proxy/([^/]+)/([^/]+)/([^/]+)/?': {
        target: 'http://localhost', // Fallback, will be overridden by router
        changeOrigin: true,
        secure: false,
        ws: true,
        router: (req) => {
          const match = req.url.match(/^\/comfy-proxy\/([^/]+)\/([^/]+)\/([^/]+)/)
          if (match) {
            const [_, protocol, host, port] = match
            const p = Number(port)
            const isStandard = (protocol === 'http' && p === 80) || (protocol === 'https' && p === 443)
            const target = `${protocol}://${host}${isStandard ? '' : `:${port}`}`
            req._comfyTarget = target
            return target
          }
          return 'http://127.0.0.1:8188'
        },
        rewrite: (path) => path.replace(/^\/comfy-proxy\/[^/]+\/[^/]+\/[^/]+/, '') || '/',
        configure: (proxy, options) => {
          const spoofHeaders = (proxyReq, req) => {
            const targetUrl = req._comfyTarget || (typeof options.target === 'string' ? options.target : options.target?.href)
            if (targetUrl) {
              try {
                const u = new URL(targetUrl)
                proxyReq.setHeader('Origin', u.origin)
                proxyReq.setHeader('Host', u.host)
                proxyReq.setHeader('Referer', `${u.origin}/`)
              } catch (_) {}
            }
          }

          proxy.on('proxyReq', (proxyReq, req, res) => {
            spoofHeaders(proxyReq, req)
          })

          proxy.on('proxyReqWs', (proxyReq, req, socket, options, head) => {
            spoofHeaders(proxyReq, req)
          })

          proxy.on('proxyRes', (proxyRes, req, res) => {
            // Strip headers that prevent iframe embedding
            const keysToDelete = ['x-frame-options', 'content-security-policy']
            for (const key of Object.keys(proxyRes.headers)) {
              if (keysToDelete.includes(key.toLowerCase())) {
                delete proxyRes.headers[key]
              }
            }
            // Ensure CORS is allowed from our origin
            proxyRes.headers['access-control-allow-origin'] = '*'
            proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
            proxyRes.headers['access-control-allow-headers'] = '*'
          })
        }
      },
      // Legacy hardcoded proxies for local development
      '/system_stats': {
        target: 'http://127.0.0.1:8188',
        changeOrigin: true,
        secure: false,
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
