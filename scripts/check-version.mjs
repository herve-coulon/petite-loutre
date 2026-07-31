// Vérifie que GAME_VERSION, VERSION (sw.js) et package.json sont synchronisés.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const constants = readFileSync(join(root, 'src/constants.js'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

const pkgVer = pkg.version;
const gameVer = constants.match(/GAME_VERSION\s*=\s*'([^']+)'/)?.[1];
const swVer = sw.match(/VERSION\s*=\s*'v([^']+)'/)?.[1];

const ok = pkgVer === gameVer && gameVer === swVer;
if (ok) {
  console.log(`✅ Versions synchronisées : ${pkgVer}`);
} else {
  console.error(`❌ Versions désynchronisées !`);
  console.error(`   package.json   : ${pkgVer}`);
  console.error(`   constants.js   : ${gameVer}`);
  console.error(`   sw.js          : ${swVer}`);
  process.exit(1);
}
