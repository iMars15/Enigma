/* ============================================
   Enigma — chat.js
   Chats list, messages rendering, WebSocket
   ============================================ */

const Chat = (() => {

  /* ── State ──────────────────────────────── */
  let state = {
    chats:        [],
    activeChatId: null,
    messages:     {},      // { chatId: [] }
    users:        {},      // { userId: userObj }
    typingTimers: {},
    replyTo:      null,
    ws:           null,
    currentUser:  null,
    loadingMore:  false,
    hasMore:      {},
  };

  /* ── DOM refs ───────────────────────────── */
  const $ = id => document.getElementById(id);

  /* ─────────────────────────────────────── */
  /*  INIT                                   */
  /* ─────────────────────────────────────── */
  async function init() {
    if (!UI.requireAuth()) return;

    try {
      state.currentUser = await Api.auth.me();
    } catch {
      window.location.href = '/frontend/pages/auth.html';
      return;
    }

    renderCurrentUserNav();
    await loadChats();
    connectWebSocket();
    bindEvents();
  }

  /* ─────────────────────────────────────── */
  /*  CHATS                                  */
  /* ─────────────────────────────────────── */
  async function loadChats() {
    try {
      const data = await Api.chats.list();
      state.chats = data.chats || [];
      renderChatList();
    } catch {
      UI.Toast.error('Не удалось загрузить чаты');
    }
  }

  function renderChatList(filter = '') {
    const list = $('chat-list');
    if (!list) return;

    const chats = filter
      ? state.chats.filter(c =>
          c.name.toLowerCase().includes(filter.toLowerCase()))
      : state.chats;

    list.innerHTML = '';

    if (!chats.length) {
      list.innerHTML = `<div style="text-align:center;padding:32px 16px;color:var(--text3);font-size:.82rem">
        ${filter ? 'Ничего не найдено' : 'Нет чатов. Начни общение!'}
      </div>`;
      return;
    }

    chats.forEach(chat => {
      const el = createChatItem(chat);
      list.appendChild(el);
    });
  }

  function createChatItem(chat) {
    const el = document.createElement('div');
    el.className = `chat-item${chat.id === state.activeChatId ? ' active' : ''}${chat.unread > 0 ? ' unread' : ''}`;
    el.dataset.chatId = chat.id;

    const av = chat.avatar
      ? `<img src="${chat.avatar}" class="avatar avatar-md" alt="${chat.name}">`
      : UI.avatarPlaceholder(chat.name, 'md').outerHTML;

    const statusDot = !chat.is_group && chat.online !== undefined
      ? `<span class="status-dot ${chat.online ? 'status-online' : 'status-offline'}"></span>`
      : '';

    el.innerHTML = `
      <div class="chat-item-av">
        ${av}
        ${statusDot}
      </div>
      <div class="chat-item-body">
        <div class="chat-item-top">
          <span class="chat-item-name">${escapeHtml(chat.name)}</span>
          <span class="chat-item-time">${chat.last_time ? UI.formatDate(chat.last_time) : ''}</span>
        </div>
        <div class="chat-item-preview">${escapeHtml(chat.last_message || 'Нет сообщений')}</div>
      </div>
      ${chat.unread > 0 ? `<span class="badge" style="margin-left:4px">${chat.unread}</span>` : ''}
    `;

    el.addEventListener('click', () => openChat(chat.id));
    return el;
  }

  /* ─────────────────────────────────────── */
  /*  OPEN CHAT                              */
  /* ─────────────────────────────────────── */
  async function openChat(chatId) {
    state.activeChatId = chatId;

    // Update sidebar selection
    document.querySelectorAll('.chat-item').forEach(el => {
      el.classList.toggle('active', el.dataset.chatId == chatId);
    });

    const chat = state.chats.find(c => c.id == chatId);
    if (!chat) return;

    // Show chat main area, hide empty
    $('chat-empty')?.classList.add('hidden');
    $('chat-main-inner')?.classList.remove('hidden');

    renderChatHeader(chat);
    clearReply();

    // Load messages
    if (!state.messages[chatId]) {
      state.messages[chatId] = [];
      state.hasMore[chatId] = true;
      await loadMessages(chatId);
    } else {
      renderMessages(chatId);
    }

    // Mark read
    const msgs = state.messages[chatId];
    if (msgs.length) {
      Api.messages.markRead(chatId, msgs[msgs.length - 1].id).catch(() => {});
      updateUnreadCount(chatId, 0);
    }

    $('chat-input-box')?.focus();
  }

  function renderChatHeader(chat) {
    const header = $('chat-header');
    if (!header) return;

    const av = chat.avatar
      ? `<img src="${chat.avatar}" class="avatar avatar-md" alt="${chat.name}">`
      : UI.avatarPlaceholder(chat.name, 'md').outerHTML;

    const statusText = chat.is_group
      ? `${chat.members_count || 0} участников`
      : chat.online ? 'В сети' : 'Не в сети';

    header.innerHTML = `
      <div class="chat-header-av">
        ${av}
        ${!chat.is_group ? `<span class="status-dot ${chat.online ? 'status-online' : 'status-offline'}"></span>` : ''}
      </div>
      <div class="chat-header-info">
        <div class="chat-header-name">${escapeHtml(chat.name)}</div>
        <div class="chat-header-status ${!chat.is_group && chat.online ? 'online' : ''}">${statusText}</div>
      </div>
      <div class="chat-header-actions">
        <button class="btn-icon" id="btn-audio-call" title="Аудиозвонок">
          ${UI.Icons.phone()}
        </button>
        <button class="btn-icon" id="btn-video-call" title="Видеозвонок">
          ${UI.Icons.video()}
        </button>
        <button class="btn-icon" id="btn-chat-info" title="Информация">
          ${UI.Icons.user()}
        </button>
      </div>
    `;

    $('btn-audio-call')?.addEventListener('click', () => {
      WebRTCCall.startCall(state.activeChatId, chat.name, chat.avatar, false);
    });
    $('btn-video-call')?.addEventListener('click', () => {
      WebRTCCall.startCall(state.activeChatId, chat.name, chat.avatar, true);
    });
  }

  /* ─────────────────────────────────────── */
  /*  MESSAGES                               */
  /* ─────────────────────────────────────── */
  async function loadMessages(chatId, before = null) {
    if (state.loadingMore) return;
    state.loadingMore = true;

    try {
      const data = await Api.messages.list(chatId, before, 40);
      const msgs = data.messages || [];

      if (before) {
        state.messages[chatId] = [...msgs, ...state.messages[chatId]];
      } else {
        state.messages[chatId] = msgs;
      }

      state.hasMore[chatId] = msgs.length === 40;
      renderMessages(chatId, !!before);
    } catch {
      UI.Toast.error('Ошибка загрузки сообщений');
    } finally {
      state.loadingMore = false;
    }
  }

  function renderMessages(chatId, prepend = false) {
    const area = $('messages-area');
    if (!area) return;

    const msgs = state.messages[chatId] || [];
    const scrollBottom = area.scrollHeight - area.scrollTop;

    if (!prepend) {
      area.innerHTML = '';
    }

    // Group consecutive messages from same sender
    let groups = [];
    let currentGroup = null;

    msgs.forEach((msg, i) => {
      const isOwn    = msg.id_sender == state.currentUser?.id;
      const prevMsg  = msgs[i - 1];
      const newDay   = !prevMsg || !sameDay(msg.created_at, prevMsg.created_at);
      const sameSender = prevMsg && prevMsg.id_sender === msg.id_sender &&
                         !newDay && (new Date(msg.created_at) - new Date(prevMsg.created_at)) < 120000;

      if (newDay) {
        groups.push({ type: 'date', date: msg.created_at });
        currentGroup = null;
      }

      if (!sameSender || !currentGroup) {
        currentGroup = { type: 'group', isOwn, sender: msg.id_sender, messages: [] };
        groups.push(currentGroup);
      }
      currentGroup.messages.push(msg);
    });

    const fragment = document.createDocumentFragment();

    groups.forEach(g => {
      if (g.type === 'date') {
        fragment.appendChild(createDateSep(g.date));
      } else {
        fragment.appendChild(createMsgGroup(g));
      }
    });

    if (prepend) {
      area.insertBefore(fragment, area.firstChild);
      area.scrollTop = area.scrollHeight - scrollBottom;
    } else {
      area.appendChild(fragment);
      scrollToBottom(area);
    }
  }

  function createDateSep(dateStr) {
    const el = document.createElement('div');
    el.className = 'msg-date-sep';
    const d = new Date(dateStr);
    el.textContent = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    return el;
  }

  function createMsgGroup(group) {
    const row = document.createElement('div');
    row.className = `msg-row ${group.isOwn ? 'out' : 'in'}`;

    const user = state.users[group.sender];
    const avEl = !group.isOwn
      ? (user?.avatar
          ? `<img src="${user.avatar}" class="msg-row-av" alt="${user.nickname}">`
          : UI.avatarPlaceholder(user?.nickname || '?', 'xs').outerHTML)
      : '';

    const bubblesHtml = group.messages.map(msg => createBubbleHtml(msg, group.isOwn)).join('');

    row.innerHTML = `
      ${avEl}
      <div class="msg-group">
        ${!group.isOwn && user ? `<div class="msg-sender">${escapeHtml(user.nickname || user.login)}</div>` : ''}
        ${bubblesHtml}
      </div>
    `;

    return row;
  }

  function createBubbleHtml(msg, isOwn) {
    let content = '';

    if (msg.media_url) {
      const ext = msg.media_url.split('.').pop().toLowerCase();
      if (['jpg','jpeg','png','gif','webp'].includes(ext)) {
        content = `<div class="msg-image"><img src="${msg.media_url}" alt="image" loading="lazy" onclick="UI.Modal.create({title:'Фото',content:'<img src=\\'${msg.media_url}\\' style=\\'max-width:100%\\'>'})" /></div>`;
      } else {
        content = `<div class="msg-file">
          <div class="msg-file-icon">${UI.Icons.paperclip()}</div>
          <div><div class="msg-file-name">${escapeHtml(msg.file_name || 'Файл')}</div>
          <div class="msg-file-size">${formatFileSize(msg.file_size)}</div></div>
          <a href="${msg.media_url}" download class="btn btn-ghost btn-sm">↓</a>
        </div>`;
      }
    } else {
      content = `<span>${escapeHtml(msg.content || '')}</span>`;
    }

    const statusIcon = isOwn
      ? `<span class="msg-status ${msg.is_read ? 'read' : ''}">${msg.is_read ? UI.Icons.checkDouble() : UI.Icons.check()}</span>`
      : '';

    return `
      <div class="msg-bubble" data-msg-id="${msg.id}">
        ${msg.reply_to ? `<div style="border-left:2px solid var(--accent);padding:4px 8px;margin-bottom:6px;font-size:.75rem;color:var(--text3);border-radius:2px">
          ${escapeHtml(msg.reply_content || '...')}
        </div>` : ''}
        ${content}
        <div class="msg-meta">
          <span>${UI.formatTime(msg.created_at)}</span>
          ${msg.edited ? '<span style="font-size:.6rem">ред.</span>' : ''}
          ${statusIcon}
        </div>
      </div>
    `;
  }

  /* ─────────────────────────────────────── */
  /*  SEND MESSAGE                           */
  /* ─────────────────────────────────────── */
  async function sendMessage() {
    const input  = $('chat-input-box');
    const chatId = state.activeChatId;
    if (!input || !chatId) return;

    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    UI.autoResize(input);

    const replyTo = state.replyTo?.id || null;
    clearReply();

    try {
      const data = await Api.messages.send(chatId, text, 1, replyTo);
      appendMessage(chatId, data.message);
      updateChatPreview(chatId, text);
    } catch {
      UI.Toast.error('Не удалось отправить сообщение');
      input.value = text;
    }
  }

  async function sendFile(file) {
    const chatId = state.activeChatId;
    if (!chatId) return;

    // Max 20MB
    if (file.size > 20 * 1024 * 1024) {
      UI.Toast.error('Файл слишком большой (макс. 20MB)');
      return;
    }

    try {
      const media = await Api.media.upload(file, chatId);
      const data  = await Api.messages.send(chatId, '', media.type_id, null);
      appendMessage(chatId, data.message);
      updateChatPreview(chatId, '📎 ' + file.name);
    } catch {
      UI.Toast.error('Ошибка загрузки файла');
    }
  }

  function appendMessage(chatId, msg) {
    if (!state.messages[chatId]) state.messages[chatId] = [];
    state.messages[chatId].push(msg);

    if (state.activeChatId == chatId) {
      const area = $('messages-area');
      if (!area) return;

      const isOwn = msg.id_sender == state.currentUser?.id;
      const group = { type: 'group', isOwn, sender: msg.id_sender, messages: [msg] };
      const el = createMsgGroup(group);
      el.classList.add('fade-in');
      area.appendChild(el);
      scrollToBottom(area);
    }
  }

  /* ─────────────────────────────────────── */
  /*  REPLY                                  */
  /* ─────────────────────────────────────── */
  function setReply(msg) {
    state.replyTo = msg;
    const preview = $('reply-preview');
    if (!preview) return;
    preview.classList.add('show');
    preview.querySelector('.reply-preview-text').textContent =
      msg.content?.substring(0, 60) || 'Медиафайл';
  }

  function clearReply() {
    state.replyTo = null;
    const preview = $('reply-preview');
    preview?.classList.remove('show');
  }

  /* ─────────────────────────────────────── */
  /*  WEBSOCKET                              */
  /* ─────────────────────────────────────── */
  function connectWebSocket() {
    const token = Api.auth.getToken();
    const wsUrl = `ws://${location.host}/backend/ws/server.php?token=${token}`;

    try {
      state.ws = new WebSocket(wsUrl);

      state.ws.onopen = () => {
        console.log('[WS] Connected');
      };

      state.ws.onmessage = (e) => {
        try {
          const packet = JSON.parse(e.data);
          handleWSPacket(packet);
        } catch {}
      };

      state.ws.onclose = () => {
        console.log('[WS] Disconnected, reconnecting in 3s...');
        setTimeout(connectWebSocket, 3000);
      };

      state.ws.onerror = () => {
        state.ws.close();
      };
    } catch {
      setTimeout(connectWebSocket, 5000);
    }
  }

  function handleWSPacket(packet) {
    switch (packet.type) {
      case 'message':
        onNewMessage(packet.data);
        break;
      case 'typing':
        onTyping(packet.data);
        break;
      case 'read':
        onRead(packet.data);
        break;
      case 'online':
        onOnlineStatus(packet.data);
        break;
      case 'call_offer':
        WebRTCCall.handleIncoming(packet.data);
        break;
      case 'call_answer':
        WebRTCCall.handleAnswer(packet.data);
        break;
      case 'call_ice':
        WebRTCCall.handleIce(packet.data);
        break;
      case 'call_end':
        WebRTCCall.handleEnd(packet.data);
        break;
    }
  }

  function sendWSPacket(type, data) {
    if (state.ws?.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type, data }));
    }
  }

  function onNewMessage(data) {
    const { chat_id, message } = data;

    if (!state.messages[chat_id]) state.messages[chat_id] = [];
    state.messages[chat_id].push(message);

    if (state.activeChatId == chat_id) {
      appendMessage(chat_id, message);
      Api.messages.markRead(chat_id, message.id).catch(() => {});
    } else {
      updateUnreadCount(chat_id, 1, true);
      showNotification(data);
    }

    updateChatPreview(chat_id, message.content || '📎 Медиафайл', message.created_at);
  }

  function onTyping(data) {
    const { chat_id, user_id, is_typing } = data;
    if (chat_id !== state.activeChatId) return;
    if (user_id === state.currentUser?.id) return;

    const indicator = $('typing-indicator');
    if (!indicator) return;

    if (is_typing) {
      indicator.style.display = 'flex';
      clearTimeout(state.typingTimers[user_id]);
      state.typingTimers[user_id] = setTimeout(() => {
        indicator.style.display = 'none';
      }, 3000);
    } else {
      indicator.style.display = 'none';
    }
  }

  function onRead(data) {
    const { chat_id, user_id, last_id } = data;
    if (chat_id !== state.activeChatId) return;

    document.querySelectorAll('.msg-bubble[data-msg-id]').forEach(el => {
      if (parseInt(el.dataset.msgId) <= last_id) {
        const statusEl = el.querySelector('.msg-status');
        if (statusEl) {
          statusEl.classList.add('read');
          statusEl.innerHTML = UI.Icons.checkDouble();
        }
      }
    });
  }

  function onOnlineStatus(data) {
    const { user_id, online } = data;
    // Update chat items
    state.chats.forEach(chat => {
      if (!chat.is_group && chat.companion_id == user_id) {
        chat.online = online;
      }
    });
    // Update header if active chat
    const activeChat = state.chats.find(c => c.id == state.activeChatId);
    if (activeChat && !activeChat.is_group && activeChat.companion_id == user_id) {
      const statusEl = document.querySelector('.chat-header-status');
      if (statusEl) {
        statusEl.textContent = online ? 'В сети' : 'Не в сети';
        statusEl.className = `chat-header-status ${online ? 'online' : ''}`;
      }
    }
  }

  /* ─── Typing emit ────────────────────────── */
  let typingTimeout = null;
  let isTyping = false;

  function emitTyping() {
    if (!state.activeChatId) return;

    if (!isTyping) {
      isTyping = true;
      sendWSPacket('typing', { chat_id: state.activeChatId, is_typing: true });
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      isTyping = false;
      sendWSPacket('typing', { chat_id: state.activeChatId, is_typing: false });
    }, 2000);
  }

  /* ─────────────────────────────────────── */
  /*  NOTIFICATIONS                          */
  /* ─────────────────────────────────────── */
  function showNotification(data) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (document.hasFocus()) return;

    const chat = state.chats.find(c => c.id == data.chat_id);
    new Notification(chat?.name || 'Enigma', {
      body: data.message?.content || 'Новое сообщение',
      icon: chat?.avatar || '/frontend/assets/img/icon.png',
    });
  }

  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  /* ─────────────────────────────────────── */
  /*  HELPERS                                */
  /* ─────────────────────────────────────── */
  function updateChatPreview(chatId, text, time = new Date().toISOString()) {
    const chat = state.chats.find(c => c.id == chatId);
    if (chat) {
      chat.last_message = text;
      chat.last_time = time;
    }

    const item = document.querySelector(`[data-chat-id="${chatId}"] .chat-item-preview`);
    if (item) item.textContent = text;

    const timeEl = document.querySelector(`[data-chat-id="${chatId}"] .chat-item-time`);
    if (timeEl) timeEl.textContent = UI.formatDate(time);
  }

  function updateUnreadCount(chatId, delta, increment = false) {
    const chat = state.chats.find(c => c.id == chatId);
    if (!chat) return;

    if (increment) chat.unread = (chat.unread || 0) + delta;
    else           chat.unread = delta;

    const item    = document.querySelector(`[data-chat-id="${chatId}"]`);
    const badgeEl = item?.querySelector('.badge');

    if (chat.unread > 0) {
      item?.classList.add('unread');
      if (badgeEl) badgeEl.textContent = chat.unread;
      else if (item) {
        const b = document.createElement('span');
        b.className = 'badge';
        b.textContent = chat.unread;
        item.appendChild(b);
      }
    } else {
      item?.classList.remove('unread');
      badgeEl?.remove();
    }
  }

  function scrollToBottom(el) {
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }

  function sameDay(d1, d2) {
    const a = new Date(d1), b = new Date(d2);
    return a.toDateString() === b.toDateString();
  }

  function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
              .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function renderCurrentUserNav() {
    const u = state.currentUser;
    if (!u) return;
    const navAv = $('nav-user-avatar');
    if (!navAv) return;
    if (u.avatar) {
      navAv.innerHTML = `<img src="${u.avatar}" class="avatar avatar-sm" alt="">`;
    } else {
      navAv.innerHTML = '';
      navAv.appendChild(UI.avatarPlaceholder(u.nickname || u.login, 'sm'));
    }
  }

  /* ─────────────────────────────────────── */
  /*  EVENTS                                 */
  /* ─────────────────────────────────────── */
  function bindEvents() {
    // Send on Enter (Shift+Enter = newline)
    const inputBox = $('chat-input-box');
    if (inputBox) {
      inputBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      inputBox.addEventListener('input', () => {
        UI.autoResize(inputBox);
        emitTyping();
      });
    }

    // Send button
    $('send-btn')?.addEventListener('click', sendMessage);

    // Search chats
    const searchInput = $('chat-search');
    if (searchInput) {
      searchInput.addEventListener('input', UI.debounce(e => {
        renderChatList(e.target.value);
      }, 250));
    }

    // Load more on scroll up
    const area = $('messages-area');
    if (area) {
      area.addEventListener('scroll', () => {
        if (area.scrollTop < 80 && state.activeChatId && state.hasMore[state.activeChatId]) {
          const oldest = state.messages[state.activeChatId]?.[0];
          if (oldest) loadMessages(state.activeChatId, oldest.id);
        }
      });
    }

    // File attach
    $('btn-attach-file')?.addEventListener('click', () => $('file-input')?.click());
    $('btn-attach-image')?.addEventListener('click', () => $('image-input')?.click());

    $('file-input')?.addEventListener('change', e => {
      [...e.target.files].forEach(sendFile);
      e.target.value = '';
    });
    $('image-input')?.addEventListener('change', e => {
      [...e.target.files].forEach(sendFile);
      e.target.value = '';
    });

    // Reply preview close
    $('reply-close')?.addEventListener('click', clearReply);

    // New chat button
    $('btn-new-chat')?.addEventListener('click', openNewChatModal);

    // Nav icons
    $('btn-nav-settings')?.addEventListener('click', () => {
      window.location.href = '/frontend/pages/settings.html';
    });

    $('btn-nav-contacts')?.addEventListener('click', openContactsModal);

    $('nav-user-avatar')?.addEventListener('click', () => {
      window.location.href = '/frontend/pages/profile.html';
    });

    // Notification permission
    requestNotificationPermission();
  }

  /* ─────────────────────────────────────── */
  /*  NEW CHAT MODAL                         */
  /* ─────────────────────────────────────── */
  function openNewChatModal() {
    const m = UI.Modal.create({
      title: 'Новый чат',
      content: `
        <div class="input-icon-wrap" style="margin-bottom:12px">
          ${UI.Icons.search()}
          <input class="input search-input" id="new-chat-search" placeholder="Поиск пользователей..." autocomplete="off">
        </div>
        <div id="new-chat-results" style="min-height:60px"></div>
      `,
    });

    const searchInput = document.getElementById('new-chat-search');
    const results     = document.getElementById('new-chat-results');
    if (!searchInput || !results) return;

    searchInput.addEventListener('input', UI.debounce(async (e) => {
      const q = e.target.value.trim();
      if (q.length < 2) { results.innerHTML = ''; return; }

      results.innerHTML = '<div class="spinner" style="margin:16px auto"></div>';

      try {
        const data = await Api.contacts.search(q);
        results.innerHTML = '';

        if (!data.users?.length) {
          results.innerHTML = '<p style="color:var(--text3);font-size:.82rem;text-align:center;padding:16px">Не найдено</p>';
          return;
        }

        data.users.forEach(user => {
          const el = document.createElement('div');
          el.className = 'user-search-result';
          const av = user.avatar
            ? `<img src="${user.avatar}" class="avatar avatar-md" alt="">`
            : UI.avatarPlaceholder(user.nickname || user.login, 'md').outerHTML;
          el.innerHTML = `
            ${av}
            <div>
              <div class="user-search-result-name">${escapeHtml(user.nickname || user.login)}</div>
              <div class="user-search-result-nick">@${escapeHtml(user.login)}</div>
            </div>
          `;
          el.addEventListener('click', async () => {
            try {
              const chatData = await Api.chats.createDirect(user.id);
              state.chats.unshift(chatData.chat);
              renderChatList();
              m.close();
              openChat(chatData.chat.id);
            } catch {
              UI.Toast.error('Ошибка создания чата');
            }
          });
          results.appendChild(el);
        });
      } catch {
        results.innerHTML = '<p style="color:var(--danger);font-size:.82rem;text-align:center;padding:16px">Ошибка поиска</p>';
      }
    }, 350));

    setTimeout(() => searchInput.focus(), 100);
  }

  /* ─── Contacts modal ─────────────────────── */
  async function openContactsModal() {
    const m = UI.Modal.create({
      title: 'Контакты',
      content: '<div id="contacts-list"><div class="spinner" style="margin:24px auto"></div></div>',
    });

    try {
      const data = await Api.contacts.list();
      const list = document.getElementById('contacts-list');
      if (!list) return;
      list.innerHTML = '';

      if (!data.contacts?.length) {
        list.innerHTML = '<p style="color:var(--text3);font-size:.82rem;text-align:center;padding:16px">Нет контактов</p>';
        return;
      }

      data.contacts.forEach(user => {
        const el = document.createElement('div');
        el.className = 'user-search-result';
        const av = user.avatar
          ? `<img src="${user.avatar}" class="avatar avatar-md" alt="">`
          : UI.avatarPlaceholder(user.nickname || user.login, 'md').outerHTML;
        el.innerHTML = `
          ${av}
          <div style="flex:1">
            <div class="user-search-result-name">${escapeHtml(user.nickname || user.login)}</div>
            <div class="user-search-result-nick">@${escapeHtml(user.login)}</div>
          </div>
          <span class="status-dot ${user.online ? 'status-online' : 'status-offline'}"></span>
        `;
        el.addEventListener('click', async () => {
          const chatData = await Api.chats.createDirect(user.id);
          if (!state.chats.find(c => c.id === chatData.chat.id)) {
            state.chats.unshift(chatData.chat);
            renderChatList();
          }
          m.close();
          openChat(chatData.chat.id);
        });
        list.appendChild(el);
      });
    } catch {
      UI.Toast.error('Ошибка загрузки контактов');
    }
  }

  /* ── Expose for WebRTC ───────────────────── */
  return {
    init,
    sendWSPacket,
    getState: () => state,
    appendMessage,
  };
})();

document.addEventListener('DOMContentLoaded', Chat.init);
