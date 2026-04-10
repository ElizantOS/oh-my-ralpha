import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installSkill } from './install.mjs';
import { resolveCodexHome } from './paths.mjs';

const MANAGED_HOOK_MARKER = 'oh-my-ralpha.js" hook native';
const MANAGED_MCP_START = '# BEGIN OH_MY_RALPHA MCP BLOCK';
const MANAGED_MCP_END = '# END OH_MY_RALPHA MCP BLOCK';
const NOTIFY_CHAIN_FILE = 'notify-chain.json';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function resolveScopedCodexHome({ cwd, codexHome, scope = 'user' }) {
  if (scope === 'project') {
    return join(cwd, '.codex');
  }
  return resolveCodexHome(codexHome);
}

export function getNotifyChainPath(installedSkillDir) {
  return join(installedSkillDir, NOTIFY_CHAIN_FILE);
}

function codexConfigPath(codexHome) {
  return join(codexHome, 'config.toml');
}

function codexHooksPath(codexHome) {
  return join(codexHome, 'hooks.json');
}

function buildManagedNotifyLine(installedCliPath) {
  return `notify = ["node", "${installedCliPath}", "notify"]`;
}

function isManagedNotifyLine(line) {
  return /^\s*notify\s*=\s*\["node",\s*".*oh-my-ralpha\.js",\s*"notify"\]\s*$/.test(line);
}

function parseNotifyArrayLiteral(line) {
  const match = line.match(/^\s*notify\s*=\s*(\[[\s\S]*\])\s*$/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string') ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeNotifyChain(installedSkillDir, notifyCommand) {
  const path = getNotifyChainPath(installedSkillDir);
  if (!notifyCommand) {
    await rm(path, { force: true });
    return null;
  }
  await writeFile(path, JSON.stringify({ command: notifyCommand }, null, 2) + '\n', 'utf-8');
  return path;
}

export async function readNotifyChain(installedSkillDir) {
  const path = getNotifyChainPath(installedSkillDir);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(await readFile(path, 'utf-8'));
    return Array.isArray(parsed.command) ? parsed.command : null;
  } catch {
    return null;
  }
}

function managedMcpBlock(installedSkillDir) {
  const stateServerPath = join(installedSkillDir, 'src', 'mcp', 'state-server.mjs');
  const traceServerPath = join(installedSkillDir, 'src', 'mcp', 'trace-server.mjs');
  const runtimeServerPath = join(installedSkillDir, 'src', 'mcp', 'runtime-server.mjs');

  return [
    MANAGED_MCP_START,
    '[mcp_servers.oh_my_ralpha_state]',
    'command = "node"',
    `args = ["${stateServerPath}"]`,
    'enabled = true',
    'startup_timeout_sec = 5',
    '',
    '[mcp_servers.oh_my_ralpha_trace]',
    'command = "node"',
    `args = ["${traceServerPath}"]`,
    'enabled = true',
    'startup_timeout_sec = 5',
    '',
    '[mcp_servers.oh_my_ralpha_runtime]',
    'command = "node"',
    `args = ["${runtimeServerPath}"]`,
    'enabled = true',
    'startup_timeout_sec = 5',
    MANAGED_MCP_END,
  ].join('\n');
}

function findSectionEnd(lines, startIndex) {
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (/^\s*\[.+\]\s*$/.test(lines[i])) return i;
  }
  return lines.length;
}

function ensureCodexHooksFlag(content) {
  const lines = content ? content.split(/\r?\n/) : [];
  const featuresIndex = lines.findIndex((line) => /^\s*\[features\]\s*$/.test(line));

  if (featuresIndex === -1) {
    return [
      ...lines.filter(Boolean),
      ...(lines.filter(Boolean).length > 0 ? [''] : []),
      '[features]',
      'codex_hooks = true',
      '',
    ].join('\n').trimEnd() + '\n';
  }

  const endIndex = findSectionEnd(lines, featuresIndex);
  const codexHooksIndex = lines.findIndex((line, index) => {
    return index > featuresIndex && index < endIndex && /^\s*codex_hooks\s*=/.test(line);
  });

  if (codexHooksIndex >= 0) {
    lines[codexHooksIndex] = 'codex_hooks = true';
    return lines.join('\n').replace(/\n*$/, '\n');
  }

  lines.splice(endIndex, 0, 'codex_hooks = true');
  return lines.join('\n').replace(/\n*$/, '\n');
}

