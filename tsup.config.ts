import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  sourcemap: true,
  target: 'es2020',
  clean: true,
  format: ['cjs', 'esm'],
  dts: true,
})
