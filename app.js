/* Streamify app.js - FULL FILE
   - Auth modal
   - Catalog + Search + Likes
   - Audio player + Spotify embed modal
   - Volume slider for audio (embed volume can't be controlled)
*/

const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbybXA6qf_CdUZPTScJ-CQMglbGy-jYGQVsN7jOBW9MPDp0YYwzxfpxRc6oJnlLGRZ8y/exec",
  TOKEN_KEY: "mymusic_token",
  EMAIL_KEY: "mymusic_email",
};

const state = {
  token: localStorage.getItem(CONFIG.TOKEN_KEY) || "",
  email: localStorage.getItem(CONFIG.EMAIL_KEY) || "",
  mode: "all",
  tracks: [],
  likes: new Set(),
  queue: [],
  currentIndex: -1,
  playingMode: "none", // "audio" | "embed" | "none"
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

  vol: document.getElementById("vol"),
  volMode: document.getElementById("volMode"),

  authModal: document.getElementById("authModal"),
  authClose: document.getElementById("authClose"),
  authEmail: document.getElementById("authEmail"),
  authPass: document.getElementById("authPass"),
  authErr: document.getElementById("authErr"),
  btnLogin: document.getElementById("btnLogin"),
  btnSignup: document.getElementById("btnSignup"),

  embedModal: document.getElementById("embedModal"),
  embedClose: document.getElementById("embedClose"),
  embedTitle: document.getElementById("embedTitle"),
  embedFrame: document.getElementById("embedFrame"),
};

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
    const cleanup = () => { try { delete window[cbName]; } catch (_) {} script.remove(); };
    window[cbName] = (data) => {
      cleanup();
      if (!data || data.ok === false) reject(new Error((data && data.error) || "API error"));
      else resolve(data);
    };
    script.onerror = () => { cleanup(); reject(new Error("Network error loading JSONP script")); };
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function coverFor(t) { return t.artworkUrl || ""; }

function displayTitle(t) {
  if (t.title) return t.title;
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
function isAudioTrack(t) {
  // treat anything with audioUrl as audio, regardless of sourceType
  return !!t.audioUrl;
}
function isUnplayable(t) {
  return !t.audioUrl && !t.embedUrl;
}

function requireTokenOrAuth() {
  if (!state.token) {
    openAuthModal();
    throw new Error("Not signed in");
  }
}

function openAuthModal() {
  el.authErr.textContent = "";
  el.authModal.style.display = "flex";
  el.authEmail.value = state.email || "";
  el.authPass.value = "";
  setTimeout(() => el.authEmail.focus(), 50);
}
function closeAuthModal() { el.authModal.style.display = "none"; }

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

function setVolumeMode(mode) {
  if (!el.vol || !el.volMode) return;
  if (mode === "embed") {
    el.volMode.textContent = "EMBED";
    el.vol.disabled = true;
    el.vol.style.opacity = "0.4";
  } else {
    el.volMode.textContent = "AUDIO";
    el.vol.disabled = false;
    el.vol.style.opacity = "1";
  }
}

function openEmbed(track) {
  // stop audio
  try { el.audio.pause(); } catch (_) {}
  try { el.audio.src = ""; } catch (_) {}
  state.playingMode = "embed";
  setVolumeMode("embed");

  el.embedTitle.textContent = `${displayTitle(track)} — ${displayArtist(track)}`;
  el.embedFrame.src = track.embedUrl || "";
  el.embedModal.style.display = "flex";

  renderNowPlaying(track);
  el.btnPlay.textContent = "▶"; // bottom bar play button doesn't control iframe
}

function closeEmbed() {
  el.embedModal.style.display = "none";
  el.embedFrame.src = "";
  if (state.playingMode === "embed") state.playingMode = "none";
}

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

function currentList() {
  let list = state.tracks;
  const q = (el.search.value || "").trim().toLowerCase();
  if (q) {
    list = list.filter(t => (`${t.title||""} ${t.artist||""} ${t.album||""} ${t.spotifyUrl||""}`.toLowerCase()).includes(q));
  }
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
      const q = currentList();
      state.queue = q;
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

async function playIndex(i) {
  const t = state.queue[i];
  if (!t) return;

  state.currentIndex = i;

  if (isUnplayable(t)) {
    state.playingMode = "none";
    renderNowPlaying(t);
    alert("This track is not playable (no audioUrl or embedUrl).");
    return;
  }

  if (isSpotifyEmbed(t)) {
    openEmbed(t);
    return;
  }

  // audio
  closeEmbed();
  state.playingMode = "audio";
  setVolumeMode("audio");

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
  const t = state.queue[state.currentIndex];

  // embed: we can only re-open / close, not control play/pause reliably
  if (state.playingMode === "embed") {
    if (el.embedModal.style.display === "flex") closeEmbed();
    else if (t && isSpotifyEmbed(t)) openEmbed(t);
    return;
  }

  // audio
  if (state.playingMode !== "audio") return;

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

// audio events
el.audio.addEventListener("loadedmetadata", () => {
  el.tDur.textContent = fmtTime(el.audio.duration);
});
el.audio.addEventListener("timeupdate", () => {
  el.tCur.textContent = fmtTime(el.audio.currentTime);
  const dur = el.audio.duration || 0;
  el.seek.value = dur > 0 ? Math.floor((el.audio.currentTime / dur) * 1000) : 0;
});
el.audio.addEventListener("ended", () => nextTrack());

// seek
el.seek.addEventListener("input", () => {
  if (state.playingMode !== "audio") return;
  const dur = el.audio.duration || 0;
  if (dur <= 0) return;
  const pct = Number(el.seek.value) / 1000;
  el.audio.currentTime = pct * dur;
});

// volume
(function initVolume(){
  const saved = Number(localStorage.getItem("streamify_vol") || "0.8");
  const v = Math.min(1, Math.max(0, saved));
  el.audio.volume = v;
  if (el.vol) el.vol.value = String(Math.round(v * 100));

  el.vol?.addEventListener("input", () => {
    const val = Math.min(1, Math.max(0, Number(el.vol.value) / 100));
    el.audio.volume = val;
    localStorage.setItem("streamify_vol", String(val));
  });
})();

// UI wiring
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

el.btnLogout.onclick = () => {
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
  setVolumeMode("audio");
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
