// Debug script to check push-up state
const Conf = require('conf');
const { join } = require('path');
const { homedir } = require('os');

const config = new Conf({
  projectName: 'vibe-log',
  cwd: join(homedir(), '.vibe-log')
});

console.log('\n=== Push-Up Challenge Debug ===\n');

const pushUpConfig = config.get('pushUpChallenge');

if (!pushUpConfig) {
  console.log('❌ No push-up challenge config found!');
  process.exit(1);
}

console.log('Current Configuration:');
console.log(JSON.stringify(pushUpConfig, null, 2));

console.log('\n=== Key Values ===');
console.log('Enabled:', pushUpConfig.enabled);
console.log('Total Debt:', pushUpConfig.totalDebt);
console.log('Total Completed:', pushUpConfig.totalCompleted);
console.log('Today Debt:', pushUpConfig.todayDebt);
console.log('Today Completed:', pushUpConfig.todayCompleted);
console.log('Last Cursor Message Count:', pushUpConfig.lastCursorMessageCount);
console.log('Last Cursor Check Date:', pushUpConfig.lastCursorCheckDate);

console.log('\n=== Config File Location ===');
console.log(config.path);
