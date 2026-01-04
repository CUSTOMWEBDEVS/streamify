/******************************************************
 * MyMusic Frontend (Spotify-ish UI)
 * - JSONP to Apps Script (no CORS)
 * - Drive audio playback (driveFileId)
 * - IndexedDB audio caching toggle
 ******************************************************/

// 1) SET THIS to your Apps Script Web App URL:
const BACKEND_URL = "https://script.google.com/macros/s/AKfycbybaLP1fiC6UpZoKFWS062zLUxBksZjZ2J3-6BLaI-krUnxsnXpCOdWE04jO9Rp6rVA/exec"; // .../exec

// If you want the Importer link to point to the same GAS deployment:
const IMPORTER_URL = () => `${BACKEND_URL}${BACKEND_URL.includes("?") ? "&" : "?"}page=admin`;

const $ = (q)=>document.querySelector(q);

const el = {
  backendLabel: $("#backendLabel"),
  meLine: $("#meLine"),
  btnAuthOpen: $("#btnAuthOpen"),
  btnLogout: $("#btnLogout"),

  navHome: $("#navHome"),
  navCatalog: $("#navCatalog"),
  navLikes: $("#navLikes"),

  chipHome: $("#chipHome"),
  chipCatalog: $("#chipCatalog"),
  chipLikes: $("#chipLikes"),

  viewTitle: $("#viewTitle"),
  viewSub: $("#viewSub"),
  listStatus: $("#listStatus"),

  q: $("#q"),
  btnSearch: $("#btnSearch"),
  btnClearSearch: $("#btnClearSearch"),
  trackGrid: $("#trackGrid"),

  plName: $("#plName"),
  btnCreatePlaylist: $("#btnCreatePlaylist"),
  btnRefreshPlaylists: $("#btnRefreshPlaylists"),
  playlistList: $("#playlistList"),

  pArt: $("#pArt"),
  pTitle: $("#pTitle"),
  pSub: $("#pSub"),
  btnPrev: $("#btnPrev"),
  btnPlay: $("#btnPlay"),
  btnNext: $("#btnNext"),
  seekBar: $("#seekBar"),
  seekFill: $("#seekFill"),
  tCur: $("#tCur"),
  tDur: $("#tDur"),
  vol: $("#vol"),
  tglShuffle: $("#tglShuffle"),
  tglRepeat: $("#tglRepeat"),
  tglCache: $("#tglCache"),
  cacheLine: $("#cacheLine"),

  btnInstall: $("#btnInstall"),
  btnAdminImporter: $("#btnAdminImporter"),

  // Modal
  authModal: $("#authModal"),
  btnAuthClose: $("#btnAuthClose"),
  email: $("#email"),
  pass: $("#pass"),
  btnLogin: $("#btnLogin"),
  btnSignup: $("#btnSignup"),
  authStatus: $("#authStatus"),
};

function setBackendLabel(){
  el.backendLabel.textContent = BACKEND_URL.includes("http") ? "backend: connected" : "backend: not set";
}
setBackendLabel();
el.btnAdminImporter.href = BACKEND_URL.includes("http") ? IMPORTER_URL() : "#";

const state = {
  token: localStorage.getItem("mymusic_token") || "",
  me: null,

  view: "home", // home | catalog | likes | playlist
  currentPlaylistId: null,

  catalog: [],
  likes: new Set(),
  playlists: [],
  playlistTracks: new Map(),

  queue: [],
  idx: -1,
  shuffle: false,
  repeat: false,
  cacheAudio: true,

  audio: new Audio(),
};

state.audio.preload = "metadata";
state.audio.crossOrigin = "anonymous";

// -------- Install prompt ----------
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  el.btnInstall.style.display = "inline-flex";
});
el.btnInstall.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt = null;
  el.btnInstall.style.display = "none";
});

