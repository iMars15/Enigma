-- ============================================
--  Enigma — schema.sql  (PostgreSQL 14+)
--  Full database schema with all FK relations
--  Exactly as shown in the ERD diagram
-- ============================================

BEGIN;

-- ─── Extensions ──────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Drop tables (reverse dependency order) ──
DROP TABLE IF EXISTS password_reset  CASCADE;
DROP TABLE IF EXISTS media            CASCADE;
DROP TABLE IF EXISTS messages         CASCADE;
DROP TABLE IF EXISTS chat_members     CASCADE;
DROP TABLE IF EXISTS chats            CASCADE;
DROP TABLE IF EXISTS type_messages    CASCADE;
DROP TABLE IF EXISTS id_file_type     CASCADE;
DROP TABLE IF EXISTS contacts         CASCADE;
DROP TABLE IF EXISTS profile          CASCADE;
DROP TABLE IF EXISTS avatar           CASCADE;
DROP TABLE IF EXISTS "user"           CASCADE;

-- ============================================
--  TABLE: user
--  Diagram: id, login, password, email,
--           nickname, status, password_hash
-- ============================================
CREATE TABLE "user" (
    id              SERIAL          PRIMARY KEY,
    login           VARCHAR(64)     NOT NULL,
    password        VARCHAR(255)    NOT NULL DEFAULT '',
    email           VARCHAR(255)    NOT NULL,
    nickname        VARCHAR(64)     DEFAULT NULL,
    status          VARCHAR(128)    DEFAULT NULL,
    password_hash   VARCHAR(255)    NOT NULL,
    last_seen       TIMESTAMPTZ     DEFAULT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_login UNIQUE (login),
    CONSTRAINT uq_user_email UNIQUE (email)
);

CREATE INDEX idx_user_login ON "user" (login);
CREATE INDEX idx_user_email ON "user" (email);

COMMENT ON TABLE  "user"               IS 'Core user accounts';
COMMENT ON COLUMN "user".password_hash IS 'bcrypt hash';
COMMENT ON COLUMN "user".password      IS 'Legacy plain field, kept per diagram';

-- ============================================
--  TABLE: avatar
--  Diagram: id, url(image)
-- ============================================
CREATE TABLE avatar (
    id          SERIAL       PRIMARY KEY,
    url_image   VARCHAR(512) NOT NULL
);

COMMENT ON TABLE avatar IS 'Avatar image references';

