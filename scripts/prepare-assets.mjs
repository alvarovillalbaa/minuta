import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { readFile, readdir, mkdir, copyFile, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url), root = resolve(import.meta.dirname, '..');
const transformerEntry = require.resolve('@huggingface/transformers'), dependencyRequire = createRequire(transformerEntry);
const ortEntry = dependencyRequire.resolve('onnxruntime-web'), dist = dirname(ortEntry);
const output = join(root, 'public/wasm'); await mkdir(output, { recursive: true });
const files = (await readdir(dist)).filter(file => file.startsWith('ort-wasm') && /\.(wasm|mjs)$/.test(file));
if (!files.some(file => file.endsWith('.wasm')) || !files.some(file => file.endsWith('.mjs'))) throw new Error('The pinned browser runtime has no complete WASM/MJS payload');
for (const file of files) await copyFile(join(dist, file), join(output, file));
const notices = [];
for (const [name, start] of [['@huggingface/transformers', transformerEntry], ['onnxruntime-web', ortEntry]]) {
  let directory = dirname(start), packageData;
  for (let i = 0; i < 6; i++, directory = dirname(directory)) {
    try { const value = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')); if (value.name === name) { packageData = value; break; } } catch {}
  }
  if (!packageData) throw new Error(`No package ownership found for ${name}`);
  let license;
  for (const file of ['LICENSE', 'LICENSE.txt', 'LICENSE.md']) { try { license = await readFile(join(directory, file), 'utf8'); break; } catch {} }
  if (!license) throw new Error(`No license found for ${name}`);
  notices.push(`${name}@${packageData.version}\n\n${license}`);
}
await writeFile(join(root, 'public/third-party-licenses.txt'), notices.join('\n\n-----\n\n'));
console.log(JSON.stringify({ selfHostedWasmFiles: files }));
