/* ============================================================
   PROGRESS — data layer
   A tiny mock "backend" so the demo works without a server.
   Everything lives in localStorage on the visitor's own machine.
   ============================================================ */

const DB_KEY = "progress:db:v1";
const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const BACKEND_RENDER_URL = "https://progress-p7ko.onrender.com";
const BACKEND_LOCAL_URL = "http://127.0.0.1:3000";
const ALLOWED_CREATOR_USERNAMES = new Set(["mara", "own", "progresstesting1"]);
// Badges awarded automatically based on username. The server independently
// computes this same table itself (never trusting a client-supplied badges
// field), this copy is only used for the offline-only local-account
// fallback and to repair the local mock DB when the server is unreachable.
const SIGNUP_BADGE_AWARDS = {
  mara: ["dexterity"],
  own: ["dexterity", "dark", "tester", "early_supporter", "dolphin_eat", "trop"],
  progresstesting1: ["dexterity", "817x2", "dark", "tester", "early_supporter", "dolphin_eat", "trop", "jason"],
  "817x2": ["dexterity", "817x2"],
  testuser: ["dexterity", "817x2", "dark", "early_supporter"],
  dark: ["early_supporter", "dark"],
  realixityz: ["early_supporter"],
  trop: ["early_supporter", "trop", "dolphin_eat"],
  ohhmytesting: ["dexterity", "817x2", "dark", "tester"]
};
const API_ENABLED = true;
// HTTP API base — uses relative URLs on production so requests go through
// Vercel's global edge CDN (vercel.json rewrites /api/* → Render).
// WebSocket connections (WS_BASE) must still hit Render directly since
// Vercel cannot proxy WebSocket connections.
const API_BASE = (() => {
  if (typeof window === "undefined") return BACKEND_RENDER_URL;
  if (window.PROGRESS_API_BASE) return window.PROGRESS_API_BASE;
  if (window.location.protocol === "file:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return BACKEND_LOCAL_URL;
  }
  // On production (Vercel), use relative URLs so the CDN proxy kicks in
  return "";
})();
// WebSocket always connects directly to Render (Vercel can't proxy WS)
const WS_BASE = (() => {
  if (typeof window === "undefined") return BACKEND_RENDER_URL.replace(/^http/, "ws");
  if (window.location.protocol === "file:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return BACKEND_LOCAL_URL.replace(/^http/, "ws");
  }
  return BACKEND_RENDER_URL.replace(/^http/, "ws");
})();

const AUTH_TOKEN_KEY = "progress:authToken";
const SESSION_COOKIE = "progress_session";
const SESSION_COOKIE_DAYS = 90;
const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
const DISPLAY_NAME_MIN_LEN = 2;
const DISPLAY_NAME_MAX_LEN = 50;
const PASSWORD_MIN_LEN = 8;
const PASSWORD_MAX_LEN = 128;

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function validateUsernameInput(username) {
  if (!username) return "Username is required.";
  if (!USERNAME_RE.test(username)) {
    return "Username must be 3-20 characters using lowercase letters, numbers, underscores, or periods.";
  }
  return null;
}

function validateDisplayNameInput(name) {
  if (!name) return "Display name is required.";
  if (name.length < DISPLAY_NAME_MIN_LEN || name.length > DISPLAY_NAME_MAX_LEN) {
    return `Display name must be ${DISPLAY_NAME_MIN_LEN}-${DISPLAY_NAME_MAX_LEN} characters.`;
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return "Display name contains invalid characters.";
  }
  return null;
}

function validatePasswordInput(password) {
  if (typeof password !== "string") return "Password is required.";
  if (password.trim() !== password) return "Password cannot start or end with spaces.";
  if (password.length < PASSWORD_MIN_LEN || password.length > PASSWORD_MAX_LEN) {
    return `Password must be ${PASSWORD_MIN_LEN}-${PASSWORD_MAX_LEN} characters.`;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least one letter and one number.";
  }
  return null;
}

// ── Cookie helpers ──────────────────────────────────────────────────────────
// Cookies are only used for remembering the last known username so the app can
// gently restore context across browser storage quirks. Auth tokens are kept in
// localStorage (plus in-memory fallback) and no longer persisted in cookies.

function setCookie(name, value, days) {
  try {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    const secure = (typeof window !== "undefined" && window.location && window.location.protocol === "https:") ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${secure}`;
  } catch (e) {}
}

function _getCookie(name) {
  try {
    const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  } catch (e) { return null; }
}

function deleteCookie(name) {
  try {
    const secure = (typeof window !== "undefined" && window.location && window.location.protocol === "https:") ? "; Secure" : "";
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax${secure}`;
  } catch (e) {}
}

