<section class="auth-screen" id="authScreen">
  <div class="brand-panel">
    <div class="brand-mark">E</div>
    <p class="eyebrow" data-i18n="heroEyebrow">Открытый мессенджер</p>
    <h1>Enigma</h1>
    <p class="brand-copy" data-i18n="heroCopy">Быстрые комнаты, живые звонки и тёмный интерфейс для командной работы без лишнего шума.</p>
    <div class="signal-lines" aria-hidden="true">
      <span></span><span></span><span></span><span></span>
    </div>
  </div>

  <form class="auth-card" id="authForm">
    <label class="language-field">
      <span data-i18n="language">Язык интерфейса</span>
      <select id="authLanguageSelect" name="language">
        <option value="ru">Русский</option>
        <option value="en">English</option>
      </select>
    </label>
    <div class="auth-tabs">
      <button type="button" class="tab active" data-auth-mode="login" data-i18n="signIn">Вход</button>
      <button type="button" class="tab" data-auth-mode="register" data-i18n="createAccount">Создать</button>
    </div>
    <label>
      <span data-i18n="username">Имя пользователя</span>
      <input name="username" autocomplete="username" placeholder="demo">
    </label>
    <label class="register-only hidden">
      <span data-i18n="displayName">Отображаемое имя</span>
      <input name="display_name" data-i18n-placeholder="displayNamePlaceholder" placeholder="Шифровальщик">
    </label>
    <label>
      <span data-i18n="password">Пароль</span>
      <input name="password" type="password" autocomplete="current-password" placeholder="enigma123">
    </label>
    <button class="primary-btn" type="submit" data-i18n="enterEnigma">Войти в Enigma</button>
    <p class="form-note" id="authNote" data-i18n="demoAccount">Демо-аккаунт: demo / enigma123</p>
  </form>
</section>
