// server.js - Comicon Bingo (ESM)
import express from "express";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const DB_FILE = process.env.RENDER_DISK_PATH
  ? path.join(process.env.RENDER_DISK_PATH, "db.json")
  : path.join(__dirname, "db.json");
const IMAGES_DIR = path.join(__dirname, "public", "images");
const PORT = process.env.PORT || 3000;
const SALT = process.env.BINGO_SALT || "super-secret-salt";
const SIZE = 5;
const CENTER = { r: 2, c: 2 };

const todayStr = () => new Date().toLocaleDateString("en-CA");
const hashToken = (token) =>
  crypto.createHash("sha256").update(token + SALT).digest("hex");

async function readDB() {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { users: {} };
  }
}
async function writeDB(db) {
  const tmp = DB_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_FILE);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function makeBoard(images) {
  // exclude emlogo.* from random pool
  const available = images.filter((f) => !/^emlogo\./i.test(f));
  const list = shuffle([...available]).slice(0, SIZE * SIZE - 1);
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  let idx = 0;

  // find emlogo (any ext)
  const emlogo = images.find((f) => /^emlogo\./i.test(f));
  const hasEmLogo = !!emlogo;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (r === CENTER.r && c === CENTER.c) {
        // center: shows emlogo if available, starts unclicked and not fixed (clickable)
        if (hasEmLogo) {
          board[r][c] = {
            text: "FREE",
            image: `/images/${encodeURIComponent(emlogo)}`,
            clicked: false,
            fixed: false,
          };
        } else {
          board[r][c] = {
            text: "FREE",
            clicked: false,
            fixed: false,
          };
        }
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

// Helper to get token from header
function getToken(req) {
  return req.headers["x-bingo-token"] || null;
}

// --- Routes ---

// GET board (create user if missing)
app.get("/api/board", async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(400).json({ error: "Missing token header x-bingo-token" });

  const id = hashToken(token);
  const db = await readDB();

  let images = [];
  try {
    images = (await fs.readdir(IMAGES_DIR)).filter((f) =>
      /\.(png|jpg|jpeg|webp|gif)$/i.test(f)
    );
  } catch (e) {
    return res.status(500).json({ error: "Images folder not found" });
  }

  if (images.length < 24)
    return res.status(500).json({ error: "Need at least 24 images in /public/images" });

  db.users ??= {};
  let user = db.users[id];

  const today = todayStr();

  if (!user) {
    user = {
      created: today,
      lastGenerated: today,
      completed: false,
      preference: false,
      board: await makeBoard(images),
    };
    db.users[id] = user;
    await writeDB(db);
  }

  return res.json({ board: user.board, meta: user });
});

// POST click => toggle clicked
app.post("/api/click", async (req, res) => {
  const { row, col } = req.body;
  const token = getToken(req);
  if (!token) return res.status(400).json({ error: "Missing token header x-bingo-token" });

  const id = hashToken(token);
  const db = await readDB();
  const user = db.users[id];
  if (!user) return res.status(404).json({ error: "User not found" });

  if (row < 0 || col < 0 || row >= SIZE || col >= SIZE) return res.status(400).json({ error: "Invalid cell" });

  const cell = user.board[row][col];
  // toggle (if fixed true toggling allowed? center not fixed in our setup)
  cell.clicked = !cell.clicked;

  // recompute overall completed
  user.completed = user.board.flat().every((sq) => sq.clicked);

  await writeDB(db);
  return res.json({ ok: true, completed: user.completed, board: user.board });
});

app.post("/api/preference", async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(400).json({ error: "Missing token header x-bingo-token" });
  const { preference } = req.body;

  const id = hashToken(token);
  const db = await readDB();
  const user = db.users[id];
  if (!user) return res.status(404).json({ error: "User not found" });

  user.preference = !!preference;
  await writeDB(db);
  return res.json({ ok: true, preference: user.preference });
});

app.post("/api/newboard", async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(400).json({ error: "Missing token header x-bingo-token" });

  const id = hashToken(token);
  const db = await readDB();
  const user = db.users[id];
  if (!user) return res.status(404).json({ error: "User not found" });

  let images = [];
  try {
    images = (await fs.readdir(IMAGES_DIR)).filter((f) =>
      /\.(png|jpg|jpeg|webp|gif)$/i.test(f)
    );
  } catch {
    return res.status(500).json({ error: "Images folder not found" });
  }

  if (images.length < 24) return res.status(500).json({ error: "Not enough images" });

  user.board = await makeBoard(images);
  user.completed = false;
  user.lastGenerated = todayStr();
  await writeDB(db);

  return res.json({ ok: true, board: user.board });
});

app.listen(PORT, () => console.log(`✅ Bingo running at http://localhost:${PORT}`));
