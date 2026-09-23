import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base './' ใช้ได้กับ GitHub Pages ทุกชื่อที่เก็บโค้ด (ใช้คู่กับ HashRouter)
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
});
