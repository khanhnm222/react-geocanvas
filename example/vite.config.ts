import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Alias trỏ thẳng vào source của thư viện, không cần build trước
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-geovisualizer': resolve(__dirname, '../src/index.ts'),
    },
    dedupe: ['react', 'react-dom'],
  },
});