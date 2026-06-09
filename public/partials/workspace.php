<section class="workspace hidden" id="workspace">
  <aside class="guild-rail">
    <button class="guild-logo active" id="homeGuild" data-i18n-title="homeTitle" title="Главная Enigma">E</button>
    <div class="guild-list" id="guildList"></div>
    <button class="circle-action" id="createGuildBtn" data-i18n-title="createServer" title="Создать сервер">+</button>
  </aside>

  <aside class="channel-panel">
    <div class="server-header">
      <div>
        <span class="muted" data-i18n="server">Сервер</span>
        <h2 id="guildName">Штаб Enigma</h2>
      </div>
      <button class="icon-btn" id="createChannelBtn" data-i18n-title="createChannel" title="Создать канал">+</button>
    </div>
    <div class="channel-list" id="channelList"></div>
    <div class="profile-strip">
      <div class="avatar" id="profileAvatar">E</div>
      <div>
        <strong id="profileName">Enigma</strong>
        <span id="profileStatus">Подключение</span>
      </div>
      <button class="icon-btn" id="settingsBtn" data-i18n-title="settings" title="Настройки">⚙</button>
    </div>
  </aside>

  <section class="chat-panel">
    <header class="chat-header">
      <div>
        <span class="muted" data-i18n="channel">Канал</span>
        <h2>#<span id="channelName">общий</span></h2>
      </div>
      <div class="header-actions">
        <button class="soft-btn" id="callBtn" data-i18n="startCall">Начать звонок</button>
        <button class="icon-btn" id="logoutBtn" data-i18n-title="logout" title="Выйти">⇥</button>
      </div>
    </header>

    <div class="call-panel hidden" id="callPanel">
      <div>
        <strong data-i18n="liveRoom">Живая комната</strong>
        <span id="callStatus">Ожидание участников</span>
      </div>
      <div class="video-grid" id="videoGrid">
        <video id="localVideo" autoplay muted playsinline></video>
      </div>
      <div class="call-actions">
        <button class="soft-btn" id="toggleMicBtn">Микрофон включён</button>
        <button class="soft-btn" id="toggleCamBtn">Камера включена</button>
        <button class="danger-btn" id="leaveCallBtn" data-i18n="leave">Выйти</button>
      </div>
    </div>

    <div class="messages" id="messages"></div>

    <form class="composer" id="messageForm">
      <input id="messageInput" data-i18n-placeholder="messageDefaultPlaceholder" placeholder="Сообщение #общий" maxlength="1600" autocomplete="off">
      <button class="primary-btn" type="submit" data-i18n="send">Отправить</button>
    </form>
  </section>

  <aside class="member-panel">
    <h3 data-i18n="signal">Сигнал</h3>
    <div class="direct-chat-panel">
      <h4 data-i18n="directMessages">Личные чаты</h4>
      <div class="user-list" id="memberList"></div>
    </div>
    <div class="stat-tile">
      <span data-i18n="socket">Сокет</span>
      <strong id="socketState">Офлайн</strong>
    </div>
    <div class="stat-tile">
      <span data-i18n="profileAccent">Акцент профиля</span>
      <strong id="accentPreview">#16f29a</strong>
    </div>
    <div class="mini-console" id="activityLog"></div>
  </aside>
</section>
