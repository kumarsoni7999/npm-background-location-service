#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const libDir = path.join(root, 'lib');

function rimraf(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

console.log('Cleaning lib/...');
rimraf(libDir);

console.log('Compiling TypeScript (ESM + declarations)...');
execSync('npx tsc -p tsconfig.build.json', { cwd: root, stdio: 'inherit' });

console.log('Compiling TypeScript (CommonJS)...');
const tmpTsconfig = path.join(root, 'tsconfig.cjs.tmp.json');
fs.writeFileSync(
  tmpTsconfig,
  JSON.stringify(
    {
      extends: './tsconfig.build.json',
      compilerOptions: {
        module: 'CommonJS',
        outDir: 'lib/commonjs',
        declaration: false,
        declarationMap: false,
        declarationDir: null,
      },
    },
    null,
    2,
  ),
);

try {
  execSync('npx tsc -p tsconfig.cjs.tmp.json', { cwd: root, stdio: 'inherit' });
} finally {
  fs.unlinkSync(tmpTsconfig);
}

console.log('Build complete.');
console.log('  ESM:   lib/module');
console.log('  CJS:   lib/commonjs');
console.log('  Types: lib/typescript');
