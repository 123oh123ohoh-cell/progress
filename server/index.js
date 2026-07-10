require("dotenv").config();
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const { MongoClient } = require("mongodb");
const { WebSocketServer } = require("ws");

const app = express();
const port = process.env.PORT || 3000;
const publicPath = path.join(__dirname, "..");
const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "progress";

if (!mongoUri) {
  console.error("Missing MONGODB_URI environment variable. Set it in a .env file locally or in your host's environment settings.");
  process.exit(1);
}

const DEFAULT_TIMEZONE = "UTC";
const ALLOWED_CREATOR_USERNAMES = new Set(["mara", "own", "progresstesting1"]);
const DEFAULT_CHAT_ROOM = "global";

const SPOTIFY_LINK_RE = /^(?:https:\/\/open\.spotify\.com\/(?:intl-[a-zA-Z-]+\/)?(?:track|album|playlist|artist|episode|show)\/[a-zA-Z0-9]+(?:\?[^\s]*)?|spotify:(?:track|album|playlist|artist|episode|show):[a-zA-Z0-9]+)$/i;

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "";

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";

// Uploads a base64 data URI to Cloudinary and returns the hosted URL.
// Signed server-side (not an unsigned upload preset) so the API secret
// never has to be exposed to the browser. This is what actually fixes the
// payload-bloat bug: once a post stores a short Cloudinary URL instead of
// a multi-MB embedded base64 string, /api/posts stays small no matter how
// many images get published.
async function uploadImageToCloudinary(base64DataUri) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary is not configured on this server yet.");
  }
  const timestamp = Math.round(Date.now() / 1000);
  const signature = crypto.createHash("sha1").update(`timestamp=${timestamp}${CLOUDINARY_API_SECRET}`).digest("hex");

  const body = new URLSearchParams();
  body.set("file", base64DataUri);
  body.set("api_key", CLOUDINARY_API_KEY);
  body.set("timestamp", String(timestamp));
  body.set("signature", signature);

  const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(`Cloudinary upload failed: ${uploadRes.status} ${errText}`);
  }
  const data = await uploadRes.json();
  return data.secure_url;
}
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "";
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || "http://127.0.0.1:3000/api/spotify/callback";
const SPOTIFY_SCOPES = "user-read-currently-playing user-read-private user-read-playback-state user-modify-playback-state";
const spotifyOAuthStates = new Map();
function cleanupSpotifyOAuthStates() {
  const now = Date.now();
  for (const [state, entry] of spotifyOAuthStates) {
    if (entry.expires < now) spotifyOAuthStates.delete(state);
  }
}

const SIGNUP_BADGE_AWARDS = {
  mara: ["dexterity"],
  own: ["dexterity"],
  progresstesting1: ["dexterity", "817x2"],
  "817x2": ["817x2"],
  testuser: ["817x2", "dexterity"]
};

const DEFAULT_SEED = {
  users: [
    {
      _id: "u1",
      username: "mara",
      name: "Mara Studios",
      password: hashPassword("demo1234"),
      avatar: "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?q=80&w=200&auto=format&fit=crop",
      joined: "2026-02-01",
      timezone: "UTC",
      following: [],
      followers: [],
      bio: "",
      spotify: "",
      badges: ["dexterity"]
    }
  ],
  posts: [
    {
      _id: "p1",
      author: "mara",
      title: "Slowing down the shipping cadence, on purpose",
      date: "2026-06-28",
      createdAt: "2026-06-28T10:00:00.000Z",
      cover: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=1200&auto=format&fit=crop",
      excerpt: "For a year I measured progress in commits. This month I started measuring it in questions I stopped asking too early.",
      content: "<p>For a year I measured progress in commits. This month I started measuring it in questions I stopped asking too early.</p><p>The habit crept in quietly. Every sprint became a race to close tickets, and every retro became a scoreboard. It worked, in the sense that the graphs went up and to the right. But somewhere in there the work stopped teaching me anything.</p><h2>What changed</h2><p>I started leaving one hour a week with nothing scheduled. Not a break, not admin time &mdash; just space to sit with a problem before reaching for the obvious fix.</p><blockquote>The fastest way to solve the wrong problem is still the wrong problem, just faster.</blockquote><p>Three weeks in, the backlog looks about the same. But two of the last four decisions I made were ones I would have gotten wrong under the old pace.</p>",
      likes: 12,
      likedBy: []
    },
    {
      _id: "p2",
      author: "mara",
      title: "A small kitchen table, rebuilt from a door",
      date: "2026-06-14",
      createdAt: "2026-06-14T10:00:00.000Z",
      cover: "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?q=80&w=1200&auto=format&fit=crop",
      excerpt: "The old door had six coats of paint on it. Underneath was oak nobody had seen since 1974.",
      content: "<p>The old door had six coats of paint on it. Underneath was oak nobody had seen since 1974.</p><p>Stripping it took longer than building the frame. That felt backwards until I remembered most restoration is like that &mdash; the removing is the real work, the assembling is just the reward for finishing it.</p><h2>The joints</h2><p>I used simple lap joints instead of anything fancier. Nobody will ever see them, and that's sort of the point of a kitchen table.</p><p>It wobbled for exactly one afternoon before I found the short leg. Now it's the steadiest thing in the house.</p>",
      likes: 27,
      likedBy: []
    },
    {
      _id: "p3",
      author: "mara",
      title: "Notes from a week of only handwritten drafts",
      date: "2026-05-30",
      createdAt: "2026-05-30T10:00:00.000Z",
      cover: "https://images.unsplash.com/photo-1455390582262-044cdead277a?q=80&w=1200&auto=format&fit=crop",
      excerpt: "No backspace key for seven days. It changed which sentences I was willing to start.",
      content: "<p>No backspace key for seven days. It changed which sentences I was willing to start.</p><p>On a screen, a bad sentence costs nothing &mdash; you delete it and move on. On paper, a bad sentence costs a scratched-out line staring back at you, so you think a little longer before committing to one.</p><p>I'm not going back to longhand permanently. But I'm keeping the pause.</p>",
      likes: 8,
      likedBy: []
    }
  ],
  comments: [],
  notifications: [
    { _id: "n1", type: "like", actor: "jonah_p", postId: "p2", postTitle: "A small kitchen table, rebuilt from a door", time: "2026-07-04T09:12:00.000Z", seen: false, recipient: "mara" },
    { _id: "n2", type: "reply", actor: "wren.codes", postId: "p1", postTitle: "Slowing down the shipping cadence, on purpose", time: "2026-07-03T21:40:00.000Z", body: "This is exactly the permission I needed to hear today.", seen: false, recipient: "mara" },
    { _id: "n3", type: "like", actor: "delia", postId: "p1", postTitle: "Slowing down the shipping cadence, on purpose", time: "2026-07-02T14:05:00.000Z", seen: false, recipient: "mara" },
    { _id: "n4", type: "follow", actor: "sam_writes", time: "2026-06-30T08:00:00.000Z", seen: true, recipient: "mara" }
  ]
};

function generateId(prefix) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== "string" || !stored) return false;
  if (stored.startsWith("scrypt:")) {
    const [, salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const hashBuffer = Buffer.from(hash, "hex");
    const candidateBuffer = crypto.scryptSync(String(password), salt, 64);
    if (hashBuffer.length !== candidateBuffer.length) return false;
    return crypto.timingSafeEqual(hashBuffer, candidateBuffer);
  }
  return stored === password;
}

function isLegacyPassword(stored) {
  return typeof stored === "string" && !stored.startsWith("scrypt:");
}

async function notifyBadgesAwarded(username, badgeIds) {
  if (!badgeIds.length) return;
  await db.collection("notifications").insertMany(badgeIds.map(badgeId => ({
    _id: generateId("n"),
    type: "badge",
    badgeId,
    recipient: username,
    time: new Date().toISOString(),
    seen: false
  })));
}

