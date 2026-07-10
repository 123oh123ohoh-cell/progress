/* ============================================================
   PROGRESS — shared app shell (nav, dropdowns, auth modals)
   Included on every page. Expects <div id="nav-root"></div>
   and <div id="modal-root"></div> somewhere in the document.
   ============================================================ */

const ICONS = {
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.1 2 4.5 5.6 4c2-.3 3.9.7 6.4 3.4C14.5 4.7 16.4 3.7 18.4 4c3.6.5 5.2 4.1 3.6 7.7C19.5 16.4 12 21 12 21z"/></svg>`,
  reply: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12l5-5v3c7 0 10 3 11 8-3-3-6-4-11-4v3z"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`
};

const BADGES = {
  reader: { label: "Avid Reader", description: "Enjoys reading entries and exploring the community.", icon: "📚" },
  supporter: { label: "Community Supporter", description: "Leaves thoughtful feedback and encourages others.", icon: "🤝" },
  early: { label: "Early Adopter", description: "Joined early and helped shape the experience.", icon: "🚀" },
  dexterity: { label: "Dexterity", description: "Awarded for playing during the Valorant ban on July 4th.", image: "images/emoticons/dexterity.png" },
  "817x2": { label: "817x2", description: "Awarded for 817x2, OurSpawn easter egg!", image: "images/emoticons/817x2.png" },
  creator: { label: "Creator", description: "Awarded for creator contributions.", image: "images/creator.png" }
};

const BROWSE_ALLOWED_USERNAMES = new Set(["mara", "own", "progresstesting1"]);

function canBrowseUsers(user) {
  return Boolean(user && BROWSE_ALLOWED_USERNAMES.has(user.username));
}


function renderBadgeChip(id, activeId) {
  const badge = BADGES[id];
  if (!badge) return "";
  const isActive = !!activeId && id === activeId;
  const activeClass = isActive ? " is-displayed" : "";
  const activeAttr = isActive ? ` data-active="true"` : "";
  if (badge.image) {
    const extraClass = id === "creator" ? " creator-badge" : "";
    return `<img class="profile-badge profile-badge-image${extraClass}${activeClass}" src="${badge.image}" alt="${badge.label}" title="${badge.label}" data-badge-id="${id}"${activeAttr} tabindex="0" />`;
  }
  return `<span class="profile-badge${activeClass}" data-badge-id="${id}"${activeAttr} tabindex="0" aria-label="${badge.label}">${badge.icon}</span>`;
}

function renderDisplayBadge(user) {
  if (!user || !user.displayBadge) return "";
  const badge = BADGES[user.displayBadge];
  if (!badge) return "";
  const extraClass = user.displayBadge === "creator" ? " creator-badge" : "";
  if (badge.image) {
    return `<img class="display-badge-image${extraClass}" src="${badge.image}" alt="${badge.label}" title="${badge.label}" data-badge-id="${user.displayBadge}" tabindex="0">`;
  }
  return `<span class="display-badge-text" data-badge-id="${user.displayBadge}" tabindex="0">${badge.icon}</span>`;
}

function renderBadges(user) {
  if (!user || !user.badges || !user.badges.length) return "";
  return user.badges.map(id => renderBadgeChip(id)).join(" ");
}

function renderBadgeDetails(user) {
  if (!user || !user.badges || !user.badges.length) return "";
  return `<div class="profile-badges-inventory">${user.badges.map(id => renderBadgeChip(id, user.displayBadge)).join(" ")}</div>`;
}

