#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const image = process.env.IMAGE || 'oh-my-ralpha-codex:ubuntu24.04';
const containerName = process.env.CONTAINER_NAME || 'oh-my-ralpha-codex-shell';
const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
const authPath = process.env.CODEX_AUTH_JSON || join(codexHome, 'auth.json');
const proxyEnabled = !['0', 'false', 'off', 'no'].includes(String(process.env.CODEX_DOCKER_PROXY ?? '1').toLowerCase());
const proxyUrl = process.env.CODEX_DOCKER_PROXY_URL || 'http://host.docker.internal:7890';
const noProxy = process.env.CODEX_DOCKER_NO_PROXY || 'localhost,127.0.0.1,::1,host.docker.internal';
const authReadonly = !['0', 'false', 'off', 'no'].includes(String(process.env.CODEX_DOCKER_AUTH_READONLY ?? '1').toLowerCase());
const autoSetup = !['0', 'false', 'off', 'no'].includes(String(process.env.CODEX_DOCKER_AUTO_SETUP ?? '1').toLowerCase());
const skillBuildId = process.env.CODEX_DOCKER_BUILD_ID || new Date().toISOString();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`Building ${image} from ${root} ...`);
run('docker', [
  'build',
  '-f',
  join(root, 'docker', 'ubuntu-codex', 'Dockerfile'),
  '-t',
  image,
  '--target',
  'skill',
  '--build-arg',
  `SKILL_BUILD_ID=${skillBuildId}`,
  root,
]);

// The final container is intentionally disposable. Only auth.json is mounted
// from the host; /root/.codex itself is fresh for every run.
spawnSync('docker', ['rm', '-f', containerName], {
  stdio: 'ignore',
});

const envArgs = [
  '--env', 'CODEX_HOME=/root/.codex',
  '--env', `CODEX_DOCKER_PROXY=${proxyEnabled ? '1' : '0'}`,
  '--env', `OH_MY_RALPHA_AUTO_SETUP=${autoSetup ? '1' : '0'}`,
  '--env', `OH_MY_RALPHA_BUILD_ID=${skillBuildId}`,
];

if (proxyEnabled) {
  envArgs.push(
    '--env', `CODEX_DOCKER_PROXY_URL=${proxyUrl}`,
    '--env', `HTTP_PROXY=${proxyUrl}`,
    '--env', `http_proxy=${proxyUrl}`,
    '--env', `HTTPS_PROXY=${proxyUrl}`,
    '--env', `https_proxy=${proxyUrl}`,
    '--env', `ALL_PROXY=${proxyUrl}`,
    '--env', `all_proxy=${proxyUrl}`,
    '--env', `NO_PROXY=${noProxy}`,
    '--env', `no_proxy=${noProxy}`,
    '--env', `npm_config_proxy=${proxyUrl}`,
    '--env', `npm_config_https_proxy=${proxyUrl}`,
  );
} else {
  envArgs.push(
    '--env', 'HTTP_PROXY=',
    '--env', 'http_proxy=',
    '--env', 'HTTPS_PROXY=',
    '--env', 'https_proxy=',
    '--env', 'ALL_PROXY=',
    '--env', 'all_proxy=',
    '--env', `NO_PROXY=${noProxy}`,
    '--env', `no_proxy=${noProxy}`,
  );
}

envArgs.push(
  '--env', `OH_MY_RALPHA_PROXY_LINE=${proxyEnabled ? `Proxy: enabled (${proxyUrl})` : 'Proxy: disabled'}`,
  '--env', `OH_MY_RALPHA_AUTH_LINE=${
    existsSync(authPath)
      ? `Auth: mounted ${authPath}${authReadonly ? ' read-only' : ''}`
      : `Auth: missing ${authPath}`
  }`,
);

for (const name of [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_ORG_ID',
  'OPENAI_PROJECT_ID',
]) {
  if (process.env[name]) {
    envArgs.push('--env', `${name}=${process.env[name]}`);
  }
}

const mountArgs = [
  '--tmpfs', '/root/.codex:mode=700',
];

if (existsSync(authPath)) {
  const readonlySuffix = authReadonly ? ',readonly' : '';
  mountArgs.push(
    '--mount',
    `type=bind,source=${authPath},target=/root/.codex/auth.json${readonlySuffix}`,
  );
} else {
  console.warn(`Warning: Codex auth file not found at ${authPath}; run codex login inside the container if needed.`);
}

run('docker', [
  'run',
  '--rm',
  '-it',
  '--name',
  containerName,
  ...envArgs,
  ...mountArgs,
  '--workdir',
  '/workspace',
  image,
  'bash',
  '-lc',
  [
    'set -euo pipefail',
    'printf "\\nUbuntu + Codex skill sandbox is ready.\\n"',
    'printf "Build: %s\\n" "$OH_MY_RALPHA_BUILD_ID"',
    'printf "%s\\n" "$OH_MY_RALPHA_PROXY_LINE"',
    'printf "%s\\n\\n" "$OH_MY_RALPHA_AUTH_LINE"',
    'printf "Skill repo is baked into /workspace.\\n"',
    'if [[ "${OH_MY_RALPHA_AUTO_SETUP:-1}" == "1" ]]; then',
    '  printf "Installing latest baked skill into CODEX_HOME...\\n"',
    '  node bin/oh-my-ralpha.js setup --scope user --force >/tmp/oh-my-ralpha-setup.json',
    '  node bin/oh-my-ralpha.js verify --scope user >/tmp/oh-my-ralpha-verify.json',
    '  node -e "const fs=require(\\"fs\\"); const r=JSON.parse(fs.readFileSync(\\"/tmp/oh-my-ralpha-verify.json\\",\\"utf8\\")); if(!r.ok){console.error(JSON.stringify(r,null,2)); process.exit(1)}"',
    '  printf "Skill install verified: ok true\\n\\n"',
    'else',
    '  printf "Auto setup is disabled. Run manually if needed:\\n  node bin/oh-my-ralpha.js setup --scope user --force\\n\\n"',
    'fi',
    'printf "Start Codex with:\\n  codex\\n\\n"',
    'exec bash',
  ].join('\n'),
]);