async function ensureUsernameBadges(user) {
  const awarded = SIGNUP_BADGE_AWARDS[user.username] || [];
  const currentBadges = Array.isArray(user.badges) ? user.badges : [];
  const missing = awarded.filter(b => !currentBadges.includes(b));
  if (!missing.length) return user;
  await db.collection("users").updateOne({ _id: user._id }, { $addToSet: { badges: { $each: missing } } });
  await notifyBadgesAwarded(user.username, missing);
  user.badges = [...currentBadges, ...missing];
  return user;
}

function toClient(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

function normalizeUser(doc) {
  const user = toClient(doc);
  return {
    ...user,
    timezone: user.timezone || DEFAULT_TIMEZONE,
    following: Array.isArray(user.following) ? user.following : [],
    followers: Array.isArray(user.followers) ? user.followers : [],
    badges: Array.isArray(user.badges) ? user.badges : [],
    bio: user.bio || "",
    spotify: user.spotify || "",
    locked: !!user.locked,
    banned: !!user.banned
  };
}

function publicUser(user) {
  const badges = Array.isArray(user.badges) ? user.badges.filter(b => b !== "creator") : [];
  let displayBadge = user.displayBadge || null;
  if (ALLOWED_CREATOR_USERNAMES.has(user.username)) {
    if (!badges.includes("creator")) badges.push("creator");
  } else if (displayBadge === "creator") {
    displayBadge = null;
  }
  const spotifyAccount = user.spotifyAccount && user.spotifyAccount.connected
    ? { connected: true, displayName: user.spotifyAccount.spotifyName || null, profileUrl: user.spotifyAccount.spotifyProfileUrl || null }
    : { connected: false, displayName: null, profileUrl: null };
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    avatar: user.avatar,
    joined: user.joined,
    timezone: user.timezone,
    bio: user.bio || "",
    spotify: user.spotify || "",
    spotifyAccount,
    badges,
    displayBadge,
    followers: user.followers || [],
    following: user.following || [],
    locked: !!user.locked,
    banned: !!user.banned
  };
}

// Post content is real HTML from the rich-text editor (bold, headings,
// Spotify/YouTube embeds, etc.) rather than escaped plain text, since the
// whole point is to preserve formatting - but nothing stops someone from
// calling POST /api/posts directly with a `content` field containing a
// <script> tag or an iframe pointing anywhere they want, which would then
// run for every single visitor who views that post. This sanitizes on
// both the write path (new posts) and the read path (defense in depth,
// so any already-stored malicious content also gets neutralized without
// needing a data migration).
//
// This is a pragmatic regex-based allowlist, not a full HTML parser like
// the `sanitize-html` npm package would give you - it covers the realistic
// attack surface for what this editor actually produces, but a real
// parser-based library is the more bulletproof choice if this app's
// user-generated content ever needs to withstand serious adversarial
// testing.
const SANITIZE_ALLOWED_TAGS = new Set(["p", "h2", "blockquote", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "img", "br", "div", "span", "iframe"]);
const SANITIZE_ALLOWED_IFRAME_HOSTS = [/^https:\/\/open\.spotify\.com\//i, /^https:\/\/www\.youtube-nocookie\.com\//i, /^https:\/\/www\.youtube\.com\//i];

function sanitizePostContent(html) {
  if (!html) return "";
  // Strip entire dangerous elements, including their content.
  let clean = html.replace(/<(script|style|object|embed|link|meta|form|base)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  clean = clean.replace(/<(script|style|object|embed|link|meta|form|base)\b[^>]*\/?>/gi, "");
  // Strip every on*="..." event handler attribute (onerror, onload, onclick, ...).
  clean = clean.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // Neutralize javascript:/data: URIs that could otherwise execute code via href/src.
  clean = clean.replace(/(href|src)\s*=\s*"(javascript|data):[^"]*"/gi, '$1="#"');
  clean = clean.replace(/(href|src)\s*=\s*'(javascript|data):[^']*'/gi, "$1='#'");
  // Drop any tag not on the allowlist (keeps its text content, strips the wrapping tag itself).
  clean = clean.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (match, tagName, attrs) => {
    const tag = tagName.toLowerCase();
    if (!SANITIZE_ALLOWED_TAGS.has(tag)) return "";
    if (tag === "iframe") {
      const srcMatch = attrs.match(/src\s*=\s*"([^"]*)"/i) || attrs.match(/src\s*=\s*'([^']*)'/i);
      const src = srcMatch ? srcMatch[1] : "";
      if (!SANITIZE_ALLOWED_IFRAME_HOSTS.some(re => re.test(src))) return "";
    }
    return match;
  });
  return clean;
}

function normalizePost(doc) {
  const post = toClient(doc);
  return {
    ...post,
    content: typeof post.content === "string" ? sanitizePostContent(post.content) : post.content,
    likes: typeof post.likes === "number" ? post.likes : 0,
    likedBy: Array.isArray(post.likedBy) ? post.likedBy : []
  };
}

function normalizeChatMessage(doc) {
  return toClient(doc);
}

const chatRooms = new Map();

function chatRoomClients(room) {
  let set = chatRooms.get(room);
  if (!set) {
    set = new Set();
    chatRooms.set(room, set);
  }
  return set;
}

function broadcastToRoom(room, payload) {
  const json = JSON.stringify(payload);
  for (const client of chatRoomClients(room)) {
    if (client.readyState === client.OPEN) client.send(json);
  }
}

function roomPresence(room) {
  return Array.from(chatRoomClients(room))
    .map(c => c.username)
    .filter(Boolean);
}

function dmRoomId(userA, userB) {
  return "dm:" + [userA, userB].sort().join(":");
}

function dmParticipants(room) {
  if (typeof room !== "string" || !room.startsWith("dm:")) return null;
  const parts = room.slice(3).split(":");
  return parts.length === 2 && parts[0] && parts[1] ? parts : null;
}

function canAccessRoom(room, username) {
  const participants = dmParticipants(room);
  if (!participants) return true;
  return participants.includes(username);
}

// Connection-based presence, same model Discord uses - each individual
// WebSocket connection tracks its own active/idle state (via a plain
// property on the ws object), not just a per-username flag. Someone with
// two tabs open - one focused, one backgrounded - correctly shows as
// "online" as long as ANY of their connections is in the foreground;
// "idle" only once every single one of their open tabs is backgrounded;
// "offline" once they have no connections left at all.
const usernameConnections = new Map(); // username -> Set of ws connections

function addUserConnection(username, ws) {
  if (!username) return;
  let set = usernameConnections.get(username);
  if (!set) { set = new Set(); usernameConnections.set(username, set); }
  set.add(ws);
}
function removeUserConnection(username, ws) {
  if (!username) return;
  const set = usernameConnections.get(username);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) usernameConnections.delete(username);
}
function getUserPresenceStatus(username) {
  const set = usernameConnections.get(username);
  if (!set || set.size === 0) return "offline";
  for (const ws of set) {
    if (ws.isActiveTab !== false) return "online";
  }
  return "idle";
}
function isUserOnline(username) {
  return getUserPresenceStatus(username) !== "offline";
}

// Fires on every connect/disconnect/tab-focus-change anywhere on the
// site (not just within one room) - sent only to clients in the
// "presence" room (the one non-chat pages open), carrying every
// currently-connected username's real status. Fully offline usernames are
// simply omitted, keeping the payload small.
function broadcastGlobalPresenceUpdate() {
  const statuses = {};
  for (const username of usernameConnections.keys()) {
    statuses[username] = getUserPresenceStatus(username);
  }
  broadcastToRoom("presence", { type: "global-presence", statuses });
}