function attachBadgeTooltip(root) {
  if (!root) return;
  let tooltip = document.getElementById("badge-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "badge-tooltip";
    tooltip.className = "emoji-tooltip hidden";
    document.body.appendChild(tooltip);
  }
  root.querySelectorAll(".profile-badge, .display-badge-image, .display-badge-text").forEach(el => {
    const id = el.dataset.badgeId;
    const badge = BADGES[id];
    if (!badge) return;
    const show = () => {
      const icon = badge.image ? `<img src="${badge.image}" alt="${badge.label}" class="tooltip-badge-image">` : badge.icon;
      const note = id === "dexterity" ? `<div style="margin-top:8px; font-size:11px; color:var(--muted);">This badge can't be displayed on display name.</div>` : "";
      tooltip.innerHTML = `<div class="emoji-tooltip-label">${icon} ${badge.label}</div><div style="font-size:12px; color:var(--ink); line-height:1.4;">${badge.description}</div>${note}`;
      tooltip.classList.remove("hidden");
      const rect = el.getBoundingClientRect();
      const left = Math.min(window.innerWidth - tooltip.offsetWidth - 12, Math.max(12, rect.left + rect.width / 2 - tooltip.offsetWidth / 2));
      const top = rect.top - tooltip.offsetHeight - 10;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top < 12 ? rect.bottom + 10 : top}px`;
    };
    el.addEventListener("mouseenter", show);
    el.addEventListener("focus", show);
    el.addEventListener("mouseleave", () => tooltip.classList.add("hidden"));
    el.addEventListener("blur", () => tooltip.classList.add("hidden"));
  });
}

const EMOTICON_NAMES = [
  "backpack", "banana", "bee", "bored", "computer", "computer2", "computersupport",
  "cow", "dead", "dexterity", "dolphinhead", "fishhead", "hamster", "hi", "kiss",
  "lion", "mwa", "pancake", "penguin", "raindeer", "romantic", "shark", "shark2",
  "sharkcat", "squish", "squuish", "starbucks", "turtle_lazy", "two", "windy", "wonder"
];
const EMOTICON_NAME_SET = new Set(EMOTICON_NAMES);

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

function avatarHTML(user, size) {
  if (user && user.avatar) return `<img src="${user.avatar}" alt="Avatar">`;
  if (!user) return `<img src="images/default.jpg" alt="Avatar">`;
  const label = initials(user.name);
  return `<span class="initials" style="font-size:${size ? size * 0.4 + 'px' : ''}">${label}</span>`;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const SPOTIFY_EMBED_TYPES = new Set(["track", "album", "playlist", "artist", "episode", "show"]);
const SPOTIFY_EMBED_HEIGHTS = { track: 152, episode: 232, show: 232, album: 352, playlist: 352, artist: 352 };

function parseSpotifyLink(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  let match = trimmed.match(/^https:\/\/open\.spotify\.com\/(?:intl-[a-zA-Z-]+\/)?(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]+)(?:\?\S*)?$/i);
  if (!match) match = trimmed.match(/^spotify:(track|album|playlist|artist|episode|show):([a-zA-Z0-9]+)$/i);
  if (!match) return null;
  const type = match[1].toLowerCase();
  if (!SPOTIFY_EMBED_TYPES.has(type)) return null;
  return { type, id: match[2] };
}

function spotifyEmbedUrl(raw) {
  const parsed = parseSpotifyLink(raw);
  if (!parsed) return null;
  return `https://open.spotify.com/embed/${parsed.type}/${parsed.id}?utm_source=generator`;
}

function renderSpotifyEmbed(user) {
  const parsed = parseSpotifyLink(user && user.spotify);
  if (!parsed) return "";
  const height = SPOTIFY_EMBED_HEIGHTS[parsed.type] || 352;
  const src = `https://open.spotify.com/embed/${parsed.type}/${parsed.id}?utm_source=generator`;
  return `<div class="spotify-embed"><iframe src="${src}" width="100%" height="${height}" frameborder="0" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" title="Spotify embed"></iframe></div>`;
}

async function fetchSpotifyNowPlaying(userId) {
  if (!userId) return null;
  return apiFetch(`/api/users/${userId}/spotify/now-playing`);
}

function formatNowPlayingClock(ms) {
  if (typeof ms !== "number" || !isFinite(ms) || ms < 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const SPOTIFY_GLYPH = `<svg class="now-playing-spotify-icon" viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141 4.32-1.32 9.719-.66 13.439 1.621.361.181.54.78.302 1.2zm.12-3.36c-3.899-2.34-10.32-2.58-14.037-1.38-.6.181-1.2-.18-1.381-.72-.18-.6.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.72 1.621.539.3.719 1.02.42 1.56-.301.42-1.021.6-1.442.3z"/></svg>`;

function renderNowPlayingWidget(data) {
  if (!data || !data.playing) return "";
  const p = data.playing;
  const safeHref = p.trackUrl && p.trackUrl.startsWith("https://open.spotify.com/") ? p.trackUrl : "#";
  const safeArt = p.albumArt && /^https:\/\//i.test(p.albumArt) ? p.albumArt : null;
  const stateClass = p.isPlaying ? "is-playing" : "is-paused";
  const hasProgress = typeof p.progressMs === "number" && typeof p.durationMs === "number" && p.durationMs > 0;
  const duration = hasProgress ? p.durationMs : 0;
  const progress = hasProgress ? Math.min(p.progressMs, duration) : 0;
  const pct = hasProgress ? Math.min(100, (progress / duration) * 100) : 0;
  const dataAttrs = hasProgress
    ? `data-duration-ms="${duration}" data-progress-ms="${progress}" data-fetched-at="${p.fetchedAt || Date.now()}" data-is-playing="${p.isPlaying ? "1" : "0"}"`
    : "";
  return `
    <a class="now-playing-widget ${stateClass}" href="${safeHref}" target="_blank" rel="noopener noreferrer" ${dataAttrs}>
      <div class="now-playing-header">${SPOTIFY_GLYPH}<span>${p.isPlaying ? "Listening to Spotify" : "Paused on Spotify"}</span></div>
      <div class="now-playing-body">
        ${safeArt ? `<img src="${safeArt}" alt="">` : `<div class="now-playing-art-fallback">♪</div>`}
        <div class="now-playing-info">
          <span class="now-playing-track">${escapeHTML(p.trackName || "")}</span>
          <span class="now-playing-artist">${escapeHTML(p.artistNames || "")}</span>
          ${hasProgress ? `
          <div class="now-playing-progress">
            <div class="now-playing-progress-fill" style="width:${pct.toFixed(2)}%"></div>
          </div>
          <div class="now-playing-times">
            <span class="now-playing-elapsed">${formatNowPlayingClock(progress)}</span>
            <span class="now-playing-duration">${formatNowPlayingClock(duration)}</span>
          </div>` : ""}
        </div>
      </div>
    </a>`;
}

function tickNowPlayingWidgets() {
  document.querySelectorAll(".now-playing-widget[data-duration-ms]").forEach(el => {
    const duration = Number(el.dataset.durationMs);
    const baseProgress = Number(el.dataset.progressMs);
    const fetchedAt = Number(el.dataset.fetchedAt);
    const isPlaying = el.dataset.isPlaying === "1";
    if (!duration) return;
    const elapsed = isPlaying ? baseProgress + (Date.now() - fetchedAt) : baseProgress;
    const clamped = Math.max(0, Math.min(duration, elapsed));
    const pct = Math.min(100, (clamped / duration) * 100);
    const fill = el.querySelector(".now-playing-progress-fill");
    const elapsedLabel = el.querySelector(".now-playing-elapsed");
    if (fill) fill.style.width = pct.toFixed(2) + "%";
    if (elapsedLabel) elapsedLabel.textContent = formatNowPlayingClock(clamped);
  });
}
setInterval(tickNowPlayingWidgets, 1000);

async function fetchListenSessions() {
  return (await apiFetch("/api/listen/sessions")) || [];
}

async function fetchListenSession(id) {
  return apiFetch(`/api/listen/sessions/${encodeURIComponent(id)}`);
}

async function createListenSession() {
  const user = Progress.getCurrentUser();
  if (!user) return null;
  return apiFetch("/api/listen/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hostId: user.id })
  });
}

async function joinListenSession(id) {
  const user = Progress.getCurrentUser();
  if (!user) return null;
  return apiFetch(`/api/listen/sessions/${encodeURIComponent(id)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: user.id })
  });
}

async function leaveListenSession(id) {
  const user = Progress.getCurrentUser();
  if (!user) return null;
  return apiFetch(`/api/listen/sessions/${encodeURIComponent(id)}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: user.id })
  });
}

