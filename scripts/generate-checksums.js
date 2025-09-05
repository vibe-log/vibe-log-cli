#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Generate SHA256 checksum for a file
 */
function generateChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function main() {
  try {
    const distPath = path.join(process.cwd(), 'dist');
    const files = ['index.js', 'index.js.map'];
    const checksums = [];
    
    for (const file of files) {
      const filePath = path.join(distPath, file);
      if (fs.existsSync(filePath)) {
        const checksum = await generateChecksum(filePath);
        checksums.push(`${checksum}  ${file}`);
      }
    }
    
    // Write checksums file
    const checksumsPath = path.join(distPath, 'checksums.sha256');
    fs.writeFileSync(checksumsPath, checksums.join('\n') + '\n');
    
    console.log('✓ Checksums generated');
  } catch (error) {
    console.error('Error generating checksums:', error);
    process.exit(1);
  }
}

main();