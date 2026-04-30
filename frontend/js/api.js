/* ============================================
   Enigma — api.js
   Centralized fetch wrapper for REST API
   ============================================ */

const API_BASE = '/backend/api';

const Api = (() => {

  /* ── Token helpers ─────────────────────── */
  const getToken = () => localStorage.getItem('nc_token');
  const setToken = (t) => localStorage.setItem('nc_token', t);
  const clearToken = () => localStorage.removeItem('nc_token');

  /* ── Base request ──────────────────────── */
  async function request(method, path, body = null, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config = {
      method,
      headers,
      ...opts,
    };

    if (body && method !== 'GET') {
      config.body = JSON.stringify(body);
    }

    try {
      const res = await fetch(`${API_BASE}/${path}`, config);

      // Token expired — redirect to auth
      if (res.status === 401) {
        clearToken();
        window.location.href = '/frontend/pages/auth.html';
        return null;
      }

      const data = await res.json();

      if (!res.ok) {
        throw new ApiError(data.message || 'Unknown error', res.status, data);
      }

      return data;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError('Network error. Check connection.', 0);
    }
  }

  /* ── File upload ───────────────────────── */
  async function upload(path, formData) {
    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/${path}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new ApiError(data.message, res.status, data);
    return data;
  }

  /* ─────────────────────────────────────── */
  /*  AUTH                                   */
  /* ─────────────────────────────────────── */
  const auth = {
    /** POST /auth.php?action=register */
    register: (login, email, password, nickname) =>
      request('POST', 'auth.php?action=register', { login, email, password, nickname }),

    /** POST /auth.php?action=login */
    login: async (login, password) => {
      const data = await request('POST', 'auth.php?action=login', { login, password });
      if (data?.token) setToken(data.token);
      return data;
    },

    /** POST /auth.php?action=logout */
    logout: async () => {
      await request('POST', 'auth.php?action=logout');
      clearToken();
    },

    /** POST /auth.php?action=recover */
    recover: (email) =>
      request('POST', 'auth.php?action=recover', { email }),

    /** POST /auth.php?action=reset_password */
    resetPassword: (token, newPassword) =>
      request('POST', 'auth.php?action=reset_password', { token, new_password: newPassword }),

    /** GET /auth.php?action=me */
    me: () => request('GET', 'auth.php?action=me'),

    /** POST /auth.php?action=change_password */
    changePassword: (oldPassword, newPassword) =>
      request('POST', 'auth.php?action=change_password', { old_password: oldPassword, new_password: newPassword }),

    isLoggedIn: () => !!getToken(),
    getToken,
    setToken,
    clearToken,
  };

  /* ─────────────────────────────────────── */
  /*  PROFILE                                */
  /* ─────────────────────────────────────── */
  const profile = {
    /** GET /profile.php?action=get&user_id=X */
    get: (userId = null) =>
      request('GET', `profile.php?action=get${userId ? `&user_id=${userId}` : ''}`),

    /** POST /profile.php?action=update */
    update: (fields) =>
      request('POST', 'profile.php?action=update', fields),

    /** POST /profile.php?action=upload_avatar (multipart) */
    uploadAvatar: (file) => {
      const fd = new FormData();
      fd.append('avatar', file);
      return upload('profile.php?action=upload_avatar', fd);
    },

    /** POST /profile.php?action=set_status */
    setStatus: (status) =>
      request('POST', 'profile.php?action=set_status', { status }),
  };

  /* ─────────────────────────────────────── */
  /*  CONTACTS                               */
  /* ─────────────────────────────────────── */
  const contacts = {
    /** GET /contacts.php?action=list */
    list: () => request('GET', 'contacts.php?action=list'),

    /** GET /contacts.php?action=search&q=... */
    search: (query) =>
      request('GET', `contacts.php?action=search&q=${encodeURIComponent(query)}`),

    /** POST /contacts.php?action=add */
    add: (userId) =>
      request('POST', 'contacts.php?action=add', { user_id: userId }),

    /** POST /contacts.php?action=remove */
    remove: (userId) =>
      request('POST', 'contacts.php?action=remove', { user_id: userId }),

    /** POST /contacts.php?action=block */
    block: (userId) =>
      request('POST', 'contacts.php?action=block', { user_id: userId }),
  };

  /* ─────────────────────────────────────── */
  /*  CHATS                                  */
  /* ─────────────────────────────────────── */
  const chats = {
    /** GET /chats.php?action=list */
    list: () => request('GET', 'chats.php?action=list'),

    /** POST /chats.php?action=create_direct */
    createDirect: (userId) =>
      request('POST', 'chats.php?action=create_direct', { user_id: userId }),

    /** POST /chats.php?action=create_group */
    createGroup: (name, memberIds) =>
      request('POST', 'chats.php?action=create_group', { name, member_ids: memberIds }),

    /** POST /chats.php?action=delete */
    delete: (chatId) =>
      request('POST', 'chats.php?action=delete', { chat_id: chatId }),

    /** POST /chats.php?action=leave */
    leave: (chatId) =>
      request('POST', 'chats.php?action=leave', { chat_id: chatId }),

    /** POST /chats.php?action=add_member */
    addMember: (chatId, userId) =>
      request('POST', 'chats.php?action=add_member', { chat_id: chatId, user_id: userId }),

    /** GET /chats.php?action=members&chat_id=X */
    members: (chatId) =>
      request('GET', `chats.php?action=members&chat_id=${chatId}`),
  };

  /* ─────────────────────────────────────── */
  /*  MESSAGES                               */
  /* ─────────────────────────────────────── */
  const messages = {
    /** GET /messages.php?action=list&chat_id=X&before=Y&limit=Z */
    list: (chatId, before = null, limit = 40) => {
      let url = `messages.php?action=list&chat_id=${chatId}&limit=${limit}`;
      if (before) url += `&before=${before}`;
      return request('GET', url);
    },

    /** POST /messages.php?action=send */
    send: (chatId, content, typeId = 1, replyTo = null) =>
      request('POST', 'messages.php?action=send', {
        chat_id: chatId,
        content,
        type_id: typeId,
        reply_to: replyTo,
      }),

    /** POST /messages.php?action=delete */
    delete: (messageId) =>
      request('POST', 'messages.php?action=delete', { message_id: messageId }),

    /** POST /messages.php?action=edit */
    edit: (messageId, content) =>
      request('POST', 'messages.php?action=edit', { message_id: messageId, content }),

    /** POST /messages.php?action=read */
    markRead: (chatId, lastId) =>
      request('POST', 'messages.php?action=read', { chat_id: chatId, last_id: lastId }),
  };

  /* ─────────────────────────────────────── */
  /*  MEDIA                                  */
  /* ─────────────────────────────────────── */
  const media = {
    /** POST /media.php?action=upload (multipart) */
    upload: (file, chatId) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('chat_id', chatId);
      return upload('media.php?action=upload', fd);
    },

    /** GET /media.php?action=get&message_id=X */
    get: (messageId) =>
      request('GET', `media.php?action=get&message_id=${messageId}`),
  };

  return { auth, profile, contacts, chats, messages, media, request };
})();

/* ─── Custom error class ─────────────────── */
class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

window.Api = Api;
window.ApiError = ApiError;
