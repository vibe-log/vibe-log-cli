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

/**
 * Get all files in a directory recursively
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  });
  
  return arrayOfFiles;
}

async function main() {
  try {
    const distPath = path.join(process.cwd(), 'dist');
    const checksums = [];
    
    // Get all files in dist directory (including subdirectories)
    const allFiles = getAllFiles(distPath);
    
    // Filter out checksums.sha256 if it exists and sort for consistent output
    const filesToChecksum = allFiles
      .filter(file => !file.endsWith('checksums.sha256'))
      .sort();
    
    for (const filePath of filesToChecksum) {
      const checksum = await generateChecksum(filePath);
      // Get relative path from dist directory for the checksum file
      const relativePath = path.relative(distPath, filePath).replace(/\\/g, '/');
      checksums.push(`${checksum}  ${relativePath}`);
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