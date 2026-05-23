// Minimal test runner — no external deps.
// Usage: node test/run.mjs
// Each test file exports an array named `tests` of { name, fn } objects.

import { tests as utTests  } from './utilidades.test.mjs';
import { tests as geomTests } from './editor-geom.test.mjs';
import { tests as grafoTests } from './grafo.test.mjs';

const suites = [
    { name: 'utilidades',   tests: utTests   },
    { name: 'editor-geom',  tests: geomTests },
    { name: 'grafo (A*)',   tests: grafoTests },
];

let passed = 0, failed = 0;

for (const suite of suites) {
    console.log(`\n── ${suite.name} ──`);
    for (const { name, fn } of suite.tests) {
        try {
            fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ✗ ${name}`);
            console.error(`    ${err.message}`);
            failed++;
        }
    }
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
