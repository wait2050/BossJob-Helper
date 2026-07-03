import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      cookie: path.resolve(__dirname, 'src/lib/cookieMock.ts'),
      'set-cookie-parser': path.resolve(__dirname, 'src/lib/cookieMock.ts'),
    },
  },
  build: {
    rollupOptions: {
      maxParallelFileOps: 20,
    },
  },
})