function upsertManagedNotify(content, installedCliPath) {
  const lines = content ? content.split(/\r?\n/) : [];
  const firstTableIndex = lines.findIndex((line) => /^\s*\[.+\]\s*$/.test(line));
  const boundary = firstTableIndex >= 0 ? firstTableIndex : lines.length;
  const notifyIndex = lines.findIndex((line, index) => index < boundary && /^\s*notify\s*=/.test(line));
  const nextLine = buildManagedNotifyLine(installedCliPath);

  if (notifyIndex >= 0) {
    if (!isManagedNotifyLine(lines[notifyIndex])) {
      const chainedNotify = parseNotifyArrayLiteral(lines[notifyIndex]);
      if (!chainedNotify) {
        throw new Error('config.toml already contains a non-managed notify entry; unable to parse it for chaining');
      }
      lines[notifyIndex] = nextLine;
      return {
        content: lines.join('\n').replace(/\n*$/, '\n'),
        chainedNotify,
      };
    }
    lines[notifyIndex] = nextLine;
    return {
      content: lines.join('\n').replace(/\n*$/, '\n'),
      chainedNotify: null,
    };
  }

  lines.splice(boundary, 0, nextLine);
  return {
    content: lines.join('\n').replace(/\n*$/, '\n'),
    chainedNotify: null,
  };
}

function removeCodexHooksFlag(content) {
  const lines = content.split(/\r?\n/);
  const nextLines = lines.filter((line) => !/^\s*codex_hooks\s*=/.test(line));
  return nextLines.join('\n').trimEnd();
}

function removeManagedNotifyLine(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => !isManagedNotifyLine(line))
    .join('\n')
    .trimEnd();
}

async function writeManagedConfig(codexHome, installedCliPath) {
  const path = codexConfigPath(codexHome);
  const existing = existsSync(path) ? await readFile(path, 'utf-8') : '';
  const notifyResult = upsertManagedNotify(existing, installedCliPath);
  const next = ensureCodexHooksFlag(notifyResult.content);
  await mkdir(codexHome, { recursive: true });
  await writeFile(path, next, 'utf-8');
  return {
    path,
    chainedNotify: notifyResult.chainedNotify,
  };
}

function stripManagedMcpBlock(content) {
  const pattern = new RegExp(`${escapeRegex(MANAGED_MCP_START)}[\\s\\S]*?${escapeRegex(MANAGED_MCP_END)}\\n?`, 'g');
  return content.replace(pattern, '').trimEnd();
}

async function writeManagedMcpConfig(codexHome, installedSkillDir) {
  const path = codexConfigPath(codexHome);
  const existing = existsSync(path) ? await readFile(path, 'utf-8') : '';
  const stripped = stripManagedMcpBlock(existing);
  const next = [stripped, managedMcpBlock(installedSkillDir)].filter(Boolean).join('\n\n') + '\n';
  await mkdir(codexHome, { recursive: true });
  await writeFile(path, next, 'utf-8');
  return path;
}

function buildManagedHooks(installedCliPath) {
  const command = `node "${installedCliPath}" hook native`;
  return {
    SessionStart: [{
      matcher: 'startup|resume',
      hooks: [{ type: 'command', command, statusMessage: 'Loading oh-my-ralpha session context' }],
    }],
    PreToolUse: [{
      hooks: [{ type: 'command', command, statusMessage: 'Logging oh-my-ralpha tool preflight' }],
    }],
    PostToolUse: [{
      hooks: [{ type: 'command', command, statusMessage: 'Logging oh-my-ralpha tool result' }],
    }],
    UserPromptSubmit: [{
      hooks: [{ type: 'command', command, statusMessage: 'Applying oh-my-ralpha prompt routing' }],
    }],
    Stop: [{
      hooks: [{ type: 'command', command, timeout: 30 }],
    }],
  };
}

function parseHooksConfig(content) {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') return { hooks: {} };
    const hooks = parsed.hooks && typeof parsed.hooks === 'object' ? parsed.hooks : {};
    return { ...parsed, hooks };
  } catch {
    throw new Error('invalid hooks.json: expected valid JSON before oh-my-ralpha can merge managed hooks');
  }
}

function stripManagedHookEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || !Array.isArray(entry.hooks)) return entry;
      const nextHooks = entry.hooks.filter((hook) => {
        return !(hook && typeof hook === 'object' && hook.type === 'command' && typeof hook.command === 'string' && hook.command.includes(MANAGED_HOOK_MARKER));
      });
      if (nextHooks.length === 0) return null;
      return { ...entry, hooks: nextHooks };
    })
    .filter(Boolean);
}

