import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const isElectron = process.env.ELECTRON === 'true'

export default defineConfig({
  plugins: [react()],
  base: isElectron ? './' : '/',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      '^/api/v1/comfy-proxy/([^/]+)/([^/]+)/([^/]+)/?.*': {
        target: 'http://127.0.0.1:8188',
        changeOrigin: true,
        secure: false,
        ws: true,
        router: (req) => {
          const url = req.originalUrl || req.url
          const match = url.match(/\/api\/v1\/comfy-proxy\/([^/]+)\/([^/]+)\/([^/]+)/)
          if (match) {
            const [_, protocol, host, port] = match
            const p = parseInt(port, 10)
            const isStd = (protocol === 'http' && p === 80) || (protocol === 'https' && p === 443)
            return `${protocol}://${host}${isStd ? '' : `:${port}`}`
          }
        },
        rewrite: (path) => path.replace(/^\/api\/v1\/comfy-proxy\/[^/]+\/[^/]+\/[^/]+/, '') || '/',
        configure: (proxy, options) => {
          const spoofHeaders = (proxyReq, req) => {
            const url = req.originalUrl || req.url
            const match = url.match(/\/api\/v1\/comfy-proxy\/([^/]+)\/([^/]+)\/([^/]+)/)
            if (match) {
              const [_, protocol, host, port] = match
              const p = parseInt(port, 10)
              const isStd = (protocol === 'http' && p === 80) || (protocol === 'https' && p === 443)
              const tHost = isStd ? host : `${host}:${port}`
              const tOrigin = `${protocol}://${tHost}`
              proxyReq.setHeader('Origin', tOrigin)
              proxyReq.setHeader('Host', tHost)
              proxyReq.setHeader('Referer', `${tOrigin}/`)

              // Mirror Electron modern browser spoofing
              proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
              proxyReq.setHeader('Accept', '*/*')
              proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9')
            }
          }
          proxy.on('proxyReq', spoofHeaders)
          proxy.on('proxyReqWs', spoofHeaders)
          proxy.on('proxyRes', (proxyRes) => {
            const keysToDelete = [
              'x-frame-options',
              'content-security-policy',
              'access-control-allow-origin',
              'cross-origin-resource-policy',
              'cross-origin-opener-policy',
              'cross-origin-embedder-policy'
            ]
            for (const key of Object.keys(proxyRes.headers)) {
              if (keysToDelete.includes(key.toLowerCase())) delete proxyRes.headers[key]
            }
            proxyRes.headers['access-control-allow-origin'] = '*'
            proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
            proxyRes.headers['access-control-allow-headers'] = '*'
            proxyRes.headers['access-control-allow-credentials'] = 'true'

            // Adopt reference app "ALLOWALL" strategy for dev proxy too
            proxyRes.headers['x-frame-options'] = 'ALLOWALL'
            proxyRes.headers['content-security-policy'] = "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
          })
        }
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: !isElectron,
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  }
})
