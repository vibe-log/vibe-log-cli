#!/usr/bin/env node

// This script captures what Claude Code sends to statusline via stdin
const fs = require('fs');
const path = require('path');
const os = require('os');

const logFile = path.join(os.homedir(), '.vibe-log', 'statusline-stdin.json');

let input = '';

// Set timeout to capture stdin
const timeout = setTimeout(() => {
  if (input) {
    try {
      const parsed = JSON.parse(input);
      fs.writeFileSync(logFile, JSON.stringify(parsed, null, 2));
      console.log('📊 Data captured and saved to:', logFile);
      
      // Output a simple statusline message
      process.stdout.write('🔍 Captured stdin data for debugging');
    } catch (e) {
      process.stdout.write('❌ Failed to parse stdin: ' + e.message);
    }
  } else {
    process.stdout.write('⏳ No stdin data received');
  }
  process.exit(0);
}, 100);

process.stdin.setEncoding('utf8');

process.stdin.on('readable', () => {
  let chunk;
  while ((chunk = process.stdin.read()) !== null) {
    input += chunk;
  }
});

process.stdin.on('end', () => {
  clearTimeout(timeout);
  if (input) {
    try {
      const parsed = JSON.parse(input);
      fs.writeFileSync(logFile, JSON.stringify(parsed, null, 2));
      process.stdout.write('📊 Captured stdin from Claude Code');
    } catch (e) {
      process.stdout.write('❌ Parse error: ' + e.message);
    }
  } else {
    process.stdout.write('⏳ No stdin received');
  }
  process.exit(0);
});