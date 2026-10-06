/* Piano Studio — local-first persistence.
 * Records live in IndexedDB (one object store per collection) with an in-memory
 * mirror for fast synchronous reads. Local files are stored as Blobs in a
 * separate "files" store. Small preferences use localStorage (see prefs.js).
 * If IndexedDB is unavailable, a localStorage fallback keeps the app usable.
 */
(function () {
  'use strict';
  var PS = window.PS;

  var DB_NAME = 'piano-studio';
  var DB_VERSION = 2; // v2: practice store
  var SCHEMA_VERSION = 1; // data-level migrations (see migrate())
  var COLLECTIONS = ['lessons', 'notes', 'songs', 'collections', 'courses', 'tasks', 'goals', 'events', 'journal', 'resources', 'practice', 'xp', 'achievements', 'notifications', 'activity'];
  var FALLBACK_KEY = 'ps.fallback.data';

  var idb = null;
  var mode = 'idb';
  var mem = {};
  var pending = 0;
  var listeners = [];
  COLLECTIONS.forEach(function (c) { mem[c] = new Map(); });

  function openIDB() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { return reject(e); }
      req.onupgradeneeded = function () {
        var db = req.result;
        COLLECTIONS.forEach(function (c) { if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' }); });
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error('IndexedDB blocked')); };
    });
  }

  function reqP(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function txDone(tx) { return new Promise(function (res, rej) { tx.oncomplete = res; tx.onerror = function () { rej(tx.error); }; tx.onabort = function () { rej(tx.error || new Error('aborted')); }; }); }

  function loadAllIDB() {
    var tx = idb.transaction(COLLECTIONS.concat(['meta']), 'readonly');
    var ps = COLLECTIONS.map(function (c) {
      return reqP(tx.objectStore(c).getAll()).then(function (rows) {
        mem[c] = new Map();
        rows.forEach(function (r) { mem[c].set(r.id, r); });
      });
    });
    var metaP = reqP(tx.objectStore('meta').get('schemaVersion'));
    return Promise.all(ps).then(function () { return metaP; }).then(function (m) { return m ? m.value : 0; });
  }

  function loadFallback() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(FALLBACK_KEY) || 'null'); } catch (e) { raw = null; }
    COLLECTIONS.forEach(function (c) {
      mem[c] = new Map();
      ((raw && raw[c]) || []).forEach(function (r) { mem[c].set(r.id, r); });
    });
    return raw && raw.__schemaVersion ? raw.__schemaVersion : 0;
  }
  var saveFallback = PS.util.debounce(function () {
    var out = { __schemaVersion: SCHEMA_VERSION };
    COLLECTIONS.forEach(function (c) { out[c] = Array.from(mem[c].values()); });
    try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(out)); }
    catch (e) { emitError(e); }
  }, 200);

  function emitError(e) {
    console.error('[PianoStudio] storage error', e);
    listeners.forEach(function (fn) { try { fn(e); } catch (x) {} });
  }

  /* Data-level migrations run once per schema bump. */
  function migrate(fromVersion) {
    var changed = [];
    if (fromVersion < 1) {
      // v1: initial schema — ensure timestamps exist on every record.
      COLLECTIONS.forEach(function (c) {
        mem[c].forEach(function (r) {
          if (!r.createdAt) { r.createdAt = new Date().toISOString(); changed.push([c, r]); }
          if (!r.updatedAt) { r.updatedAt = r.createdAt; }
        });
      });
    }
    return Promise.all(changed.map(function (x) { return put(x[0], x[1]); })).then(function () { return setMeta('schemaVersion', SCHEMA_VERSION); });
  }

  function setMeta(key, value) {
    if (mode !== 'idb') return Promise.resolve();
    var tx = idb.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key: key, value: value });
    return txDone(tx);
  }

  function init() {
    return openIDB().then(function (db) {
      idb = db;
      mode = 'idb';
      return loadAllIDB();
    }).catch(function (e) {
      console.warn('[PianoStudio] IndexedDB unavailable, falling back to localStorage', e);
      mode = 'local';
      return loadFallback();
    }).then(function (ver) {
      if (ver < SCHEMA_VERSION) return migrate(ver);
    });
  }

  function track(p) {
    pending++;
    return p.then(function (v) { pending--; return v; }, function (e) { pending--; emitError(e); throw e; });
  }

  function put(coll, rec) {
    mem[coll].set(rec.id, rec);
    if (mode !== 'idb') { saveFallback(); return Promise.resolve(rec); }
    var tx = idb.transaction(coll, 'readwrite');
    tx.objectStore(coll).put(rec);
    return track(txDone(tx).then(function () { return rec; }));
  }
  function del(coll, id) {
    mem[coll].delete(id);
    if (mode !== 'idb') { saveFallback(); return Promise.resolve(); }
    var tx = idb.transaction(coll, 'readwrite');
    tx.objectStore(coll).delete(id);
    return track(txDone(tx));
  }
  /* Replace every collection atomically (used by import & reset). */
  function replaceAll(data) {
    COLLECTIONS.forEach(function (c) {
      mem[c] = new Map();
      (data[c] || []).forEach(function (r) { mem[c].set(r.id, r); });
    });
    if (mode !== 'idb') { saveFallback(); return Promise.resolve(); }
    var tx = idb.transaction(COLLECTIONS, 'readwrite');
    COLLECTIONS.forEach(function (c) {
      var st = tx.objectStore(c);
      st.clear();
      (data[c] || []).forEach(function (r) { st.put(r); });
    });
    return track(txDone(tx));
  }

  /* ---- files (Blobs) ---- */
  function putFile(blob, name) {
    if (mode !== 'idb') return Promise.reject(new Error('אחסון קבצים מקומי אינו זמין בדפדפן זה'));
    var rec = { id: PS.util.uid('file'), name: name || blob.name || 'file', type: blob.type || '', size: blob.size, blob: blob, createdAt: new Date().toISOString() };
    var tx = idb.transaction('files', 'readwrite');
    tx.objectStore('files').put(rec);
    return track(txDone(tx).then(function () { return { id: rec.id, name: rec.name, size: rec.size, type: rec.type }; }));
  }
  function getFile(id) {
    if (mode !== 'idb') return Promise.resolve(null);
    var tx = idb.transaction('files', 'readonly');
    return reqP(tx.objectStore('files').get(id));
  }
  function deleteFile(id) {
    if (mode !== 'idb' || !id) return Promise.resolve();
    var tx = idb.transaction('files', 'readwrite');
    tx.objectStore('files').delete(id);
    return track(txDone(tx));
  }
  function clearFiles() {
    if (mode !== 'idb') return Promise.resolve();
    var tx = idb.transaction('files', 'readwrite');
    tx.objectStore('files').clear();
    return track(txDone(tx));
  }
  function filesUsage() {
    if (mode !== 'idb') return Promise.resolve({ count: 0, bytes: 0 });
    var tx = idb.transaction('files', 'readonly');
    return reqP(tx.objectStore('files').getAll()).then(function (rows) {
      return { count: rows.length, bytes: rows.reduce(function (s, r) { return s + (r.size || 0); }, 0) };
    });
  }

  function snapshot() {
    var out = {};
    COLLECTIONS.forEach(function (c) { out[c] = Array.from(mem[c].values()); });
    return out;
  }

  PS.db = {
    COLLECTIONS: COLLECTIONS,
    SCHEMA_VERSION: SCHEMA_VERSION,
    init: init,
    mem: function (c) { return mem[c]; },
    put: put,
    del: del,
    replaceAll: replaceAll,
    putFile: putFile,
    getFile: getFile,
    deleteFile: deleteFile,
    clearFiles: clearFiles,
    filesUsage: filesUsage,
    snapshot: snapshot,
    mode: function () { return mode; },
    pending: function () { return pending; },
    onError: function (fn) { listeners.push(fn); }
  };
})();
