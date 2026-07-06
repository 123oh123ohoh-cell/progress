const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const port = process.env.PORT || 3000;
const publicPath = path.join(__dirname, "..");
const dbPath = path.join(__dirname, "../db.json");

const DEFAULT_SEED = {
  users: [
    {
      id: "u1",
      username: "mara",
      name: "Mara Studios",
      password: "demo1234",
      avatar: "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?q=80&w=200&auto=format&fit=crop",
      joined: "2026-02-01",
      timezone: "UTC",
      following: [],
      followers: [],
      bio: ""
    }
  ],
  posts: [
    {
      id: "p1",
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
      id: "p2",
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
      id: "p3",
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
    { id: "n1", type: "like", actor: "jonah_p", postId: "p2", postTitle: "A small kitchen table, rebuilt from a door", time: "2026-07-04T09:12:00.000Z", seen: false, recipient: "mara" },
    { id: "n2", type: "reply", actor: "wren.codes", postId: "p1", postTitle: "Slowing down the shipping cadence, on purpose", body: "This is exactly the permission I needed to hear today.", time: "2026-07-03T21:40:00.000Z", seen: false, recipient: "mara" },
    { id: "n3", type: "like", actor: "delia", postId: "p1", postTitle: "Slowing down the shipping cadence, on purpose", time: "2026-07-02T14:05:00.000Z", seen: false, recipient: "mara" },
    { id: "n4", type: "follow", actor: "sam_writes", time: "2026-06-30T08:00:00.000Z", seen: true, recipient: "mara" }
  ]
};

function normalizeDb(raw) {
  const db = {
    users: [],
    posts: [],
    comments: [],
    notifications: [],
    ...raw
  };

  db.users = (db.users || []).map(user => ({
    id: user.id || `u${Date.now()}`,
    username: user.username || "guest",
    name: user.name || user.username || "Guest",
    password: user.password || "demo1234",
    avatar: user.avatar || null,
    joined: user.joined || new Date().toISOString().slice(0, 10),
    timezone: user.timezone || "UTC",
    following: Array.isArray(user.following) ? user.following : [],
    followers: Array.isArray(user.followers) ? user.followers : [],
    bio: user.bio || ""
  }));

  db.posts = (db.posts || []).map(post => ({
    id: post.id || `p${Date.now()}`,
    author: post.author || "mara",
    title: post.title || "Untitled entry",
    date: post.date || new Date().toISOString().slice(0, 10),
    createdAt: post.createdAt || new Date().toISOString(),
    cover: post.cover || null,
    excerpt: post.excerpt || "",
    content: post.content || "",
    likes: typeof post.likes === "number" ? post.likes : 0,
    likedBy: Array.isArray(post.likedBy) ? post.likedBy : []
  }));

  db.comments = Array.isArray(db.comments)
    ? db.comments.map(comment => ({
        id: comment.id || `c${Date.now()}`,
        postId: comment.postId || "",
        author: comment.author || "",
        body: comment.body || "",
        image: comment.image || null,
        time: comment.time || new Date().toISOString()
      }))
    : [];

  db.notifications = Array.isArray(db.notifications)
    ? db.notifications.map(notification => ({
        id: notification.id || `n${Date.now()}`,
        type: notification.type || "info",
        actor: notification.actor || "",
        recipient: notification.recipient || "",
        postId: notification.postId || null,
        postTitle: notification.postTitle || "",
        body: notification.body || "",
        time: notification.time || new Date().toISOString(),
        seen: Boolean(notification.seen)
      }))
    : [];

  return db;
}

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static(publicPath));

function loadDb() {
  try {
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify(DEFAULT_SEED, null, 2));
    }
    const raw = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    const normalized = normalizeDb(raw);
    let updated = false;

    if (!normalized.users.length) {
      normalized.users = DEFAULT_SEED.users;
      updated = true;
    } else if (!normalized.users.some(u => u.username.toLowerCase() === "mara")) {
      normalized.users.unshift(DEFAULT_SEED.users[0]);
      updated = true;
    }

    if (!normalized.posts.length) {
      normalized.posts = DEFAULT_SEED.posts;
      updated = true;
    } else {
      const missing = DEFAULT_SEED.posts.filter(p => !normalized.posts.some(existing => existing.id === p.id));
      if (missing.length) {
        normalized.posts = [...missing, ...normalized.posts];
        updated = true;
      }
    }

    if (!normalized.comments.length) {
      normalized.comments = DEFAULT_SEED.comments;
      updated = true;
    }

    if (!normalized.notifications.length) {
      normalized.notifications = DEFAULT_SEED.notifications;
      updated = true;
    }

    if (updated) {
      saveDb(normalized);
    }

    return normalized;
  } catch (err) {
    console.error("Failed to load db.json", err);
    saveDb(DEFAULT_SEED);
    return JSON.parse(JSON.stringify(DEFAULT_SEED));
  }
}

function saveDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(normalizeDb(db), null, 2));
}

app.get("/api/users", (req, res) => {
  const db = loadDb();
  let users = db.users || [];
  if (req.query.username) {
    users = users.filter(u => u.username.toLowerCase() === req.query.username.toLowerCase());
  }
  res.json(users.map(u => ({ id: u.id, username: u.username, name: u.name, avatar: u.avatar, joined: u.joined, timezone: u.timezone, bio: u.bio || "", followers: u.followers || [], following: u.following || [] })));
});

app.get("/api/users/:id", (req, res) => {
  const db = loadDb();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ id: user.id, username: user.username, name: user.name, avatar: user.avatar, bio: user.bio || "", followers: user.followers || [], following: user.following || [], joined: user.joined, timezone: user.timezone });
});

app.post("/api/users", (req, res) => {
  const db = loadDb();
  const { username, name, password, timezone } = req.body;
  if (!username || !name || !password) return res.status(400).json({ error: "username, name, and password are required" });
  if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: "Username already taken" });
  }
  const id = "u" + Date.now();
  const user = { id, username, name, password, avatar: null, joined: new Date().toISOString().slice(0, 10), timezone: timezone || "UTC", following: [], followers: [] };
  db.users.push(user);
  saveDb(db);
  res.status(201).json(user);
});

app.patch("/api/users/:id", (req, res) => {
  const db = loadDb();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const { name, timezone, avatar, bio } = req.body;
  if (typeof name === "string") user.name = name;
  if (typeof timezone === "string") user.timezone = timezone;
  if (typeof avatar !== "undefined") user.avatar = avatar;
  if (typeof bio === "string") user.bio = bio;
  saveDb(db);
  res.json({ id: user.id, username: user.username, name: user.name, avatar: user.avatar, bio: user.bio || "", timezone: user.timezone, followers: user.followers || [], following: user.following || [], joined: user.joined });
});

app.post("/api/users/:id/follow", (req, res) => {
  const db = loadDb();
  const target = db.users.find(u => u.id === req.params.id);
  const { followerId, action } = req.body;
  if (!target) return res.status(404).json({ error: "User not found" });
  const follower = db.users.find(u => u.id === followerId);
  if (!follower) return res.status(404).json({ error: "Follower user not found" });
  if (target.id === follower.id) return res.status(400).json({ error: "Cannot follow yourself" });

  const isUnfollow = action === "unfollow";
  follower.following = follower.following || [];
  target.followers = target.followers || [];

  if (!isUnfollow) {
    if (!follower.following.includes(target.username)) {
      follower.following.push(target.username);
    }
    if (!target.followers.includes(follower.username)) {
      target.followers.push(follower.username);
    }
    db.notifications.unshift({
      id: "n" + Date.now(),
      type: "follow",
      actor: follower.username,
      recipient: target.username,
      time: new Date().toISOString(),
      seen: false
    });
  } else {
    follower.following = follower.following.filter(name => name !== target.username);
    target.followers = target.followers.filter(name => name !== follower.username);
  }

  saveDb(db);
  res.json({ follower: follower.username, target: target.username, following: follower.following, followers: target.followers });
});

app.post("/api/users/:id/unfollow", (req, res) => {
  const db = loadDb();
  const target = db.users.find(u => u.id === req.params.id);
  const { followerId } = req.body;
  if (!target) return res.status(404).json({ error: "User not found" });
  const follower = db.users.find(u => u.id === followerId);
  if (!follower) return res.status(404).json({ error: "Follower user not found" });
  if (target.id === follower.id) return res.status(400).json({ error: "Cannot unfollow yourself" });
  const followIndex = follower.following.indexOf(target.username);
  if (followIndex !== -1) {
    follower.following.splice(followIndex, 1);
  }
  const followerIndex = target.followers.indexOf(follower.username);
  if (followerIndex !== -1) {
    target.followers.splice(followerIndex, 1);
  }
  saveDb(db);
  res.json({ follower: follower.username, target: target.username });
});

app.get("/api/posts", (req, res) => {
  const db = loadDb();
  let posts = (db.posts || []).map(p => ({
    ...p,
    likes: typeof p.likes === "number" ? p.likes : 0,
    likedBy: Array.isArray(p.likedBy) ? p.likedBy : []
  }));
  if (req.query.author) {
    posts = posts.filter(p => p.author.toLowerCase() === req.query.author.toLowerCase());
  }
  posts.sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());
  res.json(posts);
});