let db;

async function connect() {
  const client = new MongoClient(mongoUri);
  await client.connect();
  db = client.db(dbName);
  console.log(`Connected to MongoDB database "${dbName}"`);
  await seedIfNeeded();
}

async function seedIfNeeded() {
  const users = db.collection("users");
  const posts = db.collection("posts");
  const comments = db.collection("comments");
  const notifications = db.collection("notifications");
  const messages = db.collection("messages");

  try {
    await users.createIndex({ username: 1 }, { unique: true });
    await posts.createIndex({ author: 1, createdAt: -1 });
    await comments.createIndex({ postId: 1, time: 1 });
    await notifications.createIndex({ recipient: 1, time: -1 });
    await messages.createIndex({ room: 1, time: 1 });
  } catch (e) {
    if (!e.message.includes("already exists")) {
      console.warn("Index creation warning:", e.message);
    }
  }

  const mara = await users.findOne({ username: "mara" });
  if (!mara) {
    await users.insertOne(DEFAULT_SEED.users[0]);
  } else {
    const repair = {};
    if (!mara.password) repair.password = hashPassword("demo1234");
    if (!Array.isArray(mara.badges) || !mara.badges.length) repair.badges = ["dexterity"];
    if (Object.keys(repair).length) {
      await users.updateOne({ username: "mara" }, { $set: repair });
    }
  }

  for (const awardedUsername of Object.keys(SIGNUP_BADGE_AWARDS)) {
    const existingUser = await users.findOne({ username: awardedUsername });
    if (existingUser) await ensureUsernameBadges(existingUser);
  }

  for (const seedPost of DEFAULT_SEED.posts) {
    const exists = await posts.findOne({ _id: seedPost._id });
    if (!exists) await posts.insertOne(seedPost);
  }

  if ((await comments.estimatedDocumentCount()) === 0 && DEFAULT_SEED.comments.length) {
    await comments.insertMany(DEFAULT_SEED.comments);
  }

  if ((await notifications.estimatedDocumentCount()) === 0) {
    await notifications.insertMany(DEFAULT_SEED.notifications);
  }
}

// Simple in-memory rate limiter - a sliding window of request timestamps
// per IP, kept per-route via a dedicated Map for each limiter instance.
// This is intentionally not distributed (no Redis) since the app runs as
// Minimal JWT sign/verify using Node's built-in crypto (HMAC-SHA256) -
// this is a well-defined, simple enough format that a small dependency-free
// implementation is entirely reasonable here, same spirit as the rest of
// this app's approach to avoiding unnecessary dependencies.
//
// IMPORTANT: set a real JWT_SECRET environment variable in production. If
// it's not set, this falls back to a random value generated at boot, which
// means every existing token becomes invalid (forcing everyone to log back
// in) on every server restart/redeploy.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.JWT_SECRET) {
  console.warn("[jwt] JWT_SECRET is not set - using a random secret for this run. Sessions will not survive a restart. Set JWT_SECRET in your environment for persistent logins.");
}
const JWT_EXPIRES_IN_SECONDS = 30 * 24 * 60 * 60; // 30 days

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64urlDecode(input) {
  input = input.replace(/-/g, "+").replace(/_/g, "/");
  while (input.length % 4) input += "=";
  return Buffer.from(input, "base64").toString();
}
function signJWT(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + JWT_EXPIRES_IN_SECONDS };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(fullPayload));
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${headerB64}.${payloadB64}`).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${headerB64}.${payloadB64}.${signature}`;
}
function verifyJWT(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signature] = parts;
  const expectedSignature = crypto.createHmac("sha256", JWT_SECRET).update(`${headerB64}.${payloadB64}`).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  try {
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;
  } catch (e) {
    return null;
  }
  try {
    const payload = JSON.parse(base64urlDecode(payloadB64));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// Requires a valid token and populates req.user = { username, id }. Use on
// any route where the acting identity must be verified rather than trusted
// from the request body.
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = verifyJWT(token);
  if (!payload || !payload.username) {
    return res.status(401).json({ error: "Please log in again." });
  }
  req.user = payload;
  next();
}

// Same as requireAuth, but never rejects the request - just populates
// req.user if a valid token happens to be present. Useful for routes that
// behave the same for everyone but want to know who's asking (none of the
// current routes need this yet, kept here for future use).
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = verifyJWT(token);
  req.user = payload || null;
  next();
}

// Simple in-memory rate limiter - a sliding window of request timestamps
// per IP, kept per-route via a dedicated Map for each limiter instance.
// This is intentionally not distributed (no Redis) since the app runs as
// a single Render instance - fine at this scale, and avoids adding a new
// dependency just for this.
function rateLimit({ windowMs, max, message }) {
  const hits = new Map(); // ip -> array of timestamps within the window

  // Periodic sweep so IPs that stop making requests don't sit in memory
  // forever - runs far less often than the window itself, just tidying up.
  setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of hits) {
      const fresh = timestamps.filter(t => now - t < windowMs);
      if (fresh.length === 0) hits.delete(ip);
      else hits.set(ip, fresh);
    }
  }, Math.max(windowMs, 60000)).unref();

  return (req, res, next) => {
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const timestamps = (hits.get(ip) || []).filter(t => now - t < windowMs);
    if (timestamps.length >= max) {
      return res.status(429).json({ error: message || "Too many requests. Please slow down and try again shortly." });
    }
    timestamps.push(now);
    hits.set(ip, timestamps);
    next();
  };
}

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many login attempts. Please wait a few minutes and try again."
});
const signupRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: "Too many accounts created from this connection recently. Please try again later."
});
const generalApiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  message: "Too many requests. Please slow down."
});
const uploadRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: "Too many image uploads recently. Please wait a bit and try again."
});
const linkPreviewRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: "Too many link previews requested recently. Please slow down."
});

function asyncHandler(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

async function isUsernameBanned(username) {
  if (!username) return false;
  const doc = await db.collection("users").findOne({ username: username.toLowerCase() });
  return !!(doc && doc.banned);
}

async function notifyMentionedUsers({ text, author, skipUsernames = [], context = {} }) {
  if (!text) return;
  const mentioned = Array.from(new Set((text.match(/@([a-zA-Z0-9_.]+)/g) || [])
    .map(m => m.slice(1).toLowerCase())))
    .filter(u => u !== author.toLowerCase() && !skipUsernames.includes(u));
  if (!mentioned.length) return;
  try {
    const mentionedUsers = await db.collection("users").find({ username: { $in: mentioned } }).toArray();
    for (const u of mentionedUsers) {
      await db.collection("notifications").insertOne({
        _id: generateId("n"),
        type: "mention",
        actor: author,
        recipient: u.username,
        body: text,
        time: new Date().toISOString(),
        seen: false,
        ...context
      });
    }
  } catch (e) {
    console.error("Mention notification failed:", e);
  }
}

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// Helmet-equivalent security headers, hand-rolled to avoid pulling in the
// actual helmet package for something this small - same spirit as the rest
// of this app's approach to dependencies.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff"); // stop browsers guessing a file's type differently than the server says
  res.setHeader("X-Frame-Options", "DENY"); // stop this site being embedded in an iframe on someone else's page (clickjacking)
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin"); // don't leak full URLs to third-party sites via the Referer header
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains"); // force HTTPS for a year once a browser's seen it once
  res.removeHeader("X-Powered-By"); // don't advertise "this is Express" to anyone probing the server
  next();
});
app.use(express.static(publicPath));
app.use("/api", generalApiRateLimit);

app.get("/api/users", asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.username) {
    filter.username = { $regex: `^${escapeRegex(req.query.username)}$`, $options: "i" };
  }
  const docs = await db.collection("users").find(filter).toArray();
  res.json(docs.map(normalizeUser).map(publicUser));
}));