async function endListenSession(id) {
  const user = Progress.getCurrentUser();
  if (!user) return null;
  return apiFetch(`/api/listen/sessions/${encodeURIComponent(id)}/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: user.id })
  });
}

async function syncMeToListenSession(id) {
  const user = Progress.getCurrentUser();
  if (!user) return { synced: false, reason: "Log in first." };
  const result = await apiFetch(`/api/listen/sessions/${encodeURIComponent(id)}/sync-me`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: user.id })
  });
  return result || { synced: false, reason: "Couldn't reach the server." };
}

function renderListenSessionCard(session, opts) {
  opts = opts || {};
  const hasProgress = typeof session.progressMs === "number" && typeof session.durationMs === "number" && session.durationMs > 0;
  const pct = hasProgress ? Math.min(100, (session.progressMs / session.durationMs) * 100) : 0;
  const dataAttrs = hasProgress
    ? `data-duration-ms="${session.durationMs}" data-progress-ms="${session.progressMs}" data-fetched-at="${session.updatedAt || Date.now()}" data-is-playing="${session.isPlaying ? "1" : "0"}"`
    : "";
  const viewer = Progress.getCurrentUser();
  const isHost = viewer && viewer.username === session.hostUsername;
  const isJoined = viewer && session.participants.includes(viewer.username);
  return `
    <div class="listen-session-card now-playing-widget ${session.isPlaying ? "is-playing" : "is-paused"}" data-session-id="${session.id}" ${dataAttrs}>
      <div class="now-playing-header">${SPOTIFY_GLYPH}<span>@${escapeHTML(session.hostUsername)}'s listening session</span></div>
      <div class="now-playing-body">
        ${session.albumArt ? `<img src="${session.albumArt}" alt="">` : `<div class="now-playing-art-fallback">♪</div>`}
        <div class="now-playing-info">
          <span class="now-playing-track">${escapeHTML(session.trackName || "Nothing playing yet")}</span>
          <span class="now-playing-artist">${escapeHTML(session.artistNames || "")}</span>
          ${hasProgress ? `
          <div class="now-playing-progress"><div class="now-playing-progress-fill" style="width:${pct.toFixed(2)}%"></div></div>
          <div class="now-playing-times">
            <span class="now-playing-elapsed">${formatNowPlayingClock(session.progressMs)}</span>
            <span class="now-playing-duration">${formatNowPlayingClock(session.durationMs)}</span>
          </div>` : ""}
        </div>
      </div>
      <div class="listen-session-actions">
        <span class="listen-session-count">${session.participants.length} listening</span>
        ${isHost
          ? `<button type="button" class="btn danger listen-end-btn" data-session-id="${session.id}">End session</button>`
          : isJoined
            ? `<button type="button" class="btn listen-sync-btn" data-session-id="${session.id}">Sync my Spotify</button>
               <button type="button" class="btn secondary listen-leave-btn" data-session-id="${session.id}">Leave</button>`
            : `<button type="button" class="btn primary listen-join-btn" data-session-id="${session.id}">Join &amp; sync</button>`}
      </div>
    </div>`;
}

document.addEventListener("click", async (e) => {
  const joinBtn = e.target.closest(".listen-join-btn");
  const leaveBtn = e.target.closest(".listen-leave-btn");
  const endBtn = e.target.closest(".listen-end-btn");
  const syncBtn = e.target.closest(".listen-sync-btn");
  if (!joinBtn && !leaveBtn && !endBtn && !syncBtn) return;

  if (!Progress.getCurrentUser()) { showModal("login"); return; }

  if (joinBtn) {
    joinBtn.disabled = true;
    const result = await joinListenSession(joinBtn.dataset.sessionId);
    if (result) {
      showToast("Joined. Syncing your Spotify…");
      const sync = await syncMeToListenSession(joinBtn.dataset.sessionId);
      showToast(sync.synced ? "Synced!" : (sync.reason || "Couldn't sync."));
      document.dispatchEvent(new CustomEvent("listen-session-updated"));
    } else {
      joinBtn.disabled = false;
      showToast("Couldn't join that session.");
    }
  } else if (leaveBtn) {
    leaveBtn.disabled = true;
    await leaveListenSession(leaveBtn.dataset.sessionId);
    document.dispatchEvent(new CustomEvent("listen-session-updated"));
  } else if (endBtn) {
    endBtn.disabled = true;
    await endListenSession(endBtn.dataset.sessionId);
    document.dispatchEvent(new CustomEvent("listen-session-updated"));
  } else if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.textContent = "Syncing…";
    const sync = await syncMeToListenSession(syncBtn.dataset.sessionId);
    showToast(sync.synced ? "Synced!" : (sync.reason || "Couldn't sync."));
    syncBtn.disabled = false;
    syncBtn.textContent = "Sync my Spotify";
  }
});

const YOUTUBE_URL_PATTERNS = [
  /^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:[^\s#]*&)?v=([a-zA-Z0-9_-]{11})(?:[&#][^\s]*)?$/i,
  /^https?:\/\/(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})(?:[?#][^\s]*)?$/i,
  /^https?:\/\/(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})(?:[?#][^\s]*)?$/i
];

function parseYouTubeLink(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  let id = null;
  for (const re of YOUTUBE_URL_PATTERNS) {
    const match = trimmed.match(re);
    if (match) { id = match[1]; break; }
  }
  if (!id) return null;
  return { id, start: parseYouTubeStart(trimmed) };
}

function parseYouTubeStart(raw) {
  const match = raw.match(/[?&#](?:t|start)=([0-9hms]+)/i);
  if (!match) return 0;
  const value = match[1];
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  let seconds = 0;
  (value.match(/\d+[hms]/gi) || []).forEach(part => {
    const n = parseInt(part, 10);
    const unit = part.slice(-1).toLowerCase();
    if (unit === "h") seconds += n * 3600;
    else if (unit === "m") seconds += n * 60;
    else seconds += n;
  });
  return seconds;
}

function renderYouTubeEmbed(raw) {
  const parsed = parseYouTubeLink(raw);
  if (!parsed) return "";
  const src = `https://www.youtube-nocookie.com/embed/${parsed.id}${parsed.start ? `?start=${parsed.start}` : ""}`;
  return `<div class="yt-embed" contenteditable="false"><iframe src="${src}" width="100%" height="315" title="YouTube video player" frameborder="0" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
}

function getEmoticonNames() {
  return [...EMOTICON_NAMES];
}

function shouldSkipEmoticonNode(node) {
  let current = node.parentNode;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tag = current.tagName;
    if (tag === "CODE" || tag === "PRE" || tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA") {
      return true;
    }
    current = current.parentNode;
  }
  return false;
}

function renderEmoticonsInHTML(html, cssClass = "inline-emoticon") {
  if (!html) return "";

  const template = document.createElement("template");
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let current;

  while ((current = walker.nextNode())) {
    if (!shouldSkipEmoticonNode(current)) textNodes.push(current);
  }

  const tokenRE = /:([a-z0-9_]+):/gi;

  textNodes.forEach(node => {
    const raw = node.nodeValue || "";
    tokenRE.lastIndex = 0;
    if (!tokenRE.test(raw)) return;

    tokenRE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    while ((match = tokenRE.exec(raw))) {
      const full = match[0];
      const name = (match[1] || "").toLowerCase();
      if (!EMOTICON_NAME_SET.has(name)) continue;

      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(raw.slice(lastIndex, match.index)));
      }

      const img = document.createElement("img");
      img.className = cssClass;
      img.src = `images/emoticons/${name}.png`;
      img.alt = name;
      frag.appendChild(img);

      lastIndex = match.index + full.length;
    }

    if (!lastIndex) return;
    if (lastIndex < raw.length) {
      frag.appendChild(document.createTextNode(raw.slice(lastIndex)));
    }
    node.replaceWith(frag);
  });

  return template.innerHTML;
}

function renderEmoticonsText(text, cssClass = "inline-emoticon") {
  return renderEmoticonsInHTML(escapeHTML(text || ""), cssClass);
}

function renderMentionsInHTML(html, cssClass = "mention-link") {
  if (!html) return "";

  const template = document.createElement("template");
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let current;

  while ((current = walker.nextNode())) {
    if (!shouldSkipEmoticonNode(current)) textNodes.push(current);
  }

  const tokenRE = /@([a-zA-Z0-9_.]+)/g;

  textNodes.forEach(node => {
    const raw = node.nodeValue || "";
    tokenRE.lastIndex = 0;
    if (!tokenRE.test(raw)) return;

    tokenRE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    let touched = false;

    while ((match = tokenRE.exec(raw))) {
      const full = match[0];
      const username = (match[1] || "").toLowerCase();
      const mentionedUser = Progress.getUser(username);
      if (!mentionedUser) continue;

      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(raw.slice(lastIndex, match.index)));
      }

      const link = document.createElement("a");
      link.className = cssClass;
      link.href = `user.html?id=${mentionedUser.id}`;
      link.textContent = full;
      frag.appendChild(link);

      lastIndex = match.index + full.length;
      touched = true;
    }

    if (!touched) return;
    if (lastIndex < raw.length) {
      frag.appendChild(document.createTextNode(raw.slice(lastIndex)));
    }
    node.replaceWith(frag);
  });

  return template.innerHTML;
}

function bootingUpHTML(opts) {
  const { title = "Waking up the server\u2026 \u{1F634}", padding = "80px 20px" } = opts || {};
  return `
    <div class="feed-empty" style="padding:${padding}; text-align:center;">
      <div class="error-illustration" style="max-width:280px;">
        <img src="images/404page.png" alt="Sleepy server illustration">
      </div>
      <h3>${title}</h3>
      <p>We run on free servers that snooze when nobody's around, so they need a minute or two to stretch and boot back up. Sorry for the wait &mdash; hang tight and try refreshing shortly!</p>
    </div>`;
}

function renderNav(activePage) {
  const root = document.getElementById("nav-root");
  if (!root) return;
  const user = Progress.getCurrentUser();
  const unseen = Progress.unseenCount();

  root.innerHTML = `
    <nav class="nav">
      <a href="index.html" class="nav-title">
        <span class="nav-logo-text">progress<span class="dot">.</span></span>
        <img class="nav-logo-image" src="images/nearheader.png" alt="" loading="lazy">
      </a>
      <div class="nav-right">
        <a href="chat.html" class="nav-new nav-chat-link">chat</a>
        ${user ? `<a href="write.html" class="nav-new">+ new entry</a>` : ""}
        <div class="bell-wrap">
          <button class="bell-btn" id="bellBtn" aria-label="Notifications">
            ${ICONS.bell}
            <span class="bell-badge ${unseen ? "" : "hidden"}" id="bellBadge">${unseen}</span>
          </button>
          <div class="dropdown notif" id="notifDropdown"></div>
        </div>
        <div class="avatar-wrap">
          <button class="avatar-btn" id="avatarBtn" aria-label="Account">
            ${avatarHTML(user)}
          </button>
          <div class="dropdown" id="accountDropdown"></div>
        </div>
      </div>
    </nav>
    ${user && activePage !== "write" && activePage !== "chat" ? `
    <a href="write.html" class="mobile-fab" aria-label="New entry">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
    </a>` : ""}
  `;

  renderNotifDropdown();
  renderAccountDropdown(user, activePage);
  wireDropdowns();
}

function renderNotifDropdown() {
  const el = document.getElementById("notifDropdown");
  if (!el) return;
  const notifs = Progress.getNotifications();

  const rows = notifs.length
    ? notifs.map(n => {
        const actorUser = Progress.getUser(n.actor);
        const actorHref = actorUser ? `user.html?id=${actorUser.id}` : `user.html?username=${encodeURIComponent(n.actor)}`;
        const actorText = `<strong><span class="username-link" data-href="${actorHref}">@${escapeHTML(n.actor)}</span></strong>`;
        const postHref = n.postId ? `post.html?id=${n.postId}` : "";
        const chatHref = n.type === "message"
          ? `chat.html?with=${encodeURIComponent(n.actor)}`
          : n.type === "mention"
            ? "chat.html"
            : "";
        const targetHref = postHref || chatHref;
        let text;

        if (n.type === "like") {
          text = `${actorText} liked your post "${renderEmoticonsText(n.postTitle, "notif-emoticon")}"`;
        } else if (n.type === "reply") {
          text = `${actorText} replied: "${renderEmoticonsText(n.body, "notif-emoticon")}"`;
        } else if (n.type === "follow") {
          text = `${actorText} started following you`;
        } else if (n.type === "badge") {
          const badge = BADGES[n.badgeId];
          const badgeName = badge ? badge.label : n.badgeId;
          text = `You've been awarded with '${escapeHTML(badgeName)}'!`;
        } else if (n.type === "message") {
          text = `${actorText} has messaged you: "${renderEmoticonsText(n.body, "notif-emoticon")}"`;
        } else if (n.type === "mention") {
          text = n.via === "comment"
            ? `${actorText} mentioned you in a comment on "${renderEmoticonsText(n.postTitle || "", "notif-emoticon")}": "${renderEmoticonsText(n.body, "notif-emoticon")}"`
            : n.via === "post"
              ? `${actorText} mentioned you in a post: "${renderEmoticonsText(n.postTitle || "", "notif-emoticon")}"`
              : `${actorText} mentioned you in chat: "${renderEmoticonsText(n.body, "notif-emoticon")}"`;
        } else {
          text = `${actorText} did something`;
        }

        return `
          <div class="notif-item" data-post-href="${targetHref}">
            <span class="dot-unread ${n.seen ? "seen" : ""}"></span>
            <div>
              <p>${text}</p>
              <time>${Progress.timeAgo(n.time)}</time>
            </div>
          </div>`;
      }).join("")
    : `<div class="notif-empty">Nothing yet. Publish something and come back.</div>`;

  el.innerHTML = `<div class="dropdown-header">Notifications</div>${rows}`;

  el.querySelectorAll('.username-link').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const href = link.dataset.href;
      if (href) location.href = href;
    });
  });

  el.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', () => {
      const href = item.dataset.postHref;
      if (href) location.href = href;
    });
  });
}

