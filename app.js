/* Streamify app.js - FULL FILE
   Supports:
   - GAS+Sheets JSONP backend
   - Auth modal (login/signup)
   - Catalog + search
   - Audio tracks + Spotify embed tracks
*/

const CONFIG = {
  // ✅ PUT YOUR WEB APP /exec URL HERE:
  // Example: "https://script.google.com/macros/s/AKfycb.../exec"
  API_URL: "https://script.google.com/macros/s/AKfycbz1b6U20wPzTbj80zPmkFjr1dA36fMcANZN1m_qzqCUh13ig7DNw5XhBYZ1Eh5F-r28/exec",
  TOKEN_KEY: "mymusic_token",
  EMAIL_KEY: "mymusic_email",
};

const state = {
  token: localStorage.getItem(CONFIG.TOKEN_KEY) || "",
  email: localStorage.getItem(CONFIG.EMAIL_KEY) || "",
  mode: "all",           // "all" | "likes"
  tracks: [],
  likes: new Set(),
  queue: [],
  currentIndex: -1,
  playingMode: "none",   // "audio" | "embed" | "none"
};

const el = {
  grid: document.getElementById("grid"),
  empty: document.getElementById("empty"),
  search: document.getElementById("search"),
  btnClear: document.getElementById("btnClear"),
  btnRefresh: document.getElementById("btnRefresh"),
  btnHome: document.getElementById("btnHome"),
  btnLikes: document.getElementById("btnLikes"),
  countPill: document.getElementById("countPill"),
  likesPill: document.getElementById("likesPill"),

  btnAuth: document.getElementById("btnAuth"),
  authLabel: document.getElementById("authLabel"),
  authTag: document.getElementById("authTag"),
  btnLogout: document.getElementById("btnLogout"),
  userEmail: document.getElementById("userEmail"),

  btnImporter: document.getElementById("btnImporter"),

  // Player
  audio: document.getElementById("audio"),
  btnPrev: document.getElementById("btnPrev"),
  btnPlay: document.getElementById("btnPlay"),
  btnNext: document.getElementById("btnNext"),
  seek: document.getElementById("seek"),
  tCur: document.getElementById("tCur"),
  tDur: document.getElementById("tDur"),
  npImg: document.getElementById("npImg"),
  npTitle: document.getElementById("npTitle"),
  npArtist: document.getElementById("npArtist"),

  // Auth modal
  authModal: document.getElementById("authModal"),
  authClose: document.getElementById("authClose"),
  authTitle: document.getElementById("authTitle"),
  authEmail: document.getElementById("authEmail"),
  authPass: document.getElementById("authPass"),
  authErr: document.getElementById("authErr"),
  btnLogin: document.getElementById("btnLogin"),
  btnSignup: document.getElementById("btnSignup"),

  // Embed modal
  embedModal: document.getElementById("embedModal"),
  embedClose: document.getElementById("embedClose"),
  embedTitle: document.getElementById("embedTitle"),
  embedFrame: document.getElementById("embedFrame"),
};

// ----------------------- JSONP -----------------------
function jsonp(action, params = {}) {
  return new Promise((resolve, reject) => {
    if (!CONFIG.API_URL || CONFIG.API_URL.includes("PASTE_YOUR_GAS_EXEC_URL_HERE")) {
      reject(new Error("Set CONFIG.API_URL in app.js to your GAS /exec URL."));
      return;
    }

    const cbName = "__cb_" + Math.random().toString(36).slice(2);
    const url = new URL(CONFIG.API_URL);

    url.searchParams.set("action", action);
    url.searchParams.set("callback", cbName);

    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }

    const script = document.createElement("script");
    const cleanup = () => {
      try { delete window[cbName]; } catch (_) {}
      script.remove();
    };

    window[cbName] = (data) => {
      cleanup();
      if (!data || data.ok === false) reject(new Error((data && data.error) || "API error"));
      else resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Network error loading JSONP script"));
    };

    script.src = url.toString();
    document.head.appendChild(script);
  });
}

// ----------------------- Helpers -----------------------
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function coverFor(t) {
  return t.artworkUrl || "";
}

