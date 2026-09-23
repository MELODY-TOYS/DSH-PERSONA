/** Bundle local modules with TypeScript; browser plugins share the host's React. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, relative, extname } from 'node:path';
const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); }
catch {
  try { ts = require(resolve(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'typescript')); }
  catch { throw new Error('Build requires TypeScript 5.8.3. Run npm install first.'); }
}
const root = fileURLToPath(new URL('../', import.meta.url));
const licenses = await Promise.all(['LICENSE', 'assets/brand/LICENSE', 'THIRD_PARTY_NOTICES.md'].map(name => readFile(resolve(root, name), 'utf8')));
const licenseBanner = `/*!\n${licenses.map(text => text.trim()).join('\n\n').replace(/\*\//g, '* /')}\n*/\n`;
async function pack(entry, allowedExternals = []) {
  const modules = new Map();
  async function visit(path) {
    const id = relative(root, path).split('\\').join('/');
    if (modules.has(id)) return id;
    modules.set(id, null);
    const bytes = await readFile(path);
    const source = bytes.toString('utf8');
    const css = extname(path) === '.css';
    let output;
    if (extname(path) === '.avif') output = `Object.defineProperty(exports, '__esModule', { value: true }); exports.default = ${JSON.stringify('data:image/avif;base64,' + bytes.toString('base64'))};`;
    else if (extname(path) === '.mp4') output = `Object.defineProperty(exports, '__esModule', { value: true }); exports.default = ${JSON.stringify('data:video/mp4;base64,' + bytes.toString('base64'))};`;
    else if (css) output = `Object.defineProperty(exports, '__esModule', { value: true }); exports.default = ${JSON.stringify(source)};`;
    else {
      const result = ts.transpileModule(source, { fileName: path.replace(/\.mjs$/, '.ts'),
        reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
      const errors = result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error) ?? [];
      if (errors.length) throw new Error(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
      output = result.outputText;
    }
    const links = {};
    for (const match of output.matchAll(/require\(["']([^"']+)["']\)/g)) {
      const spec = match[1];
      if (spec.startsWith('.')) links[spec] = await visit(resolve(dirname(path), spec));
      else if (spec === 'three') links[spec] = await visit(resolve(dirname(require.resolve('three')), 'three.module.js'));
      else if (!allowedExternals.includes(spec)) throw new Error(`Unexpected external ${spec} in ${id}`);
    }
    modules.set(id, { output, links });
    return id;
  }
  const entryId = await visit(resolve(root, entry));
  const body = [...modules].map(([id, row]) => `${JSON.stringify(id)}: [function(require,module,exports){\n${row.output}\n},${JSON.stringify(row.links)}]`).join(',\n');
  return `const modules = {${body}};\nconst cache = Object.create(null);\nfunction load(id){ if(cache[id]) return cache[id].exports; const row=modules[id]; if(!row) throw new Error('Missing module '+id); const module={exports:{}};cache[id]=module;row[0](spec=>row[1][spec]?load(row[1][spec]):external(spec),module,module.exports);return module.exports;}\nreturn load(${JSON.stringify(entryId)});`;
}
const preview = `${licenseBanner}(function(){ const external = spec => { throw new Error('Preview external '+spec); };\n${await pack('preview/app.mjs')}\n})();`;
const native = `${licenseBanner}window.__ModuleLoader__.load({id:"dsh-persona",factory:(external)=>{\n${await pack('src/adapters/dsh/client.mjs', ['react'])}\n}});\n`;
let html = await readFile(resolve(root, 'preview/index.html'), 'utf8');
const css = await readFile(resolve(root, 'preview/style.css'), 'utf8');
html = html.replace(/<!--STYLE-->[\s\S]*?<!--\/STYLE-->/, () => `<style>${css}</style>`)
  .replace(/<!--SCRIPT-->[\s\S]*?<!--\/SCRIPT-->/, () => `<script>${preview.replace(/<\/script/gi, '<\\/script')}</script>`);
await mkdir(resolve(root, 'lib'), { recursive: true });
await writeFile(resolve(root, 'preview/app.js'), preview);
await writeFile(resolve(root, 'preview/standalone.html'), html);
await writeFile(resolve(root, 'lib/client.js'), native);
await writeFile(resolve(root, 'lib/index.js'), "export { name, inject, Config, apply } from '../src/adapters/dsh/host.mjs';\n");
console.log('Built native lazy-factory client, Host entry and standalone plugin-settings preview.');
