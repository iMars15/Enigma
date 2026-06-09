import { WebSocketServer } from 'ws';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const dbDir = join(rootDir, 'database');
const dbPath = join(dbDir, 'enigma.sqlite');
const fallbackPath = join(dbDir, 'ws-fallback.json');

// Load environment variables from project-level .env if present
try {
  dotenv.config({ path: join(rootDir, '.env') });
} catch (e) {
  // ignore
}

if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

let sqliteAvailable = true;

try {
  execFileSync('sqlite3', [dbPath, readFileSync(join(dbDir, 'schema.sql'), 'utf8')]);
} catch {
  sqliteAvailable = false;
  if (!existsSync(fallbackPath)) {
    writeFileSync(fallbackPath, JSON.stringify({ messages: [] }, null, 2));
  }
  console.warn('sqlite3 CLI не найден. WebSocket-сообщения будут сохраняться в database/ws-fallback.json, пока PHP не создаст SQLite-базу.');
}

// Bind to configured WS_HOST or 0.0.0.0 to accept remote connections
const socketHost = process.env.WS_HOST || '0.0.0.0';
const socketPort = Number(process.env.WS_PORT || 3001);
const wss = new WebSocketServer({ host: socketHost, port: socketPort });
const clients = new Map();

wss.on('listening', () => {
  console.log(`WebSocket-сервер Enigma слушает ws://${socketHost}:${socketPort}`);
});

wss.on('error', (error) => {
  console.error(`Ошибка WebSocket-сервера: ${error.message}`);
  process.exitCode = 1;
});

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function fillSql(sql, values = []) {
  return values.reduce((query, value, index) => query.replaceAll(`?${index + 1}`, sqlValue(value)), sql);
}

function sqliteJson(sql, values = []) {
  if (!sqliteAvailable) return [];

  try {
    const output = execFileSync('sqlite3', ['-json', dbPath, fillSql(sql, values)], { encoding: 'utf8' }).trim();
    return output ? JSON.parse(output) : [];
  } catch {
    return [];
  }
}

function sqliteRun(sql, values = []) {
  if (!sqliteAvailable) return null;

  try {
    const script = `${fillSql(sql, values)}; SELECT last_insert_rowid() AS id;`;
    const output = execFileSync('sqlite3', ['-json', dbPath, script], { encoding: 'utf8' }).trim();
    const rows = output ? JSON.parse(output) : [];
    return rows.at(-1)?.id || null;
  } catch {
    return null;
  }
}

function getUser(userId) {
  const rows = sqliteJson('SELECT id, username, display_name, avatar_url, accent_color FROM users WHERE id = ?1', [userId]);
  return rows[0] || {
    id: Number(userId),
    username: `user-${userId}`,
    display_name: `Пользователь ${userId}`,
    avatar_url: '',
    accent_color: '#16f29a'
  };
}

function getChannel(channelId) {
  return sqliteJson('SELECT id, guild_id FROM channels WHERE id = ?1', [channelId])[0] || { id: Number(channelId), guild_id: 1 };
}

function hasMembership(guildId, userId) {
  if (!sqliteAvailable) return true;
  return sqliteJson('SELECT 1 AS ok FROM guild_members WHERE guild_id = ?1 AND user_id = ?2', [guildId, userId]).length > 0;
}

function saveFallbackMessage(message) {
  const data = JSON.parse(readFileSync(fallbackPath, 'utf8'));
  data.messages.push(message);
  writeFileSync(fallbackPath, JSON.stringify(data, null, 2));
}

function insertChatMessage(channelId, user, content) {
  const id = sqliteRun('INSERT INTO messages (channel_id, user_id, content) VALUES (?1, ?2, ?3)', [channelId, user.id, content]);

  if (id) {
    return sqliteJson(`
      SELECT m.id, m.channel_id, m.content, m.created_at,
             u.id AS user_id, u.username, u.display_name, u.avatar_url, u.accent_color
      FROM messages m
      JOIN users u ON u.id = m.user_id
      WHERE m.id = ?1
    `, [id])[0];
  }

  const message = {
    id: Date.now(),
    channel_id: Number(channelId),
    content,
    created_at: new Date().toISOString(),
    user_id: user.id,
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    accent_color: user.accent_color
  };
  saveFallbackMessage(message);
  return message;
}

