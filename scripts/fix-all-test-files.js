#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Files that need fixing based on the grep output
const testFiles = [
  'src/lib/ui/__tests__/project-display.test.ts',
  'src/lib/ui/__tests__/styles.test.ts',
  'src/lib/ui/__tests__/progress.test.ts'
];

function fixFile(filePath) {
  const fullPath = path.join(__dirname, filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  let replacements = 0;
  
  // Fix regex patterns: /\x1b\[.../ -> /\u001b\[.../
  const regexPattern = /\/([^\/]*?)\\x1b(\[[^\]]*\][^\/]*?)\/([gimsuvy]*)/g;
  content = content.replace(regexPattern, (match, before, after, flags) => {
    replacements++;
    return `/${before}\\u001b${after}/${flags}`;
  });
  
  // Fix string literals: '\x1b[32m' -> '\u001b[32m'
  const stringPattern = /'\\x1b(\[[^\]]+\])'/g;
  content = content.replace(stringPattern, (match, code) => {
    replacements++;
    return `'\\u001b${code}'`;
  });
  
  // Also fix double-quoted strings: "\x1b[32m" -> "\u001b[32m"
  const doubleQuotePattern = /"\\x1b(\[[^\]]+\])"/g;
  content = content.replace(doubleQuotePattern, (match, code) => {
    replacements++;
    return `"\\u001b${code}"`;
  });
  
  // Fix any remaining \x00 and \x1F patterns
  content = content.replace(/\\x00/g, '\\u0000');
  content = content.replace(/\\x1F/g, '\\u001F');
  
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`Fixed ${filePath}: ${replacements} replacements`);
}

// Process all files
testFiles.forEach(fixFile);

console.log('\nDone fixing control character patterns in test files!');
console.log('You can now run: npm run lint');