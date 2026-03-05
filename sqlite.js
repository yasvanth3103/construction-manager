const path = require("path");
const sqlite3 = require("sqlite3").verbose();

let dbInstance;

function getDb() {
  if (!dbInstance) {
    const dbPath = path.join(__dirname, "data.sqlite");
    dbInstance = new sqlite3.Database(dbPath);
  }
  return dbInstance;
}

module.exports = { getDb };

