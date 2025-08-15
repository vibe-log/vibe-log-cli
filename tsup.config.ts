import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: true,
  target: 'node16',
  shims: true,
  outExtension() {
    return {
      js: '.js',
    }
  },
});