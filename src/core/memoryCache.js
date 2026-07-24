export class MemoryCache {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const value = this.store.get(key);
    if (!value) return null;

    if (Date.now() > value.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return value.data;
  }

  set(key, data, ttlMs) {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs
    });
  }
}

export const memoryCache = new MemoryCache();
