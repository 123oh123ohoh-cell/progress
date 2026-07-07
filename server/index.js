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

// Matches a Spotify share link (open.spotify.com/<type>/<id>, optionally
// with an "intl-xx" locale prefix and/or a "?si=..." query string) or a
// "spotify:<type>:<id>" URI. Used to validate the `spotify` profile field
// before storing it - the embed <iframe src> the client renders is always
// rebuilt from the matched type/id, never the raw stored string, so this
// whitelist is what keeps arbitrary URLs from ever reaching that iframe.
const SPOTIFY_LINK_RE = /^(?:https:\/\/open\.spotify\.com\/(?:intl-[a-zA-Z-]+\/)?(?:track|album|playlist|artist|episode|show)\/[a-zA-Z0-9]+(?:\?[^\s]*)?|spotify:(?:track|album|playlist|artist|episode|show):[a-zA-Z0-9]+)$/i;

// Real Spotify account OAuth ("Connect with Spotify" -> live currently-playing widget).
// Client secret is server-side only, never sent to the browser.
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "";
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "";
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || "http://127.0.0.1:3000/api/spotify/callback";
// Minimal scopes: just enough to read currently-playing + a display name/avatar for the "connected as" label.
const SPOTIFY_SCOPES = "user-read-currently-playing user-read-private";
// Short-lived, single-use CSRF state tokens for the OAuth flow: state -> { userId, expires }.
// In-memory is fine for a single free-tier instance - if the process restarts mid-flow the user
// just clicks "Connect Spotify" again (the whole login->callback round trip normally takes seconds).
const spotifyOAuthStates = new Map();
function cleanupSpotifyOAuthStates() {
  const now = Date.now();
  for (const [state, entry] of spotifyOAuthStates) {
    if (entry.expires < now) spotifyOAuthStates.delete(state);
  }
}

// Badges awarded automatically based on username at signup time. This is
// computed server-side (never trusted from the request body) so a client
// can't grant itself arbitrary badges by adding a `badges` field to the
// signup request.
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
    { _id: "n2", type: "reply", actor: "wren.codes", postId: "p1", postTitle: "Slowing down the shipping cadence, on purpose", body: "This is exactly the permission I needed to hear today.", time: "2026-07-03T21:40:00.000Z", seen: false, recipient: "mara" },
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

// Passwords are stored as `scrypt:<salt>:<hash>`. `verifyPassword` also
// accepts legacy plaintext values (from before hashing was added) so
// existing accounts keep working; a successful login with a legacy
// password transparently upgrades it to a hashed one.
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
  // Legacy plaintext password from before hashing was introduced.
  return stored === password;
}

function isLegacyPassword(stored) {
  return typeof stored === "string" && !stored.startsWith("scrypt:");
}

// Drops a "badge" notification for each newly-awarded badge id, the same
// shape renderNotifDropdown() (app.js) already expects for n.type === "badge".
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

// Checks whether `user` is missing any badge it's entitled to via
// SIGNUP_BADGE_AWARDS (e.g. an account created before a badge existed, or
// before its username was added to the table). If so, grants the missing
// badge(s) and notifies about them, the same way a newly-earned badge is
// announced at signup. Mutates and returns `user.badges` so callers can
// respond with up-to-date data without a second DB read.
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
    spotify: user.spotify || ""
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
  // Only ever expose the public-safe bits of a connected Spotify account -
  // never accessToken/refreshToken/spotifyId, which stay server-side only.
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
  spotifyPresence: user.spotifyPresence || null,
  badges,
  displayBadge,
  followers: user.followers || [],
  following: user.following || []
};
}

function normalizePost(doc) {
  const post = toClient(doc);
  return {
    ...post,
    likes: typeof post.likes === "number" ? post.likes : 0,
    likedBy: Array.isArray(post.likedBy) ? post.likedBy : []
  };
}

function normalizeChatMessage(doc) {
  return toClient(doc);
}

