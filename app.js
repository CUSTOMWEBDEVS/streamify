const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbx0622mQJwtzJr24tJGIw_L1zqEbyjMcOmBCN1ySd0kAXb6JmJonmorvq3nk9MGTpKO/exec",
  TOKEN_KEY: "mymusic_token",
  EMAIL_KEY: "mymusic_email",
};

const state = {
  email: "",
  token: "",
  authed: false,

  tracks: [],
  likes: new Set(),
  playlists: [], // {id,name,trackIds:[]}

  mode: { type: "all", playlistId: null },
  search: "",

  queue: [],
  currentIndex: -1,
  repeatAll: false,
  loopOne: false,
};

const $ = (id) => document.getElementById(id);

const el = {
  statusChip: $("statusChip"),

  btnAll: $("btnAll"),
  btnLiked: $("btnLiked"),
  countAll: $("countAll"),
  countLiked: $("countLiked"),

  playlistList: $("playlistList"),
  btnNewPlaylist: $("btnNewPlaylist"),

  btnReload: $("btnReload"),
  btnAddTrack: $("btnAddTrack"),
  btnExport: $("btnExport"),
  btnImportData: $("btnImportData"),

  search: $("search"),
  btnClear: $("btnClear"),
  btnShuffle: $("btnShuffle"),

  grid: $("grid"),
  empty: $("empty"),

  audio: $("audio"),
  btnPrev: $("btnPrev"),
  btnPlay: $("btnPlay"),
  btnNext: $("btnNext"),
  seek: $("seek"),
  tCur: $("tCur"),
  tDur: $("tDur"),
  npImg: $("npImg"),
  npTitle: $("npTitle"),
  npArtist: $("npArtist"),
  vol: $("vol"),
  pillRepeat: $("pillRepeat"),
  pillLoop: $("pillLoop"),

  // Auth modal
  authModal: $("authModal"),
  authEmail: $("authEmail"),
  authCode: $("authCode"),
  btnSendCode: $("btnSendCode"),
  btnVerify: $("btnVerify"),
  authErr: $("authErr"),

  // Add Track modal
  trackModal: $("trackModal"),
  trackClose: $("trackClose"),
  trackYt: $("trackYt"),
  trackUrl: $("trackUrl"),
  trackTitle: $("trackTitle"),
  trackArtist: $("trackArtist"),
  trackAlbum: $("trackAlbum"),
  trackArt: $("trackArt"),
  btnSaveTrack: $("btnSaveTrack"),
  trackErr: $("trackErr"),

  // Playlist modal
  playlistModal: $("playlistModal"),
  playlistModalTitle: $("playlistModalTitle"),
  playlistClose: $("playlistClose"),
  playlistName: $("playlistName"),
  btnSavePlaylist: $("btnSavePlaylist"),
  btnDeletePlaylist: $("btnDeletePlaylist"),
  playlistErr: $("playlistErr"),

  // Data modal
  dataModal: $("dataModal"),
  dataClose: $("dataClose"),
  dataJson: $("dataJson"),
  btnApplyData: $("btnApplyData"),
  btnCancelData: $("btnCancelData"),
  dataErr: $("dataErr"),
};

let editingPlaylistId = null;

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