app.get("/api/posts/:id", (req, res) => {
  const db = loadDb();
  const post = (db.posts || []).find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: "Post not found" });
  res.json(post);
});

app.post("/api/posts", (req, res) => {
  const db = loadDb();
  const { author, title, content, cover, excerpt } = req.body;
  if (!author || !title || !content) return res.status(400).json({ error: "author, title and content are required" });
  const id = "p" + Date.now();
  const createdAt = new Date().toISOString();
  const post = {
    id,
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
  db.posts.unshift(post);
  saveDb(db);
  res.status(201).json(post);
});

app.delete("/api/posts/:id", (req, res) => {
  const db = loadDb();
  const index = (db.posts || []).findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Post not found" });
  db.posts.splice(index, 1);
  db.comments = (db.comments || []).filter(c => c.postId !== req.params.id);
  db.notifications = (db.notifications || []).filter(n => n.postId !== req.params.id);
  saveDb(db);
  res.status(204).end();
});

app.get("/api/posts/:id/comments", (req, res) => {
  const db = loadDb();
  const comments = (db.comments || []).filter(c => c.postId === req.params.id).sort((a, b) => new Date(a.time) - new Date(b.time));
  res.json(comments);
});

app.post("/api/posts/:id/comments", (req, res) => {
  const db = loadDb();
  const post = (db.posts || []).find(p => p.id === req.params.id);
  const { author, body, image } = req.body;
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (!author || (!body && !image)) return res.status(400).json({ error: "author and body or image are required" });
  const comment = {
    id: "c" + Date.now(),
    postId: post.id,
    author,
    body: body || "",
    image: image || null,
    time: new Date().toISOString()
  };
  db.comments = db.comments || [];
  db.comments.push(comment);
  if (post.author !== author) {
    db.notifications = db.notifications || [];
    db.notifications.unshift({
      id: "n" + Date.now(),
      type: "reply",
      actor: author,
      recipient: post.author,
      postId: post.id,
      postTitle: post.title,
      body: body || "",
      time: new Date().toISOString(),
      seen: false
    });
  }
  saveDb(db);
  res.status(201).json(comment);
});

app.delete("/api/posts/:id/comments/:commentId", (req, res) => {
  const db = loadDb();
  const index = (db.comments || []).findIndex(c => c.id === req.params.commentId && c.postId === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Comment not found" });
  db.comments.splice(index, 1);
  saveDb(db);
  res.status(204).end();
});

app.post("/api/posts/:id/like", (req, res) => {
  const db = loadDb();
  const post = (db.posts || []).find(p => p.id === req.params.id);
  const { username } = req.body;
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (!username) return res.status(400).json({ error: "username is required" });
  const idx = post.likedBy.indexOf(username);
  if (idx === -1) {
    post.likedBy.push(username);
    post.likes += 1;
    if (post.author !== username) {
      db.notifications = db.notifications || [];
      db.notifications.unshift({
        id: "n" + Date.now(),
        type: "like",
        actor: username,
        recipient: post.author,
        postId: post.id,
        postTitle: post.title,
        time: new Date().toISOString(),
        seen: false
      });
    }
  } else {
    post.likedBy.splice(idx, 1);
    post.likes = Math.max(0, post.likes - 1);
  }
  saveDb(db);
  res.json(post);
});

app.get("/api/notifications", (req, res) => {
  const db = loadDb();
  const recipient = req.query.recipient;
  if (!recipient) return res.status(400).json({ error: "recipient is required" });
  const notifications = (db.notifications || []).filter(n => !n.recipient || n.recipient === recipient).sort((a, b) => new Date(b.time) - new Date(a.time));
  res.json(notifications);
});

app.post("/api/notifications/mark-seen", (req, res) => {
  const db = loadDb();
  const recipient = req.body.recipient;
  if (!recipient) return res.status(400).json({ error: "recipient is required" });
  db.notifications = (db.notifications || []).map(n => {
    if (!n.recipient || n.recipient === recipient) n.seen = true;
    return n;
  });
  saveDb(db);
  res.json({ ok: true });
});

app.post("/api/login", (req, res) => {
  const db = loadDb();
  const { username, password } = req.body;
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user || user.password !== password) return res.status(401).json({ error: "Invalid credentials" });
  res.json({ id: user.id, username: user.username, name: user.name, avatar: user.avatar, timezone: user.timezone, joined: user.joined });
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
