#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Ensure dist/templates directory exists
const distTemplatesDir = path.join(__dirname, '..', 'dist', 'templates');
if (!fs.existsSync(distTemplatesDir)) {
  fs.mkdirSync(distTemplatesDir, { recursive: true });
}

// Copy template file
const srcTemplate = path.join(__dirname, '..', 'src', 'templates', 'report-template.html');
const destTemplate = path.join(__dirname, '..', 'dist', 'templates', 'report-template.html');

if (fs.existsSync(srcTemplate)) {
  fs.copyFileSync(srcTemplate, destTemplate);
  console.log('✅ Template copied to dist/templates/');
} else {
  console.error('❌ Template file not found:', srcTemplate);
  process.exit(1);
}