// room -> Set<ws>. In-memory only (fine for a single instance) - message
// history itself lives in Mongo via createChatMessage/GET /api/chat/messages.
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

// DM rooms are `dm:<usernameA>:<usernameB>` with the two usernames sorted,
// so both participants always land on the same room id regardless of who
// started the conversation. `dmParticipants` is the inverse: given a room
// id, returns the two usernames it belongs to, or null if it's not a DM
// room at all (e.g. the "global" room).
function dmRoomId(userA, userB) {
  return "dm:" + [userA, userB].sort().join(":");
}

function dmParticipants(room) {
  if (typeof room !== "string" || !room.startsWith("dm:")) return null;
  const parts = room.slice(3).split(":");
  return parts.length === 2 && parts[0] && parts[1] ? parts : null;
}

// Same trust model as the rest of this API (no session tokens - a client
// just claims a username), but this at least stops someone from reading or
// joining a DM room without claiming to be one of its two participants.
function canAccessRoom(room, username) {
  const participants = dmParticipants(room);
  if (!participants) return true; // non-DM rooms (e.g. "global") stay open
  return participants.includes(username);
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

  // Create indexes for data integrity and query performance
  try {
    await users.createIndex({ username: 1 }, { unique: true });
    await posts.createIndex({ author: 1, createdAt: -1 });
    await comments.createIndex({ postId: 1, time: 1 });
    await notifications.createIndex({ recipient: 1, time: -1 });
    await messages.createIndex({ room: 1, time: 1 });
  } catch (e) {
    // Indexes may already exist, which is fine
    if (!e.message.includes("already exists")) {
      console.warn("Index creation warning:", e.message);
    }
  }

  const mara = await users.findOne({ username: "mara" });
  if (!mara) {
    await users.insertOne(DEFAULT_SEED.users[0]);
  } else {
    // Only repair the demo account if its password/badges are actually
    // missing or corrupted - don't clobber it unconditionally on every boot.
    const repair = {};
    if (!mara.password) repair.password = hashPassword("demo1234");
    if (!Array.isArray(mara.badges) || !mara.badges.length) repair.badges = ["dexterity"];
    if (Object.keys(repair).length) {
      await users.updateOne({ username: "mara" }, { $set: repair });
    }
  }

  // Retroactively grant username-based badges to any of these accounts that
  // already existed before the badge was introduced (accounts that don't
  // exist are left alone - they'll get the badge automatically on signup).
  // This also runs on every login (see /api/login), this boot-time pass
  // just catches accounts that never log in again.
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

function asyncHandler(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});
app.use(express.static(publicPath));

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

app.post("/api/users", asyncHandler(async (req, res) => {
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
    // Badges are decided by the server from the username, never trusted
    // from the request body - see SIGNUP_BADGE_AWARDS.
    badges: SIGNUP_BADGE_AWARDS[normalizedUsername] || []
  };
  await db.collection("users").insertOne(user);
  await notifyBadgesAwarded(normalizedUsername, user.badges);
  res.status(201).json(publicUser(normalizeUser(user)));
}));