function displayTitle(t) {
  if (t.title) return t.title;
  // For embed rows imported by ID only, title might be blank.
  if (t.spotifyUrl) return "Spotify Track";
  return "Unknown Track";
}
function displayArtist(t) {
  if (t.artist) return t.artist;
  if (t.spotifyUrl) return "Spotify";
  return "Unknown Artist";
}

function isSpotifyEmbed(t) {
  return (t.sourceType === "spotify_embed") || (t.embedUrl && t.embedUrl.includes("open.spotify.com/embed"));
}
function isMetaOnly(t) {
  return (t.sourceType === "meta_only") || (!t.audioUrl && !t.embedUrl);
}
function isAudioTrack(t) {
  return !!t.audioUrl && (!t.sourceType || t.sourceType === "audio");
}

function requireTokenOrAuth() {
  if (!state.token) {
    openAuthModal();
    throw new Error("Not signed in");
  }
}

// ----------------------- Auth UI -----------------------
function openAuthModal() {
  el.authErr.textContent = "";
  el.authModal.style.display = "flex";
  el.authTitle.textContent = "Sign in";
  el.authEmail.value = state.email || "";
  el.authPass.value = "";
  setTimeout(() => el.authEmail.focus(), 50);
}

function closeAuthModal() {
  el.authModal.style.display = "none";
}

function setSignedOut() {
  state.token = "";
  state.email = "";
  localStorage.removeItem(CONFIG.TOKEN_KEY);
  localStorage.removeItem(CONFIG.EMAIL_KEY);
  state.likes = new Set();
  updateAuthUI();
}

function setSignedIn(token, email) {
  state.token = token;
  state.email = email;
  localStorage.setItem(CONFIG.TOKEN_KEY, token);
  localStorage.setItem(CONFIG.EMAIL_KEY, email);
  updateAuthUI();
}

function updateAuthUI() {
  if (state.token) {
    el.authLabel.textContent = "Account";
    el.authTag.textContent = "Signed in";
    el.userEmail.textContent = state.email || "Signed in";
    el.btnLogout.style.display = "flex";
  } else {
    el.authLabel.textContent = "Sign in";
    el.authTag.textContent = "Guest";
    el.userEmail.textContent = "Not signed in";
    el.btnLogout.style.display = "none";
  }
}

// ----------------------- Embed modal -----------------------
function openEmbed(track) {
  const title = `${displayTitle(track)} — ${displayArtist(track)}`;
  el.embedTitle.textContent = title;
  el.embedFrame.src = track.embedUrl || "";
  el.embedModal.style.display = "flex";

  // Stop audio if any
  try { el.audio.pause(); } catch (_) {}
  try { el.audio.src = ""; } catch (_) {}

  state.playingMode = "embed";
  renderNowPlaying(track);
}

function closeEmbed() {
  el.embedModal.style.display = "none";
  el.embedFrame.src = "";
  if (state.playingMode === "embed") state.playingMode = "none";
}

// ----------------------- Data load -----------------------
async function loadCatalog() {
  requireTokenOrAuth();
  const res = await jsonp("catalog", { token: state.token, limit: 800, offset: 0 });
  state.tracks = Array.isArray(res.tracks) ? res.tracks : [];
  el.countPill.textContent = String(state.tracks.length);
}

async function loadLikes() {
  if (!state.token) { state.likes = new Set(); el.likesPill.textContent = "0"; return; }
  const res = await jsonp("likes", { token: state.token });
  const ids = Array.isArray(res.trackIds) ? res.trackIds : [];
  state.likes = new Set(ids);
  el.likesPill.textContent = String(state.likes.size);
}

// ----------------------- Render -----------------------
function currentList() {
  let list = state.tracks;

  // Search filter
  const q = (el.search.value || "").trim().toLowerCase();
  if (q) {
    list = list.filter(t => {
      const s = `${t.title||""} ${t.artist||""} ${t.album||""}`.toLowerCase();
      return s.includes(q);
    });
  }

  // Mode filter
  if (state.mode === "likes") {
    list = list.filter(t => state.likes.has(t.trackId));
  }

  return list;
}

