import { safeStorage } from 'electron';

let inMemoryToken = null;

export class DesktopAuthManager {
  constructor() {
    this.token = null;
    this.user = null;
  }

  setToken(token, user = null) {
    this.token = token;
    this.user = user;
    inMemoryToken = token;
  }

  getToken() {
    return this.token || inMemoryToken || process.env.MUMBLE_AUTH_TOKEN || null;
  }

  getUser() {
    return this.user;
  }

  clearToken() {
    this.token = null;
    this.user = null;
    inMemoryToken = null;
  }

  getAuthHeaders() {
    const token = this.getToken();
    if (!token) return {};
    return {
      'Authorization': `Bearer ${token}`
    };
  }
}

export const desktopAuthManager = new DesktopAuthManager();