-- ============================================
--  TABLE: profile
--  Diagram: id, id_user, email_user, id_avatar
-- ============================================
CREATE TABLE profile (
    id              SERIAL       PRIMARY KEY,
    id_user         INTEGER      NOT NULL,
    email_user      VARCHAR(255) NOT NULL,
    id_avatar       INTEGER      DEFAULT NULL,
    nickname        VARCHAR(64)  DEFAULT NULL,
    show_online     BOOLEAN      NOT NULL DEFAULT TRUE,
    read_receipts   BOOLEAN      NOT NULL DEFAULT TRUE,
    typing_status   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Diagram arrow: profile.id_user → user.id
    CONSTRAINT fk_profile_user
        FOREIGN KEY (id_user)   REFERENCES "user" (id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    -- Diagram arrow: profile.id_avatar → avatar.id
    CONSTRAINT fk_profile_avatar
        FOREIGN KEY (id_avatar) REFERENCES avatar (id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT uq_profile_user UNIQUE (id_user)
);

CREATE INDEX idx_profile_user   ON profile (id_user);
CREATE INDEX idx_profile_avatar ON profile (id_avatar);

COMMENT ON TABLE  profile           IS 'Extended user profile (diagram: profile)';
COMMENT ON COLUMN profile.id_user   IS 'Diagram: id_user  → user.id';
COMMENT ON COLUMN profile.id_avatar IS 'Diagram: id_avatar → avatar.id';

-- auto-update updated_at
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profile_updated_at
    BEFORE UPDATE ON profile
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================
--  TABLE: contacts
--  Diagram: id, id_user, status
-- ============================================
CREATE TABLE contacts (
    id              SERIAL      PRIMARY KEY,
    id_user_owner   INTEGER     NOT NULL,
    id_user         INTEGER     NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','blocked','pending')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Diagram arrow: contacts → user (owner side)
    CONSTRAINT fk_contacts_owner
        FOREIGN KEY (id_user_owner) REFERENCES "user" (id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    -- Diagram arrow: contacts.id_user → user.id
    CONSTRAINT fk_contacts_target
        FOREIGN KEY (id_user)       REFERENCES "user" (id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT uq_contacts_pair  UNIQUE (id_user_owner, id_user),
    CONSTRAINT chk_contacts_self CHECK  (id_user_owner <> id_user)
);

CREATE INDEX idx_contacts_owner  ON contacts (id_user_owner);
CREATE INDEX idx_contacts_target ON contacts (id_user);

COMMENT ON TABLE  contacts         IS 'User contact list (diagram: contacts)';
COMMENT ON COLUMN contacts.id_user IS 'Diagram field: id_user';
COMMENT ON COLUMN contacts.status  IS 'Diagram field: status';

-- ============================================
--  TABLE: id_file_type
--  Diagram: id, image, gif, sticker, video
-- ============================================
CREATE TABLE id_file_type (
    id      SERIAL      PRIMARY KEY,
    image   BOOLEAN     NOT NULL DEFAULT FALSE,
    gif     BOOLEAN     NOT NULL DEFAULT FALSE,
    sticker BOOLEAN     NOT NULL DEFAULT FALSE,
    video   BOOLEAN     NOT NULL DEFAULT FALSE,
    name    VARCHAR(32) NOT NULL DEFAULT 'other'
);

COMMENT ON TABLE id_file_type IS 'File type flags (diagram: id_file_type)';

-- ============================================
--  TABLE: type_messages
--  Diagram: id, text, id_media
-- ============================================
CREATE TABLE type_messages (
    id       SERIAL      PRIMARY KEY,
    text     VARCHAR(64) NOT NULL,
    id_media INTEGER     DEFAULT NULL
);

COMMENT ON TABLE  type_messages          IS 'Message types (diagram: type_messages)';
COMMENT ON COLUMN type_messages.text     IS 'Diagram field: text';
COMMENT ON COLUMN type_messages.id_media IS 'Diagram field: id_media';

-- ============================================
--  TABLE: chats
--  Diagram: id, id_type, it's_group?(boolean),
--           create_date
-- ============================================
CREATE TABLE chats (
    id          SERIAL       PRIMARY KEY,
    id_type     INTEGER      NOT NULL DEFAULT 1,
    is_group    BOOLEAN      NOT NULL DEFAULT FALSE,
    name        VARCHAR(128) DEFAULT NULL,
    create_date TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by  INTEGER      DEFAULT NULL,

    -- chats.created_by → user.id
    CONSTRAINT fk_chats_creator
        FOREIGN KEY (created_by) REFERENCES "user" (id)
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX idx_chats_type    ON chats (id_type);
CREATE INDEX idx_chats_creator ON chats (created_by);

COMMENT ON TABLE  chats          IS 'Chat rooms (diagram: chats)';
COMMENT ON COLUMN chats.is_group IS 'Diagram: it''s group?(boolean)';

-- ============================================
--  TABLE: chat_members  (junction user ↔ chats)
-- ============================================
CREATE TABLE chat_members (
    id            SERIAL      PRIMARY KEY,
    chat_id       INTEGER     NOT NULL,
    user_id       INTEGER     NOT NULL,
    role          VARCHAR(16) NOT NULL DEFAULT 'member'
                      CHECK (role IN ('admin','member')),
    unread_count  INTEGER     NOT NULL DEFAULT 0,
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_id  INTEGER     DEFAULT NULL,

    -- chat_members.chat_id → chats.id
    CONSTRAINT fk_cm_chat
        FOREIGN KEY (chat_id) REFERENCES chats (id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    -- chat_members.user_id → user.id
    CONSTRAINT fk_cm_user
        FOREIGN KEY (user_id) REFERENCES "user" (id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT uq_chat_member UNIQUE (chat_id, user_id)
);

CREATE INDEX idx_cm_chat ON chat_members (chat_id);
CREATE INDEX idx_cm_user ON chat_members (user_id);

COMMENT ON TABLE chat_members IS 'Many-to-many: user ↔ chats';

-- ============================================
--  TABLE: messages
--  Diagram: id, id_sender, id_chats,
--           id_type, status
-- ============================================
CREATE TABLE messages (
    id          SERIAL      PRIMARY KEY,
    id_sender   INTEGER     NOT NULL,
    id_chats    INTEGER     NOT NULL,
    id_type     INTEGER     NOT NULL DEFAULT 1,
    status      VARCHAR(16) NOT NULL DEFAULT 'sent'
                    CHECK (status IN ('sent','delivered','read','deleted')),
    content     TEXT        DEFAULT NULL,
    reply_to    INTEGER     DEFAULT NULL,
    edited      BOOLEAN     NOT NULL DEFAULT FALSE,
    edited_at   TIMESTAMPTZ DEFAULT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Diagram arrow: messages.id_sender → user.id
    CONSTRAINT fk_messages_sender
        FOREIGN KEY (id_sender)  REFERENCES "user" (id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    -- Diagram arrow: messages.id_chats → chats.id
    CONSTRAINT fk_messages_chat
        FOREIGN KEY (id_chats)   REFERENCES chats (id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    -- Diagram arrow: messages.id_type → type_messages.id
    CONSTRAINT fk_messages_type
        FOREIGN KEY (id_type)    REFERENCES type_messages (id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    -- Self-reference: reply_to → messages.id
    CONSTRAINT fk_messages_reply
        FOREIGN KEY (reply_to)   REFERENCES messages (id)
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX idx_messages_chat    ON messages (id_chats);
CREATE INDEX idx_messages_sender  ON messages (id_sender);
CREATE INDEX idx_messages_type    ON messages (id_type);
CREATE INDEX idx_messages_created ON messages (created_at DESC);

COMMENT ON TABLE  messages           IS 'All messages (diagram: messages)';
COMMENT ON COLUMN messages.id_sender IS 'Diagram: id_sender → user.id';
COMMENT ON COLUMN messages.id_chats  IS 'Diagram: id_chats  → chats.id';
COMMENT ON COLUMN messages.id_type   IS 'Diagram: id_type   → type_messages.id';
COMMENT ON COLUMN messages.status    IS 'Diagram: status';

-- ============================================
--  TABLE: media
--  Diagram: id, id_message, file_url,
--           id_file_type, file_size
-- ============================================
CREATE TABLE media (
    id           SERIAL       PRIMARY KEY,
    id_message   INTEGER      NOT NULL,
    file_url     VARCHAR(512) NOT NULL,
    id_file_type INTEGER      NOT NULL,
    file_size    BIGINT       DEFAULT NULL,
    file_name    VARCHAR(255) DEFAULT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Diagram arrow: media.id_message → messages.id
    CONSTRAINT fk_media_message
        FOREIGN KEY (id_message)   REFERENCES messages (id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    -- Diagram arrow: media.id_file_type → id_file_type.id
    CONSTRAINT fk_media_file_type
        FOREIGN KEY (id_file_type) REFERENCES id_file_type (id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX idx_media_message   ON media (id_message);
CREATE INDEX idx_media_file_type ON media (id_file_type);

COMMENT ON TABLE  media              IS 'Media attachments (diagram: media)';
COMMENT ON COLUMN media.id_message   IS 'Diagram: id_message   → messages.id';
COMMENT ON COLUMN media.id_file_type IS 'Diagram: id_file_type → id_file_type.id';
COMMENT ON COLUMN media.file_size    IS 'Diagram: file_size (bytes)';

-- ============================================
--  TABLE: password_reset  (utility)
-- ============================================
CREATE TABLE password_reset (
    id          SERIAL      PRIMARY KEY,
    user_id     INTEGER     NOT NULL,
    token       VARCHAR(64) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_reset_user
        FOREIGN KEY (user_id) REFERENCES "user" (id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT uq_reset_user  UNIQUE (user_id),
    CONSTRAINT uq_reset_token UNIQUE (token)
);

COMMENT ON TABLE password_reset IS 'Password recovery tokens';

-- ============================================
--  SEED: id_file_type
--  Diagram: id, image, gif, sticker, video
-- ============================================
INSERT INTO id_file_type (id, name, image, gif, sticker, video) VALUES
(1, 'image',   TRUE,  FALSE, FALSE, FALSE),
(2, 'gif',     FALSE, TRUE,  FALSE, FALSE),
(3, 'sticker', FALSE, FALSE, TRUE,  FALSE),
(4, 'video',   FALSE, FALSE, FALSE, TRUE),
(5, 'file',    FALSE, FALSE, FALSE, FALSE);

SELECT setval('id_file_type_id_seq', 5);

-- ============================================
--  SEED: type_messages
--  Diagram: id, text, id_media
-- ============================================
INSERT INTO type_messages (id, text, id_media) VALUES
(1, 'text',    NULL),
(2, 'image',   1),
(3, 'gif',     2),
(4, 'sticker', 3),
(5, 'video',   4),
(6, 'file',    5);

SELECT setval('type_messages_id_seq', 6);

COMMIT;