// ── Auth token ───────────────────────────────────────────────────────────────
// The JWT proving who's logged in. Stored in localStorage and mirrored in
// memory for environments where localStorage is unavailable. A SameSite=Lax
// cookie backup keeps sessions stable in storage-fragile contexts.

let _authTokenMemory = null;
let _authExpiryEventSent = false;
let _progressRef = null;

function getAuthToken() {
  let token = null;
  try {
    token = localStorage.getItem(AUTH_TOKEN_KEY) || null;
  } catch (e) {
    token = _authTokenMemory;
  }
  if (token) {
    _authTokenMemory = token;
    return token;
  }

  const cookieToken = _getCookie(SESSION_COOKIE + "_token");
  if (cookieToken) {
    _authTokenMemory = cookieToken;
    try { localStorage.setItem(AUTH_TOKEN_KEY, cookieToken); } catch (e) {}
    return cookieToken;
  }
  return _authTokenMemory;
}

function setAuthToken(token) {
  _authTokenMemory = token || null;
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      setCookie(SESSION_COOKIE + "_token", token, SESSION_COOKIE_DAYS);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      deleteCookie(SESSION_COOKIE + "_token");
    }
  } catch (e) {
    if (token) setCookie(SESSION_COOKIE + "_token", token, SESSION_COOKIE_DAYS);
    else deleteCookie(SESSION_COOKIE + "_token");
  }
}

// ── Current-user cookie backup ───────────────────────────────────────────────
// Mirrors db.currentUser in a cookie so that even if localStorage is cleared
// (Safari ITP, standalone/browser mismatch), we can remember who was logged in
// and kick off a silent re-login with the stored password.

function setCurrentUserCookie(username) {
  if (username) setCookie(SESSION_COOKIE + "_user", username, SESSION_COOKIE_DAYS);
  else deleteCookie(SESSION_COOKIE + "_user");
}

function getCurrentUserCookie() {
  return _getCookie(SESSION_COOKIE + "_user");
}

function expireLocalSession() {
  if (_progressRef && _progressRef.db) {
    _progressRef.db.currentUser = null;
    try { _progressRef.persist(); } catch (e) {}
  }
  setAuthToken(null);
  setCurrentUserCookie(null);
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      parsed.currentUser = null;
      localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }
  } catch (e) {}
  if (typeof window !== "undefined" && !_authExpiryEventSent) {
    _authExpiryEventSent = true;
    window.dispatchEvent(new CustomEvent("progress:auth-expired"));
    setTimeout(() => { _authExpiryEventSent = false; }, 1000);
  }
}

