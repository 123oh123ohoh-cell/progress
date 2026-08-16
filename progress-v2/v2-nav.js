/* ============================================================
   PROGRESS v2 — Shared nav bootstrap
   Include after data.js + app.js on every v2 page.
   Call: v2BootNav(initShellPromise)
   ============================================================ */

function v2BootNav(shellReady) {
  /* scroll shadow */
  const nav = document.getElementById("v2Nav");
  if (nav) {
    window.addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 8), { passive: true });
  }

  /* update nav + mobile profile tab once auth resolves */
  if (shellReady && shellReady.then) {
    shellReady.then(() => {
      const me = Progress.getCurrentUser();
      _v2ApplyUser(me);
      _v2BetaBadge(me);
    }).catch(() => {});
  } else {
    /* no shell (standalone page) — nothing to do */
  }
}

function _v2ApplyUser(me) {
  const navRight = document.getElementById("v2NavRight");
  if (!navRight) return;

  if (!me) {
    /* not logged in — show login + join buttons */
    navRight.innerHTML = `
      <a href="signup.html" class="v2-btn v2-btn--ghost" style="font-size:13px;padding:7px 15px;">Log in</a>
      <a href="signup.html" class="v2-btn v2-btn--dark"  style="font-size:13px;padding:7px 15px;">Join</a>`;
    const joinBtn = document.getElementById("v2JoinBtn");
    if (joinBtn) joinBtn.style.display = "";
    return;
  }

  const ini = (me.name || me.username).split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const avEl = me.avatar
    ? `<img src="${_esc(me.avatar)}" alt="" loading="lazy">`
    : ini;

  const adminItem = (me.adminRole && ["owner","moderator","analyst","email_writer"].includes(me.adminRole))
    ? `<a class="v2-dd-item" href="admin.html">Admin</a>` : "";

  navRight.innerHTML = `
    <a href="write.html" class="v2-btn v2-btn--dark" style="font-size:13px;padding:7px 15px;">
      <svg viewBox="0 0 16 16" fill="none" width="12" height="12" aria-hidden="true"><path d="M11.5 2 14 4.5l-8.5 8.5L3 14l.5-2.5L11.5 2Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
      Write
    </a>
    <div style="position:relative;">
      <div class="v2-nav-av" id="v2AvatarBtn" tabindex="0" role="button" aria-haspopup="true" aria-label="Account menu">${avEl}</div>
      <div class="v2-dropdown" id="v2AvatarDropdown" role="menu">
        <a class="v2-dd-item" href="profile.html">Profile</a>
        <a class="v2-dd-item" href="user.html?id=${_esc(me.username)}">My journal</a>
        <a class="v2-dd-item" href="write.html">Write</a>
        ${adminItem}
        <button class="v2-dd-item danger" id="v2LogoutBtn">Sign out</button>
      </div>
    </div>`;

  const btn = document.getElementById("v2AvatarBtn");
  const dd  = document.getElementById("v2AvatarDropdown");
  if (btn && dd) {
    btn.addEventListener("click", e => { e.stopPropagation(); dd.classList.toggle("open"); });
    document.addEventListener("click", () => dd.classList.remove("open"));
  }

  const logoutBtn = document.getElementById("v2LogoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (typeof Progress.logout === "function") Progress.logout();
      else { localStorage.clear(); location.href = "index.html"; }
    });
  }

  /* mobile profile tab */
  const mobProfile = document.getElementById("v2MobProfile");
  if (mobProfile) mobProfile.href = `user.html?id=${_esc(me.username)}`;

  /* sidebar join btn */
  const joinBtn = document.getElementById("v2JoinBtn");
  if (joinBtn) joinBtn.style.display = "none";

  /* streak in sidebar */
  const streakBox = document.getElementById("v2StreakBox");
  if (streakBox && me.streak >= 2) {
    streakBox.style.display = "block";
    streakBox.innerHTML = `
      <div style="background:var(--v2-paper);border:1px solid var(--v2-border);border-radius:var(--r-md);padding:12px 14px;display:flex;align-items:center;gap:10px;box-shadow:var(--sh-xs);">
        <span style="font-size:20px;">🔥</span>
        <div>
          <div style="font-weight:700;font-size:13px;color:var(--v2-ink);">${me.streak}-day streak</div>
          <div style="font-size:11px;color:var(--v2-muted);">Keep writing!</div>
        </div>
      </div>`;
  }
}

