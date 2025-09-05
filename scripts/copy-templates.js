#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Copy template file directly to dist/ to avoid directory issues with sha256sum
const srcTemplate = path.join(__dirname, '..', 'src', 'templates', 'report-template.html');
const destTemplate = path.join(__dirname, '..', 'dist', 'report-template.html');

if (fs.existsSync(srcTemplate)) {
  fs.copyFileSync(srcTemplate, destTemplate);
  console.log('✅ Template copied to dist/');
} else {
  console.error('❌ Template file not found:', srcTemplate);
  process.exit(1);
}