/* ============================================================
   PROGRESS — data layer
   A tiny mock "backend" so the demo works without a server.
   Everything lives in localStorage on the visitor's own machine.
   ============================================================ */

const DB_KEY = "progress:db:v1";
const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const BACKEND_RENDER_URL = "https://progress-351h.onrender.com";
const BACKEND_LOCAL_URL = "http://127.0.0.1:3000";
const API_ENABLED = true;
const API_BASE = (() => {
  if (typeof window === "undefined") return BACKEND_RENDER_URL;
  if (window.PROGRESS_API_BASE) return window.PROGRESS_API_BASE;
  if (window.location.protocol === "file:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return BACKEND_LOCAL_URL;
  }
  return BACKEND_RENDER_URL;
})();

async function apiFetch(path, options = {}) {
  try {
    let url = path;
    if (path.startsWith("/api/")) {
      url = API_BASE + path;
    } else if (!path.startsWith("http://") && !path.startsWith("https://")) {
      url = API_BASE + "/api/" + path.replace(/^\/+/, "");
    }
    const res = await fetch(url, options);
    if (!res.ok) return null;
    if (res.status === 204) return {};
    return await res.json();
  } catch (e) {
    return null;
  }
}

const SEED = {
  currentUser: null, // null = logged out
  users: [
    { id: "u1", username: "mara", name: "Mara Studios", password: "demo1234", avatar: "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?q=80&w=200&auto=format&fit=crop", joined: "2026-02-01", timezone: DEFAULT_TIMEZONE, following: [], followers: [], bio: "" }
  ],
  posts: [
    {
      id: "p1",
      author: "mara",
      title: "Slowing down the shipping cadence, on purpose",
      date: "2026-06-28",
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
      cover: "https://images.unsplash.com/photo-1455390582262-044cdead277a?q=80&w=1200&auto=format&fit=crop",
      excerpt: "No backspace key for seven days. It changed which sentences I was willing to start.",
      content: "<p>No backspace key for seven days. It changed which sentences I was willing to start.</p><p>On a screen, a bad sentence costs nothing &mdash; you delete it and move on. On paper, a bad sentence costs a scratched-out line staring back at you, so you think a little longer before committing to one.</p><p>I'm not going back to longhand permanently. But I'm keeping the pause.</p>",
      likes: 8,
      likedBy: []
    }
  ],
  comments: [],
  notifications: [
    { id: "n1", type: "like", actor: "jonah_p", postId: "p2", postTitle: "A small kitchen table, rebuilt from a door", time: "2026-07-04T09:12:00", seen: false },
    { id: "n2", type: "reply", actor: "wren.codes", postId: "p1", postTitle: "Slowing down the shipping cadence, on purpose", body: "This is exactly the permission I needed to hear today.", time: "2026-07-03T21:40:00", seen: false },
    { id: "n3", type: "like", actor: "delia", postId: "p1", postTitle: "Slowing down the shipping cadence, on purpose", time: "2026-07-02T14:05:00", seen: false },
    { id: "n4", type: "follow", actor: "sam_writes", time: "2026-06-30T08:00:00", seen: true }
  ]
};

function loadDB() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    localStorage.setItem(DB_KEY, JSON.stringify(SEED));
    return JSON.parse(JSON.stringify(SEED));
  }
  try {
    const parsed = JSON.parse(raw);
    // Normalize old saved DB shapes so missing arrays don't break the app.
    parsed.users = (parsed.users || []).map(u => ({
      ...u,
      timezone: u.timezone || DEFAULT_TIMEZONE,
      joined: u.joined || new Date().toISOString().slice(0, 10),
      following: u.following || [],
      followers: u.followers || [],
      bio: u.bio || ""
    }));
    parsed.posts = parsed.posts || [];
    parsed.notifications = parsed.notifications || [];
    parsed.comments = parsed.comments || [];
    parsed.currentUser = parsed.currentUser || null;
    return parsed;
  } catch (e) {
    localStorage.setItem(DB_KEY, JSON.stringify(SEED));
    return JSON.parse(JSON.stringify(SEED));
  }
}

function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

