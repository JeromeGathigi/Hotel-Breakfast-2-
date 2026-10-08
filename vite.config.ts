import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // No `define` block. One used to inline env.GEMINI_API_KEY into the CLIENT bundle as
    // process.env.GEMINI_API_KEY - nothing reads it, but any .env holding that key would have
    // shipped it to every browser. Server-side secrets never belong in a Vite `define`.
    //
    // No `host: '0.0.0.0'` either: server.ts binds the dev server to loopback on purpose, and
    // this setting contradicted it for `vite preview`.
    server: {
      port: 3000,
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    },
  };
});
