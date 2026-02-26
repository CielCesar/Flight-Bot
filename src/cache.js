class TTLCache {
  constructor({ defaultTtlMs = 5 * 60 * 1000, maxItems = 500 } = {}) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxItems = maxItems;
    this.map = new Map(); // key -> { value, expiresAt }
  }

  get(key) {
    const v = this.map.get(key);
    if (!v) return null;
    if (Date.now() > v.expiresAt) {
      this.map.delete(key);
      return null;
    }
    return v.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    if (this.map.size >= this.maxItems) {
      // 简单策略：删最早插入的
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key) {
    this.map.delete(key);
  }
}

module.exports = { TTLCache };