app.get("/api/users/:id", asyncHandler(async (req, res) => {
  const doc = await db.collection("users").findOne({ _id: req.params.id });
  if (!doc) return res.status(404).json({ error: "User not found" });
  res.json(publicUser(normalizeUser(doc)));
}));

app.post("/api/users", signupRateLimit, asyncHandler(async (req, res) => {
  const { username, name, password, timezone } = req.body;
  if (!username || !name || !password) return res.status(400).json({ error: "username, name, and password are required" });
  const normalizedUsername = username.trim().toLowerCase();
  if (!normalizedUsername) return res.status(400).json({ error: "username, name, and password are required" });
  const existing = await db.collection("users").findOne({ username: { $regex: `^${escapeRegex(normalizedUsername)}$`, $options: "i" } });
  if (existing) return res.status(409).json({ error: "Username already taken" });
  const user = {
    _id: generateId("u"),
    username: normalizedUsername,
    name,
    password: hashPassword(password),
    avatar: null,
    joined: new Date().toISOString().slice(0, 10),
    timezone: timezone || DEFAULT_TIMEZONE,
    following: [],
    followers: [],
    bio: "",
    spotify: "",
    badges: SIGNUP_BADGE_AWARDS[normalizedUsername] || []
  };
  await db.collection("users").insertOne(user);
  await notifyBadgesAwarded(normalizedUsername, user.badges);
  const token = signJWT({ username: user.username, id: user._id });
  res.status(201).json({ ...publicUser(normalizeUser(user)), token });
}));

app.patch("/api/users/:id", requireAuth, asyncHandler(async (req, res) => {
  const users = db.collection("users");
  const doc = await users.findOne({ _id: req.params.id });
  if (!doc) return res.status(404).json({ error: "User not found" });
  if (req.user.id !== doc._id) return res.status(403).json({ error: "You can only edit your own profile." });
  const { name, timezone, avatar, bio, displayBadge, spotify } = req.body;
  const update = {};
  if (typeof name === "string") update.name = name;
  if (typeof timezone === "string") update.timezone = timezone;
  if (typeof avatar !== "undefined") update.avatar = avatar;
  if (typeof bio === "string") update.bio = bio;
  if (typeof spotify === "string") {
    const trimmedSpotify = spotify.trim();
    if (trimmedSpotify && (trimmedSpotify.length > 300 || !SPOTIFY_LINK_RE.test(trimmedSpotify))) {
      return res.status(400).json({ error: "That doesn't look like a valid Spotify link." });
    }
    update.spotify = trimmedSpotify;
  }
  if (typeof displayBadge !== "undefined") {
    if (displayBadge === null) {
      update.displayBadge = null;
    } else {
      const ownedBadges = Array.isArray(doc.badges) ? [...doc.badges] : [];
      if (ALLOWED_CREATOR_USERNAMES.has(doc.username) && !ownedBadges.includes("creator")) {
        ownedBadges.push("creator");
      }
      if (displayBadge === "dexterity" || !ownedBadges.includes(displayBadge)) {
        return res.status(400).json({ error: "You don't own that badge" });
      }
      update.displayBadge = displayBadge;
    }
  }
  if (Object.keys(update).length) {
    await users.updateOne({ _id: req.params.id }, { $set: update });
  }
  const updated = await users.findOne({ _id: req.params.id });
  res.json(publicUser(normalizeUser(updated)));
}));

app.delete("/api/users/:id", requireAuth, asyncHandler(async (req, res) => {
  const users = db.collection("users");
  const posts = db.collection("posts");
  const comments = db.collection("comments");
  const notifications = db.collection("notifications");

  const user = await users.findOne({ _id: req.params.id });
  if (user && req.user.id !== user._id) return res.status(403).json({ error: "You can only delete your own account." });
  if (!user) return res.status(404).json({ error: "User not found" });

  const username = user.username;

  await posts.deleteMany({ author: username });
  await comments.deleteMany({ author: username });

  await posts.updateMany(
    { likedBy: username },
    { 
      $pull: { likedBy: username },
      $inc: { likes: -1 }
    }
  );

  await notifications.deleteMany({ $or: [{ actor: username }, { recipient: username }] });

  await users.updateMany(
    { following: username },
    { $pull: { following: username } }
  );

  await users.updateMany(
    { followers: username },
    { $pull: { followers: username } }
  );

  await users.deleteOne({ _id: req.params.id });

  res.status(204).end();
}));

app.post("/api/users/:id/follow", requireAuth, asyncHandler(async (req, res) => {
  const users = db.collection("users");
  const target = await users.findOne({ _id: req.params.id });
  const { action } = req.body;
  const followerId = req.user.id;
  if (!target) return res.status(404).json({ error: "User not found" });
  const follower = await users.findOne({ _id: followerId });
  if (!follower) return res.status(404).json({ error: "Follower user not found" });
  if (target._id === follower._id) return res.status(400).json({ error: "Cannot follow yourself" });
  if (follower.banned) return res.status(403).json({ error: "This account has been banned." });

  const isUnfollow = action === "unfollow";
  const followerFollowing = Array.isArray(follower.following) ? follower.following : [];
  const targetFollowers = Array.isArray(target.followers) ? target.followers : [];

  if (!isUnfollow) {
    if (!followerFollowing.includes(target.username)) followerFollowing.push(target.username);
    if (!targetFollowers.includes(follower.username)) targetFollowers.push(follower.username);
    await db.collection("notifications").insertOne({
      _id: generateId("n"),
      type: "follow",
      actor: follower.username,
      recipient: target.username,
      time: new Date().toISOString(),
      seen: false
    });
  } else {
    const fi = followerFollowing.indexOf(target.username);
    if (fi !== -1) followerFollowing.splice(fi, 1);
    const ti = targetFollowers.indexOf(follower.username);
    if (ti !== -1) targetFollowers.splice(ti, 1);
  }

  await users.updateOne({ _id: follower._id }, { $set: { following: followerFollowing } });
  await users.updateOne({ _id: target._id }, { $set: { followers: targetFollowers } });

  res.json({ follower: follower.username, target: target.username, following: followerFollowing, followers: targetFollowers });
}));

app.post("/api/users/:id/unfollow", requireAuth, asyncHandler(async (req, res) => {
  const users = db.collection("users");
  const target = await users.findOne({ _id: req.params.id });
  const followerId = req.user.id;
  if (!target) return res.status(404).json({ error: "User not found" });
  const follower = await users.findOne({ _id: followerId });
  if (!follower) return res.status(404).json({ error: "Follower user not found" });
  if (target._id === follower._id) return res.status(400).json({ error: "Cannot unfollow yourself" });

  const followerFollowing = Array.isArray(follower.following) ? follower.following : [];
  const targetFollowers = Array.isArray(target.followers) ? target.followers : [];
  const fi = followerFollowing.indexOf(target.username);
  if (fi !== -1) followerFollowing.splice(fi, 1);
  const ti = targetFollowers.indexOf(follower.username);
  if (ti !== -1) targetFollowers.splice(ti, 1);

  await users.updateOne({ _id: follower._id }, { $set: { following: followerFollowing } });
  await users.updateOne({ _id: target._id }, { $set: { followers: targetFollowers } });

  res.json({ follower: follower.username, target: target.username });
}));

app.post("/api/users/:id/lock", requireAuth, asyncHandler(async (req, res) => {
  const { locked } = req.body || {};
  if (!ALLOWED_CREATOR_USERNAMES.has(req.user.username.toLowerCase())) {
    return res.status(403).json({ error: "Only admins can lock or unlock accounts." });
  }
  const users = db.collection("users");
  const target = await users.findOne({ _id: req.params.id });
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.username === req.user.username.toLowerCase()) {
    return res.status(400).json({ error: "You can't lock your own account." });
  }
  await users.updateOne({ _id: req.params.id }, { $set: { locked: !!locked } });
  const updated = await users.findOne({ _id: req.params.id });
  res.json(publicUser(normalizeUser(updated)));
}));