function send(ws, payload) {
  // readyState 1 == OPEN
  if (ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(payload));
    } catch (e) {
      console.warn('Ошибка при отправке сокет-сообщения:', e?.message || e);
    }
  }
}

function broadcastToChannel(channelId, payload, except = null) {
  for (const client of clients.values()) {
    if (client.ws !== except && client.channels.has(Number(channelId))) {
      send(client.ws, payload);
    }
  }
}

function channelAllowed(channelId, userId) {
  const channel = getChannel(Number(channelId));
  if (!channel) {
    return false;
  }

  return hasMembership(Number(channel.guild_id), Number(userId));
}

function activePeers(channelId) {
  return [...clients.values()]
    .filter((client) => client.callChannelId === Number(channelId))
    .map((client) => ({
      user_id: client.user.id,
      display_name: client.user.display_name,
      avatar_url: client.user.avatar_url,
      accent_color: client.user.accent_color
    }));
}

wss.on('connection', (ws) => {
  try {
    const remote = ws._socket && ws._socket.remoteAddress ? `${ws._socket.remoteAddress}:${ws._socket.remotePort}` : 'unknown';
    console.log(`Новое WS-соединение от ${remote}`);
  } catch (e) {
    // ignore
  }
  const client = {
    ws,
    user: null,
    channels: new Set(),
    callChannelId: null
  };

  ws.on('message', (raw) => {
    let event;

    try {
      event = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', error: 'Некорректное сообщение сокета.' });
      return;
    }

    if (event.type === 'hello') {
      const user = getUser(Number(event.user_id));
      if (!user) {
        send(ws, { type: 'error', error: 'Пользователь не найден.' });
        return;
      }

      client.user = user;
      clients.set(ws, client);
      send(ws, { type: 'ready', user });
      return;
    }

    if (!client.user) {
      send(ws, { type: 'error', error: 'Нужно авторизоваться для работы с сокетом.' });
      return;
    }

    if (event.type === 'subscribe') {
      const channelId = Number(event.channel_id);
      if (!channelAllowed(channelId, client.user.id)) {
        send(ws, { type: 'error', error: 'Нет доступа к каналу.' });
        return;
      }

      client.channels.add(channelId);
      send(ws, { type: 'subscribed', channel_id: channelId });
      return;
    }

    if (event.type === 'message:create') {
      const channelId = Number(event.channel_id);
      const content = String(event.content || '').replace(/\s+/g, ' ').trim().slice(0, 1600);

      if (!content) {
        return;
      }

      if (!channelAllowed(channelId, client.user.id)) {
        send(ws, { type: 'error', error: 'Нет доступа к каналу.' });
        return;
      }

      const message = insertChatMessage(channelId, client.user, content);
      broadcastToChannel(channelId, { type: 'message:new', message }, ws);
      send(ws, { type: 'message:new', message });
      return;
    }

    if (event.type === 'call:join') {
      const channelId = Number(event.channel_id);
      if (!channelAllowed(channelId, client.user.id)) {
        send(ws, { type: 'error', error: 'Нет доступа к каналу.' });
        return;
      }

      client.callChannelId = channelId;
      send(ws, { type: 'call:peers', channel_id: channelId, peers: activePeers(channelId).filter((peer) => peer.user_id !== client.user.id) });
      broadcastToChannel(channelId, { type: 'call:peer-joined', channel_id: channelId, peer: client.user }, ws);
      return;
    }

    if (event.type === 'call:leave') {
      const channelId = client.callChannelId;
      client.callChannelId = null;
      if (channelId) {
        broadcastToChannel(channelId, { type: 'call:peer-left', channel_id: channelId, user_id: client.user.id }, ws);
      }
      return;
    }

    if (event.type?.startsWith('webrtc:')) {
      const targetId = Number(event.target_user_id);
      const target = [...clients.values()].find((item) => item.user?.id === targetId);
      if (!target || target.callChannelId !== client.callChannelId) {
        return;
      }

      send(target.ws, {
        ...event,
        from_user_id: client.user.id,
        from_display_name: client.user.display_name
      });
    }
  });

  ws.on('close', () => {
    const channelId = client.callChannelId;
    clients.delete(ws);

    if (channelId && client.user) {
      broadcastToChannel(channelId, { type: 'call:peer-left', channel_id: channelId, user_id: client.user.id });
    }
  });
});
