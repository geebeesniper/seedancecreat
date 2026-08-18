(function () {
  'use strict';

  const DB_NAME = 'gs-one-local-video-storage';
  const STORE = 'handles';
  const HANDLE_KEY = 'video-root';
  const LIBRARY_NAME = 'SeedanceVideos';
  const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.avi']);
  const META_KEY = 'gs_one_local_video_meta_v1';
  const SAVE_QUEUE = new Map();
  const KNOWN_GENERATIONS = new Map();

  const state = {
    rootHandle: null,
    libraryHandle: null,
    permission: 'unknown',
    lastError: '',
    syncing: false,
    listeners: new Set(),
  };

  function emit() {
    const detail = getStatus();
    state.listeners.forEach((fn) => { try { fn(detail); } catch (_) {} });
    try { window.dispatchEvent(new CustomEvent('gs-local-video-status', { detail })); } catch (_) {}
  }

  function onStatus(fn) {
    state.listeners.add(fn);
    return () => state.listeners.delete(fn);
  }

  function getStatus() {
    return {
      supported: isSupported(),
      configured: !!state.rootHandle,
      permission: state.permission,
      libraryReady: !!state.libraryHandle,
      libraryName: LIBRARY_NAME,
      rootName: state.rootHandle && state.rootHandle.name ? state.rootHandle.name : '',
      lastError: state.lastError,
      syncing: state.syncing,
    };
  }

  function isSupported() {
    return !!(window.showDirectoryPicker && window.indexedDB && window.FileSystemDirectoryHandle);
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('INDEXEDDB_OPEN_FAILED'));
    });
  }

  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('INDEXEDDB_READ_FAILED'));
      tx.oncomplete = () => db.close();
    });
  }

  async function idbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('INDEXEDDB_WRITE_FAILED')); };
    });
  }

  function readMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch (_) { return {}; }
  }

  function writeMeta(meta) {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta || {})); } catch (_) {}
  }

  function updateGenerationMeta(id, patch) {
    if (!id) return;
    const all = readMeta();
    all[id] = Object.assign({}, all[id] || {}, patch, { updatedAt: new Date().toISOString() });
    writeMeta(all);
    emit();
  }

  function getGenerationMeta(id) {
    return readMeta()[id] || null;
  }

  async function permissionOf(handle, request) {
    if (!handle) return 'unknown';
    try {
      const opts = { mode: 'readwrite' };
      let p = await handle.queryPermission(opts);
      if (p !== 'granted' && request) p = await handle.requestPermission(opts);
      return p;
    } catch (e) {
      state.lastError = errorText(e);
      return 'denied';
    }
  }

  async function ensureLibrary(create, requestPermission) {
    state.lastError = '';
    if (!isSupported()) throw new Error('FILE_SYSTEM_ACCESS_NOT_SUPPORTED');
    if (!state.rootHandle) {
      state.rootHandle = await idbGet(HANDLE_KEY);
    }
    if (!state.rootHandle) {
      state.permission = 'unknown';
      state.libraryHandle = null;
      emit();
      return null;
    }
    state.permission = await permissionOf(state.rootHandle, !!requestPermission);
    if (state.permission !== 'granted') {
      state.libraryHandle = null;
      emit();
      return null;
    }
    try {
      // If SeedanceVideos was removed, create:true recreates it as requested.
      state.libraryHandle = await state.rootHandle.getDirectoryHandle(LIBRARY_NAME, { create: !!create });
      emit();
      return state.libraryHandle;
    } catch (e) {
      state.libraryHandle = null;
      state.lastError = '无法创建或访问 ' + LIBRARY_NAME + ': ' + errorText(e);
      emit();
      throw e;
    }
  }

  async function chooseRoot() {
    if (!isSupported()) throw new Error('FILE_SYSTEM_ACCESS_NOT_SUPPORTED');
    state.lastError = '';
    try {
      const root = await window.showDirectoryPicker({ id: 'gs-one-video-root', mode: 'readwrite', startIn: 'videos' });
      state.rootHandle = root;
      await idbSet(HANDLE_KEY, root);
      try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) {}
      state.permission = await permissionOf(root, true);
      await ensureLibrary(true, false);
      return getStatus();
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      state.lastError = '选择或创建本地视频目录失败: ' + errorText(e);
      emit();
      throw e;
    }
  }

  async function reauthorize() {
    if (!state.rootHandle) state.rootHandle = await idbGet(HANDLE_KEY);
    if (!state.rootHandle) return chooseRoot();
    state.permission = await permissionOf(state.rootHandle, true);
    if (state.permission !== 'granted') {
      state.lastError = '本地目录未授权';
      emit();
      return getStatus();
    }
    await ensureLibrary(true, false);
    return getStatus();
  }

  function safePart(value, fallback) {
    const s = String(value == null ? '' : value).trim();
    const clean = s.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, '_').slice(0, 80);
    return clean || fallback;
  }

  function extFrom(url, contentType) {
    const ct = String(contentType || '').toLowerCase();
    if (ct.includes('webm')) return '.webm';
    if (ct.includes('quicktime')) return '.mov';
    if (ct.includes('mp4')) return '.mp4';
    try {
      const path = new URL(url, location.href).pathname.toLowerCase();
      for (const ext of VIDEO_EXTENSIONS) if (path.endsWith(ext)) return ext;
    } catch (_) {}
    return '.mp4';
  }

  async function childDir(parent, name) {
    return parent.getDirectoryHandle(safePart(name, 'unknown'), { create: true });
  }

  async function destinationForGeneration(gen, ext) {
    const library = await ensureLibrary(true, false);
    if (!library) throw new Error(state.permission === 'prompt' ? 'LOCAL_FOLDER_PERMISSION_REQUIRED' : 'LOCAL_FOLDER_NOT_CONFIGURED');
    const project = await childDir(library, 'project_' + safePart(gen.project_id || gen.projectId, 'unknown'));
    const episode = await childDir(project, 'episode_' + safePart(gen.episode_id || gen.episodeId, 'unknown'));
    const shot = await childDir(episode, 'shot_' + safePart(gen.shot_seq ?? gen.shotSeq, '0'));
    const id = safePart(gen.id, String(Date.now()));
    const name = 'generation_' + id + ext;
    return { dir: shot, name, relativePath: [project.name, episode.name, shot.name, name].join('/') };
  }

  async function fileExistsByGeneration(gen) {
    const library = await ensureLibrary(false, false);
    if (!library) return null;
    const marker = safePart(gen.id, '');
    if (!marker) return null;
    const files = await scanVideos();
    return files.find((x) => x.name.includes(marker) || x.relativePath.includes(marker)) || null;
  }

  function readyUrl(gen) {
    return String(gen.video_url || gen.videoUrl || gen.result_url || gen.resultUrl || '').trim();
  }

  async function saveGeneration(gen, options) {
    options = options || {};
    const id = String(gen && gen.id || '');
    if (!id) throw new Error('GENERATION_ID_REQUIRED');
    if (SAVE_QUEUE.has(id)) return SAVE_QUEUE.get(id);
    const promise = (async () => {
      const existing = await fileExistsByGeneration(gen).catch(() => null);
      if (existing) {
        updateGenerationMeta(id, { status: 'saved', relativePath: existing.relativePath, error: '' });
        return { success: true, alreadyExists: true, file: existing };
      }
      if (!state.rootHandle && options.interactive) await chooseRoot();
      const library = await ensureLibrary(true, !!options.interactive);
      if (!library) {
        const code = state.rootHandle ? 'LOCAL_FOLDER_PERMISSION_REQUIRED' : 'LOCAL_FOLDER_NOT_CONFIGURED';
        updateGenerationMeta(id, { status: 'error', error: code });
        throw new Error(code);
      }
      const url = readyUrl(gen);
      if (!url) {
        updateGenerationMeta(id, { status: 'error', error: 'VIDEO_URL_MISSING' });
        throw new Error('VIDEO_URL_MISSING');
      }
      updateGenerationMeta(id, { status: 'saving', error: '', sourceUrl: url });
      let response;
      try {
        response = await fetch(url, { credentials: 'omit', cache: 'no-store' });
      } catch (e) {
        const msg = 'VIDEO_DOWNLOAD_FAILED_OR_CORS: ' + errorText(e);
        updateGenerationMeta(id, { status: 'error', error: msg });
        throw new Error(msg);
      }
      if (!response.ok || !response.body) {
        const msg = 'VIDEO_DOWNLOAD_HTTP_' + response.status;
        updateGenerationMeta(id, { status: 'error', error: msg });
        throw new Error(msg);
      }
      const ext = extFrom(url, response.headers.get('content-type'));
      const dest = await destinationForGeneration(gen, ext);
      try {
        const fileHandle = await dest.dir.getFileHandle(dest.name, { create: true });
        const writable = await fileHandle.createWritable();
        await response.body.pipeTo(writable);
        const file = await fileHandle.getFile();
        if (!file.size) throw new Error('SAVED_FILE_IS_EMPTY');
        updateGenerationMeta(id, { status: 'saved', relativePath: dest.relativePath, size: file.size, error: '' });
        return { success: true, relativePath: dest.relativePath, size: file.size };
      } catch (e) {
        const msg = 'LOCAL_WRITE_FAILED: ' + errorText(e);
        updateGenerationMeta(id, { status: 'error', error: msg });
        throw new Error(msg);
      }
    })().finally(() => SAVE_QUEUE.delete(id));
    SAVE_QUEUE.set(id, promise);
    return promise;
  }

  async function autoSaveGenerations(rows) {
    if (!Array.isArray(rows) || !rows.length) return;
    for (const row of rows) { if (row && row.id) { KNOWN_GENERATIONS.set(String(row.id), row); const u=readyUrl(row); if(u) KNOWN_GENERATIONS.set('url:'+u,row); } }
    if (!state.rootHandle) state.rootHandle = await idbGet(HANDLE_KEY).catch(() => null);
    if (!state.rootHandle) return;
    const library = await ensureLibrary(true, false).catch(() => null);
    if (!library || state.permission !== 'granted') return;
    for (const gen of rows) {
      if (!gen || !gen.id || !readyUrl(gen)) continue;
      const meta = getGenerationMeta(String(gen.id));
      if (meta && meta.status === 'saved') continue;
      // Queue sequentially to avoid starting many large video downloads together.
      try { await saveGeneration(gen, { interactive: false }); } catch (_) {}
    }
  }

  async function saveUrl(url, suggestedName) {
    url = String(url || '').trim();
    if (!url) return { success: false, error: 'VIDEO_URL_MISSING' };
    try {
      const known = KNOWN_GENERATIONS.get('url:' + url);
      if (known) {
        const result = await saveGeneration(known, { interactive: true });
        return { success: true, path: result.relativePath || (result.file && result.file.relativePath) || '', local: true };
      }
      if (!state.rootHandle) await chooseRoot();
      const library = await ensureLibrary(true, true);
      if (!library) return { success: false, error: 'LOCAL_FOLDER_PERMISSION_REQUIRED' };
      const response = await fetch(url, { credentials: 'omit', cache: 'no-store' });
      if (!response.ok || !response.body) return { success: false, error: 'VIDEO_DOWNLOAD_HTTP_' + response.status };
      const downloads = await library.getDirectoryHandle('Downloads', { create: true });
      const ext = extFrom(url, response.headers.get('content-type'));
      let name = safePart(suggestedName || ('video_' + Date.now()), 'video_' + Date.now());
      if (!/\.(mp4|webm|mov|m4v|avi)$/i.test(name)) name += ext;
      const fileHandle = await downloads.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await response.body.pipeTo(writable);
      const file = await fileHandle.getFile();
      if (!file.size) return { success: false, error: 'SAVED_FILE_IS_EMPTY' };
      emit();
      return { success: true, path: 'Downloads/' + name, size: file.size, local: true };
    } catch (e) {
      state.lastError = '本地视频保存失败: ' + errorText(e);
      emit();
      return { success: false, error: errorText(e) };
    }
  }

  async function scanDir(dir, prefix, out) {
    for await (const [name, handle] of dir.entries()) {
      const relativePath = prefix ? prefix + '/' + name : name;
      if (handle.kind === 'directory') {
        await scanDir(handle, relativePath, out);
      } else {
        const dot = name.lastIndexOf('.');
        const ext = dot >= 0 ? name.slice(dot).toLowerCase() : '';
        if (!VIDEO_EXTENSIONS.has(ext)) continue;
        try {
          const file = await handle.getFile();
          out.push({ name, relativePath, size: file.size, lastModified: file.lastModified, handle });
        } catch (e) {
          out.push({ name, relativePath, size: 0, lastModified: 0, handle, error: errorText(e) });
        }
      }
    }
  }

  async function scanVideos() {
    const library = await ensureLibrary(true, false);
    if (!library) return [];
    const out = [];
    await scanDir(library, '', out);
    out.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
    return out;
  }

  async function openVideo(item) {
    const file = await item.handle.getFile();
    const url = URL.createObjectURL(file);
    return { url, file };
  }

  function errorText(e) {
    if (!e) return 'UNKNOWN_ERROR';
    return e.message || e.name || String(e);
  }

  async function initialize() {
    if (!isSupported()) { emit(); return getStatus(); }
    try {
      state.rootHandle = await idbGet(HANDLE_KEY);
      if (state.rootHandle) await ensureLibrary(true, false);
    } catch (e) {
      state.lastError = errorText(e);
      emit();
    }
    return getStatus();
  }

  window.GSLocalVideoStorage = {
    LIBRARY_NAME,
    isSupported,
    initialize,
    chooseRoot,
    reauthorize,
    ensureLibrary,
    scanVideos,
    openVideo,
    saveGeneration,
    saveUrl,
    autoSaveGenerations,
    getGenerationMeta,
    getStatus,
    onStatus,
  };

  initialize();
})();
