const CryptoWeb = {
  generateKey() {
    const now = new Date();
    const dateStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-${String(now.getUTCDate()).padStart(2,'0')}`;
    const hour = now.getUTCHours();
    const block = Math.floor(hour / 4);
    return CryptoWeb.sha256(`time-warp-2024-secret:${dateStr}:${block}`);
  },

  async sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  async encrypt(data) {
    const key = await this.generateKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(key.slice(0, 32)), 'AES-GCM', false, ['encrypt']);
    const encoded = new TextEncoder().encode(typeof data === 'string' ? data : JSON.stringify(data));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keyMaterial, encoded);
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  },

  async decrypt(ciphertext) {
    try {
      const key = await this.generateKey();
      const data = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
      const iv = data.slice(0, 12);
      const encrypted = data.slice(12);
      const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(key.slice(0, 32)), 'AES-GCM', false, ['decrypt']);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, keyMaterial, encrypted);
      return new TextDecoder().decode(decrypted);
    } catch { return null; }
  }
};
