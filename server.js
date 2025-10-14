// server.js – Comicon Bingo with Supabase (Render-friendly persistent storage)
import express from "express";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const SALT = process.env.BINGO_SALT || "super-secret-salt";
const SIZE = 5;
const CENTER = { r: 2, c: 2 };
const IMAGES_DIR = path.join(__dirname, "public", "images");

// ✅ Supabase Setup
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_KEY environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
console.log("✅ Connected to Supabase");

// --- Helper: ID generation ---
const todayStr = () => new Date().toLocaleDateString("en-CA");
const hashDevice = (req) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || "0.0.0.0";
  const ua = req.headers["user-agent"] || "unknown";
  return crypto.createHash("sha256").update(ip + ua + SALT).digest("hex");
};

// --- Supabase read/write ---
async function readUser(id) {
  const { data, error } = await supabase
    .from("users")
    .select("data")
    .eq("id", id)
    .maybeSingle();

  if (error && error.code !== "PGRST116") console.error("Read error:", error);
  return data ? data.data : null;
}

async function writeUser(id, user) {
  const { error } = await supabase.from("users").upsert({ id, data: user });
  if (error) console.error("Write error:", error);
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

// --- API Routes ---
app.get("/api/board", async (req, res) => {
  const id = hashDevice(req);
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
  const id = hashDevice(req);
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
  const id = hashDevice(req);
  let user = await readUser(id);
  if (!user) return res.status(404).json({ error: "User not found" });

  user.preference = !!preference;
  await writeUser(id, user);
  res.json({ ok: true, preference: user.preference });
});

app.post("/api/newboard", async (req, res) => {
  const id = hashDevice(req);
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
app.listen(PORT, () =>
  console.log(`✅ Bingo running on Render at port ${PORT}`)
);
