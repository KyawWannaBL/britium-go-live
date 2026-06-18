// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // This replaces the plugin and fixes the path resolution
    alias: {
      '@': '/src',
    },
    tsconfigPaths: true, 
  },
});