app.post("/api/users/:id/ban", requireAuth, asyncHandler(async (req, res) => {
  if (!ALLOWED_CREATOR_USERNAMES.has(req.user.username.toLowerCase())) {
    return res.status(403).json({ error: "Only admins can ban accounts." });
  }
  const users = db.collection("users");
  const target = await users.findOne({ _id: req.params.id });
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.username === req.user.username.toLowerCase()) {
    return res.status(400).json({ error: "You can't ban your own account." });
  }
  await users.updateOne({ _id: req.params.id }, { $set: { banned: true } });
  const updated = await users.findOne({ _id: req.params.id });
  res.json(publicUser(normalizeUser(updated)));
}));

app.post("/api/users/:id/unban", requireAuth, asyncHandler(async (req, res) => {
  if (!ALLOWED_CREATOR_USERNAMES.has(req.user.username.toLowerCase())) {
    return res.status(403).json({ error: "Only admins can unban accounts." });
  }
  const users = db.collection("users");
  const target = await users.findOne({ _id: req.params.id });
  if (!target) return res.status(404).json({ error: "User not found" });
  await users.updateOne({ _id: req.params.id }, { $set: { banned: false } });
  const updated = await users.findOne({ _id: req.params.id });
  res.json(publicUser(normalizeUser(updated)));
}));

app.get("/api/spotify/status", (req, res) => {
  res.json({ configured: !!(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET) });
});

app.get("/api/spotify/login", asyncHandler(async (req, res) => {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    return res.status(503).send("Spotify integration isn't configured on this server yet.");
  }
  const userId = req.query.userId;
  if (!userId) return res.status(400).send("Missing userId");
  const user = await db.collection("users").findOne({ _id: userId });
  if (!user) return res.status(404).send("User not found");

  cleanupSpotifyOAuthStates();
  const state = crypto.randomBytes(24).toString("hex");
  spotifyOAuthStates.set(state, { userId, expires: Date.now() + 10 * 60 * 1000 });

  const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", SPOTIFY_CLIENT_ID);
  authorizeUrl.searchParams.set("scope", SPOTIFY_SCOPES);
  authorizeUrl.searchParams.set("redirect_uri", SPOTIFY_REDIRECT_URI);
  authorizeUrl.searchParams.set("state", state);
  res.redirect(authorizeUrl.toString());
}));

app.get("/api/spotify/callback", asyncHandler(async (req, res) => {
  const redirectError = () => res.redirect("/profile.html?tab=settings&spotify=error");
  const { code, state, error } = req.query;
  if (error || !code || !state || !spotifyOAuthStates.has(state)) return redirectError();

  const pending = spotifyOAuthStates.get(state);
  spotifyOAuthStates.delete(state);
  if (pending.expires < Date.now()) return redirectError();

  try {
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: SPOTIFY_REDIRECT_URI })
    });
    if (!tokenRes.ok) return redirectError();
    const tokens = await tokenRes.json();

    let profile = null;
    try {
      const profileRes = await fetch("https://api.spotify.com/v1/me", {
        headers: { "Authorization": `Bearer ${tokens.access_token}` }
      });
      if (profileRes.ok) profile = await profileRes.json();
    } catch (e) {
      profile = null;
    }

    await db.collection("users").updateOne({ _id: pending.userId }, { $set: {
      spotifyAccount: {
        connected: true,
        spotifyId: profile ? profile.id : null,
        spotifyName: profile ? profile.display_name : null,
        spotifyProfileUrl: profile && profile.external_urls ? profile.external_urls.spotify : null,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        accessTokenExpires: Date.now() + (tokens.expires_in * 1000)
      }
    }});

    res.redirect("/profile.html?tab=settings&spotify=connected");
  } catch (e) {
    console.error("Spotify OAuth callback failed:", e);
    redirectError();
  }
}));

async function getValidSpotifyAccessToken(userDoc) {
  const acct = userDoc.spotifyAccount;
  if (!acct || !acct.refreshToken) return null;
  if (acct.accessToken && acct.accessTokenExpires && acct.accessTokenExpires > Date.now() + 5000) {
    return acct.accessToken;
  }
  try {
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: acct.refreshToken })
    });
    if (!tokenRes.ok) return null;
    const tokens = await tokenRes.json();
    const update = {
      "spotifyAccount.accessToken": tokens.access_token,
      "spotifyAccount.accessTokenExpires": Date.now() + (tokens.expires_in * 1000)
    };
    if (tokens.refresh_token) update["spotifyAccount.refreshToken"] = tokens.refresh_token;
    await db.collection("users").updateOne({ _id: userDoc._id }, { $set: update });
    return tokens.access_token;
  } catch (e) {
    return null;
  }
}

app.get("/api/users/:id/spotify/now-playing", asyncHandler(async (req, res) => {
  const userDoc = await db.collection("users").findOne({ _id: req.params.id });
  if (!userDoc) return res.status(404).json({ error: "User not found" });
  if (!userDoc.spotifyAccount || !userDoc.spotifyAccount.connected) {
    return res.json({ connected: false, playing: null });
  }
  const accessToken = await getValidSpotifyAccessToken(userDoc);
  if (!accessToken) return res.json({ connected: true, playing: null });

  try {
    const npRes = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    if (npRes.status !== 200) return res.json({ connected: true, playing: null });
    const data = await npRes.json().catch(() => null);
    if (!data || !data.item) return res.json({ connected: true, playing: null });
    const images = (data.item.album && data.item.album.images) || [];
    return res.json({
      connected: true,
      playing: {
        isPlaying: !!data.is_playing,
        trackName: data.item.name,
        artistNames: (data.item.artists || []).map(a => a.name).join(", "),
        albumArt: (images[1] && images[1].url) || (images[0] && images[0].url) || null,
        trackUrl: (data.item.external_urls && data.item.external_urls.spotify) || null,
        progressMs: typeof data.progress_ms === "number" ? data.progress_ms : null,
        durationMs: (data.item && typeof data.item.duration_ms === "number") ? data.item.duration_ms : null,
        fetchedAt: Date.now()
      }
    });
  } catch (e) {
    return res.json({ connected: true, playing: null });
  }
}));

app.post("/api/users/:id/spotify/disconnect", requireAuth, asyncHandler(async (req, res) => {
  const users = db.collection("users");
  const doc = await users.findOne({ _id: req.params.id });
  if (!doc) return res.status(404).json({ error: "User not found" });
  if (req.user.id !== doc._id) return res.status(403).json({ error: "You can only manage your own Spotify connection." });
  await users.updateOne({ _id: req.params.id }, { $unset: { spotifyAccount: "" } });
  const updated = await users.findOne({ _id: req.params.id });
  res.json(publicUser(normalizeUser(updated)));
}));

function publicListenSession(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    hostUsername: doc.hostUsername,
    hostUserId: doc.hostUserId,
    active: doc.active !== false,
    trackUri: doc.trackUri || null,
    trackName: doc.trackName || null,
    artistNames: doc.artistNames || null,
    albumArt: doc.albumArt || null,
    trackUrl: doc.trackUrl || null,
    durationMs: typeof doc.durationMs === "number" ? doc.durationMs : null,
    progressMs: typeof doc.progressMs === "number" ? doc.progressMs : null,
    isPlaying: !!doc.isPlaying,
    updatedAt: doc.updatedAt || null,
    participants: (doc.participants || []).map(p => p.username),
    createdAt: doc.createdAt
  };
}

