/* Piano Studio — user preferences (small, stored in localStorage). */
(function () {
  'use strict';
  var PS = window.PS;
  var KEY = 'ps.prefs.v1';

  var DEFAULTS = {
    name: '',
    initials: '',
    avatarColor: 'gold',
    theme: 'dark',              // dark | light | system
    language: 'he',
    intro: true,
    sound: false,
    reducedMotion: 'system',    // system | on | off
    weeklyGoal: 5,              // learning actions per week
    defaultLessonDuration: 45,
    calendarView: 'month',      // day | week | month | agenda
    xpToasts: true,
    levelUpAnimation: true,
    achievementAnimation: true,
    notifyLessons: true,
    notifyTasks: true,
    notifyGoals: true,
    notifyCourses: true,
    notifyLevel: true,
    notifyAchievements: true,
    browserNotifications: false,
    sidebarCollapsed: false,
    dashboardOrder: ['hero', 'notify', 'today', 'quick', 'week', 'progress', 'chart', 'learning', 'activity', 'milestones'],
    dashboardHidden: [],
    genres: null,
    lessonTemplate: null,
    onboarded: false,
    hasDemo: false,
    lessonsEnabled: false,      // learning with a teacher? (lesson manager on/off)
    practiceReminder: true,     // daily reminder to log practice
    practiceReminderTime: '19:00',
    dailyPracticeGoal: 20,      // minutes
    notifyPromptDismissed: false
  };

  var state = {};
  var subs = [];

  function load() {
    var raw = {};
    try { raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { raw = {}; }
    state = Object.assign({}, DEFAULTS, raw);
    // make sure any newly-added dashboard widgets show up for existing users
    DEFAULTS.dashboardOrder.forEach(function (w) { if (state.dashboardOrder.indexOf(w) < 0) state.dashboardOrder.push(w); });
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  function get(k) { return state[k]; }
  /* Lesson manager (learning with a teacher) is optional and off by default. */
  function lessons() { return !!state.lessonsEnabled; }
  function set(k, v) {
    if (typeof k === 'object') { Object.assign(state, k); }
    else state[k] = v;
    save();
    subs.forEach(function (fn) { fn(k); });
  }
  function all() { return Object.assign({}, state); }
  function replace(obj) {
    state = Object.assign({}, DEFAULTS);
    Object.keys(obj || {}).forEach(function (k) { if (k in DEFAULTS) state[k] = obj[k]; });
    save();
    subs.forEach(function (fn) { fn('*'); });
  }
  function reset() { state = Object.assign({}, DEFAULTS); save(); }

  load();
  PS.prefs = { lessons: lessons, get: get, set: set, all: all, replace: replace, reset: reset, DEFAULTS: DEFAULTS, on: function (fn) { subs.push(fn); } };
})();
