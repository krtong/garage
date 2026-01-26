import { readFile, writeFile } from 'node:fs/promises';
import { minify as minifyHtml } from 'html-minifier-terser';
import { minify as terserMinify } from 'terser';

const files = ['index.html', 'reset.html'];

const SCRIPT_TAG_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const SRC_RE = /\bsrc\s*=\s*['"][^'"]+['"]/i;
const TYPE_MODULE_RE = /\btype\s*=\s*['"]module['"]/i;

async function minifyScripts(html) {
  let out = '';
  let lastIndex = 0;
  for (const match of html.matchAll(SCRIPT_TAG_RE)) {
    const [full, attrs, code] = match;
    const start = match.index ?? 0;
    out += html.slice(lastIndex, start);
    lastIndex = start + full.length;

    if (SRC_RE.test(attrs) || !code.trim()) {
      out += full;
      continue;
    }

    const isModule = TYPE_MODULE_RE.test(attrs);
    const result = await terserMinify(code, {
      module: isModule,
      compress: true,
      mangle: true,
      format: { comments: false }
    });

    if (result.error || !result.code) {
      out += full;
      continue;
    }

    out += `<script${attrs}>${result.code}</script>`;
  }

  out += html.slice(lastIndex);
  return out;
}

async function minifyFile(file) {
  const html = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  const withMinifiedScripts = await minifyScripts(html);
  const minified = await minifyHtml(withMinifiedScripts, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeEmptyAttributes: true,
    minifyCSS: true,
    minifyJS: false,
    keepClosingSlash: true
  });
  await writeFile(new URL(`../${file}`, import.meta.url), minified);
}

for (const file of files) {
  await minifyFile(file);
}

console.log('Minified:', files.join(', '));
