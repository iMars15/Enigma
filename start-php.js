#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env file
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const envExamplePath = path.join(__dirname, '.env.example');
  
  const env = { ...process.env };
  
  // Try to read .env, fall back to .env.example
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf-8');
  } else if (fs.existsSync(envExamplePath)) {
    console.log('ℹ️  .env not found, using .env.example for defaults');
    content = fs.readFileSync(envExamplePath, 'utf-8');
  }
  
  // Parse environment variables
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key) {
        env[key] = valueParts.join('=');
      }
    }
  });
  
  return env;
}

const env = loadEnv();

// Get host and port with defaults
const phpHost = env.PHP_HOST || '127.0.0.1';
const phpPort = env.PHP_PORT || '8080';
const publicDir = path.join(__dirname, 'public');
const routerFile = path.join(__dirname, 'router.php');

console.log(`🚀 Starting PHP server on ${phpHost}:${phpPort}`);
console.log(`📁 Project root: ${__dirname}`);
console.log(`📁 Document root: ${publicDir}`);
console.log(`🔀 Router: ${routerFile}`);

if (!fs.existsSync(publicDir)) {
  console.error(`❌ Document root not found: ${publicDir}`);
  process.exit(1);
}

if (!fs.existsSync(routerFile)) {
  console.error(`❌ Router file not found: ${routerFile}`);
  process.exit(1);
}

// Spawn PHP server
const php = spawn('php', [
  '-S',
  `${phpHost}:${phpPort}`,
  '-t',
  publicDir,
  routerFile
], {
  cwd: __dirname,
  stdio: 'inherit'
});

// Handle process termination
process.on('SIGTERM', () => {
  console.log('⏹️  Stopping PHP server...');
  php.kill();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('⏹️  Stopping PHP server...');
  php.kill();
  process.exit(0);
});

php.on('error', (err) => {
  console.error('❌ Failed to start PHP server:', err);
  process.exit(1);
});

php.on('exit', (code) => {
  if (code !== 0) {
    console.error(`❌ PHP server exited with code ${code}`);
    process.exit(code);
  }
});