function renderAccountDropdown(user, activePage) {
  const el = document.getElementById("accountDropdown");
  if (!el) return;

  if (!user) {
    el.innerHTML = `
      <button class="dropdown-item" id="openLogin">Log in</button>
      <button class="dropdown-item" id="openSignup">Create account</button>
    `;
    return;
  }

  el.innerHTML = `
    <div class="dropdown-header">${user.name} &middot; @${user.username}</div>
    ${canBrowseUsers(user) ? `<a class="dropdown-item" href="users.html">Browse users</a>` : ""}
    <a class="dropdown-item" href="profile.html?tab=profile">Profile</a>
    <a class="dropdown-item" href="profile.html?tab=settings">Settings</a>
    <button class="dropdown-item danger" id="logoutBtn">Log out</button>
  `;
}

function closeAllDropdowns(except) {
  document.querySelectorAll(".dropdown.open").forEach(d => {
    if (d !== except) d.classList.remove("open");
  });
}

function wireDropdowns() {
  const bellBtn = document.getElementById("bellBtn");
  const avatarBtn = document.getElementById("avatarBtn");
  const notifDD = document.getElementById("notifDropdown");
  const accountDD = document.getElementById("accountDropdown");

  bellBtn && bellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = !notifDD.classList.contains("open");
    closeAllDropdowns();
    if (willOpen) {
      notifDD.classList.add("open");
      Progress.markAllSeen();
      renderNotifDropdown();
      const badge = document.getElementById("bellBadge");
      if (badge) badge.classList.add("hidden");
    }
  });

  avatarBtn && avatarBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = !accountDD.classList.contains("open");
    closeAllDropdowns();
    if (willOpen) accountDD.classList.add("open");
  });

  document.addEventListener("click", (e) => {
    if (!notifDD.contains(e.target) && e.target !== bellBtn && !accountDD.contains(e.target) && e.target !== avatarBtn) {
      closeAllDropdowns();
    }
  });
  notifDD && notifDD.addEventListener("click", (e) => e.stopPropagation());
  accountDD && accountDD.addEventListener("click", (e) => e.stopPropagation());

  const openLogin = document.getElementById("openLogin");
  const openSignup = document.getElementById("openSignup");
  const logoutBtn = document.getElementById("logoutBtn");

  openLogin && openLogin.addEventListener("click", () => showModal("login"));
  openSignup && openSignup.addEventListener("click", () => showModal("signup"));
  logoutBtn && logoutBtn.addEventListener("click", () => {
    Progress.logout();
    showToast("Signed out. See you soon.");
    setTimeout(() => location.reload(), 500);
  });
}

