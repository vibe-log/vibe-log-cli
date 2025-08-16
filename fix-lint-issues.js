#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Function to replace control characters in file
function fixFile(filePath) {
  const fullPath = path.join(__dirname, filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${filePath}`);
    return 0;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  let changes = 0;
  
  // Count changes before replacement
  const matches = content.match(/\\x[0-9a-fA-F]{2}/g) || [];
  changes = matches.length;
  
  // Replace all hex escapes with unicode escapes
  content = content.replace(/\\x1b/g, '\\u001b');
  content = content.replace(/\\x00/g, '\\u0000');
  content = content.replace(/\\x1F/g, '\\u001F');
  content = content.replace(/\\x1f/g, '\\u001f');
  
  // For any other control characters (0x00-0x1F), replace them
  for (let i = 0; i <= 0x1F; i++) {
    const hex = i.toString(16).padStart(2, '0');
    const regex = new RegExp(`\\\\x${hex}`, 'gi');
    const unicode = `\\u00${hex}`;
    content = content.replace(regex, unicode);
  }
  
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`Fixed ${filePath}: ${changes} replacements`);
  return changes;
}

// List of files to fix
const files = [
  'src/lib/ui/__tests__/styles.test.ts',
  'src/lib/ui/__tests__/progress.test.ts',
  // Already fixed: 'src/lib/ui/__tests__/project-display.test.ts',
];

console.log('Fixing control character patterns in test files...\n');

let totalChanges = 0;
files.forEach(file => {
  totalChanges += fixFile(file);
});

console.log(`\nTotal changes: ${totalChanges}`);
console.log('Done! You can now run: npm run lint');