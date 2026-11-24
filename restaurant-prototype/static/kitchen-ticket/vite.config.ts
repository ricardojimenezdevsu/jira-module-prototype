import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Forge serves Custom UI from a sub-path inside a sandboxed iframe, so asset URLs
// must be relative (base './'). The manifest points at the ./build directory.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'build',
    emptyOutDir: true,
  },
});