/* ============================================================
   AUTH MODALS
   ============================================================ */

function mountModals() {
  const root = document.getElementById("modal-root");
  if (!root) return;

  root.innerHTML = `
    <div class="modal-overlay" id="modalOverlay" aria-hidden="true">
      <div class="modal" role="dialog" aria-modal="true">
        <button class="modal-close" id="modalClose">&times;</button>

        <div id="loginPane">
          <h2>Welcome back</h2>
          <p class="sub">Log in to write, like, and follow along.</p>
          <div class="modal-error" id="loginError"></div>
          <div class="field">
            <label for="loginUsername">Username</label>
            <input id="loginUsername" type="text" autocomplete="username" placeholder="mara" autocapitalize="none" spellcheck="false">
          </div>
          <div class="field">
            <label for="loginPassword">Password</label>
            <input id="loginPassword" type="password" autocomplete="current-password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" autocapitalize="none" spellcheck="false">
          </div>
          <button class="modal-submit" id="loginSubmit">Log in</button>
          <p class="modal-switch">New here? <button id="toSignup">Create an account</button></p>
          <p class="modal-switch" style="margin-top:6px; font-size:11.5px;">Try the demo: <strong>mara</strong> / <strong>demo1234</strong></p>
        </div>

        <div id="signupPane" style="display:none;">
          <h2>Start your journal</h2>
          <p class="sub">It takes a minute. Everyone's welcome.</p>
          <div class="modal-error" id="signupError"></div>
          <div class="field">
            <label for="signupName">Display name</label>
            <input id="signupName" type="text" placeholder="Mara Studios" autocapitalize="words" spellcheck="false">
          </div>
          <div class="field">
            <label for="signupUsername">Username</label>
            <input id="signupUsername" type="text" placeholder="mara" autocapitalize="none" spellcheck="false">
          </div>
          <div class="field">
            <label for="signupPassword">Password</label>
            <input id="signupPassword" type="password" autocomplete="new-password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" autocapitalize="none" spellcheck="false">
          </div>
          <button class="modal-submit" id="signupSubmit">Create account</button>
          <p class="modal-switch">Already have one? <button id="toLogin">Log in</button></p>
        </div>
      </div>
    </div>
    <div class="toast" id="toast"></div>
  `;

  const overlay = document.getElementById("modalOverlay");
  document.getElementById("modalClose").addEventListener("click", hideModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) hideModal(); });

  document.getElementById("toSignup").addEventListener("click", () => showModal("signup"));
  document.getElementById("toLogin").addEventListener("click", () => showModal("login"));

  const loginSubmit = document.getElementById("loginSubmit");
  const signupSubmit = document.getElementById("signupSubmit");
  function setModalButtonState(button, enabled, label) {
    if (!button) return;
    button.disabled = !enabled;
    if (label) button.textContent = label;
  }

  function withWakingLabel(button, label) {
    const timer = setTimeout(() => {
      if (button.disabled) button.textContent = label;
    }, 4000);
    return () => clearTimeout(timer);
  }

  document.getElementById("loginSubmit").addEventListener("click", async () => {
    const username = document.getElementById("loginUsername").value;
    const password = document.getElementById("loginPassword").value;
    const errEl = document.getElementById("loginError");
    errEl.classList.remove("show");
    errEl.textContent = "";
    setModalButtonState(loginSubmit, false, "Logging in...");
    const stopWaking = withWakingLabel(loginSubmit, "Waking up server\u2026");
    const res = await Progress.login(username, password);
    stopWaking();
    setModalButtonState(loginSubmit, true, "Log in");
    if (!res.ok) {
      errEl.textContent = res.error;
      errEl.classList.add("show");
      return;
    }
    hideModal();
    showToast(`Welcome back, ${res.user.name.split(" ")[0]}.`);
    setTimeout(() => location.reload(), 500);
  });

  document.getElementById("signupSubmit").addEventListener("click", async () => {
    const name = document.getElementById("signupName").value;
    const username = document.getElementById("signupUsername").value;
    const password = document.getElementById("signupPassword").value;
    const errEl = document.getElementById("signupError");
    errEl.classList.remove("show");
    errEl.textContent = "";
    setModalButtonState(signupSubmit, false, "Creating...");
    const stopWaking = withWakingLabel(signupSubmit, "Waking up server\u2026");
    const res = await Progress.signup(username, name, password);
    stopWaking();
    setModalButtonState(signupSubmit, true, "Create account");
    if (!res.ok) {
      errEl.textContent = res.error;
      errEl.classList.add("show");
      return;
    }
    hideModal();
    showToast(res.offline
      ? "Account created locally. It'll finish syncing once the server's reachable."
      : `Account created. Welcome, ${res.user.name.split(" ")[0]}.`);
    setTimeout(() => location.reload(), 500);
  });

  ["loginUsername","loginPassword","signupName","signupUsername","signupPassword"].forEach(id => {
    document.getElementById(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const isLogin = id.startsWith("login");
        document.getElementById(isLogin ? "loginSubmit" : "signupSubmit").click();
      }
    });
  });
}

