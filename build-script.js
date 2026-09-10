const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const { minify } = require('terser');

// -----------------------------------------------------------------------------
// Production build
//
// All of js/*.js is concatenated (in the same order index.html loads them)
// into one program, then that single unit is obfuscated into dist/js/app.js.
// The deployed site ships ONE unreadable file instead of 13 commented sources.
//
// The files are concatenated raw (no per-file IIFE) because the codebase
// shares classic-script globals across files - config.js declares bare
// `let scene`, `const modelScale`, etc. that modelLoader.js / sceneManager.js
// reference directly. Obfuscating the whole thing as one unit keeps that
// shared top-level scope intact and avoids cross-file name collisions.
// -----------------------------------------------------------------------------

const config = {
  inputDir: './js',
  outputDir: './dist',
  bundleName: 'app.js',
  obfuscate: true,
  minify: true,
  // Lightweight anti-tamper on the page. The old build also nuked the page
  // when it *guessed* devtools were open via window size - that fired for
  // laptops, zoom, bookmark bars, etc., so it's gone. Set to false to drop
  // even the right-click / shortcut deterrents.
  pageHardening: true
};

// Same order as the <script> tags in index.html.
const LOAD_ORDER = [
  'config.js',
  'lighting.js',
  'materialManager.js',
  'modelLoader.js',
  'uiControls.js',
  'sceneManager.js',
  'stageManager.js',
  'shellBuilder.js',
  'curveTool.js',
  'brushTool.js',
  'stoneSetter.js',
  'miniView.js',
  'main.js'
];

const OBFUSCATOR_OPTS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,
  debugProtection: false,          // avoids freezing the tab if a user opens devtools
  disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.9,
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

function ensureDirs() {
  for (const d of [config.outputDir, path.join(config.outputDir, 'js'), path.join(config.outputDir, 'assets')]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function bundle() {
  console.log('📦 Bundling JavaScript...');
  const present = fs.readdirSync(config.inputDir).filter((f) => f.endsWith('.js'));
  const order = LOAD_ORDER.filter((f) => present.includes(f));
  const extras = present.filter((f) => !LOAD_ORDER.includes(f));
  if (extras.length) {
    console.warn('⚠️  js files not in LOAD_ORDER (appended at end):', extras.join(', '));
  }
  const files = [...order, ...extras];

  const parts = files.map((file) => {
    const code = fs.readFileSync(path.join(config.inputDir, file), 'utf8');
    return `\n/* ${file} */\n${code}\n;\n`;
  });

  console.log('   ' + files.join(' → '));
  return parts.join('');
}

async function buildBundle() {
  ensureDirs();

  let code = bundle();

  if (config.obfuscate) {
    console.log('🔒 Obfuscating bundle...');
    code = JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTS).getObfuscatedCode();
  }

  if (config.minify) {
    console.log('🗜️  Minifying bundle...');
    // mangle:false - top-level names are shared with the inline <script> in
    // index.html (envHDRUrl) and across the concatenated files, so renaming
    // them here would break references. The obfuscator already renamed all
    // function-local identifiers.
    const out = await minify(code, {
      compress: { drop_debugger: true, dead_code: true },
      mangle: false,
      format: { comments: false }
    });
    code = out.code;
  }

  const outPath = path.join(config.outputDir, 'js', config.bundleName);
  fs.writeFileSync(outPath, code);
  const kb = (Buffer.byteLength(code) / 1024).toFixed(0);
  console.log(`✅ Wrote ${outPath} (${kb} KB)`);
}

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function copyAssets() {
  console.log('📁 Copying assets...');
  if (fs.existsSync('./assets')) {
    copyDir('./assets', path.join(config.outputDir, 'assets'));
    console.log('✅ Assets copied');
  }
}

function createProductionHTML() {
  console.log('📄 Creating production index.html...');
  let html = fs.readFileSync('./index.html', 'utf8');

  // Replace the whole run of individual <script src="./js/*.js"> tags with one
  // bundle tag.
  const firstTag = html.indexOf('<script src="./js/');
  const lastTagEnd = html.lastIndexOf('</script>') + '</script>'.length;
  if (firstTag !== -1 && lastTagEnd > firstTag) {
    html = html.slice(0, firstTag) +
      `<script src="./js/${config.bundleName}"></script>` +
      html.slice(lastTagEnd);
  } else {
    console.warn('⚠️  Could not find the js script block to collapse.');
  }

  if (config.pageHardening) {
    const hardening = `
    <script>
      (function () {
        'use strict';
        document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        document.addEventListener('keydown', function (e) {
          var k = (e.key || '').toLowerCase();
          if (k === 'f12' ||
              (e.ctrlKey && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) ||
              (e.ctrlKey && k === 'u')) {
            e.preventDefault();
          }
        });
      })();
    </script>`;
    html = html.replace('</head>', hardening + '\n</head>');
  }

  fs.writeFileSync(path.join(config.outputDir, 'index.html'), html);
  console.log('✅ Production index.html created');
}

(async function main() {
  console.log('🔧 Building 3D Jaw Viewer (production)...');
  try {
    await buildBundle();
    copyAssets();
    createProductionHTML();
    console.log('🎉 Build complete → ./dist');
    console.log('🚀 Deploy the contents of ./dist');
  } catch (err) {
    console.error('❌ Build failed:', err);
    process.exit(1);
  }
})();