function renderGrid() {
  const list = currentList();
  el.grid.innerHTML = "";
  el.empty.style.display = list.length ? "none" : "block";

  for (let idx = 0; idx < list.length; idx++) {
    const t = list[idx];

    const card = document.createElement("div");
    card.className = "card";

    const cover = document.createElement("div");
    cover.className = "cover";
    const imgUrl = coverFor(t);
    if (imgUrl) {
      const img = document.createElement("img");
      img.src = imgUrl;
      img.loading = "lazy";
      cover.appendChild(img);
    }
    card.appendChild(cover);

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = displayTitle(t);
    card.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${displayArtist(t)}${t.album ? " • " + t.album : ""}`;
    card.appendChild(meta);

    const row = document.createElement("div");
    row.className = "row2";

    const tag = document.createElement("div");
    tag.className = "tag";
    if (isAudioTrack(t)) { tag.classList.add("tagGreen"); tag.textContent = "AUDIO"; }
    else if (isSpotifyEmbed(t)) { tag.classList.add("tagGreen"); tag.textContent = "SPOTIFY"; }
    else { tag.classList.add("tagRed"); tag.textContent = "UNPLAYABLE"; }

    const like = document.createElement("button");
    like.className = "btn";
    like.style.padding = "6px 10px";
    like.textContent = state.likes.has(t.trackId) ? "♥" : "♡";
    like.title = "Like";
    like.onclick = async (ev) => {
      ev.stopPropagation();
      try {
        requireTokenOrAuth();
        if (state.likes.has(t.trackId)) {
          await jsonp("unlike", { token: state.token, trackId: t.trackId });
          state.likes.delete(t.trackId);
        } else {
          await jsonp("like", { token: state.token, trackId: t.trackId });
          state.likes.add(t.trackId);
        }
        el.likesPill.textContent = String(state.likes.size);
        like.textContent = state.likes.has(t.trackId) ? "♥" : "♡";
      } catch (e) {
        console.error(e);
        alert(e.message || String(e));
      }
    };

    row.appendChild(tag);
    row.appendChild(like);
    card.appendChild(row);

    card.onclick = () => {
      // Build queue from what user is currently viewing (search/mode filtered)
      const q = currentList();
      state.queue = q;
      // find index within queue
      const qi = q.findIndex(x => x.trackId === t.trackId);
      playIndex(qi >= 0 ? qi : idx).catch(err => {
        console.error(err);
        alert(err.message || String(err));
      });
    };

    el.grid.appendChild(card);
  }
}

function renderNowPlaying(track) {
  const t = track || state.queue[state.currentIndex] || null;
  if (!t) {
    el.npTitle.textContent = "Nothing playing";
    el.npArtist.textContent = "—";
    el.npImg.src = "";
    el.tCur.textContent = "0:00";
    el.tDur.textContent = "0:00";
    el.seek.value = 0;
    return;
  }

  el.npTitle.textContent = displayTitle(t);
  el.npArtist.textContent = displayArtist(t);
  el.npImg.src = coverFor(t) || "";
}

// ----------------------- Player logic -----------------------
async function playIndex(i) {
  const t = state.queue[i];
  if (!t) return;

  state.currentIndex = i;

  // META only: not playable
  if (isMetaOnly(t)) {
    state.playingMode = "none";
    renderNowPlaying(t);
    alert("This track is not playable yet (no audioUrl or embedUrl).");
    return;
  }

  // SPOTIFY EMBED
  if (isSpotifyEmbed(t)) {
    openEmbed(t);
    el.btnPlay.textContent = "▶"; // audio play state not relevant
    return;
  }

  // AUDIO
  if (!t.audioUrl) {
    state.playingMode = "none";
    renderNowPlaying(t);
    alert("Track has no audio URL.");
    return;
  }

  // Close embed if open
  closeEmbed();

  state.playingMode = "audio";
  el.audio.src = t.audioUrl;

  renderNowPlaying(t);

  try {
    await el.audio.play();
    el.btnPlay.textContent = "❚❚";
  } catch (e) {
    el.btnPlay.textContent = "▶";
    throw e;
  }
}

function togglePlayPause() {
  if (state.playingMode !== "audio") {
    // If embed track is open, we can't control it reliably; just show modal if current is embed
    const t = state.queue[state.currentIndex];
    if (t && isSpotifyEmbed(t)) openEmbed(t);
    return;
  }

  if (el.audio.paused) {
    el.audio.play().then(() => el.btnPlay.textContent = "❚❚").catch(console.error);
  } else {
    el.audio.pause();
    el.btnPlay.textContent = "▶";
  }
}

function nextTrack() {
  if (!state.queue.length) return;
  const i = (state.currentIndex + 1) % state.queue.length;
  playIndex(i).catch(console.error);
}
function prevTrack() {
  if (!state.queue.length) return;
  const i = (state.currentIndex - 1 + state.queue.length) % state.queue.length;
  playIndex(i).catch(console.error);
}

// Audio events
el.audio.addEventListener("loadedmetadata", () => {
  el.tDur.textContent = fmtTime(el.audio.duration);
});
el.audio.addEventListener("timeupdate", () => {
  el.tCur.textContent = fmtTime(el.audio.currentTime);
  const dur = el.audio.duration || 0;
  if (dur > 0) {
    el.seek.value = Math.floor((el.audio.currentTime / dur) * 1000);
  } else {
    el.seek.value = 0;
  }
});
el.audio.addEventListener("ended", () => {
  nextTrack();
});

// Seek
el.seek.addEventListener("input", () => {
  if (state.playingMode !== "audio") return;
  const dur = el.audio.duration || 0;
  if (dur <= 0) return;
  const pct = Number(el.seek.value) / 1000;
  el.audio.currentTime = pct * dur;
});

// ----------------------- Wire UI -----------------------
el.btnAuth.onclick = () => openAuthModal();
el.authClose.onclick = () => closeAuthModal();
el.authModal.addEventListener("click", (e) => { if (e.target === el.authModal) closeAuthModal(); });

el.btnLogin.onclick = async () => {
  el.authErr.textContent = "";
  try {
    const email = el.authEmail.value.trim();
    const password = el.authPass.value.trim();
    if (!email || !password) throw new Error("Enter email + password");
    const res = await jsonp("login", { email, password });
    setSignedIn(res.token, res.email || email);
    closeAuthModal();
    await refreshAll();
  } catch (e) {
    el.authErr.textContent = e.message || String(e);
  }
};

el.btnSignup.onclick = async () => {
  el.authErr.textContent = "";
  try {
    const email = el.authEmail.value.trim();
    const password = el.authPass.value.trim();
    if (!email || !password) throw new Error("Enter email + password");
    const res = await jsonp("signup", { email, password });
    setSignedIn(res.token, res.email || email);
    closeAuthModal();
    await refreshAll();
  } catch (e) {
    el.authErr.textContent = e.message || String(e);
  }
};

el.btnLogout.onclick = async () => {
  setSignedOut();
  state.tracks = [];
  state.queue = [];
  state.currentIndex = -1;
  renderGrid();
  renderNowPlaying(null);
};

el.btnRefresh.onclick = () => refreshAll().catch(e => alert(e.message || String(e)));

el.btnHome.onclick = () => { state.mode = "all"; renderGrid(); };
el.btnLikes.onclick = () => { state.mode = "likes"; renderGrid(); };

el.btnClear.onclick = () => { el.search.value = ""; renderGrid(); };
el.search.addEventListener("input", () => renderGrid());

el.btnPrev.onclick = () => prevTrack();
el.btnNext.onclick = () => nextTrack();
el.btnPlay.onclick = () => togglePlayPause();

el.embedClose.onclick = () => closeEmbed();
el.embedModal.addEventListener("click", (e) => { if (e.target === el.embedModal) closeEmbed(); });

el.btnImporter.onclick = () => {
  if (!CONFIG.API_URL || CONFIG.API_URL.includes("PASTE_YOUR_GAS_EXEC_URL_HERE")) {
    alert("Set CONFIG.API_URL in app.js first.");
    return;
  }
  const u = new URL(CONFIG.API_URL);
  u.searchParams.set("page", "admin");
  window.open(u.toString(), "_blank", "noopener,noreferrer");
};

// ----------------------- Refresh -----------------------
async function refreshAll() {
  updateAuthUI();
  if (!state.token) {
    renderGrid();
    renderNowPlaying(null);
    return;
  }
  await loadCatalog();
  await loadLikes();
  renderGrid();
  renderNowPlaying(null);
}

(async function init() {
  updateAuthUI();
  // If user has a stored token, try loading data.
  if (state.token) {
    try { await refreshAll(); }
    catch (e) {
      console.warn("Token invalid or backend error:", e);
      setSignedOut();
      renderGrid();
    }
  } else {
    renderGrid();
  }
})();