function showModal(which) {
  document.getElementById("loginError").classList.remove("show");
  document.getElementById("signupError").classList.remove("show");
  document.getElementById("loginPane").style.display = which === "login" ? "block" : "none";
  document.getElementById("signupPane").style.display = which === "signup" ? "block" : "none";
  const overlay = document.getElementById("modalOverlay");
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function hideModal() {
  const overlay = document.getElementById("modalOverlay");
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}

const THEME_STORAGE_KEY = "progressTheme";

// Dark mode lives entirely in localStorage rather than the user's account -
// it applies instantly on every page load (including for logged-out
// visitors) with zero server round-trip, and the tiny inline snippet in
// each page's <head> reads this same key before first paint, so there's
// no flash of the wrong theme while the page loads.
function getStoredTheme() {
  try { return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light"; } catch (e) { return "light"; }
}
function applyTheme(theme) {
  if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
}
function setTheme(theme) {
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch (e) {}
  applyTheme(theme);
}

function setDeviceMode() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || "");
  document.body.classList.toggle("mobile", isMobile);
}

function attachNavScrollWatcher() {
  const nav = document.querySelector(".nav");
  if (!nav) return;

  let lastScroll = window.scrollY || window.pageYOffset || 0;
  let ticking = false;

  const updateNav = () => {
    const current = window.scrollY || window.pageYOffset || 0;
    const scrolledDown = current > lastScroll + 6 && current > 20;
    const scrolledUp = current < lastScroll - 6 || current <= 20;

    if (scrolledDown) nav.classList.add("hidden");
    if (scrolledUp) nav.classList.remove("hidden");

    lastScroll = current;
    ticking = false;
  };

  const onScroll = () => {
    if (!ticking) {
      window.requestAnimationFrame(updateNav);
      ticking = true;
    }
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  updateNav();
}

function applyLockedOverlayIfNeeded() {
  const user = Progress.getCurrentUser();
  if (!user || !user.locked) return;
  document.body.classList.add("account-locked");
  const main = document.querySelector("main");
  if (main && !main.querySelector(".locked-screen")) {
    main.innerHTML = `
      <div class="locked-screen">
        <div class="error-illustration">
          <img src="images/404page.png" alt="Account locked illustration">
        </div>
        <h1>Your account has been locked</h1>
        <p>If you think this is a mistake, you can <a href="https://forms.gle/4p5gh4ocT3K6WQuU6" target="_blank" rel="noopener noreferrer">appeal here</a>.</p>
      </div>
    `;
  }
}

let bannedMainObserver = null;

function lockMainToBannedScreen() {
  const main = document.querySelector("main");
  if (!main) return;
  const bannedHTML = `
    <div class="locked-screen banned-screen">
      <div class="error-illustration">
        <img src="images/404page.png" alt="Account banned illustration">
      </div>
      <h1>This account has been banned</h1>
      <p>Your account has been suspended for violating our community guidelines. If you believe this was a mistake, you're welcome to submit an appeal and we'll take a look.</p>
      <a class="btn primary banned-appeal-btn" href="https://forms.gle/FBDevngpyBNgWVAQ7" target="_blank" rel="noopener noreferrer">Submit an appeal</a>
    </div>
  `;
  const enforce = () => {
    if (!main.querySelector(".banned-screen")) main.innerHTML = bannedHTML;
  };
  enforce();
  if (bannedMainObserver) bannedMainObserver.disconnect();
  bannedMainObserver = new MutationObserver(enforce);
  bannedMainObserver.observe(main, { childList: true });
}

async function applyBannedOverlayIfNeeded() {
  const user = Progress.getCurrentUser();
  if (!user) return false;
  let banned = !!user.banned;
  const fresh = await apiFetch(`/api/users/${user.id}`);
  if (fresh) banned = !!fresh.banned;
  if (!banned) return false;
  document.body.classList.add("account-banned");
  lockMainToBannedScreen();
  return true;
}

// Discord-style presence: a single persistent WebSocket connection, opened
// once per page and held open the whole time someone's on the site. Being
// "online" is defined purely by that connection existing - no periodic
// pings, no polling on the write side, nothing repeated at all. The
// connection joins a dedicated "presence" room that never carries actual
// chat traffic, so it stays idle except for the connect/disconnect signal
// itself. Skipped on chat.html, which already opens its own connection for
// real chat - no need for a second, redundant one there.
let presenceSocket = null;
function openPresenceSocket(activePage) {
  if (activePage === "chat") return;
  const user = Progress.getCurrentUser();
  if (!user) return;
  try {
    // Must point at the actual backend (API_BASE, e.g. Render), not
    // location.host - the current page's own origin (Vercel) doesn't run
    // a WebSocket server at all, which is exactly why this was failing
    // with NS_ERROR_WEBSOCKET... every request.
    const wsBase = API_BASE.replace(/^http/, "ws");
    presenceSocket = new WebSocket(`${wsBase}/ws/chat?username=${encodeURIComponent(user.username)}&room=presence`);

    // Tells the server whether THIS specific tab is currently focused, so
    // someone can show as "Idle" rather than fully "Online" while every
    // tab they have open is backgrounded (Discord calls this state Idle).
    // Sent once right after connecting (correcting the server's default
    // "active" assumption if the tab actually started out hidden) and
    // again on every subsequent visibility change.
    const sendActivity = () => {
      if (presenceSocket.readyState === WebSocket.OPEN) {
        presenceSocket.send(JSON.stringify({ type: "activity", active: !document.hidden }));
      }
    };
    presenceSocket.addEventListener("open", sendActivity);
    document.addEventListener("visibilitychange", sendActivity);

    // The server already broadcasts a "presence" message to everyone in
    // this room the instant anyone connects/disconnects/changes tab focus -
    // re-dispatch that as a plain DOM event so any page (e.g. user.html)
    // can react to it immediately, instead of relying purely on a polling
    // interval.
    presenceSocket.addEventListener("message", (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch (e) { return; }
      if (data.type === "global-presence") {
        document.dispatchEvent(new CustomEvent("presence-update", { detail: data.statuses || {} }));
      }
    });
    window.addEventListener("beforeunload", () => {
      try { presenceSocket.close(); } catch (e) {}
    });
  } catch (e) {
    // If this fails for any reason, the page still works fine - presence
    // just won't reflect while this connection is unavailable.
  }
}

function initShell(activePage) {
  applyTheme(getStoredTheme());
  setDeviceMode();
  window.addEventListener("resize", setDeviceMode);
  renderNav(activePage);
  mountModals();
  attachNavScrollWatcher();
  openPresenceSocket(activePage);
  (async () => {
    const banned = await applyBannedOverlayIfNeeded();
    if (!banned) applyLockedOverlayIfNeeded();
  })();
  return Progress.loadFromApi()
    .catch(() => {})
    .then(async () => {
      const banned = await applyBannedOverlayIfNeeded();
      if (!banned) applyLockedOverlayIfNeeded();
      const badge = document.getElementById("bellBadge");
      if (badge) {
        const unseen = Progress.unseenCount();
        badge.textContent = unseen;
        badge.classList.toggle("hidden", !unseen);
      }
      const notifDD = document.getElementById("notifDropdown");
      if (notifDD && notifDD.classList.contains("open")) {
        renderNotifDropdown();
      }
    });
}