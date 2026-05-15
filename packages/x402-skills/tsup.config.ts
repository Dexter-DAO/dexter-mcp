import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  minify: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: false,
  target: 'es2022',
});
