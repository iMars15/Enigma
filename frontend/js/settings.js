/* ============================================
   Enigma — settings.js
   Settings page: notifications, privacy, theme
   ============================================ */

document.addEventListener('DOMContentLoaded', async () => {
  if (!UI.requireAuth()) return;
  initNav();
  loadSettings();
  bindEvents();
});

/* ── Default settings ────────────────────── */
const DEFAULTS = {
  notifications: true,
  notif_sound:   true,
  notif_preview: true,
  theme:         'dark',
  language:      'ru',
  font_size:     'medium',
  online_status: true,
  read_receipts: true,
  typing_status: true,
  two_fa:        false,
};

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem('nc_settings') || '{}');
  const s = { ...DEFAULTS, ...saved };

  setToggle('toggle-notifications', s.notifications);
  setToggle('toggle-notif-sound',   s.notif_sound);
  setToggle('toggle-notif-preview', s.notif_preview);
  setToggle('toggle-online-status', s.online_status);
  setToggle('toggle-read-receipts', s.read_receipts);
  setToggle('toggle-typing-status', s.typing_status);
  setToggle('toggle-2fa',           s.two_fa);

  const langSel = document.getElementById('select-language');
  if (langSel) langSel.value = s.language;

  const fontSel = document.getElementById('select-font-size');
  if (fontSel) fontSel.value = s.font_size;

  // Accent color
  const savedAccent = localStorage.getItem('nc_accent');
  if (savedAccent) {
    document.querySelectorAll('.color-swatch').forEach(sw => {
      sw.classList.toggle('selected', sw.dataset.color === savedAccent);
    });
  }

  applyFontSize(s.font_size);
}

function saveSettings() {
  const s = {
    notifications: getToggle('toggle-notifications'),
    notif_sound:   getToggle('toggle-notif-sound'),
    notif_preview: getToggle('toggle-notif-preview'),
    online_status: getToggle('toggle-online-status'),
    read_receipts: getToggle('toggle-read-receipts'),
    typing_status: getToggle('toggle-typing-status'),
    two_fa:        getToggle('toggle-2fa'),
    language:      document.getElementById('select-language')?.value || 'ru',
    font_size:     document.getElementById('select-font-size')?.value || 'medium',
  };
  localStorage.setItem('nc_settings', JSON.stringify(s));

  // Sync privacy settings with backend
  Api.profile.update({
    show_online:   s.online_status,
    read_receipts: s.read_receipts,
    typing_status: s.typing_status,
  }).catch(() => {});

  return s;
}

/* ─── Nav tabs ───────────────────────────── */
function initNav() {
  const items    = document.querySelectorAll('.settings-nav-item');
  const sections = document.querySelectorAll('.settings-section');

  items.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.dataset.section;
      items.forEach(i => i.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(`section-${target}`)?.classList.add('active');
    });
  });
}

/* ─── Events ─────────────────────────────── */
function bindEvents() {
  // All toggles → auto-save
  document.querySelectorAll('.toggle input').forEach(toggle => {
    toggle.addEventListener('change', saveSettings);
  });

  // Selects → auto-save + apply
  document.getElementById('select-language')?.addEventListener('change', saveSettings);
  document.getElementById('select-font-size')?.addEventListener('change', e => {
    applyFontSize(e.target.value);
    saveSettings();
  });

  // Color swatches
  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      localStorage.setItem('nc_accent', sw.dataset.color);
      applyAccentColor(sw.dataset.color);
      saveSettings();
    });
  });

  // Notification permission
  document.getElementById('btn-request-notif')?.addEventListener('click', async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') UI.Toast.success('Уведомления разрешены');
      else UI.Toast.error('Уведомления отклонены');
    }
  });

  // Clear cache / media
  document.getElementById('btn-clear-cache')?.addEventListener('click', async () => {
    const ok = await UI.confirm('Очистить кэш приложения?', { ok: 'Очистить' });
    if (ok) {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      UI.Toast.success('Кэш очищен');
    }
  });

  // Delete account
  document.getElementById('btn-delete-account')?.addEventListener('click', async () => {
    const ok = await UI.confirm(
      'Удалить аккаунт навсегда? Это действие необратимо.',
      { ok: 'Удалить', danger: true, title: 'Удаление аккаунта' }
    );
    if (ok) {
      try {
        await Api.request('DELETE', 'auth.php?action=delete_account');
        Api.auth.clearToken();
        window.location.href = '/frontend/pages/auth.html';
      } catch {
        UI.Toast.error('Ошибка удаления аккаунта');
      }
    }
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    const ok = await UI.confirm('Выйти из аккаунта?', { ok: 'Выйти', danger: true });
    if (ok) {
      await Api.auth.logout();
      window.location.href = '/frontend/pages/auth.html';
    }
  });

  // Back to app
  document.getElementById('btn-back-to-app')?.addEventListener('click', () => {
    window.location.href = '/frontend/pages/app.html';
  });
}

/* ─── Font size ──────────────────────────── */
function applyFontSize(size) {
  const map = { small: '14px', medium: '16px', large: '18px' };
  document.documentElement.style.fontSize = map[size] || '16px';
}

/* ─── Accent color ───────────────────────── */
function applyAccentColor(hex) {
  if (!hex) return;
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty('--accent2', shadeHex(hex, -20));
  document.documentElement.style.setProperty('--accent-dim',  hex + '22');
  document.documentElement.style.setProperty('--accent-glow', hex + '55');
}

function shadeHex(hex, amount) {
  const num = parseInt(hex.replace('#',''), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// Apply on load
const savedAccent = localStorage.getItem('nc_accent');
if (savedAccent) applyAccentColor(savedAccent);

/* ─── Helpers ────────────────────────────── */
function setToggle(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = !!val;
}
function getToggle(id) {
  return !!document.getElementById(id)?.checked;
}
