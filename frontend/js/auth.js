/* ============================================
   Enigma — auth.js
   Login, Register, Password Recovery
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Redirect if already logged in
  UI.redirectIfAuth();

  initTabs();
  initLoginForm();
  initRegisterForm();
  initRecoveryForm();
  initPasswordToggles();
});

/* ─── Tabs ───────────────────────────────── */
function initTabs() {
  const tabs    = document.querySelectorAll('.auth-tab');
  const forms   = document.querySelectorAll('.auth-form-section');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      forms.forEach(f => f.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`form-${target}`)?.classList.add('active');
    });
  });
}

/* ─── Login form ─────────────────────────── */
function initLoginForm() {
  const form   = document.getElementById('login-form');
  const errEl  = document.getElementById('login-error');
  const btn    = document.getElementById('login-btn');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading(btn, true);
    hideError(errEl);

    const login    = form.querySelector('[name="login"]').value.trim();
    const password = form.querySelector('[name="password"]').value;

    if (!login || !password) {
      showError(errEl, 'Заполните все поля');
      setLoading(btn, false);
      return;
    }

    try {
      await Api.auth.login(login, password);
      UI.Toast.success('Добро пожаловать!');
      window.location.href = '/frontend/pages/app.html';
    } catch (err) {
      showError(errEl, err.message || 'Неверный логин или пароль');
      setLoading(btn, false);
    }
  });
}

/* ─── Register form ──────────────────────── */
function initRegisterForm() {
  const form   = document.getElementById('register-form');
  const errEl  = document.getElementById('register-error');
  const btn    = document.getElementById('register-btn');
  const pwInput = form?.querySelector('[name="password"]');

  if (!form) return;

  // Password strength meter
  if (pwInput) {
    pwInput.addEventListener('input', () => {
      updatePasswordStrength(pwInput.value);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading(btn, true);
    hideError(errEl);

    const login    = form.querySelector('[name="login"]').value.trim();
    const email    = form.querySelector('[name="email"]').value.trim();
    const nickname = form.querySelector('[name="nickname"]').value.trim();
    const password = form.querySelector('[name="password"]').value;
    const confirm  = form.querySelector('[name="password_confirm"]').value;

    // Validation
    if (!login || !email || !password || !confirm) {
      showError(errEl, 'Заполните все поля');
      setLoading(btn, false);
      return;
    }
    if (login.length < 3) {
      showError(errEl, 'Логин минимум 3 символа');
      setLoading(btn, false);
      return;
    }
    if (!validateEmail(email)) {
      showError(errEl, 'Неверный формат email');
      setLoading(btn, false);
      return;
    }
    if (password.length < 6) {
      showError(errEl, 'Пароль минимум 6 символов');
      setLoading(btn, false);
      return;
    }
    if (password !== confirm) {
      showError(errEl, 'Пароли не совпадают');
      setLoading(btn, false);
      return;
    }

    try {
      await Api.auth.register(login, email, password, nickname || login);
      // Auto login after register
      await Api.auth.login(login, password);
      UI.Toast.success('Аккаунт создан!');
      window.location.href = '/frontend/pages/app.html';
    } catch (err) {
      showError(errEl, err.message || 'Ошибка регистрации');
      setLoading(btn, false);
    }
  });
}

/* ─── Recovery form ──────────────────────── */
function initRecoveryForm() {
  const form    = document.getElementById('recovery-form');
  const errEl   = document.getElementById('recovery-error');
  const btn     = document.getElementById('recovery-btn');
  const success = document.getElementById('recovery-success');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading(btn, true);
    hideError(errEl);

    const email = form.querySelector('[name="email"]').value.trim();

    if (!validateEmail(email)) {
      showError(errEl, 'Введите корректный email');
      setLoading(btn, false);
      return;
    }

    try {
      await Api.auth.recover(email);
      form.style.display = 'none';
      success?.classList.add('show');
    } catch (err) {
      showError(errEl, err.message || 'Ошибка отправки письма');
      setLoading(btn, false);
    }
  });
}

/* ─── Password toggles ───────────────────── */
function initPasswordToggles() {
  document.querySelectorAll('.password-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.closest('.input-icon-wrap')?.querySelector('input');
      if (!input) return;
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      btn.innerHTML = isText ? UI.Icons.eye() : UI.Icons.eyeOff();
    });
  });
}

/* ─── Password strength ──────────────────── */
function updatePasswordStrength(pw) {
  const wrap = document.querySelector('.password-strength');
  if (!wrap) return;

  let score = 0;
  if (pw.length >= 6)  score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  wrap.className = 'password-strength';
  const hints = ['', 'Слабый пароль', 'Средний пароль', 'Надёжный пароль'];

  if (score <= 1)      { wrap.classList.add('pw-weak');   wrap.querySelector('.pw-hint').textContent = hints[1]; }
  else if (score <= 3) { wrap.classList.add('pw-medium'); wrap.querySelector('.pw-hint').textContent = hints[2]; }
  else                 { wrap.classList.add('pw-strong'); wrap.querySelector('.pw-hint').textContent = hints[3]; }
}

/* ─── Helpers ────────────────────────────── */
function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}
function hideError(el) {
  if (!el) return;
  el.classList.remove('show');
}
function setLoading(btn, state) {
  if (!btn) return;
  btn.classList.toggle('loading', state);
  btn.disabled = state;
}
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
