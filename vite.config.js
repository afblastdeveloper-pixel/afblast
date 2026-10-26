import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // Tailwind CSS v4 via Vite plugin
    {
      name: 'remove-staff-preload',
      enforce: 'post',
      transformIndexHtml(html) {
        // Hapus link modulepreload untuk chunk staf agar member tidak mengunduh kode panel staf saat memuat /login
        return html.replace(/<link\s+rel="modulepreload"[^>]*staff-[^>]*>\s*/gi, '')
      },
    },
  ],
  server: {
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Pisahkan seluruh halaman, komponen, dan rute staf ke chunk tersendiri ("staff")
          const normalizedId = id.replace(/\\/g, '/')
          if (
            normalizedId.includes('/src/pages/admin/') ||
            normalizedId.includes('/src/pages/finance/') ||
            normalizedId.includes('/src/pages/developer/') ||
            normalizedId.includes('/src/components/admin/') ||
            normalizedId.includes('/src/routes/Staff')
          ) {
            return 'staff'
          }
        },
      },
    },
  },
})