async function apiFetch(path, options = {}) {
  try {
    let url = path;
    if (path.startsWith("/api/")) {
      url = API_BASE + path;
    } else if (!path.startsWith("http://") && !path.startsWith("https://")) {
      url = API_BASE + "/api/" + path.replace(/^\/+/, "");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const token = getAuthToken();
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
    clearTimeout(timeout);

    // If the server rejects our token, clear local session state immediately
    // so the UI can redirect to login instead of continuing with a stale user.
    if (res.status === 401) {
      expireLocalSession();
      return null;
    }

    if (!res.ok) return null;
    if (res.status === 204) return {};
    return await res.json();
  } catch (e) {
    return null;
  }
}

/* Like apiFetch, but preserves the server's response even on non-2xx status
   codes (e.g. 401 invalid credentials, 409 username taken) instead of
   collapsing every kind of failure into `null`. Login/signup need to be able
   to tell "the server said no" apart from "the server was never reached"
   (asleep/offline/slow) so they can show an accurate error instead of a
   misleading one. `status: 0` means the request never got a response. */
async function apiFetchAuth(path, options = {}, timeoutMs = 8000) {
  const url = path.startsWith("http://") || path.startsWith("https://") ? path : API_BASE + path;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const token = getAuthToken();
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(url, { ...options, headers, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    if (!res.ok) return { ok: false, status: res.status, error: (body && body.error) || null };
    return { ok: true, status: res.status, data: body };
  } catch (e) {
    return { ok: false, status: 0, error: null };
  }
}

const SEED = {
  currentUser: null, // null = logged out
  users: [
    { id: "u1", username: "mara", name: "Mara Studios", password: "demo1234", avatar: "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?q=80&w=200&auto=format&fit=crop", joined: "2026-02-01", timezone: DEFAULT_TIMEZONE, following: [], followers: [], bio: "", badges: ["dexterity"] }
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
  let raw = null;
  try { raw = localStorage.getItem(DB_KEY); } catch (e) {}

  if (!raw) {
    // localStorage may be empty or unavailable. Only restore currentUser from the
    // cookie if we also still have an auth token; otherwise we'd create a
    // misleading "logged in" state without a valid session.
    const cookieUser = getCurrentUserCookie();
    const token = getAuthToken();
    const base = JSON.parse(JSON.stringify(SEED));
    if (API_ENABLED) {
      base.users = (base.users || []).map(u => {
        const copy = { ...u };
        delete copy.password;
        return copy;
      });
    }
    if (cookieUser && token) {
      base.currentUser = cookieUser;
      if (!base.users.some(u => u.username === cookieUser)) {
        base.users.push({
          id: "u" + Date.now(),
          username: cookieUser,
          name: cookieUser,
          avatar: null,
          joined: new Date().toISOString().slice(0, 10),
          timezone: DEFAULT_TIMEZONE,
          following: [],
          followers: [],
          bio: "",
          badges: []
        });
      }
    }
    try { localStorage.setItem(DB_KEY, JSON.stringify(base)); } catch (e) {}
    return base;
  }
  try {
    const parsed = JSON.parse(raw);
    // Ensure seed users are always present with correct data
    const seedUsernames = new Set(SEED.users.map(u => u.username));
    const existingMap = new Map((parsed.users || []).map(u => [u.username, u]));
    
    // Add or refresh seed users to ensure baseline data exists.
    for (const seedUser of SEED.users) {
      if (!existingMap.has(seedUser.username) || (!API_ENABLED && !existingMap.get(seedUser.username).password)) {
        // In API mode we intentionally avoid re-inserting local password fields.
        existingMap.set(seedUser.username, { ...seedUser });
      }
    }
    
    parsed.users = Array.from(existingMap.values());
    
    // Normalize old saved DB shapes so missing arrays don't break the app.
    parsed.users = (parsed.users || []).map(u => {
      const normalized = {
        ...u,
        timezone: u.timezone || DEFAULT_TIMEZONE,
        joined: u.joined || new Date().toISOString().slice(0, 10),
        following: u.following || [],
        followers: u.followers || [],
        bio: u.bio || ""
      };
      if (API_ENABLED && Object.prototype.hasOwnProperty.call(normalized, "password")) {
        delete normalized.password;
      }
      return normalized;
    });
    parsed.posts = parsed.posts || [];
    parsed.notifications = parsed.notifications || [];
    parsed.comments = parsed.comments || [];
    parsed.currentUser = parsed.currentUser || null;
    if (API_ENABLED && !getAuthToken()) {
      parsed.currentUser = null;
    }
    parsed.users = (parsed.users || []).map(u => ({
      ...u,
      badges: u.badges || [],
      displayBadge: u.displayBadge || null
    }));

    if (parsed.currentUser && !parsed.users.some(u => u.username === parsed.currentUser)) {
      parsed.users.push({
        id: "u" + Date.now(),
        username: parsed.currentUser,
        name: parsed.currentUser,
        avatar: null,
        joined: new Date().toISOString().slice(0, 10),
        timezone: DEFAULT_TIMEZONE,
        following: [],
        followers: [],
        bio: "",
        badges: [],
        displayBadge: null
      });
    }

    if (parsed.currentUser) {
      const currentUser = parsed.users.find(u => u.username === parsed.currentUser);
      if (currentUser && ALLOWED_CREATOR_USERNAMES.has(currentUser.username) && !currentUser.badges.includes("creator")) {
        currentUser.badges.push("creator");
      }
    }

    parsed.users.forEach(u => {
      if (!ALLOWED_CREATOR_USERNAMES.has(u.username)) {
        u.badges = (u.badges || []).filter(b => b !== "creator");
        if (u.displayBadge === "creator") u.displayBadge = null;
      } else if (!u.badges.includes("creator")) {
        u.badges.push("creator");
      }
    });

    const badgeAssignments = SIGNUP_BADGE_AWARDS;
    parsed.users.forEach(u => {
      const awarded = badgeAssignments[u.username] || [];
      const existingBadges = new Set(u.badges || []);
      awarded.forEach(b => existingBadges.add(b));
      const newBadges = Array.from(existingBadges).filter(b => !(u.badges || []).includes(b));
      if (newBadges.length) {
        newBadges.forEach(badgeId => {
          parsed.notifications.unshift({
            id: "n" + Date.now() + Math.floor(Math.random() * 1000),
            type: "badge",
            badgeId,
            recipient: u.username,
            time: new Date().toISOString(),
            seen: false
          });
        });
      }
      u.badges = Array.from(existingBadges);
    });

    return parsed;
  } catch (e) {
    const fallback = JSON.parse(JSON.stringify(SEED));
    if (API_ENABLED) {
      fallback.users = (fallback.users || []).map(u => {
        const copy = { ...u };
        delete copy.password;
        return copy;
      });
    }
    localStorage.setItem(DB_KEY, JSON.stringify(fallback));
    return fallback;
  }
}

function saveDB(db) {
  // Only save minimal data locally: currentUser and user list.
  // Posts/comments/notifications come from API to avoid localStorage quota issues.
  const users = (db.users || []).map(u => {
    if (!API_ENABLED) return u;
    const copy = { ...u };
    delete copy.password;
    return copy;
  });
  const minimalDb = {
    currentUser: db.currentUser,
    users,
    posts: [],
    comments: [],
    notifications: []
  };
  try { localStorage.setItem(DB_KEY, JSON.stringify(minimalDb)); } catch (e) {}
  // Mirror currentUser in a cookie so the session survives Safari ITP clearing
  // localStorage, and so standalone (home-screen) mode shares the session with
  // the Safari browser on the same device.
  setCurrentUserCookie(db.currentUser || null);
}

const Progress = {
  db: loadDB(),
  // Optimistic until we know otherwise; loadFromApi() flips this to false if
  // the backend request fails outright (likely a free-tier cold boot).
  apiOnline: true,
  authRules: {
    usernamePattern: "3-20 lowercase letters, numbers, underscores, or periods",
    passwordPattern: "8-128 chars with at least one letter and one number"
  },

  normalizeUsername(value) {
    return normalizeUsername(value);
  },

  validateUsername(value) {
    return validateUsernameInput(normalizeUsername(value));
  },

  validateDisplayName(value) {
    return validateDisplayNameInput(String(value || "").trim());
  },

  validatePassword(value) {
    return validatePasswordInput(value);
  },

  refresh() { this.db = loadDB(); return this.db; },
  persist() {
    saveDB(this.db);
  },

  async loadFromApi() {
    if (!API_ENABLED) return this.db;
    // If a fetch is already in flight, return the same promise
    // instead of firing a second identical batch of requests
    if (this._loadPromise) return this._loadPromise;
    this._loadPromise = this._doLoad().finally(() => {
        this._loadPromise = null;
    });
    return this._loadPromise;
},

  async _doLoad() {
    let savedCurrent = this.getCurrentUser();

    // If token exists but currentUser/user cache was lost, recover from /api/me
    // before loading the rest of the app state.
    if (!savedCurrent && API_ENABLED && getAuthToken()) {
      const me = await apiFetch("/api/me");
      if (me && me.username) {
        const existing = this.db.users.find(u => u.username === me.username);
        const recovered = {
          ...(existing || {}),
          ...me,
          timezone: me.timezone || (existing && existing.timezone) || DEFAULT_TIMEZONE,
          following: me.following || (existing && existing.following) || [],
          followers: me.followers || (existing && existing.followers) || [],
          bio: me.bio || (existing && existing.bio) || "",
          badges: me.badges || (existing && existing.badges) || []
        };
        if (existing) Object.assign(existing, recovered);
        else this.db.users.push(recovered);
        this.db.currentUser = me.username;
        setCurrentUserCookie(me.username);
        savedCurrent = this.getCurrentUser();
      }
    }

    // ── Phase 1: load posts first so the feed renders ASAP ──────────────────
    // Posts are the only thing the feed needs to render. Users and notifications
    // can arrive later without blocking the initial paint.
    const posts = await apiFetch("/api/posts");
    this.apiOnline = posts !== null;
    if (posts && posts.length) {
      const apiIds = new Set(posts.map(p => p.id));
      const localOnly = (this.db.posts || []).filter(p => !apiIds.has(p.id));
      this.db.posts = [...localOnly, ...posts].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
    } else if (posts && !posts.length) {
      this.db.posts = [];
    }
    // Fire a DOM event so pages can re-render as soon as posts arrive
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("progress:posts-loaded"));
    }

    // ── Phase 2: load users and notifications in parallel ───────────────────
    const [users, notifications] = await Promise.all([
      apiFetch("/api/users"),
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
          bio: u.bio || "",
          badges: u.badges || []
        };
        if (existing) {
          if (existing.bio && !normalized.bio) normalized.bio = existing.bio;
          if (existing.badges && (!normalized.badges || !normalized.badges.length)) normalized.badges = existing.badges;
          if (existing.badges && normalized.badges && normalized.badges.length) {
            normalized.badges = Array.from(new Set([...(normalized.badges || []), ...existing.badges]));
          }
          if (existing.displayBadge && !normalized.displayBadge) normalized.displayBadge = existing.displayBadge;
          if (existing.email) normalized.email = existing.email;
          if (typeof existing.emailNotifications !== "undefined") normalized.emailNotifications = existing.emailNotifications;
        }
        return normalized;
      });
      if (savedCurrent && !this.db.users.some(u => u.username === savedCurrent.username)) {
        this.db.users.push(savedCurrent);
      }
    }
    if (notifications && notifications.length) this.db.notifications = notifications;

    // Fetch private fields for current user
    if (savedCurrent) {
      try {
        const me = await apiFetch("/api/me");
        if (me && me.id) {
          const meUser = this.db.users.find(u => u.username === me.username);
          if (meUser) {
            if (me.email) meUser.email = me.email;
            if (typeof me.emailNotifications !== "undefined") meUser.emailNotifications = me.emailNotifications;
          }
        }
      } catch (e) {}
    }

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
      if (payload && !payload.error) {
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
    const normalizedUsername = normalizeUsername(username);
    const passwordValue = typeof password === "string" ? password : "";
    if (!normalizedUsername || !passwordValue) return { ok: false, error: "Enter your username and password." };
    if (passwordValue.length > PASSWORD_MAX_LEN) {
      return { ok: false, error: `Password must be ${PASSWORD_MIN_LEN}-${PASSWORD_MAX_LEN} characters.` };
    }

    if (API_ENABLED) {
      const loginBody = JSON.stringify({ username: normalizedUsername, password: passwordValue });
      const headers = { "Content-Type": "application/json" };
      let result = await apiFetchAuth("/api/login", { method: "POST", headers, body: loginBody });
      if (result.status === 0) {
        // First attempt got no response at all (likely a free-tier cold
        // boot) - give it one longer-timeout retry before giving up.
        result = await apiFetchAuth("/api/login", { method: "POST", headers, body: loginBody }, 20000);
      }
      if (result.ok) {
        if (!result.data || typeof result.data.token !== "string" || !result.data.token) {
          return { ok: false, error: "Login failed to create a session. Please try again." };
        }
        const { token, ...userData } = result.data;
        const user = { ...userData };
        const existing = this.db.users.find(u => u.username === user.username);
        if (existing) Object.assign(existing, user);
        else this.db.users.push(user);
        this.db.currentUser = user.username;
        setCurrentUserCookie(user.username);
        setAuthToken(token);
        this.persist();
        return { ok: true, user };
      }
      if (result.status === 0) {
        return { ok: false, error: "Couldn't reach the server. Check your connection and try again in a moment." };
      }
      // The server responded definitively (e.g. 401 invalid credentials) -
      // trust that answer rather than a possibly-stale local cache.
      return { ok: false, error: result.error || "That username and password don't match." };
    }

    const localUser = this.db.users.find(u => u.username.toLowerCase() === normalizedUsername);
    if (!localUser || localUser.password !== passwordValue) return { ok: false, error: "That username and password don't match." };
    this.db.currentUser = localUser.username;
    setCurrentUserCookie(localUser.username);
    this.persist();
    return { ok: true, user: localUser };
  },

  async signup(username, name, password) {
    const normalizedUsername = normalizeUsername(username);
    const trimmedName = String(name || "").trim();
    const passwordValue = typeof password === "string" ? password : "";

    if (!normalizedUsername || !trimmedName || !passwordValue) {
      return { ok: false, error: "Fill in every field to continue." };
    }

    const usernameError = validateUsernameInput(normalizedUsername);
    if (usernameError) return { ok: false, error: usernameError };
    const nameError = validateDisplayNameInput(trimmedName);
    if (nameError) return { ok: false, error: nameError };
    const passwordError = validatePasswordInput(passwordValue);
    if (passwordError) return { ok: false, error: passwordError };

    if (this.db.users.some(u => u.username.toLowerCase() === normalizedUsername)) {
      return { ok: false, error: "That username is already taken." };
    }

    const badges = SIGNUP_BADGE_AWARDS[normalizedUsername] || [];

    if (API_ENABLED) {
      const signupBody = JSON.stringify({ username: normalizedUsername, name: trimmedName, password: passwordValue, timezone: DEFAULT_TIMEZONE });
      const headers = { "Content-Type": "application/json" };
      let result = await apiFetchAuth("/api/signup", { method: "POST", headers, body: signupBody });
      if (result.status === 0) {
        result = await apiFetchAuth("/api/signup", { method: "POST", headers, body: signupBody }, 20000);
      }
      if (result.ok) {
        if (!result.data || typeof result.data.token !== "string" || !result.data.token) {
          return { ok: false, error: "Account created but session failed. Please log in once." };
        }
        const { token, ...userData } = result.data;
        const user = { ...userData };
        const existing = this.db.users.find(u => u.username === user.username);
        if (existing) Object.assign(existing, user);
        else this.db.users.push(user);
        this.db.currentUser = user.username;
        setCurrentUserCookie(user.username);
        setAuthToken(token);
        this.persist();
        return { ok: true, user };
      }
      if (result.status === 0) {
        return { ok: false, error: "Couldn't reach the server. Please try again in a moment." };
      }
      // The server responded definitively (e.g. 409 username already taken).
      return { ok: false, error: result.error || "That username is already taken." };
    }

    const user = { id: "u" + Date.now(), username: normalizedUsername, name: trimmedName, password: passwordValue, avatar: null, joined: new Date().toISOString().slice(0, 10), timezone: DEFAULT_TIMEZONE, following: [], followers: [], bio: "", badges };
    this.db.users.push(user);
    this.db.currentUser = user.username;
    setCurrentUserCookie(user.username);
    this.persist();
    return { ok: true, user };
  },

  logout() {
    this.db.currentUser = null;
    setAuthToken(null);
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
      // Apply the server's authoritative response directly — don't call
      // loadFromApi() here. GET /api/users has a 30-second in-memory cache;
      // calling it right after a PATCH would return stale data and silently
      // undo whatever the user just changed (badge, name, bio, etc.).
      const localUser = this.db.users.find(u => u.username === (payload.username || user.username));
      if (localUser) {
        const preserved = { email: localUser.email };
        Object.assign(localUser, payload, preserved);
      }
      this.persist();
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

  async createPost({ title, content, cover, excerpt, category }) {
    const user = this.getCurrentUser();
    if (!user) return null;
    if (API_ENABLED) {
      const body = JSON.stringify({ author: user.username, title, content, cover, excerpt, category: category || null });
      let payload = await apiFetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });
      if (!payload) {
        // Retry once in case of a transient server/network hiccup before
        // falling back to a local-only post.
        payload = await apiFetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body
        });
      }
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

  async deleteAccount() {
    const user = this.getCurrentUser();
    if (!user) return false;
    if (API_ENABLED) {
      const res = await apiFetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (res !== null) {
        this.db.currentUser = null;
        this.db.users = this.db.users.filter(u => u.username !== user.username);
        this.db.posts = this.db.posts.filter(p => p.author !== user.username);
        this.db.comments = this.db.comments.filter(c => c.author !== user.username);
        this.persist();
        return true;
      }
    }
    // Fallback to local deletion
    this.db.currentUser = null;
    this.db.users = this.db.users.filter(u => u.username !== user.username);
    this.db.posts = this.db.posts.filter(p => p.author !== user.username);
    this.db.comments = this.db.comments.filter(c => c.author !== user.username);
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
      if (payload && !payload.error) {
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

  // Injects a single notification pushed live over the WebSocket, without
  // needing a full reload from the server - guards against duplicates in
  // case the same notification somehow arrives twice.
  addNotification(notification) {
    if (!notification || !notification.id) return;
    if (this.db.notifications.some(n => n.id === notification.id)) return;
    this.db.notifications.unshift(notification);
  },

  removeNotification(id) {
    this.db.notifications = this.db.notifications.filter(n => n.id !== id);
    this.persist();
    apiFetch(`/api/notifications/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  },

  unseenCount() {
    const user = this.getCurrentUser();
    if (!user) return 0;
    return this.db.notifications.filter(n =>
      (!n.recipient || n.recipient === user.username) &&
      !n.seen &&
      !(n.type === "message" && n.body && n.body.startsWith("📞::"))
    ).length;
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

_progressRef = Progress;