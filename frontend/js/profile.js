/* ============================================
   Enigma — profile.js
   Profile view, edit, avatar customization
   ============================================ */

document.addEventListener('DOMContentLoaded', async () => {
  if (!UI.requireAuth()) return;
  await loadProfile();
  bindEvents();
});

let currentUser = null;
let avatarFile  = null;

/* ─────────────────────────────────────── */
/*  LOAD PROFILE                           */
/* ─────────────────────────────────────── */
async function loadProfile() {
  try {
    const data = await Api.profile.get();
    currentUser = data.profile;
    renderProfile(currentUser);
  } catch {
    UI.Toast.error('Ошибка загрузки профиля');
  }
}

function renderProfile(p) {
  // Avatar
  const av = document.getElementById('profile-avatar');
  if (av) {
    if (p.avatar_url) {
      av.innerHTML = `<img src="${p.avatar_url}" class="avatar avatar-xxl" alt="${p.nickname}">`;
    } else {
      av.innerHTML = '';
      av.appendChild(UI.avatarPlaceholder(p.nickname || p.login, 'xxl'));
    }
  }

  // Fields
  setText('profile-display-name', p.nickname || p.login);
  setText('profile-username',     '@' + p.login);
  setText('profile-status-text',  p.status || 'Не указан');
  setText('profile-email-val',    p.email_user);
  setText('profile-nick-val',     p.nickname || '—');

  // Form defaults
  setVal('input-nickname', p.nickname || '');
  setVal('input-status',   p.status   || '');
  setVal('input-email',    p.email_user);
  setVal('input-login',    p.login);
}

/* ─────────────────────────────────────── */
/*  EVENTS                                 */
/* ─────────────────────────────────────── */
function bindEvents() {
  // Edit form submit
  document.getElementById('profile-edit-form')
    ?.addEventListener('submit', handleSave);

  // Avatar upload via file input
  document.getElementById('avatar-file-input')
    ?.addEventListener('change', handleAvatarFile);

  // Avatar upload area click
  document.getElementById('avatar-upload-area')
    ?.addEventListener('click', () => {
      document.getElementById('avatar-file-input')?.click();
    });

  // Avatar drag-and-drop
  const uploadArea = document.getElementById('avatar-upload-area');
  if (uploadArea) {
    uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.style.borderColor = 'var(--accent)'; });
    uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = ''; });
    uploadArea.addEventListener('drop', e => {
      e.preventDefault();
      uploadArea.style.borderColor = '';
      const file = e.dataTransfer.files[0];
      if (file) previewAvatar(file);
    });
  }

  // Color theme swatches
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      applyAccentColor(swatch.dataset.color);
    });
  });

  // Back button
  document.getElementById('btn-back')?.addEventListener('click', () => {
    window.location.href = '/frontend/pages/app.html';
  });

  // Password change
  document.getElementById('password-change-form')
    ?.addEventListener('submit', handlePasswordChange);

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    const ok = await UI.confirm('Выйти из аккаунта?', { ok: 'Выйти', danger: true });
    if (ok) {
      await Api.auth.logout();
      window.location.href = '/frontend/pages/auth.html';
    }
  });
}

/* ─────────────────────────────────────── */
/*  SAVE PROFILE                           */
/* ─────────────────────────────────────── */
async function handleSave(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-profile');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    // Upload avatar first if changed
    if (avatarFile) {
      await Api.profile.uploadAvatar(avatarFile);
      avatarFile = null;
    }

    const fields = {
      nickname: getVal('input-nickname'),
      status:   getVal('input-status'),
    };

    await Api.profile.update(fields);

    // Save accent color to localStorage
    const selected = document.querySelector('.color-swatch.selected');
    if (selected) localStorage.setItem('nc_accent', selected.dataset.color);

    UI.Toast.success('Профиль сохранён');
    await loadProfile();
  } catch (err) {
    UI.Toast.error(err.message || 'Ошибка сохранения');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить';
  }
}

/* ─────────────────────────────────────── */
/*  AVATAR                                 */
/* ─────────────────────────────────────── */
function handleAvatarFile(e) {
  const file = e.target.files[0];
  if (file) previewAvatar(file);
}

function previewAvatar(file) {
  if (!file.type.startsWith('image/')) {
    UI.Toast.error('Допускаются только изображения');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    UI.Toast.error('Файл слишком большой (макс. 5MB)');
    return;
  }

  avatarFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    const area = document.getElementById('avatar-upload-area');
    if (!area) return;
    area.innerHTML = `<img src="${e.target.result}" alt="preview" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%">`;

    // Also update main profile preview
    const mainAv = document.getElementById('profile-avatar');
    if (mainAv) {
      mainAv.innerHTML = `<img src="${e.target.result}" class="avatar avatar-xxl" alt="">`;
    }
  };
  reader.readAsDataURL(file);
}

/* ─────────────────────────────────────── */
/*  PASSWORD CHANGE                        */
/* ─────────────────────────────────────── */
async function handlePasswordChange(e) {
  e.preventDefault();
  const btn     = document.getElementById('btn-change-password');
  const errEl   = document.getElementById('pw-change-error');
  const oldPw   = getVal('input-old-password');
  const newPw   = getVal('input-new-password');
  const confirm = getVal('input-new-password-confirm');

  if (!oldPw || !newPw || !confirm) {
    showErr(errEl, 'Заполните все поля');
    return;
  }
  if (newPw.length < 6) {
    showErr(errEl, 'Пароль минимум 6 символов');
    return;
  }
  if (newPw !== confirm) {
    showErr(errEl, 'Пароли не совпадают');
    return;
  }

  btn.disabled = true;
  try {
    await Api.auth.changePassword(oldPw, newPw);
    UI.Toast.success('Пароль изменён');
    e.target.reset();
    if (errEl) errEl.classList.remove('show');
  } catch (err) {
    showErr(errEl, err.message || 'Неверный текущий пароль');
  } finally {
    btn.disabled = false;
  }
}

/* ─────────────────────────────────────── */
/*  THEME                                  */
/* ─────────────────────────────────────── */
function applyAccentColor(hex) {
  if (!hex) return;
  document.documentElement.style.setProperty('--accent', hex);

  // Darken for accent2
  const darker = shadeHex(hex, -20);
  document.documentElement.style.setProperty('--accent2', darker);
  document.documentElement.style.setProperty('--accent-dim', hex + '22');
  document.documentElement.style.setProperty('--accent-glow', hex + '55');
}

function shadeHex(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// Apply saved accent color on load
const savedAccent = localStorage.getItem('nc_accent');
if (savedAccent) applyAccentColor(savedAccent);

/* ─── Helpers ────────────────────────────── */
const $ = id => document.getElementById(id);
const getVal  = id => ($(`#${id}`)?.value ?? document.getElementById(id)?.value ?? '').trim();
const setVal  = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? ''; };
const showErr = (el, msg) => { if (!el) return; el.textContent = msg; el.classList.add('show'); };
