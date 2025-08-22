import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false, // Disabled for transparency and verifiability
  target: 'node16',
  shims: true,
  external: ['update-notifier'],
  outExtension() {
    return {
      js: '.js',
    }
  },
});