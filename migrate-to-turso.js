// migrate-to-turso.js
// Safe Turso migration script — accepts credentials via CLI args, env vars, or turso-credentials.json

import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";

const CREDENTIALS_FILE = path.resolve("./turso-credentials.json");

// Utility: get credentials from CLI, env, or credentials file
function getCredentials() {
  // 1) CLI args: node migrate-to-turso.js <TURSO_URL> <TURSO_TOKEN>
  const argv = process.argv.slice(2);
  if (argv.length >= 2 && argv[0] && argv[1]) {
    return { url: argv[0], token: argv[1] };
  }

  // 2) Environment variables
  if (process.env.TURSO_URL && process.env.TURSO_TOKEN) {
    return { url: process.env.TURSO_URL, token: process.env.TURSO_TOKEN };
  }

  // 3) credentials file
  if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      const raw = fs.readFileSync(CREDENTIALS_FILE, "utf8");
      const j = JSON.parse(raw);
      if (j.TURSO_URL && j.TURSO_TOKEN) return { url: j.TURSO_URL, token: j.TURSO_TOKEN };
      // allow alternative keys
      if (j.url && j.token) return { url: j.url, token: j.token };
    } catch (err) {
      console.error("Error reading turso-credentials.json:", err.message);
      process.exit(1);
    }
  }

  return null;
}

const creds = getCredentials();
if (!creds) {
  console.error("\n❌ No Turso credentials found.");
  console.error("Provide them one of three ways:");
  console.error("  1) CLI args: node migrate-to-turso.js <TURSO_URL> <TURSO_TOKEN>");
  console.error("  2) Environment vars: set TURSO_URL and TURSO_TOKEN");
  console.error("  3) Create turso-credentials.json with { \"TURSO_URL\": \"...\", \"TURSO_TOKEN\": \"...\" }\n");
  process.exit(1);
}

const TURSO_URL = creds.url;
const TURSO_TOKEN = creds.token;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("❌ TURSO_URL or TURSO_TOKEN empty — aborting.");
  process.exit(1);
}

console.log("Using Turso URL:", TURSO_URL.replace(/(\/\/).+(@)/, "$1***$2") || TURSO_URL);
console.log("Using TURSO_TOKEN length:", TURSO_TOKEN.length);

// connect
const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

async function migrate() {
  try {
    const dbPath = path.resolve("./db.json");
    if (!fs.existsSync(dbPath)) {
      console.error("❌ No db.json found in current folder. Place db.json beside this script.");
      process.exit(1);
    }

    const raw = fs.readFileSync(dbPath, "utf8");
    const dbData = JSON.parse(raw);
    const entries = Object.entries(dbData);
    console.log(`📦 Found ${entries.length} user records in db.json`);

    // Ensure table exists
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        data TEXT
      );
    `);

    // Insert/replace users
    for (const [id, data] of entries) {
      const jsonData = JSON.stringify(data);
      await turso.execute(
        "INSERT OR REPLACE INTO users (id, data) VALUES (?, ?)",
        [id, jsonData]
      );
      console.log(`✅ Imported ${id}`);
    }

    console.log("🎉 Migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }
}

migrate();
