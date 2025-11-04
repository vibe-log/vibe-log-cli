const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

// Get Cursor DB path
const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData/Roaming');
const dbPath = path.join(appData, 'Cursor/User/globalStorage/state.vscdb');

console.log('Reading Cursor database:', dbPath);

const db = new Database(dbPath, { readonly: true });

// Get all messages
const sql = `SELECT value FROM cursorDiskKV WHERE key LIKE 'composerData:%' AND length(value) > 1000`;
const rows = db.prepare(sql).all();

console.log(`\nFound ${rows.length} conversations`);

// Parse and analyze timestamps
rows.forEach((row, idx) => {
  try {
    const data = JSON.parse(row.value);
    console.log(`\n--- Conversation ${idx + 1}: ${data.composerId.slice(0, 8)} ---`);

    if (data.conversation) {
      // Legacy format
      console.log(`Format: Legacy`);
      console.log(`Messages: ${data.conversation.length}`);

      const timestamps = data.conversation.map(m => {
        if (m.timestamp) return new Date(m.timestamp).getTime();
        return Date.now();
      });

      if (timestamps.length > 0) {
        const start = Math.min(...timestamps);
        const end = Math.max(...timestamps);
        const durationMs = end - start;
        const durationMin = Math.floor(durationMs / 60000);

        console.log(`Duration: ${durationMin} minutes (${Math.floor(durationMs / 1000)} seconds)`);
        console.log(`Start: ${new Date(start).toISOString()}`);
        console.log(`End: ${new Date(end).toISOString()}`);
      }
    } else {
      // Modern format
      console.log(`Format: Modern`);
      console.log(`Headers: ${data.fullConversationHeadersOnly?.length || 0}`);
      console.log(`Created: ${data.createdAt ? new Date(data.createdAt).toISOString() : 'N/A'}`);
      console.log(`Updated: ${data.lastUpdatedAt ? new Date(data.lastUpdatedAt).toISOString() : 'N/A'}`);

      if (data.createdAt && data.lastUpdatedAt) {
        const durationMs = data.lastUpdatedAt - data.createdAt;
        const durationMin = Math.floor(durationMs / 60000);
        console.log(`Duration: ${durationMin} minutes (${Math.floor(durationMs / 1000)} seconds)`);
      }
    }
  } catch (e) {
    console.log(`Error parsing conversation ${idx + 1}:`, e.message);
  }
});

db.close();