function normalize(s) { return String(s || "").trim().toLowerCase(); }

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2,"0")}`;
}

function coverFor(t){ return t.artwork || ""; }
function titleFor(t){ return t.title || "Untitled"; }
function artistFor(t){ return t.artist || "Unknown"; }
function albumFor(t){ return t.album || ""; }

function apiUrl(params) {
  const u = new URL(CONFIG.API_URL);
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k, String(v)));
  return u.toString();
}

async function apiGet(params) {
  const res = await fetch(apiUrl(params), { cache: "no-store" });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "API error");
  return json;
}

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

async function ensureAuthed() {
  if (state.authed) return;
  openAuthModal();
  throw new Error("Not logged in.");
}

/* ------------------- Load Data ------------------- */

async function loadAll() {
  await ensureAuthed().catch(() => {});

  if (!state.authed) {
    setStatus("Login required", "warn");
    return;
  }

  setStatus("Loading…", "warn");
  try {
    const [lib, likes, pls] = await Promise.all([
      apiGet({ action:"library", email: state.email, token: state.token }),
      apiGet({ action:"likes", email: state.email, token: state.token }),
      apiGet({ action:"playlists", email: state.email, token: state.token }),
    ]);

    state.tracks = lib.tracks || [];
    state.likes = new Set((likes.likes || []).map(String));
    state.playlists = pls.playlists || [];

    updateCounts();
    renderPlaylists();
    renderGrid();
    setStatus("Ready", "ok");
  } catch (e) {
    console.error(e);
    setStatus("Auth failed", "bad");
    clearAuth();
    openAuthModal();
  }
}

function updateCounts() {
  el.countAll.textContent = String(state.tracks.length);
  el.countLiked.textContent = String(state.likes.size);
}

function currentList() {
  let list = state.tracks.slice();

  const q = normalize(state.search);
  if (q) {
    list = list.filter(t => {
      const hay = `${titleFor(t)} ${artistFor(t)} ${albumFor(t)}`.toLowerCase();
      return hay.includes(q);
    });
  }

  if (state.mode.type === "liked") {
    list = list.filter(t => state.likes.has(t.id));
  } else if (state.mode.type === "playlist" && state.mode.playlistId) {
    const p = state.playlists.find(x => x.id === state.mode.playlistId);
    const set = new Set((p?.trackIds || []).map(String));
    list = list.filter(t => set.has(String(t.id)));
  }

  return list;
}

function setSidebarActive() {
  el.btnAll.classList.toggle("active", state.mode.type === "all");
  el.btnLiked.classList.toggle("active", state.mode.type === "liked");
}

/* ------------------- UI Render ------------------- */

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
      state.mode = { type:"playlist", playlistId: p.id };
      setSidebarActive();
      renderPlaylists();
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
      fb.textContent = "STREAMIFY";
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
    tag.textContent = "AUDIO";

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
      openAddToPlaylistMenu(t.id, addBtn);
    };

    const likeBtn = document.createElement("button");
    likeBtn.className = "iconBtn";
    likeBtn.title = "Like";
    likeBtn.textContent = state.likes.has(String(t.id)) ? "♥" : "♡";
    likeBtn.onclick = async (ev) => {
      ev.stopPropagation();
      try {
        await ensureAuthed();
        const id = String(t.id);
        if (state.likes.has(id)) {
          await apiGet({ action:"unlike", email:state.email, token:state.token, trackId:id });
          state.likes.delete(id);
        } else {
          await apiGet({ action:"like", email:state.email, token:state.token, trackId:id });
          state.likes.add(id);
        }
        updateCounts();
        renderGrid();
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

/* ------------------- Playback ------------------- */

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
  el.npArtist.textContent = artistFor(t);
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
      setStatus("Playing", "ok");
    }).catch(() => setStatus("Play failed", "bad"));
  } else {
    el.audio.pause();
    el.btnPlay.textContent = "▶";
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

el.audio.addEventListener("loadedmetadata", () => {
  el.tDur.textContent = fmtTime(el.audio.duration);
});
el.audio.addEventListener("timeupdate", () => {
  el.tCur.textContent = fmtTime(el.audio.currentTime);
  const dur = el.audio.duration || 0;
  el.seek.value = dur > 0 ? Math.floor((el.audio.currentTime / dur) * 1000) : 0;
});
el.audio.addEventListener("ended", () => nextTrack());

el.seek.addEventListener("input", () => {
  const dur = el.audio.duration || 0;
  if (dur <= 0) return;
  el.audio.currentTime = (Number(el.seek.value) / 1000) * dur;
});

(function initVolume(){
  const saved = Number(localStorage.getItem(CONFIG.VOL_KEY) || "0.8");
  const v = Math.min(1, Math.max(0, saved));
  el.audio.volume = v;
  el.vol.value = String(Math.round(v * 100));
  el.vol.addEventListener("input", () => {
    const val = Math.min(1, Math.max(0, Number(el.vol.value) / 100));
    el.audio.volume = val;
    localStorage.setItem(CONFIG.VOL_KEY, String(val));
  });
})();

/* ------------------- Menus + Modals ------------------- */

let menuEl = null;
function closeMenu(){ if (menuEl) { menuEl.remove(); menuEl = null; } }

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
  m.style.background = "rgba(16,21,33,.98)";
  m.style.backdropFilter = "blur(12px)";
  m.style.borderRadius = "14px";
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
        await ensureAuthed();
        if (has) {
          await apiGet({ action:"playlistRemoveTrack", email:state.email, token:state.token, playlistId:p.id, trackId:String(trackId) });
          p.trackIds = (p.trackIds || []).filter(x => String(x) !== String(trackId));
        } else {
          await apiGet({ action:"playlistAddTrack", email:state.email, token:state.token, playlistId:p.id, trackId:String(trackId) });
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

function closePlaylistModal(){
  el.playlistModal.style.display = "none";
  editingPlaylistId = null;
}

function openTrackModal(){
  el.trackErr.textContent = "";
  el.trackYt.value = "";
  el.trackUrl.value = "./musicup/";
  el.trackTitle.value = "";
  el.trackArtist.value = "";
  el.trackAlbum.value = "";
  el.trackArt.value = "";
  el.trackModal.style.display = "flex";
  setTimeout(() => el.trackUrl.focus(), 50);
}

function closeTrackModal(){
  el.trackModal.style.display = "none";
}

/* ------------------- Wire UI ------------------- */

function wireUI() {
  el.btnAll.onclick = () => { state.mode = { type:"all", playlistId:null }; renderPlaylists(); renderGrid(); };
  el.btnLiked.onclick = () => { state.mode = { type:"liked", playlistId:null }; renderPlaylists(); renderGrid(); };

  el.btnNewPlaylist.onclick = () => openPlaylistModal(null);

  el.btnReload.onclick = () => loadAll();
  el.btnAddTrack.onclick = () => openTrackModal();

  el.search.addEventListener("input", () => { state.search = el.search.value || ""; renderGrid(); });
  el.btnClear.onclick = () => { el.search.value = ""; state.search = ""; renderGrid(); };

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
  };
  el.pillLoop.onclick = () => {
    state.loopOne = !state.loopOne;
    el.pillLoop.classList.toggle("active", state.loopOne);
  };

  // Auth modal
  el.authModal.addEventListener("click", (e) => { if (e.target === el.authModal) closeAuthModal(); });
  el.btnSendCode.onclick = async () => {
    el.authErr.textContent = "";
    const email = (el.authEmail.value || "").trim().toLowerCase();
    if (!email.includes("@")) { el.authErr.textContent = "Enter a valid email."; return; }
    try {
      setStatus("Sending…", "warn");
      await apiGet({ action:"requestCode", email });
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
    if (!email.includes("@")) { el.authErr.textContent = "Enter a valid email."; return; }
    if (!code) { el.authErr.textContent = "Enter the code."; return; }
    try {
      setStatus("Verifying…", "warn");
      const out = await apiGet({ action:"verifyCode", email, code });
      saveAuth(email, out.token);
      closeAuthModal();
      await loadAll();
    } catch (e) {
      console.error(e);
      setStatus("Verify failed", "bad");
      el.authErr.textContent = e.message || String(e);
    }
  };

  // Playlist modal
  el.playlistClose.onclick = () => closePlaylistModal();
  el.playlistModal.addEventListener("click", (e) => { if (e.target === el.playlistModal) closePlaylistModal(); });

  el.btnSavePlaylist.onclick = async () => {
    el.playlistErr.textContent = "";
    try {
      await ensureAuthed();
      const name = (el.playlistName.value || "").trim();
      if (!name) throw new Error("Name required.");

      if (!editingPlaylistId) {
        const out = await apiGet({ action:"playlistCreate", email:state.email, token:state.token, name });
        state.playlists.unshift({ id: out.id, name, trackIds: [] });
      } else {
        await apiGet({ action:"playlistRename", email:state.email, token:state.token, id: editingPlaylistId, name });
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
    try {
      await ensureAuthed();
      if (!editingPlaylistId) return;
      await apiGet({ action:"playlistDelete", email:state.email, token:state.token, id: editingPlaylistId });
      state.playlists = state.playlists.filter(p => p.id !== editingPlaylistId);
      if (state.mode.type === "playlist" && state.mode.playlistId === editingPlaylistId) {
        state.mode = { type:"all", playlistId:null };
      }
      renderPlaylists();
      renderGrid();
      closePlaylistModal();
    } catch (e) {
      console.error(e);
      el.playlistErr.textContent = e.message || String(e);
    }
  };

  // Track modal
  el.trackClose.onclick = () => closeTrackModal();
  el.trackModal.addEventListener("click", (e) => { if (e.target === el.trackModal) closeTrackModal(); });

  el.btnSaveTrack.onclick = async () => {
    el.trackErr.textContent = "";
    try {
      await ensureAuthed();

      const youtube = (el.trackYt.value || "").trim();
      const url = (el.trackUrl.value || "").trim();
      const title = (el.trackTitle.value || "").trim();
      const artist = (el.trackArtist.value || "").trim();
      const album = (el.trackAlbum.value || "").trim();
      const artwork = (el.trackArt.value || "").trim();

      if (!title) throw new Error("Title required.");
      if (!url) throw new Error("Local url required (./musicup/...)");
      if (!url.startsWith("./musicup/") && !url.startsWith("musicup/")) {
        throw new Error("url must be under ./musicup/ so GitHub Pages can serve it.");
      }

      const out = await apiGet({
        action:"trackAdd",
        email:state.email,
        token:state.token,
        youtube,
        url,
        title,
        artist,
        album,
        artwork
      });

      state.tracks.unshift({ id: out.id, title, artist: artist || "Unknown", album, url, artwork, youtube });
      updateCounts();
      renderGrid();
      closeTrackModal();
      setStatus("Track added", "ok");
    } catch (e) {
      console.error(e);
      el.trackErr.textContent = e.message || String(e);
      setStatus("Add failed", "bad");
    }
  };

  // Export/import (client-only user data is not needed now)
  // But you asked to keep GAS+Sheets: export/import is less necessary.
  // We'll export a snapshot of local auth state + nothing else (safe).
  el.btnExport.onclick = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      email: state.email,
      note: "Playlists/likes/library are stored in Google Sheets."
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "streamify-export.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  el.btnImportData.onclick = () => {
    el.dataErr.textContent = "";
    el.dataJson.value = "";
    el.dataModal.style.display = "flex";
    setTimeout(() => el.dataJson.focus(), 50);
  };

  el.dataClose.onclick = () => { el.dataModal.style.display = "none"; };
  el.btnCancelData.onclick = () => { el.dataModal.style.display = "none"; };
  el.btnApplyData.onclick = () => {
    el.dataErr.textContent = "";
    try {
      const txt = el.dataJson.value.trim();
      if (!txt) throw new Error("Paste JSON first.");
      const parsed = JSON.parse(txt);
      if (parsed.email) localStorage.setItem(CONFIG.EMAIL_KEY, String(parsed.email));
      el.dataModal.style.display = "none";
      setStatus("Imported", "ok");
    } catch (e) {
      el.dataErr.textContent = e.message || String(e);
    }
  };
  el.dataModal.addEventListener("click", (e) => { if (e.target === el.dataModal) el.dataModal.style.display = "none"; });

  window.addEventListener("scroll", () => closeMenu(), { passive:true });
  window.addEventListener("resize", () => closeMenu());

  window.addEventListener("keydown", (e) => {
    if (e.target && ["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)) return;
    if (e.code === "Space") { e.preventDefault(); togglePlayPause(); }
    if (e.code === "ArrowRight" && e.shiftKey) nextTrack();
    if (e.code === "ArrowLeft" && e.shiftKey) prevTrack();
  });
}

/* ------------------- init ------------------- */

async function init() {
  loadAuth();
  wireUI();

  if (!state.authed) openAuthModal();
  await loadAll();

  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  }
}

init().catch((e) => {
  console.error(e);
  setStatus("Init failed", "bad");
});
