import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// .devcontainer が 3000 番を転送しているので、Vite も 3000 番で起動する
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    strictPort: true,
  },
})
