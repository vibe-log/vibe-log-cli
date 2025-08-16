#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Files that need fixing based on the grep output
const testFiles = [
  'src/lib/ui/__tests__/project-display.test.ts',
  'src/lib/ui/__tests__/styles.test.ts', 
  'src/lib/ui/__tests__/progress.test.ts'
];

testFiles.forEach(filePath => {
  const fullPath = path.join(__dirname, filePath);
  
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Replace regex patterns containing \x1b with \u001b
    // This matches the pattern /...\\x1b.../ in test files
    content = content.replace(/\/([^\/]*?)\\x1b([^\/]*?)\/([gimsuvy]*)/g, '/$1\\u001b$2/$3');
    
    // Also replace in string literals that check for ANSI codes
    content = content.replace(/\\.toContain\('\\x1b/g, '\\.toContain(\'\\u001b');
    content = content.replace(/expect\([^)]+\)\.toContain\('\\x([0-9a-fA-F]{2})/g, (match, hex) => {
      // Convert hex to unicode format
      const code = parseInt(hex, 16);
      const unicode = code.toString(16).padStart(4, '0');
      return match.replace(`\\x${hex}`, `\\u00${hex}`);
    });
    
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`Fixed: ${filePath}`);
  } else {
    console.log(`File not found: ${filePath}`);
  }
});

console.log('Done fixing control character patterns in test files!');