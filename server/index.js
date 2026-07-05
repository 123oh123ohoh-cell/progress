const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const port = process.env.PORT || 3000;
const publicPath = path.join(__dirname, "..");
const dbPath = path.join(__dirname, "../db.json");

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static(publicPath));

function normalizeDb(db) {
  db.users = (db.users || []).map(u => ({
    ...u,
    followers: u.followers || [],
    following: u.following || [],
    avatar: typeof u.avatar === "undefined" ? null : u.avatar,
    bio: typeof u.bio === "string" ? u.bio : ""
  }));
  db.posts = db.posts || [];
  db.comments = db.comments || [];
  db.notifications = db.notifications || [];
  return db;
}

function loadDb() {
  try {
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify(normalizeDb({ users: [], posts: [], comments: [], notifications: [] }), null, 2));
    }
    const raw = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    return normalizeDb(raw);
  } catch (err) {
    console.error("Failed to load db.json", err);
    return normalizeDb({ users: [], posts: [], comments: [], notifications: [] });
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
