const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbx5B2ci6ciW0BThRzDcMEyXV0hE3asFM0iL2Y1TbZhKmLe-D4EMlaVgLX1ytplDOBji/exec",
  TOKEN_KEY: "mymusic_token",
  EMAIL_KEY: "mymusic_email",
  VOL_KEY: "streamify_vol_v4",
  LIBRARY_URL: "./musicup/library.json",
  PLAYER_STATE_KEY: "streamify_player_state_v4"
};

const state = {
  email: "",
  token: "",
  authed: false,

  tracks: [],
  likes: new Set(),
  playlists: [],

  mode: { type: "all", playlistId: null, category: null },
  search: "",

  queue: [],
  currentIndex: -1,
  repeatAll: false,
  loopOne: false,

  categories: [],
  isRestoring: false
};

const $ = (id) => document.getElementById(id);
function must(id) {
  const node = $(id);
  if (!node) throw new Error(`Missing element #${id} in index.html`);
  return node;
}

let el = null;
function cacheEls() {
  el = {
    statusChip: must("statusChip"),

    btnAll: must("btnAll"),
    btnLiked: must("btnLiked"),
    countAll: must("countAll"),
    countLiked: must("countLiked"),

    categoryList: must("categoryList"),

    playlistList: must("playlistList"),
    btnNewPlaylist: must("btnNewPlaylist"),

    btnLogout: must("btnLogout"),

    search: must("search"),
    btnClear: must("btnClear"),
    btnShuffle: must("btnShuffle"),

    grid: must("grid"),
    empty: must("empty"),
    sectionTitle: must("sectionTitle"),
    sectionMeta: must("sectionMeta"),

    audio: must("audio"),
    btnPrev: must("btnPrev"),
    btnPlay: must("btnPlay"),
    btnNext: must("btnNext"),
    seek: must("seek"),
    tCur: must("tCur"),
    tDur: must("tDur"),
    npImg: must("npImg"),
    npTitle: must("npTitle"),
    npArtist: must("npArtist"),
    vol: must("vol"),
    pillRepeat: must("pillRepeat"),
    pillLoop: must("pillLoop"),

    authModal: must("authModal"),
    authCloseBtn: must("authCloseBtn"),
    authEmail: must("authEmail"),
    authCode: must("authCode"),
    btnSendCode: must("btnSendCode"),
    btnVerify: must("btnVerify"),
    authErr: must("authErr"),

    playlistModal: must("playlistModal"),
    playlistModalTitle: must("playlistModalTitle"),
    playlistClose: must("playlistClose"),
    playlistName: must("playlistName"),
    btnSavePlaylist: must("btnSavePlaylist"),
    btnDeletePlaylist: must("btnDeletePlaylist"),
    playlistErr: must("playlistErr")
  };
}

let editingPlaylistId = null;
let menuEl = null;

function setStatus(text, tone = "ok") {
  el.statusChip.textContent = text;
  if (tone === "bad") {
    el.statusChip.style.borderColor = "rgba(255,124,138,.40)";
    el.statusChip.style.background = "rgba(255,124,138,.12)";
    el.statusChip.style.color = "rgba(255,190,196,.95)";
  } else if (tone === "warn") {
    el.statusChip.style.borderColor = "rgba(255,255,255,.18)";
    el.statusChip.style.background = "rgba(255,255,255,.06)";
    el.statusChip.style.color = "rgba(255,255,255,.86)";
  } else {
    el.statusChip.style.borderColor = "rgba(99,245,154,.25)";
    el.statusChip.style.background = "rgba(99,245,154,.10)";
    el.statusChip.style.color = "rgba(99,245,154,.95)";
  }
}

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function titleFor(t) { return t.title || "Untitled"; }
function artistFor(t) { return t.artist || "Unknown"; }
function albumFor(t) { return t.album || ""; }
function coverFor(t) { return t.artwork || ""; }
function categoryFor(t) { return t.category || "general"; }
function prettyCategory(cat) {
  if (!cat) return "All Songs";
  return String(cat)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function apiUrl(params) {
  const u = new URL(CONFIG.API_URL);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  return u.toString();
}

async function apiGet(params) {
  const res = await fetch(apiUrl(params), { cache: "no-store" });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "API error");
  return json;
}

/* ---------------- AUTH ---------------- */

