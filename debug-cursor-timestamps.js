// Debug script to check if Cursor populates lastUpdatedAt
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

function getCursorDatabasePath() {
  const platform = os.platform();

  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library/Application Support/Cursor/User/globalStorage/state.vscdb');
  } else if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData/Roaming');
    return path.join(appData, 'Cursor/User/globalStorage/state.vscdb');
  } else {
    return path.join(os.homedir(), '.config/Cursor/User/globalStorage/state.vscdb');
  }
}

const dbPath = getCursorDatabasePath();
console.log('Database path:', dbPath);
console.log('');

try {
  const db = new Database(dbPath, { readonly: true });

  const sql = `
    SELECT value FROM cursorDiskKV
    WHERE key LIKE 'composerData:%'
    AND length(value) > 1000
    LIMIT 5
  `;

  const stmt = db.prepare(sql);
  const rows = stmt.all();

  console.log(`Found ${rows.length} conversations to analyze\n`);

  for (let i = 0; i < rows.length; i++) {
    const conversation = JSON.parse(rows[i].value);

    console.log(`Conversation ${i + 1}:`);
    console.log('  composerId:', conversation.composerId);
    console.log('  createdAt:', conversation.createdAt);
    console.log('  lastUpdatedAt:', conversation.lastUpdatedAt);
    console.log('  hasCreatedAt:', !!conversation.createdAt);
    console.log('  hasLastUpdatedAt:', !!conversation.lastUpdatedAt);

    if (conversation.createdAt && conversation.lastUpdatedAt) {
      const created = new Date(conversation.createdAt);
      const updated = new Date(conversation.lastUpdatedAt);
      console.log('  Created:', created.toLocaleString());
      console.log('  Updated:', updated.toLocaleString());
      console.log('  Different?:', conversation.createdAt !== conversation.lastUpdatedAt);
    }

    console.log('');
  }

  db.close();
} catch (error) {
  console.error('Error:', error.message);
}
