
// bingoSession.js
// Handles user token cookies and simple token→card mapping via sessions.json

import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSION_FILE = path.join(__dirname, 'sessions.json');

// Ensure file exists
if (!fs.existsSync(SESSION_FILE)) {
  fs.writeFileSync(SESSION_FILE, '{}');
}

// Read/write helpers
function readSessions() {
  return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
}

function writeSessions(data) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
}

// Create a new secure random token
function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

// Assign or retrieve a user card ID
export function getUserCard(req, res, pickRandomCard) {
  const cookies = parseCookies(req);
  let token = cookies.bingo_token;
  let sessions = readSessions();

  // If token exists, return their card
  if (token && sessions[token]) {
    return sessions[token];
  }

  // Otherwise, make a new token + card
  token = generateToken();
  const cardId = pickRandomCard();
  sessions[token] = cardId;
  writeSessions(sessions);

  // Set cookie
  res.cookie('bingo_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 1000 * 60 * 60 * 24 * 365 // 1 year
  });

  return cardId;
}

// Simple cookie parser (no dependency)
function parseCookies(req) {
  const rc = req.headers.cookie;
  const cookies = {};
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      cookies[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return cookies;
}
