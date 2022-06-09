import esbuild from 'rollup-plugin-esbuild';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import dts from 'rollup-plugin-dts';

const config = [
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
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
        tsconfig: 'tsconfig.json',
        loaders: {
          '.json': 'json',
        },
      }),
    ],
  },
  {
    input: 'src/index.ts',
    output: [{ file: 'dist/index.d.ts', format: 'es' }],
    plugins: [dts()],
  },
];

export default config;
