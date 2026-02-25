const CryptoJS = require('crypto-js');

function generateKey() {
  const now = new Date();
  const dateStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-${String(now.getUTCDate()).padStart(2,'0')}`;
  const hour = now.getUTCHours();
  const block = Math.floor(hour / 4);
  return CryptoJS.SHA256(`time-warp-2024-secret:${dateStr}:${block}`).toString();
}

function encrypt(data) {
  const key = generateKey();
  const json = typeof data === 'string' ? data : JSON.stringify(data);
  return CryptoJS.AES.encrypt(json, key).toString();
}

function decrypt(ciphertext) {
  const key = generateKey();
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, key);
    const text = bytes.toString(CryptoJS.enc.Utf8);
    if (!text) {
      const prevKey = generatePrevKey();
      const prevBytes = CryptoJS.AES.decrypt(ciphertext, prevKey);
      return prevBytes.toString(CryptoJS.enc.Utf8);
    }
    return text;
  } catch {
    const prevKey = generatePrevKey();
    try {
      const prevBytes = CryptoJS.AES.decrypt(ciphertext, prevKey);
      return prevBytes.toString(CryptoJS.enc.Utf8);
    } catch { return null; }
  }
}

function generatePrevKey() {
  const now = new Date();
  now.setUTCHours(now.getUTCHours() - 4);
  const dateStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-${String(now.getUTCDate()).padStart(2,'0')}`;
  const hour = now.getUTCHours();
  const block = Math.floor(hour / 4);
  return CryptoJS.SHA256(`time-warp-2024-secret:${dateStr}:${block}`).toString();
}

module.exports = { encrypt, decrypt, generateKey };
