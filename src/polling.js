// src/polling.js
class PollingManager {
  constructor() {
    // userId -> { timer, intervalMs, queryParams, pref, bestSignature, bestScore }
    this.active = new Map();
  }

  isRunning(userId) {
    return this.active.has(userId);
  }

  stop(userId) {
    const entry = this.active.get(userId);
    if (entry?.timer) clearInterval(entry.timer);
    this.active.delete(userId);
  }

  status(userId) {
    const e = this.active.get(userId);
    if (!e) return null;
    return { intervalMs: e.intervalMs, queryParams: e.queryParams, pref: e.pref };
  }

  start({ userId, intervalMs, queryParams, pref, tick }) {
    // stop existing
    this.stop(userId);

    const entry = {
      timer: null,
      intervalMs,
      queryParams,
      pref,
      bestSignature: null,
      bestScore: null,
      firstRunDone: false,
      running: false,
      tick,
    };

    const runOnce = async () => {
      if (entry.running) return; // avoid overlapping calls
      entry.running = true;
      try {
        await entry.tick(entry);
      } finally {
        entry.running = false;
      }
    };

    // run immediately once
    runOnce();

    entry.timer = setInterval(runOnce, intervalMs);
    this.active.set(userId, entry);
  }
}

module.exports = { PollingManager };