function loadAuth() {
  state.email = (localStorage.getItem(CONFIG.EMAIL_KEY) || "").trim().toLowerCase();
  state.token = (localStorage.getItem(CONFIG.TOKEN_KEY) || "").trim();
  state.authed = !!(state.email && state.token);
}

function saveAuth(email, token) {
  state.email = email.trim().toLowerCase();
  state.token = token.trim();
  state.authed = true;
  localStorage.setItem(CONFIG.EMAIL_KEY, state.email);
  localStorage.setItem(CONFIG.TOKEN_KEY, state.token);
}

function clearAuth() {
  state.email = "";
  state.token = "";
  state.authed = false;
  localStorage.removeItem(CONFIG.EMAIL_KEY);
  localStorage.removeItem(CONFIG.TOKEN_KEY);
}

function openAuthModal() {
  el.authErr.textContent = "";
  el.authEmail.value = state.email || "";
  el.authCode.value = "";
  el.authModal.style.display = "flex";
  setTimeout(() => el.authEmail.focus(), 50);
}

function closeAuthModal() {
  el.authModal.style.display = "none";
}

/* ---------------- PLAYER STATE ---------------- */

function savePlayerState() {
  try {
    const currentTrack = state.queue[state.currentIndex] || null;
    const payload = {
      trackId: currentTrack ? String(currentTrack.id) : "",
      currentTime: Number(el.audio.currentTime || 0),
      volume: Number(el.audio.volume || 0.8),
      mode: state.mode,
      repeatAll: !!state.repeatAll,
      loopOne: !!state.loopOne
    };
    localStorage.setItem(CONFIG.PLAYER_STATE_KEY, JSON.stringify(payload));
  } catch {}
}