async function refreshListenSessionFromHost(sessionDoc) {
  const hostDoc = await db.collection("users").findOne({ username: sessionDoc.hostUsername });
  if (!hostDoc || !hostDoc.spotifyAccount || !hostDoc.spotifyAccount.connected) return sessionDoc;
  const accessToken = await getValidSpotifyAccessToken(hostDoc);
  if (!accessToken) return sessionDoc;
  try {
    const npRes = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    let update;
    if (npRes.status === 200) {
      const data = await npRes.json().catch(() => null);
      if (data && data.item) {
        const images = (data.item.album && data.item.album.images) || [];
        update = {
          trackUri: data.item.uri,
          trackName: data.item.name,
          artistNames: (data.item.artists || []).map(a => a.name).join(", "),
          albumArt: (images[1] && images[1].url) || (images[0] && images[0].url) || null,
          trackUrl: (data.item.external_urls && data.item.external_urls.spotify) || null,
          durationMs: data.item.duration_ms,
          progressMs: data.progress_ms,
          isPlaying: !!data.is_playing,
          updatedAt: Date.now()
        };
      }
    }
    if (!update) update = { isPlaying: false, updatedAt: Date.now() };
    await db.collection("listenSessions").updateOne({ _id: sessionDoc._id }, { $set: update });
    return { ...sessionDoc, ...update };
  } catch (e) {
    return sessionDoc;
  }
}

app.post("/api/listen/sessions", requireAuth, asyncHandler(async (req, res) => {
  const hostId = req.user.id;
  const hostDoc = await db.collection("users").findOne({ _id: hostId });
  if (!hostDoc) return res.status(404).json({ error: "User not found" });
  if (hostDoc.banned) return res.status(403).json({ error: "This account has been banned." });
  if (!hostDoc.spotifyAccount || !hostDoc.spotifyAccount.connected) {
    return res.status(400).json({ error: "Connect Spotify before starting a listening session." });
  }
  await db.collection("listenSessions").updateMany(
    { hostUsername: hostDoc.username, active: true },
    { $set: { active: false } }
  );
  const session = {
    _id: crypto.randomUUID(),
    hostUsername: hostDoc.username,
    hostUserId: hostDoc._id,
    active: true,
    participants: [{ username: hostDoc.username, userId: hostDoc._id, joinedAt: Date.now() }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isPlaying: false
  };
  await db.collection("listenSessions").insertOne(session);
  const refreshed = await refreshListenSessionFromHost(session);
  res.json(publicListenSession(refreshed));
}));

app.get("/api/listen/sessions", asyncHandler(async (req, res) => {
  const docs = await db.collection("listenSessions").find({ active: true }).toArray();
  res.json(docs.map(publicListenSession));
}));

app.get("/api/listen/sessions/:id", asyncHandler(async (req, res) => {
  const doc = await db.collection("listenSessions").findOne({ _id: req.params.id, active: true });
  if (!doc) return res.status(404).json({ error: "Session not found or ended" });
  const refreshed = await refreshListenSessionFromHost(doc);
  res.json(publicListenSession(refreshed));
}));

app.post("/api/listen/sessions/:id/join", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const userDoc = await db.collection("users").findOne({ _id: userId });
  if (!userDoc) return res.status(404).json({ error: "User not found" });
  const doc = await db.collection("listenSessions").findOne({ _id: req.params.id, active: true });
  if (!doc) return res.status(404).json({ error: "Session not found or ended" });
  const already = (doc.participants || []).some(p => p.username === userDoc.username);
  if (!already) {
    await db.collection("listenSessions").updateOne(
      { _id: doc._id },
      { $push: { participants: { username: userDoc.username, userId: userDoc._id, joinedAt: Date.now() } } }
    );
  }
  const updated = await db.collection("listenSessions").findOne({ _id: doc._id });
  const refreshed = await refreshListenSessionFromHost(updated);
  res.json(publicListenSession(refreshed));
}));

app.post("/api/listen/sessions/:id/leave", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  await db.collection("listenSessions").updateOne(
    { _id: req.params.id },
    { $pull: { participants: { userId } } }
  );
  res.json({ left: true });
}));

app.post("/api/listen/sessions/:id/end", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const doc = await db.collection("listenSessions").findOne({ _id: req.params.id });
  if (!doc) return res.status(404).json({ error: "Session not found" });
  if (doc.hostUserId !== userId) return res.status(403).json({ error: "Only the host can end this session." });
  await db.collection("listenSessions").updateOne({ _id: req.params.id }, { $set: { active: false } });
  res.json({ ended: true });
}));

app.post("/api/listen/sessions/:id/sync-me", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const userDoc = await db.collection("users").findOne({ _id: userId });
  if (!userDoc || !userDoc.spotifyAccount || !userDoc.spotifyAccount.connected) {
    return res.status(400).json({ synced: false, reason: "Connect Spotify first." });
  }
  const doc = await db.collection("listenSessions").findOne({ _id: req.params.id, active: true });
  if (!doc) return res.status(404).json({ synced: false, reason: "Session not found or ended" });
  const refreshed = await refreshListenSessionFromHost(doc);
  if (!refreshed.trackUri || !refreshed.isPlaying) {
    return res.json({ synced: false, reason: "The host isn't playing anything right now." });
  }
  const accessToken = await getValidSpotifyAccessToken(userDoc);
  if (!accessToken) {
    return res.json({ synced: false, reason: "Couldn't refresh your Spotify session. Try reconnecting Spotify." });
  }
  const roundTripBufferMs = 1200;
  const targetPosition = Math.max(0, refreshed.progressMs + (Date.now() - refreshed.updatedAt) + roundTripBufferMs);
  try {
    const playRes = await fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [refreshed.trackUri], position_ms: targetPosition })
    });
    if (playRes.status === 204) return res.json({ synced: true });
    if (playRes.status === 404) return res.json({ synced: false, reason: "Open Spotify on a device first, then try again." });
    if (playRes.status === 403) return res.json({ synced: false, reason: "Syncing playback needs Spotify Premium." });
    return res.json({ synced: false, reason: "Spotify couldn't sync playback right now." });
  } catch (e) {
    return res.json({ synced: false, reason: "Spotify couldn't sync playback right now." });
  }
}));

// Fetches a URL server-side and pulls out OpenGraph metadata for a link
// preview card - has to happen server-side since the browser can't fetch
// arbitrary cross-origin pages itself (CORS). Deliberately dependency-free
// (plain regex over the raw HTML) rather than pulling in an HTML parser
// just for this. A short timeout keeps a slow/unresponsive external site
// from hanging the request.
app.get("/api/link-preview", linkPreviewRateLimit, asyncHandler(async (req, res) => {
  const url = (req.query.url || "").toString();
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "A valid http(s) URL is required." });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const pageRes = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ProgressLinkPreview/1.0)" }
    });
    const html = await pageRes.text();

    const metaValue = (attr, key) => {
      const re1 = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']*)["']`, "i");
      const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${key}["']`, "i");
      const match = html.match(re1) || html.match(re2);
      return match ? match[1] : null;
    };

    const titleTagMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = metaValue("property", "og:title") || (titleTagMatch ? titleTagMatch[1].trim() : null);
    const description = metaValue("property", "og:description") || metaValue("name", "description");
    const image = metaValue("property", "og:image");
    let siteName = metaValue("property", "og:site_name");
    if (!siteName) {
      try { siteName = new URL(url).hostname.replace(/^www\./, ""); } catch (e) { siteName = null; }
    }

    if (!title && !description && !image) return res.json({ preview: null });
    res.json({ preview: { title, description, image, siteName, url } });
  } catch (e) {
    res.json({ preview: null });
  } finally {
    clearTimeout(timeout);
  }
}));

