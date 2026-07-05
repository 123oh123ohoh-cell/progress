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
        let text;

        if (n.type === "like") {
          text = `${actorText} liked your post "${escapeHTML(n.postTitle)}"`;
        } else if (n.type === "reply") {
          text = `${actorText} replied: "${escapeHTML(n.body)}"`;
        } else if (n.type === "follow") {
          text = `${actorText} started following you`;
        } else {
          text = `${actorText} did something`;
        }

        return `
          <div class="notif-item" data-post-href="${postHref}">
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
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal">
        <button class="modal-close" id="modalClose">&times;</button>

        <div id="loginPane">
          <h2>Welcome back</h2>
          <p class="sub">Log in to write, like, and follow along.</p>
          <div class="modal-error" id="loginError"></div>
          <div class="field">
            <label for="loginUsername">Username</label>
            <input id="loginUsername" type="text" autocomplete="username" placeholder="mara">
          </div>
          <div class="field">
            <label for="loginPassword">Password</label>
            <input id="loginPassword" type="password" autocomplete="current-password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;">
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
            <input id="signupName" type="text" placeholder="Mara Studios">
          </div>
          <div class="field">
            <label for="signupUsername">Username</label>
            <input id="signupUsername" type="text" placeholder="mara">
          </div>
          <div class="field">
            <label for="signupPassword">Password</label>
            <input id="signupPassword" type="password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;">
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

  document.getElementById("loginSubmit").addEventListener("click", async () => {
    const username = document.getElementById("loginUsername").value;
    const password = document.getElementById("loginPassword").value;
    const res = await Progress.login(username, password);
    const errEl = document.getElementById("loginError");
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
    const res = await Progress.signup(username, name, password);
    const errEl = document.getElementById("signupError");
    if (!res.ok) {
      errEl.textContent = res.error;
      errEl.classList.add("show");
      return;
    }
    hideModal();
    showToast(`Account created. Welcome, ${res.user.name.split(" ")[0]}.`);
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
  document.getElementById("modalOverlay").classList.add("open");
}

function hideModal() {
  document.getElementById("modalOverlay").classList.remove("open");
}

function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
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

/* Call this once per page after DOM is ready */
function initShell(activePage) {
  Progress.loadFromApi()
    .catch(() => {})
    .finally(() => {
      renderNav(activePage);
      mountModals();
      attachNavScrollWatcher();
    });
}