async function writeManagedHooks(codexHome, installedCliPath) {
  const path = codexHooksPath(codexHome);
  const existing = existsSync(path) ? await readFile(path, 'utf-8') : null;
  const parsed = existing ? parseHooksConfig(existing) : { hooks: {} };
  const managed = buildManagedHooks(installedCliPath);
  const next = { ...parsed, hooks: { ...parsed.hooks } };

  for (const [eventName, managedEntries] of Object.entries(managed)) {
    const preserved = stripManagedHookEntries(next.hooks[eventName]);
    next.hooks[eventName] = [...preserved, ...managedEntries];
  }

  await mkdir(codexHome, { recursive: true });
  await writeFile(path, JSON.stringify(next, null, 2) + '\n', 'utf-8');
  return path;
}

function restoreNotifyLine(content, notifyCommand) {
  if (!notifyCommand || notifyCommand.length === 0) return content;
  const lines = content ? content.split(/\r?\n/) : [];
  const firstTableIndex = lines.findIndex((line) => /^\s*\[.+\]\s*$/.test(line));
  const boundary = firstTableIndex >= 0 ? firstTableIndex : lines.length;
  const notifyLine = `notify = ${JSON.stringify(notifyCommand)}`;
  lines.splice(boundary, 0, notifyLine);
  return lines.join('\n');
}

async function removeManagedConfig(codexHome, installedSkillDir, { keepCodexHooks = false } = {}) {
  const path = codexConfigPath(codexHome);
  if (!existsSync(path)) return null;
  const existing = await readFile(path, 'utf-8');
  const notifyChain = await readNotifyChain(installedSkillDir);
  const withoutNotify = removeManagedNotifyLine(existing);
  const withoutMcp = stripManagedMcpBlock(withoutNotify);
  const maybeRestoredNotify = restoreNotifyLine(withoutMcp, notifyChain);
  const stripped = (keepCodexHooks ? maybeRestoredNotify : removeCodexHooksFlag(maybeRestoredNotify)).trim();
  if (!stripped) {
    await rm(path, { force: true });
    return path;
  }
  await writeFile(path, `${stripped}\n`, 'utf-8');
  return path;
}

async function removeManagedHooks(codexHome) {
  const path = codexHooksPath(codexHome);
  if (!existsSync(path)) return { path: null, hooksRemain: false };
  const parsed = parseHooksConfig(await readFile(path, 'utf-8'));
  const next = { ...parsed, hooks: { ...parsed.hooks } };

  for (const key of Object.keys(next.hooks)) {
    const preserved = stripManagedHookEntries(next.hooks[key]);
    if (preserved.length > 0) {
      next.hooks[key] = preserved;
    } else {
      delete next.hooks[key];
    }
  }

  if (Object.keys(next.hooks).length === 0) {
    delete next.hooks;
  }

  if (Object.keys(next).length === 0) {
    await rm(path, { force: true });
    return { path, hooksRemain: false };
  }

  await writeFile(path, JSON.stringify(next, null, 2) + '\n', 'utf-8');
  return {
    path,
    hooksRemain: Boolean(next.hooks && Object.keys(next.hooks).length > 0),
  };
}

export async function setupCodexIntegration({
  cwd,
  runtimeRoot,
  codexHome,
  scope = 'user',
  force = false,
}) {
  const targetCodexHome = resolveScopedCodexHome({ cwd, codexHome, scope });
  const existingHooksPath = codexHooksPath(targetCodexHome);
  if (existsSync(existingHooksPath)) {
    parseHooksConfig(await readFile(existingHooksPath, 'utf-8'));
  }
  const installed = await installSkill({
    runtimeRoot,
    codexHome: targetCodexHome,
    force,
  });
  const configResult = await writeManagedConfig(targetCodexHome, installed.installedCliPath);
  await writeNotifyChain(installed.targetSkillDir, configResult.chainedNotify);
  const configPath = await writeManagedMcpConfig(targetCodexHome, installed.targetSkillDir);
  const hooksPath = await writeManagedHooks(targetCodexHome, installed.installedCliPath);
  return {
    scope,
    codexHome: targetCodexHome,
    ...installed,
    configPath,
    hooksPath,
  };
}

export async function uninstallCodexIntegration({
  cwd,
  codexHome,
  scope = 'user',
}) {
  const targetCodexHome = resolveScopedCodexHome({ cwd, codexHome, scope });
  const skillDir = join(targetCodexHome, 'skills', 'oh-my-ralpha');
  const launcherPath = join(targetCodexHome, 'bin', 'oh-my-ralpha');
  const hooksResult = await removeManagedHooks(targetCodexHome);
  const configPath = await removeManagedConfig(targetCodexHome, skillDir, {
    keepCodexHooks: hooksResult.hooksRemain,
  });
  await rm(skillDir, { recursive: true, force: true });
  await rm(launcherPath, { force: true });
  return {
    scope,
    codexHome: targetCodexHome,
    removedSkillDir: skillDir,
    removedLauncherPath: launcherPath,
    configPath,
    hooksPath: hooksResult.path,
  };
}