// -------- JSONP ----------
function jsonp(action, params = {}) {
  return new Promise((resolve, reject) => {
    if (!BACKEND_URL.includes("http")) return reject(new Error("BACKEND_URL not set in app.js"));
    const cbName = "cb_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const qs = new URLSearchParams({ action, callback: cbName, ...params });
    const url = `${BACKEND_URL}?${qs.toString()}`;

    window[cbName] = (data) => {
      cleanup();
      if (!data || data.ok === false) reject(new Error(data?.error || "Request failed"));
      else resolve(data);
    };

    function cleanup(){
      try { delete window[cbName]; } catch {}
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    script.onerror = () => { cleanup(); reject(new Error("Network/JSONP error")); };
    script.src = url;
    document.body.appendChild(script);
  });
}

// -------- IndexedDB audio cache ----------
const DB_NAME = "mymusic_cache_v2";
const STORE = "audio";

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const st = tx.objectStore(STORE);
    const req = st.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const st = tx.objectStore(STORE);
    const req = st.put(val, key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// -------- Helpers ----------
function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function escapeAttr(s){ return escapeHtml(s); }

function fmtTime(sec){
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${String(r).padStart(2,"0")}`;
}
function setStatus(s){ el.listStatus.textContent = s || ""; }
function setAuthStatus(s){ el.authStatus.textContent = s || ""; }

function setActiveNav(which){
  const all = [el.navHome, el.navCatalog, el.navLikes];
  all.forEach(x => x.classList.remove("active"));
  if (which === "home") el.navHome.classList.add("active");
  if (which === "catalog") el.navCatalog.classList.add("active");
  if (which === "likes") el.navLikes.classList.add("active");
  if (which === "playlist") el.navCatalog.classList.add("active"); // treat playlist as catalog section
}

function setActiveChip(which){
  [el.chipHome, el.chipCatalog, el.chipLikes].forEach(x => x.classList.remove("active"));
  if (which === "home") el.chipHome.classList.add("active");
  if (which === "catalog") el.chipCatalog.classList.add("active");
  if (which === "likes") el.chipLikes.classList.add("active");
}

// -------- Modal ----------
function openAuthModal(){
  el.authModal.classList.add("show");
  setAuthStatus("");
  setTimeout(() => el.email.focus(), 50);
}
function closeAuthModal(){
  el.authModal.classList.remove("show");
}
el.btnAuthOpen.onclick = openAuthModal;
el.btnAuthClose.onclick = closeAuthModal;
el.authModal.addEventListener("click", (e)=>{ if (e.target === el.authModal) closeAuthModal(); });
window.addEventListener("keydown", (e)=>{ if (e.key === "Escape") closeAuthModal(); });

// -------- Data ----------
async function loadMe(){
  if (!state.token) return null;
  const res = await jsonp("me", { token: state.token });
  state.me = { userId: res.userId, email: res.email };
  return state.me;
}
async function loadCatalog(){
  const res = await jsonp("catalog", { token: state.token, limit: 500, offset: 0 });
  state.catalog = res.tracks || [];
  localStorage.setItem("mymusic_catalog", JSON.stringify(state.catalog));
  return state.catalog;
}
async function loadLikes(){
  const res = await jsonp("likes", { token: state.token });
  state.likes = new Set(res.trackIds || []);
  return state.likes;
}
async function loadPlaylists(){
  const res = await jsonp("playlists", { token: state.token });
  state.playlists = res.playlists || [];
  return state.playlists;
}
async function loadPlaylistTracks(playlistId){
  const res = await jsonp("playlist_get", { token: state.token, playlistId });
  state.playlistTracks.set(playlistId, res.trackIds || []);
  return res;
}

function trackById(id){
  return state.catalog.find(t => String(t.trackId) === String(id)) || null;
}

function getViewTracks(){
  if (state.view === "home") return state.catalog.slice(0, 30);
  if (state.view === "catalog") return state.catalog;
  if (state.view === "likes") return state.catalog.filter(t => state.likes.has(String(t.trackId)));
  if (state.view === "playlist") {
    const ids = state.playlistTracks.get(state.currentPlaylistId) || [];
    return ids.map(id => trackById(id)).filter(Boolean);
  }
  return state.catalog;
}

// -------- Render ----------
function updateHeader(){
  if (state.view === "home"){
    el.viewTitle.textContent = "Home";
    el.viewSub.textContent = "Pick something and hit play.";
    setActiveNav("home");
    setActiveChip("home");
  } else if (state.view === "catalog"){
    el.viewTitle.textContent = "Catalog";
    el.viewSub.textContent = "Your Drive-backed library.";
    setActiveNav("catalog");
    setActiveChip("catalog");
  } else if (state.view === "likes"){
    el.viewTitle.textContent = "Liked Songs";
    el.viewSub.textContent = "Tracks you hearted.";
    setActiveNav("likes");
    setActiveChip("likes");
  } else if (state.view === "playlist"){
    const pl = state.playlists.find(p => p.playlistId === state.currentPlaylistId);
    el.viewTitle.textContent = pl ? pl.name : "Playlist";
    el.viewSub.textContent = "Playlist tracks.";
    setActiveNav("playlist");
    setActiveChip("catalog");
  }
}

function renderPlaylists(){
  el.playlistList.innerHTML = "";
  if (!state.playlists.length){
    el.playlistList.innerHTML = `<div class="muted">No playlists yet.</div>`;
    return;
  }
  for (const pl of state.playlists){
    const div = document.createElement("div");
    div.className = "plRow";
    div.innerHTML = `
      <div style="min-width:0">
        <div class="plName">${escapeHtml(pl.name)}</div>
        <div class="plId">${escapeHtml(pl.playlistId)}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn small" data-open="${escapeAttr(pl.playlistId)}">Open</button>
      </div>
    `;
    div.querySelector("[data-open]").onclick = async (ev) => {
      ev.stopPropagation();
      state.view = "playlist";
      state.currentPlaylistId = pl.playlistId;
      if (!state.playlistTracks.has(pl.playlistId)) await loadPlaylistTracks(pl.playlistId);
      renderTracks();
    };
    div.onclick = async () => {
      state.view = "playlist";
      state.currentPlaylistId = pl.playlistId;
      if (!state.playlistTracks.has(pl.playlistId)) await loadPlaylistTracks(pl.playlistId);
      renderTracks();
    };
    el.playlistList.appendChild(div);
  }
}

function renderTracks(list = null){
  const tracks = list || getViewTracks();
  el.trackGrid.innerHTML = "";
  updateHeader();

  if (!tracks.length){
    el.trackGrid.innerHTML = `<div class="muted">Nothing here yet.</div>`;
    setStatus("");
    return;
  }

  for (const t of tracks){
    const liked = state.likes.has(String(t.trackId));
    const card = document.createElement("div");
    card.className = "trackCard";
    card.innerHTML = `
      <div class="art">${t.artworkUrl ? `<img src="${escapeAttr(t.artworkUrl)}" />` : `<div class="muted2">No art</div>`}</div>
      <div class="cardTitle">${escapeHtml(t.title || "Untitled")}</div>
      <div class="cardSub">${escapeHtml(t.artist || "Unknown")}${t.album ? " • " + escapeHtml(t.album) : ""}</div>
      <div class="cardActions">
        <button class="ghostBtn" data-play="${escapeAttr(t.trackId)}">Play</button>
        <button class="ghostBtn heartBtn" data-like="${escapeAttr(t.trackId)}">${liked ? "♥" : "♡"}</button>
        <button class="ghostBtn" data-add="${escapeAttr(t.trackId)}">＋</button>
      </div>
    `;

    // click card = play
    card.addEventListener("dblclick", () => {
      setQueue(tracks, t.trackId);
      playIndex(state.idx);
    });

    card.querySelector("[data-play]").onclick = (ev) => {
      ev.stopPropagation();
      setQueue(tracks, t.trackId);
      playIndex(state.idx);
    };

    card.querySelector("[data-like]").onclick = async (ev) => {
      ev.stopPropagation();
      if (!state.token) { openAuthModal(); return; }
      const id = String(t.trackId);
      try{
        if (state.likes.has(id)){
          await jsonp("unlike", { token: state.token, trackId: id });
          state.likes.delete(id);
        } else {
          await jsonp("like", { token: state.token, trackId: id });
          state.likes.add(id);
        }
        renderTracks(tracks);
      } catch(e){
        alert(e.message);
      }
    };

    card.querySelector("[data-add]").onclick = async (ev) => {
      ev.stopPropagation();
      if (!state.token) { openAuthModal(); return; }
      if (!state.currentPlaylistId){
        alert("Open a playlist in the sidebar first, then add songs to it.");
        return;
      }
      try{
        await jsonp("playlist_add", {
          token: state.token,
          playlistId: state.currentPlaylistId,
          trackId: String(t.trackId)
        });
        await loadPlaylistTracks(state.currentPlaylistId);
        el.cacheLine.textContent = "Added to playlist.";
        setTimeout(() => el.cacheLine.textContent = "", 1200);
      } catch(e){
        alert(e.message);
      }
    };

    el.trackGrid.appendChild(card);
  }

  setStatus(`${tracks.length} track(s)`);
}

// -------- Player ----------
function setQueue(tracks, startTrackId){
  state.queue = tracks.map(t => String(t.trackId));
  const idx = state.queue.findIndex(id => id === String(startTrackId));
  state.idx = idx >= 0 ? idx : 0;
}

function currentTrackId(){
  if (state.idx < 0 || state.idx >= state.queue.length) return null;
  return state.queue[state.idx];
}

async function resolveTrack(trackId){
  const res = await jsonp("track", { token: state.token, id: String(trackId) });
  return res.track;
}

async function getPlayableUrl(track){
  const cacheKey = `audio:${track.trackId}`;
  if (state.cacheAudio){
    const blob = await idbGet(cacheKey);
    if (blob){
      el.cacheLine.textContent = "Playing cached audio";
      return URL.createObjectURL(blob);
    }
  }

  el.cacheLine.textContent = state.cacheAudio ? "Downloading (will cache)..." : "Streaming...";
  const url = track.streamUrl;

  if (!state.cacheAudio) return url;

  const resp = await fetch(url);
  if (!resp.ok){
    throw new Error("Failed to fetch audio. Make sure the Drive file is shared 'Anyone with the link'.");
  }
  const blob = await resp.blob();
  await idbSet(cacheKey, blob);
  el.cacheLine.textContent = "Cached for offline";
  setTimeout(()=> el.cacheLine.textContent="", 1200);
  return URL.createObjectURL(blob);
}

async function playIndex(i){
  if (!state.queue.length) return;
  if (!state.token){ openAuthModal(); return; }

  state.idx = (i + state.queue.length) % state.queue.length;
  const id = currentTrackId();
  const meta = trackById(id);
  if (!meta) return;

  el.pTitle.textContent = meta.title || "Untitled";
  el.pSub.textContent = `${meta.artist || "Unknown"}${meta.album ? " • " + meta.album : ""}`;
  el.pArt.innerHTML = meta.artworkUrl ? `<img src="${escapeAttr(meta.artworkUrl)}" />` : "";

  const track = await resolveTrack(id);
  const playUrl = await getPlayableUrl(track);

  state.audio.src = playUrl;
  await state.audio.play();
  el.btnPlay.textContent = "⏸";
}

function togglePlay(){
  if (!state.audio.src){
    const tracks = getViewTracks();
    if (!tracks.length) return;
    setQueue(tracks, tracks[0].trackId);
    playIndex(0);
    return;
  }
  if (state.audio.paused){
    state.audio.play();
    el.btnPlay.textContent = "⏸";
  } else {
    state.audio.pause();
    el.btnPlay.textContent = "▶";
  }
}

function nextTrack(){
  if (!state.queue.length) return;
  if (state.shuffle){
    state.idx = Math.floor(Math.random() * state.queue.length);
  } else {
    state.idx++;
  }
  if (state.idx >= state.queue.length){
    if (state.repeat) state.idx = 0;
    else { state.idx = state.queue.length - 1; state.audio.pause(); el.btnPlay.textContent="▶"; return; }
  }
  playIndex(state.idx);
}

function prevTrack(){
  if (!state.queue.length) return;
  if (state.audio.currentTime > 3){
    state.audio.currentTime = 0;
    return;
  }
  state.idx--;
  if (state.idx < 0){
    if (state.repeat) state.idx = state.queue.length - 1;
    else state.idx = 0;
  }
  playIndex(state.idx);
}

// Seek bar
el.seekBar.addEventListener("click", (e) => {
  const rect = el.seekBar.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  if (state.audio.duration && isFinite(state.audio.duration)){
    state.audio.currentTime = pct * state.audio.duration;
  }
});
state.audio.addEventListener("timeupdate", () => {
  const cur = state.audio.currentTime || 0;
  const dur = state.audio.duration || 0;
  el.seekFill.style.width = `${dur > 0 ? (cur / dur) * 100 : 0}%`;
  el.tCur.textContent = fmtTime(cur);
  el.tDur.textContent = fmtTime(dur);
});
state.audio.addEventListener("ended", () => {
  if (state.repeat) nextTrack();
  else nextTrack();
});

// Volume
el.vol.addEventListener("input", () => { state.audio.volume = Number(el.vol.value); });

// Player controls
el.btnPlay.onclick = togglePlay;
el.btnNext.onclick = nextTrack;
el.btnPrev.onclick = prevTrack;

// Toggles
el.tglShuffle.onclick = () => {
  state.shuffle = !state.shuffle;
  el.tglShuffle.classList.toggle("on", state.shuffle);
};
el.tglRepeat.onclick = () => {
  state.repeat = !state.repeat;
  el.tglRepeat.classList.toggle("on", state.repeat);
};
el.tglCache.onclick = () => {
  state.cacheAudio = !state.cacheAudio;
  el.tglCache.classList.toggle("on", state.cacheAudio);
  el.cacheLine.textContent = state.cacheAudio ? "Caching enabled" : "Caching disabled";
  setTimeout(()=> el.cacheLine.textContent="", 1200);
};

// -------- Views / Nav ----------
function goHome(){ state.view = "home"; state.currentPlaylistId = null; renderTracks(); }
function goCatalog(){ state.view = "catalog"; state.currentPlaylistId = null; renderTracks(); }
function goLikes(){ state.view = "likes"; state.currentPlaylistId = null; renderTracks(); }

el.navHome.onclick = goHome;
el.navCatalog.onclick = goCatalog;
el.navLikes.onclick = () => { if (!state.token) openAuthModal(); else goLikes(); };

el.chipHome.onclick = goHome;
el.chipCatalog.onclick = goCatalog;
el.chipLikes.onclick = () => { if (!state.token) openAuthModal(); else goLikes(); };

el.btnSearch.onclick = async () => {
  const q = el.q.value.trim();
  if (!q){ renderTracks(); return; }
  if (!state.token){ openAuthModal(); return; }
  setStatus("Searching...");
  try{
    const res = await jsonp("search", { token: state.token, q });
    state.view = "catalog";
    state.currentPlaylistId = null;
    renderTracks(res.tracks || []);
  } catch(e){
    setStatus(e.message);
  }
};

el.btnClearSearch.onclick = () => {
  el.q.value = "";
  renderTracks();
};

// -------- Auth ----------
function setLoggedOutUI(){
  el.meLine.textContent = "Not logged in";
  el.btnAuthOpen.style.display = "inline-flex";
  el.btnLogout.style.display = "none";
  el.btnCreatePlaylist.style.display = "none";
  el.btnRefreshPlaylists.style.display = "none";
  el.chipLikes.style.display = "none";
  el.navLikes.style.display = "none";
}

function setLoggedInUI(){
  el.meLine.textContent = state.me ? `Logged in as ${state.me.email}` : "Logged in";
  el.btnAuthOpen.style.display = "none";
  el.btnLogout.style.display = "inline-flex";
  el.btnCreatePlaylist.style.display = "inline-flex";
  el.btnRefreshPlaylists.style.display = "inline-flex";
  el.chipLikes.style.display = "inline-flex";
  el.navLikes.style.display = "flex";
}

el.btnLogin.onclick = async () => {
  setAuthStatus("Logging in...");
  try{
    const res = await jsonp("login", { email: el.email.value.trim(), password: el.pass.value });
    state.token = res.token;
    localStorage.setItem("mymusic_token", state.token);
    setAuthStatus("Logged in.");
    await boot(true);
    closeAuthModal();
  } catch(e){
    setAuthStatus(e.message);
  }
};

el.btnSignup.onclick = async () => {
  setAuthStatus("Creating account...");
  try{
    const res = await jsonp("signup", { email: el.email.value.trim(), password: el.pass.value });
    state.token = res.token;
    localStorage.setItem("mymusic_token", state.token);
    setAuthStatus("Account created.");
    await boot(true);
    closeAuthModal();
  } catch(e){
    setAuthStatus(e.message);
  }
};

el.btnLogout.onclick = () => {
  localStorage.removeItem("mymusic_token");
  state.token = "";
  state.me = null;
  location.reload();
};

// Playlists
el.btnCreatePlaylist.onclick = async () => {
  const name = el.plName.value.trim();
  if (!name) return;
  try{
    await jsonp("playlist_create", { token: state.token, name });
    el.plName.value = "";
    await loadPlaylists();
    renderPlaylists();
  } catch(e){
    alert(e.message);
  }
};
el.btnRefreshPlaylists.onclick = async () => {
  await loadPlaylists();
  renderPlaylists();
};

// -------- Service worker ----------
async function registerSW(){
  if ("serviceWorker" in navigator){
    try{ await navigator.serviceWorker.register("sw.js"); } catch {}
  }
}

// -------- Boot ----------
async function boot(forceFresh = false){
  await registerSW();

  // Load cached catalog first (fast UI)
  const cached = localStorage.getItem("mymusic_catalog");
  if (cached){
    try{ state.catalog = JSON.parse(cached); } catch {}
  }

  // default view
  renderTracks();

  if (!state.token){
    setLoggedOutUI();
    setStatus("Log in to load your library.");
    return;
  }

  // validate session
  try{
    await loadMe();
  } catch(e){
    setLoggedOutUI();
    setStatus("Session expired. Please log in again.");
    localStorage.removeItem("mymusic_token");
    state.token = "";
    return;
  }

  setLoggedInUI();

  // fetch fresh
  setStatus("Loading library...");
  try{
    await Promise.all([loadCatalog(), loadLikes(), loadPlaylists()]);
    renderPlaylists();
    renderTracks();
    setStatus("");
  } catch(e){
    setStatus(e.message);
  }
}

boot();