app.post("/api/upload-image", uploadRateLimit, asyncHandler(async (req, res) => {
  const { image } = req.body || {};
  if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
    return res.status(400).json({ error: "A base64 image data URI is required." });
  }
  try {
    const url = await uploadImageToCloudinary(image);
    res.json({ url });
  } catch (e) {
    console.error("Image upload failed:", e);
    res.status(502).json({ error: "Could not upload image. Try again." });
  }
}));

app.get("/api/posts", asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.author) {
    filter.author = { $regex: `^${escapeRegex(req.query.author)}$`, $options: "i" };
  }
  // Excludes `content` at the query level - it's the one field that can
  // balloon a post's size (embedded base64 images from the editor), and the
  // feed/profile list views never render it, only title/excerpt/cover. This
  // is what was causing the earlier "posts stuck loading for 2 minutes" bug.
  const docs = await db.collection("posts").find(filter, { projection: { content: 0 } }).toArray();
  const posts = docs.map(normalizePost).sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());
  res.json(posts);
}));

app.get("/api/posts/:id", asyncHandler(async (req, res) => {
  const doc = await db.collection("posts").findOne({ _id: req.params.id });
  if (!doc) return res.status(404).json({ error: "Post not found" });
  res.json(normalizePost(doc));
}));

app.post("/api/posts", requireAuth, asyncHandler(async (req, res) => {
  const { title, cover, excerpt } = req.body;
  const author = req.user.username;
  const content = sanitizePostContent(req.body.content);
  if (!title || !content) return res.status(400).json({ error: "title and content are required" });
  if (await isUsernameBanned(author)) return res.status(403).json({ error: "This account has been banned." });
  const createdAt = new Date().toISOString();
  const post = {
    _id: generateId("p"),
    author,
    title,
    date: createdAt.slice(0, 10),
    createdAt,
    cover: cover || null,
    excerpt: excerpt || content.replace(/<[^>]+>/g, "").slice(0, 140),
    content,
    likes: 0,
    likedBy: []
  };
  await db.collection("posts").insertOne(post);
  await notifyMentionedUsers({
    text: content.replace(/<[^>]+>/g, " "),
    author,
    context: { postId: post._id, postTitle: post.title, via: "post" }
  });
  res.status(201).json(toClient(post));
}));

app.delete("/api/posts/:id", requireAuth, asyncHandler(async (req, res) => {
  const post = await db.collection("posts").findOne({ _id: req.params.id });
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (post.author !== req.user.username) return res.status(403).json({ error: "You can only delete your own entries." });
  await db.collection("posts").deleteOne({ _id: req.params.id });
  await db.collection("comments").deleteMany({ postId: req.params.id });
  await db.collection("notifications").deleteMany({ postId: req.params.id });
  res.status(204).end();
}));

app.get("/api/posts/:id/comments", asyncHandler(async (req, res) => {
  const docs = await db.collection("comments").find({ postId: req.params.id }).toArray();
  const comments = docs.map(toClient).sort((a, b) => new Date(a.time) - new Date(b.time));
  res.json(comments);
}));

app.post("/api/posts/:id/comments", requireAuth, asyncHandler(async (req, res) => {
  const post = await db.collection("posts").findOne({ _id: req.params.id });
  const { body, image } = req.body;
  const author = req.user.username;
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (!body && !image) return res.status(400).json({ error: "body or image are required" });
  if (await isUsernameBanned(author)) return res.status(403).json({ error: "This account has been banned." });
  const comment = {
    _id: generateId("c"),
    postId: post._id,
    author,
    body: body || "",
    image: image || null,
    time: new Date().toISOString()
  };
  await db.collection("comments").insertOne(comment);
  if (post.author !== author) {
    await db.collection("notifications").insertOne({
      _id: generateId("n"),
      type: "reply",
      actor: author,
      recipient: post.author,
      postId: post._id,
      postTitle: post.title,
      body: body || "",
      time: new Date().toISOString(),
      seen: false
    });
  }
  await notifyMentionedUsers({
    text: body || "",
    author,
    skipUsernames: [post.author.toLowerCase()],
    context: { postId: post._id, postTitle: post.title, via: "comment" }
  });
  res.status(201).json(toClient(comment));
}));

app.delete("/api/posts/:id/comments/:commentId", requireAuth, asyncHandler(async (req, res) => {
  const comment = await db.collection("comments").findOne({ _id: req.params.commentId, postId: req.params.id });
  if (!comment) return res.status(404).json({ error: "Comment not found" });
  const post = await db.collection("posts").findOne({ _id: req.params.id });
  const isCommentAuthor = comment.author === req.user.username;
  const isPostAuthor = post && post.author === req.user.username;
  if (!isCommentAuthor && !isPostAuthor) {
    return res.status(403).json({ error: "You can only delete your own replies." });
  }
  await db.collection("comments").deleteOne({ _id: req.params.commentId, postId: req.params.id });
  res.status(204).end();
}));

app.post("/api/posts/:id/like", requireAuth, asyncHandler(async (req, res) => {
  const posts = db.collection("posts");
  const post = await posts.findOne({ _id: req.params.id });
  const username = req.user.username;
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (await isUsernameBanned(username)) return res.status(403).json({ error: "This account has been banned." });
  const likedBy = Array.isArray(post.likedBy) ? post.likedBy : [];
  let likes = typeof post.likes === "number" ? post.likes : 0;
  const idx = likedBy.indexOf(username);
  if (idx === -1) {
    likedBy.push(username);
    likes += 1;
    if (post.author !== username) {
      await db.collection("notifications").insertOne({
        _id: generateId("n"),
        type: "like",
        actor: username,
        recipient: post.author,
        postId: post._id,
        postTitle: post.title,
        time: new Date().toISOString(),
        seen: false
      });
    }
  } else {
    likedBy.splice(idx, 1);
    likes = Math.max(0, likes - 1);
  }
  await posts.updateOne({ _id: post._id }, { $set: { likedBy, likes } });
  const updated = await posts.findOne({ _id: post._id });
  res.json(normalizePost(updated));
}));

app.get("/api/notifications", asyncHandler(async (req, res) => {
  const recipient = req.query.recipient;
  if (!recipient) return res.status(400).json({ error: "recipient is required" });
  const docs = await db.collection("notifications").find({
    $or: [{ recipient }, { recipient: { $exists: false } }, { recipient: null }, { recipient: "" }]
  }).toArray();
  const notifications = docs.map(toClient).sort((a, b) => new Date(b.time) - new Date(a.time));
  res.json(notifications);
}));

app.post("/api/notifications/mark-seen", asyncHandler(async (req, res) => {
  const recipient = req.body.recipient;
  if (!recipient) return res.status(400).json({ error: "recipient is required" });
  await db.collection("notifications").updateMany(
    { $or: [{ recipient }, { recipient: { $exists: false } }, { recipient: null }, { recipient: "" }] },
    { $set: { seen: true } }
  );
  res.json({ ok: true });
}));

