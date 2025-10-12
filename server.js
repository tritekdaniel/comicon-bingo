// server.js - mobile-optimized Comicon Bingo server (drop-in)
import express from "express";
import cors from "cors";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const DB_FILE = process.env.RENDER_DISK_PATH
  ? path.join(process.env.RENDER_DISK_PATH, "db.json")
  : path.join(__dirname, "db.json");
const IMAGES_DIR = path.join(__dirname, "public", "images");
const PORT = process.env.PORT || 3000;
const SIZE = 5;
const CENTER = { r: 2, c: 2 };

const todayStr = () => new Date().toLocaleDateString("en-CA");
const generateToken = () => crypto.randomBytes(16).toString("hex");

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

function makeBoard(images) {
  const list = shuffle([...images]).slice(0, SIZE * SIZE - 1);
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  let idx = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (r === CENTER.r && c === CENTER.c) {
        board[r][c] = { text: "FREE", clicked: true, fixed: true };
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

// Identify user by client-provided header token (fallback: generate token)
function getUserId(req) {
  const headerToken = req.headers["x-bingo-token"];
  if (headerToken && typeof headerToken === "string" && headerToken.length > 8) {
    return headerToken;
  }
  // fallback (shouldn't be used if client sends token)
  return generateToken();
}

// --- API: GET /api/board
app.get("/api/board", async (req, res) => {
  try {
    const userId = getUserId(req);
    const db = await readDB();

    const images = (await fs.readdir(IMAGES_DIR)).filter((f) =>
      /\.(png|jpg|jpeg|webp|gif)$/i.test(f)
    );
    if (images.length < 24) {
      return res.status(500).json({ error: "Need at least 24 images in /public/images" });
    }

    const today = todayStr();
    db.users ??= {};
    let user = db.users[userId];

    if (!user) {
      user = {
        created: today,
        lastGenerated: today,
        completed: false,
        preference: false,
        board: makeBoard(images),
      };
      db.users[userId] = user;
      await writeDB(db);
    } else if (user.preference && user.completed && user.lastGenerated !== today) {
      // daily reset if opted-in and completed
      user.board = makeBoard(images);
      user.completed = false;
      user.lastGenerated = today;
      await writeDB(db);
    }

    res.json({ board: user.board, meta: user });
  } catch (err) {
    console.error("GET /api/board error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// --- API: POST /api/click
app.post("/api/click", async (req, res) => {
  try {
    const { row, col } = req.body;
    if (typeof row !== "number" || typeof col !== "number") {
      return res.status(400).json({ error: "Missing row/col" });
    }
    if (row < 0 || col < 0 || row >= SIZE || col >= SIZE)
      return res.status(400).json({ error: "Invalid cell" });

    const userId = getUserId(req);
    const db = await readDB();
    db.users ??= {};
    let user = db.users[userId];

    // ✅ Ensure user exists with a stable board
    if (!user) {
      const images = (await fs.readdir(IMAGES_DIR)).filter((f) =>
        /\.(png|jpg|jpeg|webp|gif)$/i.test(f)
      );
      if (images.length < 24)
        return res.status(500).json({ error: "Not enough images" });

      user = {
        created: todayStr(),
        lastGenerated: todayStr(),
        completed: false,
        preference: false,
        board: makeBoard(images),
      };
      db.users[userId] = user;
      await writeDB(db);
    }

    const cell = user.board[row][col];

    // Ignore already-clicked or fixed cells
    if (cell.fixed || cell.clicked) {
      return res.json({ ok: true, completed: user.completed, board: user.board });
    }

    // Mark the clicked square
    cell.clicked = true;

    const allClicked = user.board.flat().every((sq) => sq.clicked);
    if (allClicked) user.completed = true;

    await writeDB(db);
    res.json({ ok: true, completed: user.completed, board: user.board });
  } catch (err) {
    console.error("POST /api/click error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// --- API: POST /api/preference
app.post("/api/preference", async (req, res) => {
  try {
    const { preference } = req.body;
    const userId = getUserId(req);
    const db = await readDB();
    const user = db.users[userId];
    if (!user) return res.status(404).json({ error: "User not found" });

    user.preference = !!preference;
    await writeDB(db);
    res.json({ ok: true, preference: user.preference });
  } catch (err) {
    console.error("POST /api/preference error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// --- API: POST /api/newboard
app.post("/api/newboard", async (req, res) => {
  try {
    const userId = getUserId(req);
    const db = await readDB();
    const user = db.users[userId];
    if (!user) return res.status(404).json({ error: "User not found" });

    const images = (await fs.readdir(IMAGES_DIR)).filter((f) =>
      /\.(png|jpg|jpeg|webp|gif)$/i.test(f)
    );
    if (images.length < 24)
      return res.status(500).json({ error: "Not enough images" });

    user.board = makeBoard(images);
    user.completed = false;
    user.lastGenerated = todayStr();
    await writeDB(db);

    res.json({ ok: true, board: user.board });
  } catch (err) {
    console.error("POST /api/newboard error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Start
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Bingo running on all interfaces, port ${PORT}`)
);

