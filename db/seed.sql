-- ============================================
--  Enigma — seed.sql  (PostgreSQL)
--  Test data for development
--  Run AFTER schema.sql
--  All passwords = "password123"
-- ============================================

BEGIN;

-- ─── Users ───────────────────────────────────
-- password_hash = bcrypt("password123", cost=12)
INSERT INTO "user" (id, login, password, email, nickname, status, password_hash, last_seen) VALUES
(1, 'alex',   '', 'alex@enigma.dev',   'Алексей',  'Всегда онлайн 🚀',    '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NOW()),
(2, 'maria',  '', 'maria@enigma.dev',  'Мария',    'Дизайнер 🎨',         '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NOW()),
(3, 'ivan',   '', 'ivan@enigma.dev',   'Иван',     'Backend разработчик', '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NOW() - INTERVAL '10 minutes'),
(4, 'olga',   '', 'olga@enigma.dev',   'Ольга',    'PM 📋',               '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NOW() - INTERVAL '2 hours'),
(5, 'dmitry', '', 'dmitry@enigma.dev', 'Дмитрий',  'DevOps ⚙️',          '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NOW() - INTERVAL '1 day');

SELECT setval('"user_id_seq"', 5);

-- ─── Avatars ─────────────────────────────────
INSERT INTO avatar (id, url_image) VALUES
(1, '/backend/uploads/avatars/default_1.png'),
(2, '/backend/uploads/avatars/default_2.png'),
(3, '/backend/uploads/avatars/default_3.png'),
(4, '/backend/uploads/avatars/default_4.png'),
(5, '/backend/uploads/avatars/default_5.png');

SELECT setval('avatar_id_seq', 5);

-- ─── Profiles ────────────────────────────────
INSERT INTO profile (id, id_user, email_user, id_avatar, nickname) VALUES
(1, 1, 'alex@enigma.dev',   1, 'Алексей'),
(2, 2, 'maria@enigma.dev',  2, 'Мария'),
(3, 3, 'ivan@enigma.dev',   3, 'Иван'),
(4, 4, 'olga@enigma.dev',   4, 'Ольга'),
(5, 5, 'dmitry@enigma.dev', 5, 'Дмитрий');

SELECT setval('profile_id_seq', 5);

-- ─── Contacts ────────────────────────────────
INSERT INTO contacts (id_user_owner, id_user, status) VALUES
(1, 2, 'active'), (1, 3, 'active'), (1, 4, 'active'),
(2, 1, 'active'), (2, 3, 'active'),
(3, 1, 'active'), (3, 2, 'active'), (3, 5, 'active');

-- ─── Chats ───────────────────────────────────
INSERT INTO chats (id, id_type, is_group, name, create_date, created_by) VALUES
(1, 1, FALSE, NULL,        NOW(), 1),
(2, 1, FALSE, NULL,        NOW(), 1),
(3, 1, FALSE, NULL,        NOW(), 2),
(4, 2, TRUE,  'Команда',   NOW(), 1),
(5, 2, TRUE,  'Dev Chat',  NOW(), 3);

SELECT setval('chats_id_seq', 5);

-- ─── Chat members ────────────────────────────
INSERT INTO chat_members (chat_id, user_id, role, unread_count) VALUES
(1, 1, 'admin',  0), (1, 2, 'member', 2),
(2, 1, 'admin',  0), (2, 3, 'member', 0),
(3, 2, 'admin',  1), (3, 3, 'member', 0),
(4, 1, 'admin',  0), (4, 2, 'member', 3), (4, 3, 'member', 1), (4, 4, 'member', 0),
(5, 3, 'admin',  0), (5, 1, 'member', 0), (5, 5, 'member', 2);

-- ─── Messages ────────────────────────────────
INSERT INTO messages (id, id_sender, id_chats, id_type, status, content, created_at) VALUES
-- Chat 1: alex ↔ maria
(1,  1, 1, 1, 'read',      'Привет! Как дела?',                    NOW() - INTERVAL '2 hours'),
(2,  2, 1, 1, 'read',      'Привет! Всё отлично, спасибо 😊',      NOW() - INTERVAL '115 minutes'),
(3,  1, 1, 1, 'read',      'Созвонимся сегодня?',                  NOW() - INTERVAL '110 minutes'),
(4,  2, 1, 1, 'read',      'Да, в 18:00 подойдёт?',               NOW() - INTERVAL '100 minutes'),
(5,  1, 1, 1, 'read',      'Договорились! 👍',                     NOW() - INTERVAL '90 minutes'),
(6,  2, 1, 1, 'delivered', 'Кстати, посмотри макет — я отправила', NOW() - INTERVAL '5 minutes'),
(7,  2, 1, 1, 'delivered', 'Жду обратную связь 🙏',                NOW() - INTERVAL '4 minutes'),
-- Chat 2: alex ↔ ivan
(8,  3, 2, 1, 'read',      'Привет! Деплой прошёл?',               NOW() - INTERVAL '3 hours'),
(9,  1, 2, 1, 'read',      'Да, всё ок. Спасибо!',                 NOW() - INTERVAL '170 minutes'),
(10, 3, 2, 1, 'read',      'Отлично. Можем закрыть задачу.',       NOW() - INTERVAL '160 minutes'),
(11, 1, 2, 1, 'sent',      'Уже закрыл ✅',                        NOW() - INTERVAL '20 minutes'),
-- Chat 3: maria ↔ ivan
(12, 2, 3, 1, 'read',      'Иван, можешь ревьюнуть PR?',           NOW() - INTERVAL '1 hour'),
(13, 3, 3, 1, 'read',      'Конечно, скину комменты через час',    NOW() - INTERVAL '50 minutes'),
(14, 2, 3, 1, 'delivered', 'Спасибо большое! 🔥',                  NOW() - INTERVAL '10 minutes'),
-- Chat 4: group "Команда"
(15, 1, 4, 1, 'read',      'Всем привет! 👋',                      NOW() - INTERVAL '4 hours'),
(16, 2, 4, 1, 'read',      'Привет!',                              NOW() - INTERVAL '230 minutes'),
(17, 3, 4, 1, 'read',      'Хай!',                                 NOW() - INTERVAL '220 minutes'),
(18, 4, 4, 1, 'read',      'Привет всем 😊',                       NOW() - INTERVAL '210 minutes'),
(19, 1, 4, 1, 'read',      'Сегодня стенд в 10:00, не забудьте',  NOW() - INTERVAL '200 minutes'),
(20, 2, 4, 1, 'delivered', 'Ок!',                                  NOW() - INTERVAL '15 minutes'),
(21, 3, 4, 1, 'delivered', 'Буду',                                 NOW() - INTERVAL '14 minutes'),
(22, 1, 4, 1, 'delivered', 'Отлично 🚀',                           NOW() - INTERVAL '2 minutes'),
-- Chat 5: group "Dev Chat"
(23, 3, 5, 1, 'read',      'Народ, обновил зависимости',           NOW() - INTERVAL '6 hours'),
(24, 1, 5, 1, 'read',      'Видел, спасибо',                       NOW() - INTERVAL '5 hours'),
(25, 5, 5, 1, 'read',      'Ок, проверю на stage',                 NOW() - INTERVAL '4 hours'),
(26, 3, 5, 1, 'delivered', 'Мерж можно делать',                    NOW() - INTERVAL '30 minutes');

SELECT setval('messages_id_seq', 26);

COMMIT;
