/* Piano Studio — data store: validated CRUD, relationships, change events, activity log. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;

  var subs = [];
  var batching = 0;
  var dirty = new Set();

  function emit(coll) {
    if (batching) { dirty.add(coll); return; }
    var set = new Set([coll]);
    subs.forEach(function (fn) { try { fn(set); } catch (e) { console.error(e); } });
  }
  function batch(fn) {
    batching++;
    try { return fn(); } finally {
      batching--;
      if (!batching && dirty.size) {
        var set = dirty; dirty = new Set();
        subs.forEach(function (f) { try { f(set); } catch (e) { console.error(e); } });
      }
    }
  }

  function list(coll) { return Array.from(PS.db.mem(coll).values()); }
  function get(coll, id) { return id ? PS.db.mem(coll).get(id) || null : null; }

  /* Create a record. Throws {errors} on validation failure. */
  function create(coll, data, opt) {
    opt = opt || {};
    var base = Object.assign(PS.schema.defaults(coll), data || {});
    var res = PS.schema.validate(coll, base);
    if (Object.keys(res.errors).length && !opt.force) { var err = new Error('validation'); err.errors = res.errors; throw err; }
    var now = U.nowISO();
    var rec = Object.assign(res.value, { id: (data && data.id) || U.uid(coll.slice(0, 3)), createdAt: (data && data.createdAt) || now, updatedAt: now });
    if (PS.domain) rec = PS.domain.beforeSave(coll, null, rec) || rec;
    PS.db.put(coll, rec);
    if (PS.domain) PS.domain.afterSave(coll, null, rec);
    emit(coll);
    return rec;
  }

  /* Update a record with a patch. Returns the new record. */
  function update(coll, id, patch, opt) {
    opt = opt || {};
    var prev = get(coll, id);
    if (!prev) throw new Error('not found: ' + coll + '/' + id);
    var merged = Object.assign({}, prev, patch);
    var res = PS.schema.validate(coll, merged);
    if (Object.keys(res.errors).length && !opt.force) { var err = new Error('validation'); err.errors = res.errors; throw err; }
    var next = Object.assign(res.value, { id: prev.id, createdAt: prev.createdAt, updatedAt: U.nowISO() });
    if (PS.domain) next = PS.domain.beforeSave(coll, prev, next) || next;
    PS.db.put(coll, next);
    if (PS.domain) PS.domain.afterSave(coll, prev, next);
    emit(coll);
    return next;
  }

  /* Write a record without validation/hooks (internal collections such as xp, activity). */
  function putRaw(coll, rec) {
    if (!rec.id) rec.id = U.uid(coll.slice(0, 3));
    if (!rec.createdAt) rec.createdAt = U.nowISO();
    rec.updatedAt = U.nowISO();
    PS.db.put(coll, rec);
    emit(coll);
    return rec;
  }

  /* References that must be cleaned when a record is deleted. */
  var REFS = {
    songs: [['tasks', 'songId'], ['resources', 'songId'], ['notes', 'songIds'], ['lessons', 'songIds'], ['courses', 'songIds'], ['goals', 'songIds'], ['collections', 'songIds']],
    lessons: [['tasks', 'lessonId'], ['notes', 'lessonId'], ['courses', 'lessonIds'], ['goals', 'lessonIds']],
    courses: [['tasks', 'courseId'], ['resources', 'courseId'], ['goals', 'courseIds']]
  };

  /* Count records that reference this one (for delete confirmations). */
  function referencesTo(coll, id) {
    var n = 0;
    (REFS[coll] || []).forEach(function (r) {
      list(r[0]).forEach(function (rec) {
        var v = rec[r[1]];
        if (Array.isArray(v) ? v.indexOf(id) >= 0 : v === id) n++;
      });
    });
    return n;
  }

  /* Safe delete: detaches references instead of cascading deletions. XP history is kept. */
  function remove(coll, id) {
    var rec = get(coll, id);
    if (!rec) return;
    batch(function () {
      (REFS[coll] || []).forEach(function (r) {
        list(r[0]).forEach(function (other) {
          var v = other[r[1]];
          if (Array.isArray(v) ? v.indexOf(id) >= 0 : v === id) {
            var copy = Object.assign({}, other);
            copy[r[1]] = Array.isArray(v) ? v.filter(function (x) { return x !== id; }) : '';
            copy.updatedAt = U.nowISO();
            PS.db.put(r[0], copy);
            emit(r[0]);
          }
        });
      });
      if (rec.file && rec.file.id) PS.db.deleteFile(rec.file.id);
      PS.db.del(coll, id);
      // remove notifications that point at the deleted record
      list('notifications').forEach(function (n) { if (n.refId === id) PS.db.del('notifications', n.id); });
      emit(coll);
    });
  }

  function distinct(coll, key) {
    var s = new Set();
    list(coll).forEach(function (r) {
      var v = r[key];
      if (Array.isArray(v)) v.forEach(function (x) { if (x) s.add(x); });
      else if (v) s.add(v);
    });
    return Array.from(s).sort(function (a, b) { return String(a).localeCompare(String(b), 'he'); });
  }

  /* Activity history — human-readable trail of what happened. */
  function log(type, text, ref) {
    var rec = { id: U.uid('act'), type: type, text: text, refColl: ref && ref.coll, refId: ref && ref.id, at: U.nowISO(), createdAt: U.nowISO(), updatedAt: U.nowISO() };
    PS.db.put('activity', rec);
    // keep the log bounded
    var all = list('activity');
    if (all.length > 600) {
      all.sort(U.byKey('at')).slice(0, all.length - 600).forEach(function (r) { PS.db.del('activity', r.id); });
    }
    emit('activity');
    return rec;
  }

  /* Display name for any record. */
  function titleOf(coll, rec) {
    if (!rec) return '';
    return rec.title || rec.name || (coll === 'journal' ? 'יומן · ' + U.fmtDate(rec.date) : '');
  }

  PS.store = {
    list: list, get: get, create: create, update: update, remove: remove, putRaw: putRaw,
    referencesTo: referencesTo, distinct: distinct, log: log, batch: batch, titleOf: titleOf,
    emit: emit,
    on: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; }
  };
})();