function loadPlayerState() {
  try {
    const raw = localStorage.getItem(CONFIG.PLAYER_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function restorePlayerState() {
  const saved = loadPlayerState();
  if (!saved || !saved.trackId) return;

  state.repeatAll = !!saved.repeatAll;
  state.loopOne = !!saved.loopOne;
  el.pillRepeat.classList.toggle("active", state.repeatAll);
  el.pillLoop.classList.toggle("active", state.loopOne);

  if (saved.mode && typeof saved.mode === "object") {
    state.mode = {
      type: saved.mode.type || "all",
      playlistId: saved.mode.playlistId || null,
      category: saved.mode.category || null
    };
  }

  renderCategories();
  renderPlaylists();
  renderGrid();

  const list = currentList();
  const foundInCurrent = list.findIndex(t => String(t.id) === String(saved.trackId));
  const fallbackList = state.tracks.slice();
  const foundFallback = fallbackList.findIndex(t => String(t.id) === String(saved.trackId));

  if (foundInCurrent >= 0) {
    state.queue = list;
    state.currentIndex = foundInCurrent;
  } else if (foundFallback >= 0) {
    state.queue = fallbackList;
    state.currentIndex = foundFallback;
  } else {
    return;
  }

  const t = state.queue[state.currentIndex];
  renderNowPlaying(t);
  el.audio.src = t.url;

  await new Promise((resolve) => {
    const done = () => {
      el.audio.removeEventListener("loadedmetadata", done);
      resolve();
    };
    el.audio.addEventListener("loadedmetadata", done, { once: true });
  });

  el.audio.currentTime = Math.min(Number(saved.currentTime || 0), Math.max(0, (el.audio.duration || 0) - 1));
  el.tCur.textContent = fmtTime(el.audio.currentTime);
  el.tDur.textContent = fmtTime(el.audio.duration || 0);

  try {
    await el.audio.play();
    el.btnPlay.textContent = "❚❚";
    setStatus("Resumed", "ok");
  } catch {
    el.audio.pause();
    el.btnPlay.textContent = "▶";
    setStatus("Resume ready", "warn");
  }
}

/* ---------------- LIBRARY ---------------- */

async function loadRepoLibrary() {
  const url = `${CONFIG.LIBRARY_URL}?v=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`library.json HTTP ${res.status}`);

  const json = await res.json();
  const tracks = Array.isArray(json.tracks) ? json.tracks : [];

  return tracks
    .filter(t => t && t.url)
    .map(t => ({
      id: String(t.id || ""),
      title: String(t.title || ""),
      artist: String(t.artist || ""),
      album: String(t.album || ""),
      url: String(t.url || ""),
      artwork: String(t.artwork || ""),
      youtube: String(t.youtube || ""),
      category: String(t.category || "general")
    }))
    .filter(t => t.id && t.url);
}

function deriveCategories() {
  const set = new Set();
  for (const t of state.tracks) set.add(categoryFor(t));
  state.categories = Array.from(set).sort((a, b) => a.localeCompare(b));
}

/* ---------------- USER DATA ---------------- */

async function loadUserDataFromGAS() {
  if (!state.authed) return;

  const [likes, pls] = await Promise.all([
    apiGet({ action: "likes", email: state.email, token: state.token }),
    apiGet({ action: "playlists", email: state.email, token: state.token })
  ]);

  state.likes = new Set((likes.likes || []).map(String));
  state.playlists = pls.playlists || [];
}

/* ---------------- LOAD ---------------- */

async function loadAll() {
  setStatus("Loading…", "warn");

  try {
    state.tracks = await loadRepoLibrary();
    deriveCategories();
  } catch (e) {
    console.error(e);
    state.tracks = [];
    state.categories = [];
    setStatus("Library missing/broken", "bad");
  }

  if (state.authed) {
    try {
      await loadUserDataFromGAS();
    } catch (e) {
      console.error(e);
      clearAuth();
      openAuthModal();
      setStatus("Login required", "warn");
    }
  }

  updateCounts();
  renderCategories();
  renderPlaylists();
  renderGrid();
  renderNowPlaying(null);

  if (!state.isRestoring) {
    state.isRestoring = true;
    await restorePlayerState();
  }

  if (state.tracks.length && !state.authed) {
    setStatus("Browse mode", "warn");
  } else if (state.authed) {
    setStatus("Ready", "ok");
  }
}

function updateCounts() {
  el.countAll.textContent = String(state.tracks.length);
  el.countLiked.textContent = String(state.likes.size);
}

/* ---------------- FILTERING ---------------- */

function currentList() {
  let list = state.tracks.slice();

  if (state.mode.type === "liked") {
    list = list.filter(t => state.likes.has(String(t.id)));
  } else if (state.mode.type === "playlist" && state.mode.playlistId) {
    const p = state.playlists.find(x => x.id === state.mode.playlistId);
    const set = new Set((p?.trackIds || []).map(String));
    list = list.filter(t => set.has(String(t.id)));
  } else if (state.mode.type === "category" && state.mode.category) {
    list = list.filter(t => categoryFor(t) === state.mode.category);
  }

  const q = normalize(state.search);
  if (q) {
    list = list.filter(t => {
      const hay = [
        titleFor(t),
        artistFor(t),
        albumFor(t),
        categoryFor(t),
        prettyCategory(categoryFor(t))
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  return list;
}

function currentSectionTitle() {
  if (state.mode.type === "liked") return "Liked Songs";
  if (state.mode.type === "playlist") {
    const p = state.playlists.find(x => x.id === state.mode.playlistId);
    return p ? p.name : "Playlist";
  }
  if (state.mode.type === "category") return prettyCategory(state.mode.category);
  return "All Songs";
}

function setSidebarActive() {
  el.btnAll.classList.toggle("active", state.mode.type === "all");
  el.btnLiked.classList.toggle("active", state.mode.type === "liked");
}

/* ---------------- RENDER ---------------- */

function renderCategories() {
  el.categoryList.innerHTML = "";

  for (const cat of state.categories) {
    const btn = document.createElement("button");
    btn.className = "navBtn";
    btn.classList.toggle("active", state.mode.type === "category" && state.mode.category === cat);

    const left = document.createElement("span");
    left.textContent = prettyCategory(cat);

    const right = document.createElement("span");
    right.className = "pill";
    right.textContent = String(state.tracks.filter(t => categoryFor(t) === cat).length);

    btn.appendChild(left);
    btn.appendChild(right);

    btn.onclick = () => {
      state.mode = { type: "category", playlistId: null, category: cat };
      savePlayerState();
      renderCategories();
      renderPlaylists();
      renderGrid();
    };

    el.categoryList.appendChild(btn);
  }
}

function renderPlaylists() {
  el.playlistList.innerHTML = "";

  for (const p of state.playlists) {
    const item = document.createElement("div");
    item.className = "playlistItem";
    item.classList.toggle("active", state.mode.type === "playlist" && state.mode.playlistId === p.id);

    const name = document.createElement("div");
    name.className = "playlistName";
    name.textContent = p.name;

    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = String((p.trackIds || []).length);

    item.appendChild(name);
    item.appendChild(pill);

    item.onclick = () => {
      state.mode = { type: "playlist", playlistId: p.id, category: null };
      savePlayerState();
      renderPlaylists();
      renderCategories();
      renderGrid();
    };

    item.oncontextmenu = (e) => {
      e.preventDefault();
      openPlaylistModal(p.id);
    };

    el.playlistList.appendChild(item);
  }
}

function renderGrid() {
  setSidebarActive();
  const list = currentList();

  el.sectionTitle.textContent = currentSectionTitle();
  el.sectionMeta.textContent = `${list.length} song${list.length === 1 ? "" : "s"}`;

  el.grid.innerHTML = "";
  el.empty.style.display = list.length ? "none" : "block";

  for (const t of list) {
    const card = document.createElement("div");
    card.className = "card";

    const cover = document.createElement("div");
    cover.className = "cover";

    const art = coverFor(t);
    if (art) {
      const img = document.createElement("img");
      img.src = art;
      img.loading = "lazy";
      cover.appendChild(img);
    } else {
      const fb = document.createElement("div");
      fb.className = "fallback";
      fb.textContent = prettyCategory(categoryFor(t));
      cover.appendChild(fb);
    }
    card.appendChild(cover);

    const tt = document.createElement("div");
    tt.className = "trackTitle";
    tt.textContent = titleFor(t);
    card.appendChild(tt);

    const meta = document.createElement("div");
    meta.className = "trackMeta";
    meta.textContent = `${artistFor(t)}${albumFor(t) ? " • " + albumFor(t) : ""}`;
    card.appendChild(meta);

    const footer = document.createElement("div");
    footer.className = "cardFooter";

    const tag = document.createElement("div");
    tag.className = "miniTag ok";
    tag.textContent = prettyCategory(categoryFor(t));

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.gap = "8px";
    right.style.alignItems = "center";

    const addBtn = document.createElement("button");
    addBtn.className = "iconBtn";
    addBtn.title = "Toggle in playlist";
    addBtn.textContent = "+";
    addBtn.onclick = (ev) => {
      ev.stopPropagation();
      if (!state.authed) return openAuthModal();
      openAddToPlaylistMenu(t.id, addBtn);
    };

    const likeBtn = document.createElement("button");
    likeBtn.className = "iconBtn";
    likeBtn.title = "Like";
    likeBtn.textContent = state.likes.has(String(t.id)) ? "♥" : "♡";
    likeBtn.onclick = async (ev) => {
      ev.stopPropagation();
      if (!state.authed) return openAuthModal();

      try {
        const id = String(t.id);
        if (state.likes.has(id)) {
          await apiGet({ action: "unlike", email: state.email, token: state.token, trackId: id });
          state.likes.delete(id);
        } else {
          await apiGet({ action: "like", email: state.email, token: state.token, trackId: id });
          state.likes.add(id);
        }
        updateCounts();
        if (state.mode.type === "liked") renderGrid();
        else likeBtn.textContent = state.likes.has(String(t.id)) ? "♥" : "♡";
      } catch (e) {
        console.error(e);
        setStatus("Like failed", "bad");
      }
    };

    right.appendChild(addBtn);
    right.appendChild(likeBtn);

    footer.appendChild(tag);
    footer.appendChild(right);
    card.appendChild(footer);

    card.onclick = () => {
      state.queue = list.slice();
      const idx = state.queue.findIndex(x => String(x.id) === String(t.id));
      playIndex(idx >= 0 ? idx : 0).catch(err => {
        console.error(err);
        setStatus("Play failed", "bad");
        alert(err.message || String(err));
      });
    };

    el.grid.appendChild(card);
  }
}

/* ---------------- PLAYBACK ---------------- */

function renderNowPlaying(track) {
  const t = track || state.queue[state.currentIndex] || null;
  if (!t) {
    el.npTitle.textContent = "Nothing playing";
    el.npArtist.textContent = "—";
    el.npImg.src = "";
    el.tCur.textContent = "0:00";
    el.tDur.textContent = "0:00";
    el.seek.value = 0;
    el.btnPlay.textContent = "▶";
    return;
  }
  el.npTitle.textContent = titleFor(t);
  el.npArtist.textContent = `${artistFor(t)} • ${prettyCategory(categoryFor(t))}`;
  el.npImg.src = coverFor(t) || "";
}

async function playIndex(i) {
  const t = state.queue[i];
  if (!t || !t.url) throw new Error("Track has no playable URL.");

  state.currentIndex = i;
  renderNowPlaying(t);

  el.audio.src = t.url;

  try {
    await el.audio.play();
    el.btnPlay.textContent = "❚❚";
    savePlayerState();
    setStatus("Playing", "ok");
  } catch (e) {
    el.btnPlay.textContent = "▶";
    setStatus("Click play", "warn");
    throw e;
  }
}

function togglePlayPause() {
  if (!state.queue.length || state.currentIndex < 0) return;
  if (el.audio.paused) {
    el.audio.play().then(() => {
      el.btnPlay.textContent = "❚❚";
      savePlayerState();
      setStatus("Playing", "ok");
    }).catch(() => setStatus("Play failed", "bad"));
  } else {
    el.audio.pause();
    el.btnPlay.textContent = "▶";
    savePlayerState();
    setStatus("Paused", "warn");
  }
}

function nextTrack() {
  if (!state.queue.length) return;
  if (state.loopOne) return playIndex(state.currentIndex).catch(console.error);

  const atEnd = (state.currentIndex + 1) >= state.queue.length;
  if (atEnd && !state.repeatAll) {
    el.audio.pause();
    el.btnPlay.textContent = "▶";
    savePlayerState();
    setStatus("Ended", "warn");
    return;
  }
  const i = (state.currentIndex + 1) % state.queue.length;
  playIndex(i).catch(console.error);
}

function prevTrack() {
  if (!state.queue.length) return;
  const i = (state.currentIndex - 1 + state.queue.length) % state.queue.length;
  playIndex(i).catch(console.error);
}

/* ---------------- MENUS/MODALS ---------------- */

function closeMenu() {
  if (menuEl) {
    menuEl.remove();
    menuEl = null;
  }
}

function openAddToPlaylistMenu(trackId, anchorBtn) {
  closeMenu();
  if (!state.playlists.length) {
    setStatus("No playlists", "warn");
    return;
  }

  const rect = anchorBtn.getBoundingClientRect();
  const m = document.createElement("div");
  m.style.position = "fixed";
  m.style.top = `${rect.bottom + 8}px`;
  m.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
  m.style.width = "240px";
  m.style.zIndex = "99999";
  m.style.border = "1px solid rgba(255,255,255,.12)";
  m.style.background = "rgba(22,27,40,.98)";
  m.style.backdropFilter = "blur(12px)";
  m.style.borderRadius = "16px";
  m.style.boxShadow = "0 20px 70px rgba(0,0,0,.55)";
  m.style.overflow = "hidden";

  const head = document.createElement("div");
  head.style.padding = "10px 12px";
  head.style.fontSize = "12px";
  head.style.color = "rgba(238,242,255,.62)";
  head.style.borderBottom = "1px solid rgba(255,255,255,.08)";
  head.textContent = "Toggle in playlist";
  m.appendChild(head);

  for (const p of state.playlists) {
    const row = document.createElement("button");
    row.type = "button";
    row.style.width = "100%";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    row.style.gap = "10px";
    row.style.padding = "10px 12px";
    row.style.border = "0";
    row.style.background = "transparent";
    row.style.color = "rgba(238,242,255,.92)";
    row.style.cursor = "pointer";
    row.onmouseenter = () => row.style.background = "rgba(255,255,255,.06)";
    row.onmouseleave = () => row.style.background = "transparent";

    const has = (p.trackIds || []).map(String).includes(String(trackId));
    const left = document.createElement("span");
    left.textContent = p.name;
    const right = document.createElement("span");
    right.textContent = has ? "✓" : "+";

    row.appendChild(left);
    row.appendChild(right);

    row.onclick = async () => {
      try {
        if (has) {
          await apiGet({ action: "playlistRemoveTrack", email: state.email, token: state.token, playlistId: p.id, trackId: String(trackId) });
          p.trackIds = (p.trackIds || []).filter(x => String(x) !== String(trackId));
        } else {
          await apiGet({ action: "playlistAddTrack", email: state.email, token: state.token, playlistId: p.id, trackId: String(trackId) });
          p.trackIds = [...(p.trackIds || []).map(String), String(trackId)];
        }
        renderPlaylists();
        renderGrid();
      } catch (e) {
        console.error(e);
        setStatus("Playlist update failed", "bad");
      } finally {
        closeMenu();
      }
    };

    m.appendChild(row);
  }

  document.body.appendChild(m);
  menuEl = m;

  setTimeout(() => {
    document.addEventListener("click", (e) => {
      if (menuEl && !menuEl.contains(e.target)) closeMenu();
    }, { once: true });
  }, 0);
}

function openPlaylistModal(id = null) {
  el.playlistErr.textContent = "";
  editingPlaylistId = id;

  if (!id) {
    el.playlistModalTitle.textContent = "New playlist";
    el.playlistName.value = "";
    el.btnDeletePlaylist.style.display = "none";
  } else {
    const p = state.playlists.find(x => x.id === id);
    el.playlistModalTitle.textContent = "Edit playlist";
    el.playlistName.value = p?.name || "";
    el.btnDeletePlaylist.style.display = "inline-flex";
  }

  el.playlistModal.style.display = "flex";
  setTimeout(() => el.playlistName.focus(), 50);
}

function closePlaylistModal() {
  el.playlistModal.style.display = "none";
  editingPlaylistId = null;
}

/* ---------------- UI WIRING ---------------- */

function wireUI() {
  el.btnAll.onclick = () => {
    state.mode = { type: "all", playlistId: null, category: null };
    savePlayerState();
    renderCategories();
    renderPlaylists();
    renderGrid();
  };

  el.btnLiked.onclick = () => {
    state.mode = { type: "liked", playlistId: null, category: null };
    savePlayerState();
    renderCategories();
    renderPlaylists();
    renderGrid();
  };

  el.btnNewPlaylist.onclick = () => {
    if (!state.authed) return openAuthModal();
    openPlaylistModal(null);
  };

  el.btnLogout.onclick = () => {
    clearAuth();
    state.likes = new Set();
    state.playlists = [];
    state.mode = { type: "all", playlistId: null, category: null };
    renderPlaylists();
    renderCategories();
    renderGrid();
    setStatus("Logged out", "warn");
  };

  el.search.addEventListener("input", () => {
    state.search = el.search.value || "";
    renderGrid();
  });

  el.btnClear.onclick = () => {
    el.search.value = "";
    state.search = "";
    renderGrid();
  };

  el.btnShuffle.onclick = () => {
    const list = currentList();
    if (!list.length) return;
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    state.queue = list;
    playIndex(0).catch(console.error);
  };

  el.btnPrev.onclick = () => prevTrack();
  el.btnNext.onclick = () => nextTrack();
  el.btnPlay.onclick = () => togglePlayPause();

  el.pillRepeat.onclick = () => {
    state.repeatAll = !state.repeatAll;
    el.pillRepeat.classList.toggle("active", state.repeatAll);
    savePlayerState();
  };

  el.pillLoop.onclick = () => {
    state.loopOne = !state.loopOne;
    el.pillLoop.classList.toggle("active", state.loopOne);
    savePlayerState();
  };

  el.audio.addEventListener("loadedmetadata", () => {
    el.tDur.textContent = fmtTime(el.audio.duration);
  });

  el.audio.addEventListener("timeupdate", () => {
    el.tCur.textContent = fmtTime(el.audio.currentTime);
    const dur = el.audio.duration || 0;
    el.seek.value = dur > 0 ? Math.floor((el.audio.currentTime / dur) * 1000) : 0;
    savePlayerState();
  });

  el.audio.addEventListener("ended", () => nextTrack());

  el.seek.addEventListener("input", () => {
    const dur = el.audio.duration || 0;
    if (dur <= 0) return;
    el.audio.currentTime = (Number(el.seek.value) / 1000) * dur;
    savePlayerState();
  });

  const savedVol = Number(localStorage.getItem(CONFIG.VOL_KEY) || "0.8");
  const v = Math.min(1, Math.max(0, savedVol));
  el.audio.volume = v;
  el.vol.value = String(Math.round(v * 100));
  el.vol.addEventListener("input", () => {
    const val = Math.min(1, Math.max(0, Number(el.vol.value) / 100));
    el.audio.volume = val;
    localStorage.setItem(CONFIG.VOL_KEY, String(val));
    savePlayerState();
  });

  el.authCloseBtn.onclick = () => closeAuthModal();
  el.authModal.addEventListener("click", (e) => {
    if (e.target === el.authModal) closeAuthModal();
  });

  el.btnSendCode.onclick = async () => {
    el.authErr.textContent = "";
    const email = (el.authEmail.value || "").trim().toLowerCase();
    if (!email.includes("@")) {
      el.authErr.textContent = "Enter a valid email.";
      return;
    }
    try {
      setStatus("Sending…", "warn");
      await apiGet({ action: "requestCode", email });
      setStatus("Code sent", "ok");
      el.authErr.textContent = "Check your email for the 6-digit code.";
      el.authCode.focus();
    } catch (e) {
      console.error(e);
      setStatus("Send failed", "bad");
      el.authErr.textContent = e.message || String(e);
    }
  };

  el.btnVerify.onclick = async () => {
    el.authErr.textContent = "";
    const email = (el.authEmail.value || "").trim().toLowerCase();
    const code = (el.authCode.value || "").trim();
    if (!email.includes("@")) {
      el.authErr.textContent = "Enter a valid email.";
      return;
    }
    if (!code) {
      el.authErr.textContent = "Enter the code.";
      return;
    }
    try {
      setStatus("Verifying…", "warn");
      const out = await apiGet({ action: "verifyCode", email, code });
      saveAuth(email, out.token);
      closeAuthModal();
      await loadAll();
    } catch (e) {
      console.error(e);
      setStatus("Verify failed", "bad");
      el.authErr.textContent = e.message || String(e);
    }
  };

  el.playlistClose.onclick = () => closePlaylistModal();
  el.playlistModal.addEventListener("click", (e) => {
    if (e.target === el.playlistModal) closePlaylistModal();
  });

  el.btnSavePlaylist.onclick = async () => {
    el.playlistErr.textContent = "";
    if (!state.authed) return openAuthModal();

    try {
      const name = (el.playlistName.value || "").trim();
      if (!name) throw new Error("Name required.");

      if (!editingPlaylistId) {
        const out = await apiGet({ action: "playlistCreate", email: state.email, token: state.token, name });
        state.playlists.unshift({ id: out.id, name, trackIds: [] });
      } else {
        await apiGet({ action: "playlistRename", email: state.email, token: state.token, id: editingPlaylistId, name });
        const p = state.playlists.find(x => x.id === editingPlaylistId);
        if (p) p.name = name;
      }

      renderPlaylists();
      closePlaylistModal();
    } catch (e) {
      console.error(e);
      el.playlistErr.textContent = e.message || String(e);
    }
  };

  el.btnDeletePlaylist.onclick = async () => {
    el.playlistErr.textContent = "";
    if (!state.authed) return openAuthModal();

    try {
      if (!editingPlaylistId) return;
      await apiGet({ action: "playlistDelete", email: state.email, token: state.token, id: editingPlaylistId });
      state.playlists = state.playlists.filter(p => p.id !== editingPlaylistId);
      if (state.mode.type === "playlist" && state.mode.playlistId === editingPlaylistId) {
        state.mode = { type: "all", playlistId: null, category: null };
      }
      renderPlaylists();
      renderGrid();
      closePlaylistModal();
    } catch (e) {
      console.error(e);
      el.playlistErr.textContent = e.message || String(e);
    }
  };

  window.addEventListener("scroll", () => closeMenu(), { passive: true });
  window.addEventListener("resize", () => closeMenu());

  window.addEventListener("keydown", (e) => {
    if (e.target && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
    if (e.code === "Space") {
      e.preventDefault();
      togglePlayPause();
    }
    if (e.code === "ArrowRight" && e.shiftKey) nextTrack();
    if (e.code === "ArrowLeft" && e.shiftKey) prevTrack();
  });
}

/* ---------------- INIT ---------------- */

async function init() {
  if (document.readyState === "loading") {
    await new Promise((r) => document.addEventListener("DOMContentLoaded", r, { once: true }));
  }

  cacheEls();
  loadAuth();
  wireUI();
  await loadAll();

  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  }
}

init().catch((e) => {
  console.error(e);
  try {
    const chip = $("statusChip");
    if (chip) chip.textContent = "Init failed";
  } catch {}
});