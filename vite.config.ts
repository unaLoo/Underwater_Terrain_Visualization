import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [glsl()],

  server: {
    host: true,
    port: 5177,
    proxy: {
      '/TTB': {
        target: 'http://127.0.0.1:8079',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/TTB/, '')
      }
    }

  }
})
