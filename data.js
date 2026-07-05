/* ============================================================
   PROGRESS — data layer
   A tiny mock "backend" so the demo works without a server.
   Everything lives in localStorage on the visitor's own machine.
   ============================================================ */

const DB_KEY = "progress:db:v1";
const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const SEED = {
  currentUser: null, // null = logged out
  users: [
    { username: "mara", name: "Mara Studios", password: "demo1234", avatar: "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?q=80&w=200&auto=format&fit=crop", joined: "2026-02-01", timezone: DEFAULT_TIMEZONE, following: [], followers: [], bio: "Building progress one note at a time." }
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
  persist() { saveDB(this.db); },

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

  createComment(postId, body) {
    const user = this.getCurrentUser();
    if (!user) return null;
    const post = this.getPost(postId);
    if (!post) return null;
    const comment = {
      id: "c" + Date.now(),
      postId,
      author: user.username,
      body,
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

  toggleFollow(targetUsername) {
    const user = this.getCurrentUser();
    if (!user || user.username === targetUsername) return null;
    const target = this.getUser(targetUsername);
    if (!target) return null;

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

  login(username, password) {
    const user = this.db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user || user.password !== password) return { ok: false, error: "That username and password don't match." };
    this.db.currentUser = user.username;
    this.persist();
    return { ok: true, user };
  },

  signup(username, name, password) {
    username = username.trim().toLowerCase();
    if (!username || !name.trim() || !password) return { ok: false, error: "Fill in every field to continue." };
    if (this.db.users.some(u => u.username.toLowerCase() === username)) {
      return { ok: false, error: "That username is already taken." };
    }
    const user = { username, name: name.trim(), password, avatar: null, joined: new Date().toISOString().slice(0, 10), timezone: DEFAULT_TIMEZONE, following: [], followers: [], bio: "" };
    this.db.users.push(user);
    this.db.currentUser = user.username;
    this.persist();
    return { ok: true, user };
  },

  logout() {
    this.db.currentUser = null;
    this.persist();
  },

  updateProfile(fields) {
    const user = this.getCurrentUser();
    if (!user) return;
    Object.assign(user, fields);
    this.persist();
  },

  getPosts() {
    return [...this.db.posts].sort((a, b) => new Date(b.date) - new Date(a.date));
  },

  getPost(id) {
    return this.db.posts.find(p => p.id === id) || null;
  },

  createPost({ title, content, cover, excerpt }) {
    const user = this.getCurrentUser();
    const id = "p" + (Date.now());
    const createdAt = new Date().toISOString();
    const post = {
      id,
      author: user ? user.username : "mara",
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

  toggleLike(postId) {
    const user = this.getCurrentUser();
    const post = this.getPost(postId);
    if (!post) return;
    const who = user ? user.username : "guest";
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

  markAllSeen() {
    const user = this.getCurrentUser();
    if (!user) return;
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
    const date = iso && iso.includes("T") ? new Date(iso) : new Date(iso + "T00:00:00");
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