async function createChatMessage({ room, author, body, image }) {
  const targetRoom = (room || DEFAULT_CHAT_ROOM).toString().slice(0, 200);
  const trimmed = (body || "").toString().trim();
  const safeImage = (typeof image === "string" && image.startsWith("https://")) ? image : null;
  if (!author || (!trimmed && !safeImage)) return null;
  if (!canAccessRoom(targetRoom, author)) return null;
  if (await isUsernameBanned(author)) return null;
  const message = {
    _id: generateId("m"),
    room: targetRoom,
    author,
    body: trimmed.slice(0, 2000),
    image: safeImage,
    time: new Date().toISOString()
  };
  await db.collection("messages").insertOne(message);
  const clientMessage = normalizeChatMessage(message);
  broadcastToRoom(targetRoom, { type: "message", message: clientMessage });

  try {
    const participants = dmParticipants(targetRoom);
    if (participants) {
      const recipient = participants.find(p => p !== author);
      if (recipient) {
        await db.collection("notifications").insertOne({
          _id: generateId("n"),
          type: "message",
          actor: author,
          recipient,
          room: targetRoom,
          body: message.body,
          time: new Date().toISOString(),
          seen: false
        });
        // Sent straight to the recipient's own connections (not a
        // room broadcast) - this is what lets their sidebar bump the
        // unread badge the instant a DM lands, even while they're
        // sitting in Global or a completely different conversation.
        const recipientConnections = usernameConnections.get(recipient);
        if (recipientConnections) {
          const payload = JSON.stringify({ type: "dm-notify", room: targetRoom, from: author });
          for (const conn of recipientConnections) {
            if (conn.readyState === conn.OPEN) conn.send(payload);
          }
        }
      }
    } else {
      await notifyMentionedUsers({ text: message.body, author, context: { room: targetRoom } });
    }
  } catch (e) {
    console.error("Chat notification failed:", e);
  }

  return clientMessage;
}

app.get("/api/chat/messages", requireAuth, asyncHandler(async (req, res) => {
  const room = (req.query.room || DEFAULT_CHAT_ROOM).toString().slice(0, 200);
  const viewer = req.user.username;
  if (dmParticipants(room) && !canAccessRoom(room, viewer)) {
    return res.status(403).json({ error: "Not a participant in this conversation" });
  }
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const docs = await db.collection("messages")
    .find({ room })
    .sort({ time: -1 })
    .limit(limit)
    .toArray();
  res.json(docs.map(normalizeChatMessage).reverse());
}));

app.get("/api/chat/conversations", requireAuth, asyncHandler(async (req, res) => {
  const username = req.user.username;
  const rooms = await db.collection("messages").distinct("room", { room: { $regex: "^dm:" } });
  const mine = rooms.filter(room => canAccessRoom(room, username));
  const conversations = await Promise.all(mine.map(async room => {
    const participants = dmParticipants(room);
    const withUsername = participants.find(p => p !== username) || participants[0];
    const lastDocs = await db.collection("messages").find({ room }).sort({ time: -1 }).limit(1).toArray();
    const readDoc = await db.collection("chatReadState").findOne({ _id: `${username}:${room}` });
    const lastReadAt = readDoc ? readDoc.lastReadAt : null;
    const unreadCount = await db.collection("messages").countDocuments({
      room,
      author: { $ne: username },
      ...(lastReadAt ? { time: { $gt: lastReadAt } } : {})
    });
    return {
      room,
      with: withUsername,
      lastMessage: lastDocs[0] ? normalizeChatMessage(lastDocs[0]) : null,
      unreadCount
    };
  }));
  conversations.sort((a, b) => {
    const at = a.lastMessage ? new Date(a.lastMessage.time).getTime() : 0;
    const bt = b.lastMessage ? new Date(b.lastMessage.time).getTime() : 0;
    return bt - at;
  });
  res.json(conversations);
}));

// Called when someone actually opens/views a conversation - records "now"
// as their last-read point for that room, so unread counts on future
// /api/chat/conversations calls only count messages after this moment.
app.post("/api/chat/mark-read", requireAuth, asyncHandler(async (req, res) => {
  const { room } = req.body || {};
  const username = req.user.username;
  if (!room) return res.status(400).json({ error: "room is required" });
  await db.collection("chatReadState").updateOne(
    { _id: `${username}:${room}` },
    { $set: { username, room, lastReadAt: new Date().toISOString() } },
    { upsert: true }
  );
  res.status(204).end();
}));

app.post("/api/chat/messages", requireAuth, asyncHandler(async (req, res) => {
  const message = await createChatMessage({ ...req.body, author: req.user.username });
  if (!message) return res.status(400).json({ error: "body or image are required" });
  res.status(201).json(message);
}));

app.post("/api/login", loginRateLimit, asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "username and password are required" });
  const user = await db.collection("users").findOne({ username: { $regex: `^${escapeRegex(username)}$`, $options: "i" } });
  if (!user || !verifyPassword(password, user.password)) return res.status(401).json({ error: "Invalid credentials" });
  if (isLegacyPassword(user.password)) {
    user.password = hashPassword(password);
    await db.collection("users").updateOne({ _id: user._id }, { $set: { password: user.password } });
  }
  await ensureUsernameBadges(user);
  const token = signJWT({ username: user.username, id: user._id });
  res.json({ ...publicUser(normalizeUser(user)), token });
}));

app.get("/api/online-users", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const statuses = {};
  for (const username of usernameConnections.keys()) {
    statuses[username] = getUserPresenceStatus(username);
  }
  res.json({ statuses });
});

app.get("/api/current-user", (req, res) => {
  res.status(200).json({});
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal server error" });
});

connect()
  .then(() => {
    const server = http.createServer(app);

    const wss = new WebSocketServer({ noServer: true });

    wss.on("connection", (ws, req, { room, username }) => {
      ws.room = room;
      ws.username = username;
      // Assume active/foreground on connect - corrected within moments by
      // the client's initial activity message if the tab actually started
      // out backgrounded.
      ws.isActiveTab = true;
      chatRoomClients(room).add(ws);
      addUserConnection(username, ws);
      broadcastToRoom(room, { type: "presence", room, users: roomPresence(room) });
      broadcastGlobalPresenceUpdate();

      ws.on("message", raw => {
        let data;
        try {
          data = JSON.parse(raw.toString());
        } catch (e) {
          return;
        }
        if (data.type === "send") {
          createChatMessage({ room: ws.room, author: ws.username, body: data.body, image: data.image }).catch(err => {
            console.error("Chat message failed:", err);
          });
        } else if (data.type === "typing") {
          broadcastToRoom(ws.room, { type: "typing", room: ws.room, username: ws.username });
        } else if (data.type === "activity") {
          // The client sends this whenever document.hidden changes on
          // THIS specific tab - active=true means focused, false means
          // backgrounded. Only touches this one connection's own state,
          // not the whole username, so a second focused tab elsewhere
          // still correctly keeps someone "online".
          ws.isActiveTab = !!data.active;
          broadcastGlobalPresenceUpdate();
        }
      });

      ws.on("close", () => {
        chatRoomClients(room).delete(ws);
        removeUserConnection(username, ws);
        broadcastToRoom(room, { type: "presence", room, users: roomPresence(room) });
        broadcastGlobalPresenceUpdate();
      });
    });

    server.on("upgrade", (req, socket, head) => {
      let url;
      try {
        url = new URL(req.url, "http://localhost");
      } catch (e) {
        socket.destroy();
        return;
      }
      if (url.pathname !== "/ws/chat") {
        socket.destroy();
        return;
      }
      const token = url.searchParams.get("token") || "";
      const payload = verifyJWT(token);
      const username = payload && payload.username ? payload.username : null;
      const room = (url.searchParams.get("room") || DEFAULT_CHAT_ROOM).trim().slice(0, 200) || DEFAULT_CHAT_ROOM;
      if (!username || !canAccessRoom(room, username)) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, ws => {
        wss.emit("connection", ws, req, { room, username });
      });
    });

    server.listen(port, () => {
      console.log(`Server running on port ${port}`);

      const selfUrl = process.env.RENDER_EXTERNAL_URL;
      if (selfUrl) {
        setInterval(async () => {
          try {
            await fetch(`${selfUrl}/api/posts`);
            console.log("[keep-alive] ping ok");
          } catch (e) { /* silent */ }
        }, 14 * 60 * 1000);
      }
    });
  })
  .catch(err => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });