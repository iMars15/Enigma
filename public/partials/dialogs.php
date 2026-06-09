<dialog id="settingsDialog">
  <form method="dialog" class="dialog-card" id="settingsForm">
    <header>
      <h2 data-i18n="profileSettings">Настройки профиля</h2>
      <button class="icon-btn" value="cancel">×</button>
    </header>
    <label>
      <span data-i18n="language">Язык интерфейса</span>
      <select id="settingsLanguageSelect" name="language">
        <option value="ru">Русский</option>
        <option value="en">English</option>
      </select>
    </label>
    <label>
      <span data-i18n="displayName">Отображаемое имя</span>
      <input name="display_name" maxlength="40">
    </label>
    <label>
      <span data-i18n="status">Статус</span>
      <input name="status_text" maxlength="80">
    </label>
    <label>
      <span data-i18n="avatarUrl">URL аватара</span>
      <input name="avatar_url" placeholder="https://...">
    </label>
    <label>
      <span data-i18n="accentColor">Цвет акцента</span>
      <input name="accent_color" type="color">
    </label>
    <button class="primary-btn" value="default" data-i18n="saveProfile">Сохранить профиль</button>
  </form>
</dialog>

<dialog id="textDialog">
  <form method="dialog" class="dialog-card" id="textForm">
    <header>
      <h2 id="textDialogTitle">Создать</h2>
      <button class="icon-btn" value="cancel">×</button>
    </header>
    <label>
      <span data-i18n="name">Название</span>
      <input name="name" maxlength="48" required>
    </label>
    <button class="primary-btn" value="default" data-i18n="create">Создать</button>
  </form>
</dialog>
