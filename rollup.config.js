import esbuild from 'rollup-plugin-esbuild';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.browser.js',
    format: 'es',
  },
  plugins: [
    resolve({ browser: true, preferBuiltins: false }),
    json(),
    commonjs({
      include: 'node_modules/**',
      ignoreGlobal: true,
    }),
    esbuild({
      include: /\.[jt]s?$/,
      target: 'esnext',
      tsconfig: 'tsconfig.browser.json',
      loaders: {
        '.json': 'json',
      },
    }),
  ],
};