/* ============================================================
   BETA BADGE — shown in v2 nav for beta-eligible users.
   Adds a "v2 beta" chip + "← Switch to v1" in the avatar dropdown.
   ============================================================ */
function _v2BetaBadge(me) {
  if (!me) return;
  /* Mirror the beta-access check from app.js _isBetaUser */
  const isBeta = (typeof BROWSE_ALLOWED_USERNAMES !== "undefined" && BROWSE_ALLOWED_USERNAMES.has(me.username))
    || !!(me.adminRole && ["owner","tester"].includes(me.adminRole));
  if (!isBeta) return;

  /* "v2 beta" chip injected into the sticky nav */
  const nav = document.getElementById("v2Nav");
  if (nav) {
    const chip = document.createElement("span");
    chip.id = "v2BetaChip";
    chip.textContent = "v2 beta";
    chip.style.cssText = [
      "font-family:var(--v2-font-m,monospace)",
      "font-size:9px",
      "font-weight:700",
      "letter-spacing:.07em",
      "text-transform:uppercase",
      "background:var(--v2-accent)",
      "color:#fff",
      "border-radius:4px",
      "padding:2px 7px",
      "flex-shrink:0",
      "align-self:center",
      "margin-left:4px",
    ].join(";");
    /* Insert before v2NavRight so it sits left of the avatar */
    const navRight = document.getElementById("v2NavRight");
    nav.insertBefore(chip, navRight || null);
  }

  /* "← Switch to v1" inside the avatar dropdown */
  const dd = document.getElementById("v2AvatarDropdown");
  if (dd) {
    const divider = document.createElement("div");
    divider.style.cssText = "border-top:1px solid var(--v2-border);margin:4px 8px;";

    const v1Btn = document.createElement("button");
    v1Btn.className = "v2-dd-item";
    v1Btn.style.cssText = "font-size:12px;color:var(--v2-muted);gap:6px;";
    v1Btn.innerHTML = `<span style="margin-right:2px;">←</span> Switch to original`;
    v1Btn.title = "Turn off v2 and return to v1";
    v1Btn.addEventListener("click", () => {
      localStorage.removeItem("progressV2");
      /* Navigate to the v1 equivalent: strip /progress-v2/ from path */
      const page = location.pathname.split("/progress-v2/")[1] || "index.html";
      location.replace("../" + page + location.search + location.hash);
    });

    dd.appendChild(divider);
    dd.appendChild(v1Btn);
  }
}

function _esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

/* Common mobile nav snippet — call to get the HTML string.
   Pass the active tab key: "feed" | "explore" | "write" | "chat" | "profile" */
function v2MobNavHTML(active) {
  const tabs = [
    { key:"feed",    href:"index.html",   label:"Feed",    icon:`<path d="M2.5 10 11 3l8.5 7V19a.8.8 0 0 1-.8.8H3.3a.8.8 0 0 1-.8-.8V10Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>` },
    { key:"explore", href:"explore.html", label:"Explore", icon:`<circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.7"/><path d="m16 16 3.5 3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>` },
    { key:"write",   href:"write.html",   label:"Write",   icon:`<path d="M16.5 3 19 5.5l-13 13L3 20l.5-3.5 13-13Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>`, cls:"v2-mob-tab--write" },
    { key:"chat",    href:"chat.html",    label:"Chat",    icon:`<path d="M19.5 11c0 4.14-3.36 7.5-7.5 7.5A7.48 7.48 0 0 1 7.3 17.4L3 18.5l1.1-4.3A7.48 7.48 0 0 1 4.5 11C4.5 6.86 7.86 3.5 12 3.5s7.5 3.36 7.5 7.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>` },
    { key:"profile", href:"profile.html", label:"Profile", icon:`<circle cx="11" cy="7.5" r="3.5" stroke="currentColor" stroke-width="1.7"/><path d="M4 19.5c0-3.87 3.13-7 7-7h.5c3.87 0 7 3.13 7 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>`, id:"v2MobProfile" },
  ];
  return `<nav class="v2-mob-nav" aria-label="Mobile navigation">
  ${tabs.map(t => `
    <a href="${t.href}" class="v2-mob-tab${active===t.key?" v2-mob-tab--active":""}${t.cls?" "+t.cls:""}"${t.id?` id="${t.id}"`:""}aria-label="${t.label}">
      <svg viewBox="0 0 22 22" fill="none" width="21" height="21" aria-hidden="true">${t.icon}</svg>
      <span>${t.label}</span>
    </a>`).join("")}
  </nav>`;
}