const Progress = {
  db: loadDB(),

  refresh() { this.db = loadDB(); return this.db; },
  persist() {
    saveDB(this.db);
  },

  async loadFromApi() {
    if (!API_ENABLED) return this.db;
    const savedCurrent = this.getCurrentUser();
    const [users, posts, notifications] = await Promise.all([
      apiFetch("/api/users"),
      apiFetch("/api/posts"),
      savedCurrent ? apiFetch(`/api/notifications?recipient=${encodeURIComponent(savedCurrent.username)}`) : Promise.resolve(null)
    ]);
    if (users && users.length) {
      this.db.users = users.map(u => {
        const existing = this.db.users.find(x => x.username === u.username);
        const normalized = {
          ...u,
          timezone: u.timezone || DEFAULT_TIMEZONE,
          following: u.following || [],
          followers: u.followers || [],
          bio: u.bio || ""
        };
        if (existing && existing.bio && !normalized.bio) {
          normalized.bio = existing.bio;
        }
        return normalized;
      });
      if (savedCurrent && !this.db.users.some(u => u.username === savedCurrent.username)) {
        this.db.users.push(savedCurrent);
      }
    }
    if (posts && posts.length) this.db.posts = posts;
    if (notifications && notifications.length) this.db.notifications = notifications;
    this.persist();
    return this.db;
  },

  async loadComments(postId) {
    if (!API_ENABLED) {
      return this.db.comments
        .filter(c => c.postId === postId)
        .sort((a, b) => new Date(a.time) - new Date(b.time));
    }
    const comments = await apiFetch(`/api/posts/${postId}/comments`);
    if (comments) {
      this.db.comments = (this.db.comments || []).filter(c => c.postId !== postId).concat(comments);
      return comments.sort((a, b) => new Date(a.time) - new Date(b.time));
    }
    return this.db.comments
      .filter(c => c.postId === postId)
      .sort((a, b) => new Date(a.time) - new Date(b.time));
  },

  getCurrentUser() {
    if (!this.db.currentUser) return null;
    return this.db.users.find(u => u.username === this.db.currentUser) || null;
  },

  getUser(username) {
    return this.db.users.find(u => u.username === username) || null;
  },

  getTimeZone() {
    const user = this.getCurrentUser();
    return user && user.timezone ? user.timezone : DEFAULT_TIMEZONE;
  },

  isFollowing(username) {
    const user = this.getCurrentUser();
    if (!user) return false;
    return user.following.includes(username);
  },

  createNotification(payload) {
    if (API_ENABLED) return;
    this.db.notifications.unshift({
      id: "n" + Date.now(),
      seen: false,
      time: new Date().toISOString(),
      ...payload
    });
    this.persist();
  },

  getComments(postId) {
    return this.db.comments
      .filter(c => c.postId === postId)
      .sort((a, b) => new Date(a.time) - new Date(b.time));
  },

  async createComment(postId, body, image) {
    const user = this.getCurrentUser();
    if (!user) return null;
    const post = this.getPost(postId);
    if (!post) return null;
    if (API_ENABLED) {
      const payload = await apiFetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: user.username, body, image })
      });
      if (payload) {
        await this.loadComments(postId);
        await this.loadFromApi();
        return payload;
      }
      // fallback to local comment creation when the API is unavailable
    }
    const comment = {
      id: "c" + Date.now(),
      postId,
      author: user.username,
      body,
      image: image || null,
      time: new Date().toISOString()
    };
    this.db.comments.push(comment);
    if (post.author !== user.username) {
      this.createNotification({
        type: "reply",
        actor: user.username,
        postId,
        postTitle: post.title,
        body,
        recipient: post.author
      });
    }
    this.persist();
    return comment;
  },

  async toggleFollow(targetUsername) {
    const user = this.getCurrentUser();
    if (!user || user.username === targetUsername) return null;
    const target = this.getUser(targetUsername);
    if (!target) return null;

    const isFollowing = user.following.includes(targetUsername);
    if (API_ENABLED) {
      const endpoint = `/api/users/${encodeURIComponent(target.id)}/${isFollowing ? "unfollow" : "follow"}`;
      const payload = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followerId: user.id })
      });
      if (payload) {
        await this.loadFromApi();
        const refreshedUser = this.getCurrentUser();
        const refreshedTarget = this.getUser(targetUsername);
        return refreshedUser && refreshedTarget ? { following: refreshedUser.following, followers: refreshedTarget.followers } : null;
      }
      // fallback to local follow/unfollow when the API is unavailable
    }

    const followingIndex = user.following.indexOf(targetUsername);
    if (followingIndex === -1) {
      user.following.push(targetUsername);
      target.followers = target.followers || [];
      if (!target.followers.includes(user.username)) {
        target.followers.push(user.username);
      }
      this.createNotification({
        type: "follow",
        actor: user.username,
        recipient: targetUsername
      });
    } else {
      user.following.splice(followingIndex, 1);
      const followerIndex = target.followers.indexOf(user.username);
      if (followerIndex !== -1) target.followers.splice(followerIndex, 1);
    }
    this.persist();
    return { following: user.following, followers: target.followers };
  },

  async login(username, password) {
    if (API_ENABLED) {
      const payload = await apiFetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      if (payload && !payload.error) {
        const user = { ...payload, password };
        const existing = this.db.users.find(u => u.username === user.username);
        if (existing) Object.assign(existing, user);
        else this.db.users.push(user);
        this.db.currentUser = user.username;
        this.persist();
        return { ok: true, user };
      }
      // fallback to local login when API is unavailable
      if (!payload) {
        const user = this.db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user || user.password !== password) return { ok: false, error: "That username and password don't match." };
        this.db.currentUser = user.username;
        this.persist();
        return { ok: true, user };
      }
      return { ok: false, error: payload?.error || "That username and password don't match." };
    }

    const user = this.db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user || user.password !== password) return { ok: false, error: "That username and password don't match." };
    this.db.currentUser = user.username;
    this.persist();
    return { ok: true, user };
  },

  async signup(username, name, password) {
    username = username.trim().toLowerCase();
    if (!username || !name.trim() || !password) return { ok: false, error: "Fill in every field to continue." };
    if (!API_ENABLED && this.db.users.some(u => u.username.toLowerCase() === username)) {
      return { ok: false, error: "That username is already taken." };
    }
    if (API_ENABLED) {
      const payload = await apiFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, name: name.trim(), password, timezone: DEFAULT_TIMEZONE })
      });
      if (payload && !payload.error) {
        const user = { ...payload, password };
        this.db.users.push(user);
        this.db.currentUser = user.username;
        this.persist();
        return { ok: true, user };
      }
      if (!payload) {
        // fallback to local signup if API is unavailable
        if (this.db.users.some(u => u.username.toLowerCase() === username)) {
          return { ok: false, error: "That username is already taken." };
        }
        const user = { id: "u" + Date.now(), username, name: name.trim(), password, avatar: null, joined: new Date().toISOString().slice(0, 10), timezone: DEFAULT_TIMEZONE, following: [], followers: [] };
        this.db.users.push(user);
        this.db.currentUser = user.username;
        this.persist();
        return { ok: true, user };
      }
      return { ok: false, error: payload?.error || "Could not create account." };
    }

    if (this.db.users.some(u => u.username.toLowerCase() === username)) {
      return { ok: false, error: "That username is already taken." };
    }
    const user = { id: "u" + Date.now(), username, name: name.trim(), password, avatar: null, joined: new Date().toISOString().slice(0, 10), timezone: DEFAULT_TIMEZONE, following: [], followers: [] };
    this.db.users.push(user);
    this.db.currentUser = user.username;
    this.persist();
    return { ok: true, user };
  },

  logout() {
    this.db.currentUser = null;
    this.persist();
  },

  async updateProfile(fields) {
    const user = this.getCurrentUser();
    if (!user) return null;
    Object.assign(user, fields);
    if (API_ENABLED) {
      const payload = await apiFetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields)
      });
      if (!payload) {
        this.persist();
        return user;
      }
      await this.loadFromApi();
      return this.getCurrentUser();
    }
    this.persist();
    return user;
  },

  getPosts() {
    return [...this.db.posts].sort((a, b) => new Date(b.date) - new Date(a.date));
  },

  getPost(id) {
    return this.db.posts.find(p => p.id === id) || null;
  },

  async createPost({ title, content, cover, excerpt }) {
    const user = this.getCurrentUser();
    if (!user) return null;
    if (API_ENABLED) {
      const payload = await apiFetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: user.username, title, content, cover, excerpt })
      });
      if (payload) {
        await this.loadFromApi();
        return payload;
      }
      // Fallback when the API is unavailable or returns an error.
      // This keeps the editor working in static/demo mode.
    }
    const id = "p" + (Date.now());
    const createdAt = new Date().toISOString();
    const post = {
      id,
      author: user.username,
      title: title || "Untitled entry",
      date: createdAt.slice(0, 10),
      createdAt,
      cover: cover || null,
      excerpt: excerpt || "",
      content: content || "",
      likes: 0,
      likedBy: []
    };
    this.db.posts.unshift(post);
    this.persist();
    return post;
  },

  async deletePost(postId) {
    const user = this.getCurrentUser();
    if (!user) return false;
    const post = this.getPost(postId);
    if (!post || post.author !== user.username) return false;
    if (API_ENABLED) {
      const res = await apiFetch(`/api/posts/${postId}`, { method: "DELETE" });
      if (res) {
        await this.loadFromApi();
        return true;
      }
      // fallback to local deletion when the API is unavailable
    }
    const index = this.db.posts.findIndex(p => p.id === postId);
    if (index === -1) return false;
    this.db.posts.splice(index, 1);
    this.db.comments = (this.db.comments || []).filter(c => c.postId !== postId);
    this.db.notifications = (this.db.notifications || []).filter(n => n.postId !== postId);
    this.persist();
    return true;
  },

  async toggleLike(postId) {
    const user = this.getCurrentUser();
    const post = this.getPost(postId);
    if (!post || !user) return;
    if (API_ENABLED) {
      const payload = await apiFetch(`/api/posts/${postId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username })
      });
      if (payload) {
        await this.loadFromApi();
        return payload;
      }
      // fallback to local like toggling when the API is unavailable
    }
    const who = user.username;
    const idx = post.likedBy.indexOf(who);
    if (idx === -1) {
      post.likedBy.push(who);
      post.likes += 1;
      if (post.author !== who) {
        this.createNotification({
          type: "like",
          actor: who,
          postId,
          postTitle: post.title,
          recipient: post.author
        });
      }
    } else {
      post.likedBy.splice(idx, 1);
      post.likes = Math.max(0, post.likes - 1);
    }
    this.persist();
    return post;
  },

  getNotifications() {
    const user = this.getCurrentUser();
    if (!user) return [];
    return [...this.db.notifications]
      .filter(n => !n.recipient || n.recipient === user.username)
      .sort((a, b) => new Date(b.time) - new Date(a.time));
  },

  unseenCount() {
    const user = this.getCurrentUser();
    if (!user) return 0;
    return this.db.notifications.filter(n => (!n.recipient || n.recipient === user.username) && !n.seen).length;
  },

  async markAllSeen() {
    const user = this.getCurrentUser();
    if (!user) return;
    if (API_ENABLED) {
      const payload = await apiFetch("/api/notifications/mark-seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: user.username })
      });
      if (payload) {
        await this.loadFromApi();
        return;
      }
      // fallback to local notification state when the API is unavailable
    }
    this.db.notifications.forEach(n => {
      if (!n.recipient || n.recipient === user.username) n.seen = true;
    });
    this.persist();
  },

  timeAgo(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  },

  formatDate(iso) {
    if (!iso) return "Unknown";
    const date = iso.includes("T") ? new Date(iso) : new Date(iso + "T00:00:00");
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  },

  formatDateTime(iso) {
    if (!iso) return "";
    const tz = this.getTimeZone();
    const date = iso.includes("T") ? new Date(iso) : new Date(iso + "T00:00:00");
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: tz,
        timeZoneName: "short"
      }).format(date);
    } catch (e) {
      return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) + " • " + date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
  },

  formatDateShort(iso) {
    const date = iso && iso.includes("T") ? new Date(iso) : new Date(iso + "T00:00:00");
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
  }
};
