/** Build the actual prompt form into a bounded, offline browser regression fixture. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, relative } from 'node:path';
const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); } catch { ts = require(resolve(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'typescript')); }
const root = fileURLToPath(new URL('../', import.meta.url)), modules = new Map();
async function visit(path) {
  const id = relative(root, path);
  if (modules.has(id)) return id;
  modules.set(id, null);
  const source = await readFile(path, 'utf8');
  const result = path.endsWith('.css') ? { outputText: `exports.default=${JSON.stringify(source)};`, diagnostics: [] }
    : ts.transpileModule(source, { fileName: path.replace(/\.mjs$/, '.ts'), reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  if (result.diagnostics.some(d => d.category === ts.DiagnosticCategory.Error)) throw new Error(`Cannot compile ${id}`);
  const links = {};
  for (const match of result.outputText.matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (!match[1].startsWith('.')) throw new Error(`Unexpected external ${match[1]}`);
    links[match[1]] = await visit(resolve(dirname(path), match[1]));
  }
  modules.set(id, { output: result.outputText, links }); return id;
}
const layout = process.argv.includes('--layout');
const fixture = layout ? 'layout' : 'prompts';
const entry = await visit(resolve(root, `tests/fixtures/${fixture}-browser.mjs`));
const body = [...modules].map(([id, row]) => `${JSON.stringify(id)}:[function(require,module,exports){${row.output}},${JSON.stringify(row.links)}]`).join(',\n');
const script = `(function(){const modules={${body}},cache={};function load(id){if(cache[id])return cache[id].exports;const row=modules[id],m={exports:{}};cache[id]=m;row[0](spec=>load(row[1][spec]),m,m.exports);return m.exports;}load(${JSON.stringify(entry)});})();`;
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>dsh-persona · ${layout ? '布局与动效' : '提示词'}</title><style>
:root{color-scheme:dark;--dsw-alias-bg-layer-1:#141414;--dsw-alias-bg-layer-3:#202022;--dsw-alias-bg-layer-4:#303033;--dsw-alias-label-primary:#ededee;--dsw-alias-label-secondary:#c4c4c8;--dsw-alias-label-tertiary:#949499;--dsw-alias-border-l3:#333337;--dsw-alias-border-l4:#414144;--dsw-alias-brand-primary:#6b8aff;font:13px/1.5 Arial,'Noto Sans CJK SC',sans-serif;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
:root[data-theme=light]{color-scheme:light;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-3:#f5f5f6;--dsw-alias-bg-layer-4:#f2f2f4;--dsw-alias-label-primary:#242428;--dsw-alias-label-secondary:#505057;--dsw-alias-label-tertiary:#717179;--dsw-alias-border-l3:#e5e5e9;--dsw-alias-border-l4:#d3d3d8}
body{margin:0}main{max-width:960px;margin:auto;padding:28px clamp(20px,4vw,48px) 48px}header{margin-bottom:32px}header p{color:var(--dsw-alias-label-secondary);margin:8px 0}header h1{font-size:20px;font-weight:500;margin:24px 0 4px}.crumb{font-size:12px;color:var(--dsw-alias-label-tertiary)}.fixture-note{font-size:11px;color:var(--dsw-alias-label-tertiary);margin-top:24px}
</style><main><header><span class="crumb">‹ dsh-persona</span><h1>${layout ? 'Persona' : '提示词'}</h1><p>${layout ? '名称、头像和模型关联。' : '为 Persona 组或原生模型追加提示词。'}</p></header><div id="fixture"></div><p class="fixture-note">组件交互预览 · 演示模型 · 设置仅保存在本页内存</p></main><script>${script.replace(/<\/script/gi, '<\\/script')}</script></html>`;
await mkdir(resolve(root, 'preview'), { recursive: true });
await writeFile(resolve(root, `preview/${fixture}-test.html`), html);
console.log(`Built ${fixture} form fixture (${modules.size} modules).`);
