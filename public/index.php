<?php
?><!doctype html>
<html lang="ru">
  <?php include __DIR__ . '/partials/head.php'; ?>
  <body>
    <main class="app-shell" id="app" data-view="auth">
      <?php include __DIR__ . '/partials/auth.php'; ?>
      <?php include __DIR__ . '/partials/workspace.php'; ?>
    </main>
    <?php include __DIR__ . '/partials/dialogs.php'; ?>
    <script src="/js/app.js" type="module"></script>
  </body>
</html>
