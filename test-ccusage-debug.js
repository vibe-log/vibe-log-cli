#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Log file for debugging
const logFile = path.join(os.homedir(), '.vibe-log', 'ccusage-debug.log');

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFile, logMessage);
  console.log(message);
}

async function testCCUsage() {
  log('=== Testing ccusage integration ===');
  
  // Test 1: Check if ccusage is available
  log('Test 1: Checking ccusage availability...');
  
  try {
    const checkProcess = spawn('npx', ['ccusage@latest', '--version'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });
    
    let output = '';
    checkProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    checkProcess.on('close', (code) => {
      if (code === 0) {
        log(`✅ ccusage version: ${output.trim()}`);
      } else {
        log(`❌ ccusage not available or errored with code ${code}`);
      }
    });
  } catch (error) {
    log(`❌ Error checking ccusage: ${error.message}`);
  }
  
  // Wait a bit for the version check to complete
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 2: Try calling ccusage statusline
  log('\nTest 2: Testing ccusage statusline command...');
  
  return new Promise((resolve) => {
    let output = '';
    let errorOutput = '';
    let processExited = false;
    
    const timeout = setTimeout(() => {
      log('⏱️ Timeout after 3 seconds');
      resolve();
    }, 3000);
    
    try {
      const ccusage = spawn('npx', ['ccusage@latest', 'statusline'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      });
      
      log('Process spawned, sending input...');
      
      // Send test input
      const input = JSON.stringify({ session_id: 'test-session-debug' });
      ccusage.stdin.write(input);
      ccusage.stdin.end();
      
      ccusage.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        log(`stdout: ${chunk}`);
      });
      
      ccusage.stderr.on('data', (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        log(`stderr: ${chunk}`);
      });
      
      ccusage.on('close', (code) => {
        if (processExited) return;
        processExited = true;
        clearTimeout(timeout);
        
        log(`Process exited with code ${code}`);
        if (output) {
          log(`✅ Got output: ${output.trim()}`);
        } else {
          log(`❌ No output received`);
        }
        
        resolve();
      });
      
      ccusage.on('error', (err) => {
        if (processExited) return;
        processExited = true;
        clearTimeout(timeout);
        
        log(`❌ Process error: ${err.message}`);
        resolve();
      });
      
    } catch (error) {
      clearTimeout(timeout);
      log(`❌ Exception: ${error.message}`);
      resolve();
    }
  });
}

// Run the test
testCCUsage().then(() => {
  log('\n=== Test complete ===');
  log(`Debug log saved to: ${logFile}`);
  process.exit(0);
}).catch(error => {
  log(`Fatal error: ${error.message}`);
  process.exit(1);
});