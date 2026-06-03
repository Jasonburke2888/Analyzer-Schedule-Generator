#!/usr/bin/env node
/**
 * Build standalone.html — single-file offline bundle from index.html, css, js, and CSV.
 * Run from repo root: node scripts/build-standalone.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const cssPath = path.join(root, 'css', 'styles.css');
const jsPath = path.join(root, 'js', 'app.js');
const csvPath = path.join(root, 'data', 'activities.csv');
const outPath = path.join(root, 'standalone.html');

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const csv = fs.readFileSync(csvPath, 'utf8');

const stylesheetTag = '<link rel="stylesheet" href="./css/styles.css">';
const scriptTag = '<script src="./js/app.js"></script>';

if (!html.includes(stylesheetTag) || !html.includes(scriptTag)) {
  console.error('index.html link tags changed — update scripts/build-standalone.js');
  process.exit(1);
}

const embedded = [
  '<!-- Standalone bundle: HTML + CSS + JS + embedded activities.csv -->',
  '<!-- Regenerate: node scripts/build-standalone.js -->',
  html.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n<!-- Standalone offline bundle -->'),
]
  .join('\n')
  .replace(stylesheetTag, '<style>\n' + css + '\n</style>')
  .replace(
    scriptTag,
    '<script>window.EMBEDDED_ACTIVITIES_CSV = ' + JSON.stringify(csv) + ';</script>\n<script>\n' + js + '\n</script>'
  );

fs.writeFileSync(outPath, embedded, 'utf8');
console.log('Wrote ' + outPath + ' (' + Math.round(fs.statSync(outPath).size / 1024) + ' KB)');
