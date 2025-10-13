// server.js – Comicon Bingo (Turso + local fallback)
import express from "express";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import { createClient } from "@libsql/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const SALT = process.env.BINGO_SALT || "super-secret-salt";
const SIZE = 5;
const CENTER = { r: 2, c: 2 };

// Local fallback DB file
const DB_FILE = process.env.RENDER_DISK_PATH
  ? path.join(process.env.RENDER_DISK_PATH, "db.json")
  : path.join(__dirname, "db.json");

// Turso setup (if env vars present)
let turso = null;
if (process.env.TURSO_URL && process.env.TURSO_AUTH_TOKEN) {
  try {
    turso = createClient({
      url: process.env.TURSO_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    console.log("✅ Connected to Turso database");
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        data TEXT
      )
    `);
  } catch (err) {
    console.error("⚠️ Turso init failed — using local JSON DB:", err.message);
    turso = null;
  }
}

const IMAGES_DIR = path.join(__dirname, "public", "images");
const todayStr = () => new Date().toLocaleDateString("en-CA");
const hashId = (ipOrCookie) =>
  crypto.createHash("sha256").update(ipOrCookie + SALT).digest("hex");

// --- Helpers ---
async function readLocalDB() {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { users: {} };
  }
}

async function writeLocalDB(db) {
  const tmp = DB_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_FILE);
}

// --- Turso user helpers ---
async function readUser(id) {
  if (!turso) {
    const db = await readLocalDB();
    return db.users[id] || null;
  }
  const res = await turso.execute({
    sql: "SELECT data FROM users WHERE id = ?",
    args: [id],
  });
  if (res.rows.length === 0) return null;
  return JSON.parse(res.rows[0].data);
}

async function writeUser(id, user) {
  if (!turso) {
    const db = await readLocalDB();
    db.users[id] = user;
    await writeLocalDB(db);
    return;
  }
  await turso.execute({
    sql: "INSERT OR REPLACE INTO users (id, data) VALUES (?, ?)",
    args: [id, JSON.stringify(user)],
  });
}

// --- Board helpers ---
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeBoard(images) {
  const emLogo = images.find((f) => /^emlogo\.(png|jpg|jpeg|webp|gif)$/i.test(f));
  const otherImages = images.filter((f) => f !== emLogo);
  const list = shuffle([...otherImages]).slice(0, SIZE * SIZE - 1);
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

  let idx = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (r === CENTER.r && c === CENTER.c) {
        board[r][c] = {
          text: "FREE",
          image: emLogo ? `/images/${encodeURIComponent(emLogo)}` : null,
          clicked: true,
          fixed: true,
        };
      } else {
        const file = list[idx++];
        const label = file.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
        board[r][c] = {
          text: label,
          image: `/images/${encodeURIComponent(file)}`,
          clicked: false,
        };
      }
    }
  }
  return board;
}

const getUserId = (req, res) => {
  let uid = req.cookies?.bingoId;
  if (!uid) {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
    uid = hashId(ip);
    res.cookie("bingoId", uid, { maxAge: 365 * 24 * 60 * 60 * 1000 });
  }
  return uid;
};

// --- Routes ---
app.get("/api/board", async (req, res) => {
  const id = getUserId(req, res);
  const images = (await fs.readdir(IMAGES_DIR)).filter((f) =>
    /\.(png|jpg|jpeg|webp|gif)$/i.test(f)
  );
  if (images.length < 24)
    return res.status(500).json({ error: "Need at least 24 images in /public/images" });

  const today = todayStr();
  let user = await readUser(id);

  if (!user) {
    user = {
      created: today,
      lastGenerated: today,
      completed: false,
      preference: false,
      board: makeBoard(images),
    };
    await writeUser(id, user);
  } else if (user.preference && user.completed && user.lastGenerated !== today) {
    user.board = makeBoard(images);
    user.completed = false;
    user.lastGenerated = today;
    await writeUser(id, user);
  }

  res.json({ board: user.board, meta: user });
});

app.post("/api/click", async (req, res) => {
  const { row, col } = req.body;
  const id = getUserId(req, res);
  let user = await readUser(id);
  if (!user) return res.status(404).json({ error: "User not found" });

  const cell = user.board[row]?.[col];
  if (!cell || cell.fixed) return res.json({ ok: true, board: user.board });

  cell.clicked = !cell.clicked;

  const allClicked = user.board.flat().every((sq) => sq.clicked);
  if (allClicked) user.completed = true;

  await writeUser(id, user);
  res.json({ ok: true, completed: user.completed, board: user.board });
});

app.post("/api/preference", async (req, res) => {
  const { preference } = req.body;
  const id = getUserId(req, res);
  let user = await readUser(id);
  if (!user) return res.status(404).json({ error: "User not found" });

  user.preference = !!preference;
  await writeUser(id, user);
  res.json({ ok: true, preference: user.preference });
});

app.post("/api/newboard", async (req, res) => {
  const id = getUserId(req, res);
  let user = await readUser(id);
  if (!user) return res.status(404).json({ error: "User not found" });

  const images = (await fs.readdir(IMAGES_DIR)).filter((f) =>
    /\.(png|jpg|jpeg|webp|gif)$/i.test(f)
  );
  if (images.length < 24)
    return res.status(500).json({ error: "Not enough images" });

  user.board = makeBoard(images);
  user.completed = false;
  user.lastGenerated = todayStr();
  await writeUser(id, user);
  res.json({ ok: true, board: user.board });
});

// --- Start server ---
app.listen(PORT, () => console.log(`✅ Bingo running at http://localhost:${PORT}`));
