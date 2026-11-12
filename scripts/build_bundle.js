/**
 * RAMAN AI (Experiment No. 170) – Production Bundler & Minifier
 * Concatenates and minifies modular client scripts into a standalone, air-gapped distribution bundle.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Terser = require('terser');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const MODULE_FILES = [
  'webgpu_volumetric.js',
  'webgpu_pkpd.js',
  'vcg_vectorcardiography.js',
  'hybrid_search.js',
  'vision_diagnostics.js',
  'ble_telemetry.js',
  'fhir_exporter.js',
  'zkp_verifier.js',
  'qr_code.js',
  'digital_signature.js',
  'stt_dictation.js',
  'federated_learning.js',
  'quantized_slm.js',
  'ui_responsive_agent.js',
  'app.js'
];

async function build() {
  console.log('==================================================================');
  console.log('📦 RAMAN AI (Experiment No. 170) – PRODUCTION BUNDLE BUILDER');
  console.log('==================================================================');

  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  let totalRawBytes = 0;
  const parts = [];

  const banner = `/**
 * RAMAN AI (Experiment No. 170) – Production Unified Engine Bundle
 * Offline, Zero-Cloud Air-Gapped Clinical Intelligence System
 * Build Date: ${new Date().toISOString()}
 * License: ISC
 */
`;
  parts.push(banner);

  for (const file of MODULE_FILES) {
    const fullPath = path.join(ROOT_DIR, file);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Required module file not found: ${file}`);
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    totalRawBytes += content.length;
    console.log(`  [+] Bundling: ${file.padEnd(28)} (${(content.length / 1024).toFixed(1)} KB)`);
    parts.push(`\n// --- BEGIN MODULE: ${file} ---\n`);
    parts.push(content);
    parts.push(`\n// --- END MODULE: ${file} ---\n`);
  }

  const bundledCode = parts.join('\n');
  const bundlePath = path.join(DIST_DIR, 'raman.bundle.js');
  fs.writeFileSync(bundlePath, bundledCode, 'utf8');
  console.log(`\n  ✅ Unminified Bundle: ${bundlePath} (${(bundledCode.length / 1024).toFixed(1)} KB)`);

  // Verify unminified bundle parses cleanly
  try {
    new vm.Script(bundledCode);
    console.log('  ✅ Unminified AST Verification: PASSED (Syntax OK)');
  } catch (err) {
    console.error('  💥 AST Verification Error in unminified bundle:', err);
    throw err;
  }

  // Safe Production Minification via Terser
  console.log('  ⚙️  Minifying production bundle with Terser...');
  const minifiedResult = await Terser.minify(bundledCode, {
    compress: {
      dead_code: true,
      drop_console: false,
      passes: 2
    },
    mangle: false, // Maintain public global symbol names for clinical tests and debuggability
    format: {
      comments: /^!|@license|@preserve/i
    }
  });

  const minifiedCode = minifiedResult.code;
  const minBundlePath = path.join(DIST_DIR, 'raman.bundle.min.js');
  fs.writeFileSync(minBundlePath, minifiedCode, 'utf8');
  console.log(`  ✅ Minified Bundle:   ${minBundlePath} (${(minifiedCode.length / 1024).toFixed(1)} KB)`);

  // Verify minified bundle parses cleanly
  try {
    new vm.Script(minifiedCode);
    console.log('  ✅ Minified AST Verification: PASSED (Syntax OK)');
  } catch (err) {
    console.error('  💥 AST Verification Error in minified bundle:', err);
    throw err;
  }

  const savingsBytes = bundledCode.length - minifiedCode.length;
  const savingsPct = ((savingsBytes / bundledCode.length) * 100).toFixed(1);
  console.log(`  ⚡ Savings: ${savingsBytes} bytes (${savingsPct}% size reduction)`);

  // Generate production index.html in dist/
  generateProductionHtml();

  // Copy essential static assets into dist/
  copyStaticAssets();

  // Generate production service worker in dist/
  generateProductionServiceWorker();

  console.log('==================================================================');
  console.log('🎉 PRODUCTION BUNDLE BUILD COMPLETED SUCCESSFULLY!');
  console.log('==================================================================\n');
}

const STATIC_ASSETS_TO_COPY = [
  'style.css',
  'session_mgr.css',
  'favicon.svg',
  'manifest.json',
  'human_body_map.webp',
  'human_body_map.png',
  'mcp_agent_worker.js',
  'index.esm.js'
];

/**
 * Copies static CSS, icons, images, and worker files to dist/
 */
function copyStaticAssets() {
  for (const file of STATIC_ASSETS_TO_COPY) {
    const src = path.join(ROOT_DIR, file);
    const dest = path.join(DIST_DIR, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`  📋 Copied static asset: ${file.padEnd(24)} -> dist/${file}`);
    } else {
      console.warn(`  ⚠️ Warning: Asset not found: ${file}`);
    }
  }
}

/**
 * Generates dist/sw.js configured to cache raman.bundle.min.js instead of individual dev modules
 */
function generateProductionServiceWorker() {
  const srcSwPath = path.join(ROOT_DIR, 'sw.js');
  if (!fs.existsSync(srcSwPath)) return;
  let swContent = fs.readFileSync(srcSwPath, 'utf8');

  // Replace individual script entries in STATIC_ASSETS with the production bundle
  const moduleListRegex = /'\.\/app\.js',[\s\S]*?'\.\/vcg_vectorcardiography\.js',/;
  if (moduleListRegex.test(swContent)) {
    swContent = swContent.replace(
      moduleListRegex,
      "  './raman.bundle.min.js',\n  './mcp_agent_worker.js',"
    );
  }
  fs.writeFileSync(path.join(DIST_DIR, 'sw.js'), swContent, 'utf8');
  console.log('  📄 Generated production Service Worker: dist/sw.js (caching raman.bundle.min.js)');
}

/**
 * Generates dist/index.html linking to raman.bundle.min.js
 */
function generateProductionHtml() {
  const srcHtmlPath = path.join(ROOT_DIR, 'index.html');
  let html = fs.readFileSync(srcHtmlPath, 'utf8');

  // Replace individual script tags with unified bundle
  const scriptsRegex = /<script defer src="webgpu_volumetric\.js[\s\S]*?<script defer src="app\.js[^"]*"><\/script>/;
  const bundleScriptTag = '<script defer src="raman.bundle.min.js"></script>';

  if (scriptsRegex.test(html)) {
    html = html.replace(scriptsRegex, bundleScriptTag);
    fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html, 'utf8');
    console.log(`  📄 Generated production distribution: dist/index.html (1 script tag)`);
  }
}

if (require.main === module) {
  build().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
  });
}

module.exports = { build };
