import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/kucoin': {
        target: 'https://api.kucoin.com',
        changeOrigin: true,
        rewrite(path) {
          const url = new URL(path, 'http://localhost')
          const endpoint = url.searchParams.get('endpoint')
          url.searchParams.delete('endpoint')
          return `/api/v1/market/${endpoint}?${url.searchParams.toString()}`
        },
      },
      '/api/coinmarketcap': {
        target: 'https://pro-api.coinmarketcap.com',
        changeOrigin: true,
        rewrite(path) {
          const url = new URL(path, 'http://localhost')
          return `/public-api/v3/cryptocurrency/listings/latest?${url.searchParams.toString()}`
        },
      },
    },
  },
})
