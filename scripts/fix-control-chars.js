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
    
    // Replace \x1b with \u001b (ANSI escape)
    content = content.replace(/\\x1b/g, '\\u001b');
    
    // Replace \x00 with \u0000 (null character) 
    content = content.replace(/\\x00/g, '\\u0000');
    
    // Replace \x1F with \u001F (unit separator)
    content = content.replace(/\\x1F/g, '\\u001F');
    
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`Fixed: ${filePath}`);
  } else {
    console.log(`File not found: ${filePath}`);
  }
});

console.log('Done fixing control character patterns in test files!');