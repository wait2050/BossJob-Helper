import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  return {
    build: {
      sourcemap: 'hidden',
      rollupOptions: {
        external: ['cookie', 'set-cookie-parser'],
      },
    },
    plugins: [
      react({
        babel: {
          plugins: isDev ? ['react-dev-locator'] : [],
        },
      }),
      tsconfigPaths()
    ],
  };
})
