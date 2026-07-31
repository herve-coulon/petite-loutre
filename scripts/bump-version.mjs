// Bump la version dans package.json, src/constants.js et sw.js.
// Usage : node scripts/bump-version.mjs [patch|minor|major|X.Y.Z]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const target = process.argv[2] || 'patch';

function bump(version, type) {
  const [maj, min, pat] = version.split('.').map(Number);
  if (type === 'major') return `${maj + 1}.0.0`;
  if (type === 'minor') return `${maj}.${min + 1}.0`;
  if (type === 'patch') return `${maj}.${min}.${pat + 1}`;
  // sinon c'est un numéro explicite
  if (/^\d+\.\d+\.\d+$/.test(type)) return type;
  console.error(`Usage : npm run version:bump [patch|minor|major|X.Y.Z]`);
  process.exit(1);
}

const pkgPath = join(root, 'package.json');
const constPath = join(root, 'src/constants.js');
const swPath = join(root, 'sw.js');

const oldVer = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
const newVer = bump(oldVer, target);

// package.json
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.version = newVer;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// src/constants.js
let c = readFileSync(constPath, 'utf8');
c = c.replace(/GAME_VERSION\s*=\s*'[^']+'/, `GAME_VERSION = '${newVer}'`);
writeFileSync(constPath, c);

// sw.js
let s = readFileSync(swPath, 'utf8');
s = s.replace(/VERSION\s*=\s*'v[^']+'/, `VERSION = 'v${newVer}'`);
writeFileSync(swPath, s);

console.log(`🏷️  ${oldVer} → ${newVer}`);
console.log(`   package.json ✓`);
console.log(`   src/constants.js ✓`);
console.log(`   sw.js ✓`);