app.patch("/api/users/:id", asyncHandler(async (req, res) => {
  const users = db.collection("users");
  const doc = await users.findOne({ _id: req.params.id });
  if (!doc) return res.status(404).json({ error: "User not found" });
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

app.delete("/api/users/:id", asyncHandler(async (req, res) => {
  const users = db.collection("users");
  const posts = db.collection("posts");
  const comments = db.collection("comments");
  const notifications = db.collection("notifications");

  const user = await users.findOne({ _id: req.params.id });
  if (!user) return res.status(404).json({ error: "User not found" });

  const username = user.username;

  // Delete all user's posts and comments on other posts
  await posts.deleteMany({ author: username });
  await comments.deleteMany({ author: username });

  // Remove user from all likedBy arrays on remaining posts
  await posts.updateMany(
    { likedBy: username },
    { 
      $pull: { likedBy: username },
      $inc: { likes: -1 }
    }
  );

  // Delete all notifications about or by this user
  await notifications.deleteMany({ $or: [{ actor: username }, { recipient: username }] });

  // Remove user from all other users' following lists
  await users.updateMany(
    { following: username },
    { $pull: { following: username } }
  );

  // Remove user from all other users' followers lists
  await users.updateMany(
    { followers: username },
    { $pull: { followers: username } }
  );

  // Delete the user account
  await users.deleteOne({ _id: req.params.id });

  res.status(204).end();
}));

app.post("/api/users/:id/follow", asyncHandler(async (req, res) => {
  const users = db.collection("users");
  const target = await users.findOne({ _id: req.params.id });
  const { followerId, action } = req.body;
  if (!target) return res.status(404).json({ error: "User not found" });
  const follower = await users.findOne({ _id: followerId });
  if (!follower) return res.status(404).json({ error: "Follower user not found" });
  if (target._id === follower._id) return res.status(400).json({ error: "Cannot follow yourself" });

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

app.post("/api/users/:id/unfollow", asyncHandler(async (req, res) => {
  const users = db.collection("users");
  const target = await users.findOne({ _id: req.params.id });
  const { followerId } = req.body;
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

// ---- Spotify account OAuth ("Connect with Spotify") ----

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
  spotifyOAuthStates.delete(state); // single-use
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

// Returns a valid access token for a user's connected Spotify account, refreshing it first if
// it's expired (or about to expire). Returns null if not connected or the refresh fails.
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

async function updateSpotifyPresence(userDoc) {
  const token = await getValidSpotifyAccessToken(userDoc);

  if (!token) {
    await db.collection("users").updateOne(
      { _id: userDoc._id },
      { $set: { spotifyPresence: null } }
    );
    return;
  }

  try {
    const res = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing",
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (res.status !== 200) {
      await db.collection("users").updateOne(
        { _id: userDoc._id },
        { $set: { spotifyPresence: null } }
      );
      return;
    }

    const data = await res.json();

    if (!data.item) {
      await db.collection("users").updateOne(
        { _id: userDoc._id },
        { $set: { spotifyPresence: null } }
      );
      return;
    }

    await db.collection("users").updateOne(
      { _id: userDoc._id },
      {
        $set: {
          spotifyPresence: {
            isPlaying: data.is_playing,
            trackName: data.item.name,
            artistNames: data.item.artists.map(a => a.name).join(", "),
            albumName: data.item.album.name,
            albumArt: data.item.album.images[0]?.url || null,
            trackUrl: data.item.external_urls.spotify,
            progress: data.progress_ms,
            duration: data.item.duration_ms,
            updatedAt: Date.now()
          }
        }
      }
    );
  } catch {
    await db.collection("users").updateOne(
      { _id: userDoc._id },
      { $set: { spotifyPresence: null } }
    );
  }
}

app.get("/api/users/:id/spotify/now-playing", asyncHandler(async (req, res) => {
  const user = await db.collection("users").findOne({
    _id: req.params.id
  });

  if (!user) {
    return res.status(404).json({
      error: "User not found"
    });
  }

  res.json({
    connected: !!user.spotifyAccount?.connected,
    playing: user.spotifyPresence || null
  });
}));

app.post("/api/users/:id/spotify/disconnect", asyncHandler(async (req, res) => {
  const users = db.collection("users");
  const doc = await users.findOne({ _id: req.params.id });
  if (!doc) return res.status(404).json({ error: "User not found" });
  await users.updateOne(
  { _id: req.params.id },
  {
    $unset: {
      spotifyAccount: "",
      spotifyPresence: ""
    }
  }
);
  const updated = await users.findOne({ _id: req.params.id });
  res.json(publicUser(normalizeUser(updated)));
}));

app.get("/api/posts", asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.author) {
    filter.author = { $regex: `^${escapeRegex(req.query.author)}$`, $options: "i" };
  }
  const docs = await db.collection("posts").find(filter).toArray();
  const posts = docs.map(normalizePost).sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());
  res.json(posts);
}));

app.get("/api/posts/:id", asyncHandler(async (req, res) => {
  const doc = await db.collection("posts").findOne({ _id: req.params.id });
  if (!doc) return res.status(404).json({ error: "Post not found" });
  res.json(normalizePost(doc));
}));

app.post("/api/posts", asyncHandler(async (req, res) => {
  const { author, title, content, cover, excerpt } = req.body;
  if (!author || !title || !content) return res.status(400).json({ error: "author, title and content are required" });
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
  res.status(201).json(toClient(post));
}));

app.delete("/api/posts/:id", asyncHandler(async (req, res) => {
  const result = await db.collection("posts").deleteOne({ _id: req.params.id });
  if (!result.deletedCount) return res.status(404).json({ error: "Post not found" });
  await db.collection("comments").deleteMany({ postId: req.params.id });
  await db.collection("notifications").deleteMany({ postId: req.params.id });
  res.status(204).end();
}));

app.get("/api/posts/:id/comments", asyncHandler(async (req, res) => {
  const docs = await db.collection("comments").find({ postId: req.params.id }).toArray();
  const comments = docs.map(toClient).sort((a, b) => new Date(a.time) - new Date(b.time));
  res.json(comments);
}));

app.post("/api/posts/:id/comments", asyncHandler(async (req, res) => {
  const post = await db.collection("posts").findOne({ _id: req.params.id });
  const { author, body, image } = req.body;
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (!author || (!body && !image)) return res.status(400).json({ error: "author and body or image are required" });
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
  res.status(201).json(toClient(comment));
}));

app.delete("/api/posts/:id/comments/:commentId", asyncHandler(async (req, res) => {
  const result = await db.collection("comments").deleteOne({ _id: req.params.commentId, postId: req.params.id });
  if (!result.deletedCount) return res.status(404).json({ error: "Comment not found" });
  res.status(204).end();
}));

app.post("/api/posts/:id/like", asyncHandler(async (req, res) => {
  const posts = db.collection("posts");
  const post = await posts.findOne({ _id: req.params.id });
  const { username } = req.body;
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (!username) return res.status(400).json({ error: "username is required" });
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

// ---- Realtime chat ----
// `room` is a free-form string. "global" is the one shared room the main
// chat UI uses; DM rooms are `dm:<usernameA>:<usernameB>` (see dmRoomId /
// dmParticipants / canAccessRoom above).

// Shared by both the REST fallback and the WebSocket "send" handler so a
// message is stored and broadcast identically no matter which path sent it.
async function createChatMessage({ room, author, body }) {
  const targetRoom = (room || DEFAULT_CHAT_ROOM).toString().slice(0, 200);
  const trimmed = (body || "").toString().trim();
  if (!author || !trimmed) return null;
  if (!canAccessRoom(targetRoom, author)) return null;
  const message = {
    _id: generateId("m"),
    room: targetRoom,
    author,
    body: trimmed.slice(0, 2000),
    time: new Date().toISOString()
  };
  await db.collection("messages").insertOne(message);
  const clientMessage = normalizeChatMessage(message);
  broadcastToRoom(targetRoom, { type: "message", message: clientMessage });
  return clientMessage;
}

app.get("/api/chat/messages", asyncHandler(async (req, res) => {
  const room = (req.query.room || DEFAULT_CHAT_ROOM).toString().slice(0, 200);
  const viewer = (req.query.username || "").toString();
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

// Lists every DM room `username` is a participant in, each with its most
// recent message, newest first - powers the DM sidebar on the chat page.
app.get("/api/chat/conversations", asyncHandler(async (req, res) => {
  const username = (req.query.username || "").toString();
  if (!username) return res.status(400).json({ error: "username is required" });
  const rooms = await db.collection("messages").distinct("room", { room: { $regex: "^dm:" } });
  const mine = rooms.filter(room => canAccessRoom(room, username));
  const conversations = await Promise.all(mine.map(async room => {
    const participants = dmParticipants(room);
    const withUsername = participants.find(p => p !== username) || participants[0];
    const lastDocs = await db.collection("messages").find({ room }).sort({ time: -1 }).limit(1).toArray();
    return {
      room,
      with: withUsername,
      lastMessage: lastDocs[0] ? normalizeChatMessage(lastDocs[0]) : null
    };
  }));
  conversations.sort((a, b) => {
    const at = a.lastMessage ? new Date(a.lastMessage.time).getTime() : 0;
    const bt = b.lastMessage ? new Date(b.lastMessage.time).getTime() : 0;
    return bt - at;
  });
  res.json(conversations);
}));

// REST fallback for sending a message when a client's WebSocket connection
// isn't available - still broadcasts to any WS clients in the room via
// createChatMessage(), so it never creates a message only the sender sees.
app.post("/api/chat/messages", asyncHandler(async (req, res) => {
  const message = await createChatMessage(req.body);
  if (!message) return res.status(400).json({ error: "author and body are required" });
  res.status(201).json(message);
}));

app.post("/api/login", asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "username and password are required" });
  const user = await db.collection("users").findOne({ username: { $regex: `^${escapeRegex(username)}$`, $options: "i" } });
  if (!user || !verifyPassword(password, user.password)) return res.status(401).json({ error: "Invalid credentials" });
  if (isLegacyPassword(user.password)) {
    // Transparently upgrade legacy plaintext passwords to a hashed one.
    user.password = hashPassword(password);
    await db.collection("users").updateOne({ _id: user._id }, { $set: { password: user.password } });
  }
  await ensureUsernameBadges(user);
  res.json(publicUser(normalizeUser(user)));
}));

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

    // ---- Chat WebSocket upgrade ----
    // Path: /ws/chat?room=<room>&username=<username>
    // Trusts the `username` query param the same way the REST routes trust
    // `author`/`username` fields in the body - there's no session/token auth
    // anywhere else in this API yet, so this matches the existing model
    // rather than introducing a new one just for chat.
    const wss = new WebSocketServer({ noServer: true });

    wss.on("connection", (ws, req, { room, username }) => {
      ws.room = room;
      ws.username = username;
      chatRoomClients(room).add(ws);
      broadcastToRoom(room, { type: "presence", room, users: roomPresence(room) });

      ws.on("message", raw => {
        let data;
        try {
          data = JSON.parse(raw.toString());
        } catch (e) {
          return;
        }
        if (data.type === "send") {
          createChatMessage({ room: ws.room, author: ws.username, body: data.body }).catch(err => {
            console.error("Chat message failed:", err);
          });
        } else if (data.type === "typing") {
          broadcastToRoom(ws.room, { type: "typing", room: ws.room, username: ws.username });
        }
      });

      ws.on("close", () => {
        chatRoomClients(room).delete(ws);
        broadcastToRoom(room, { type: "presence", room, users: roomPresence(room) });
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
      const username = (url.searchParams.get("username") || "").trim();
      const room = (url.searchParams.get("room") || DEFAULT_CHAT_ROOM).trim().slice(0, 200) || DEFAULT_CHAT_ROOM;
      if (!username || !canAccessRoom(room, username)) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, ws => {
        wss.emit("connection", ws, req, { room, username });
      });
    });
// Refresh Spotify "currently playing" for connected users every 15 seconds.
setInterval(async () => {
  try {
    const users = await db.collection("users")
      .find({ "spotifyAccount.connected": true })
      .toArray();

    for (const user of users) {
      await updateSpotifyPresence(user);
    }
  } catch (err) {
    console.error("Spotify presence update failed:", err);
  }
}, 15000);
    server.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch(err => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });