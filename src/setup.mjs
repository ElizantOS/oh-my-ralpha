import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  COMPANION_AGENT_PROMPTS,
  COMPANION_SKILLS,
  OBSOLETE_COMPANION_AGENT_PROMPTS,
  OBSOLETE_COMPANION_SKILLS,
} from './companions.mjs';
import { installSkill } from './install.mjs';
import { installedAgentsDir, installedLauncherPath, installedPromptsDir, installedSkillDir, resolveCodexHome } from './paths.mjs';

const MANAGED_HOOK_MARKER = 'oh-my-ralpha.js" hook native';
const MANAGED_MCP_START = '# BEGIN RALPHA MCP BLOCK';
const MANAGED_MCP_END = '# END RALPHA MCP BLOCK';
const NOTIFY_CHAIN_FILE = 'notify-chain.json';
const BUNDLED_COMPANION_SKILL_FILE = 'SKILL.bundle.md';

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

function escapeTomlBasicString(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeTomlMultiline(value) {
  return value.replace(/"{3,}/g, (match) => match.split('').join('\\'));
}

function stripFrontmatter(content) {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? content.slice(match[0].length).trim() : content.trim();
}

function nativeAgentToml(capability, promptContent) {
  const instructions = stripFrontmatter(promptContent);
  const lines = [
    `# oh-my-ralpha imported OMX agent: ${capability.installName}`,
    `name = "${escapeTomlBasicString(capability.installName)}"`,
    `description = "${escapeTomlBasicString(capability.description)}"`,
    `model_reasoning_effort = "${capability.reasoningEffort}"`,
    'developer_instructions = """',
    escapeTomlMultiline(instructions),
    '"""',
    '',
  ];
  return lines.join('\n');
}

async function installBundledCompanions({ codexHome, runtimeRoot, scope = 'user', force = false }) {
  const summary = {
    sourceRoot: runtimeRoot,
    prompts: [],
    skills: [],
    removed: [],
  };

  const sourcePromptsDir = join(runtimeRoot, 'companions', 'prompts');
  const sourceSkillsDir = join(runtimeRoot, 'companions', 'skills');
  const userCodexHome = resolveCodexHome();
  const targetIsUserCodexHome = scope === 'user' || resolve(codexHome) === resolve(userCodexHome);

  await mkdir(installedPromptsDir(codexHome), { recursive: true });
  await mkdir(installedAgentsDir(codexHome), { recursive: true });

  if (force) {
    for (const name of OBSOLETE_COMPANION_AGENT_PROMPTS) {
      const promptPath = join(installedPromptsDir(codexHome), `${name}.md`);
      const agentPath = join(installedAgentsDir(codexHome), `${name}.toml`);
      const existed = existsSync(promptPath) || existsSync(agentPath);
      await rm(promptPath, { force: true });
      await rm(agentPath, { force: true });
      if (existed) summary.removed.push({ type: 'agent-prompt', id: name, promptPath, agentPath });
    }

    for (const name of OBSOLETE_COMPANION_SKILLS) {
      const skillDir = installedSkillDir(codexHome, name);
      const existed = existsSync(skillDir);
      await rm(skillDir, { recursive: true, force: true });
      if (existed) summary.removed.push({ type: 'skill', id: name, skillDir });
    }
  }

  for (const capability of COMPANION_AGENT_PROMPTS) {
    const sourcePromptPath = join(sourcePromptsDir, `${capability.installName}.md`);
    const promptPath = join(installedPromptsDir(codexHome), `${capability.installName}.md`);
    const agentPath = join(installedAgentsDir(codexHome), `${capability.installName}.toml`);
    if (!existsSync(sourcePromptPath)) {
      summary.prompts.push({ id: capability.id, installed: false, reason: 'missing-source-prompt' });
      continue;
    }
    if (force || !existsSync(promptPath)) {
      await copyFile(sourcePromptPath, promptPath);
    }
    if (force || !existsSync(agentPath)) {
      const promptContent = await readFile(sourcePromptPath, 'utf-8');
      await writeFile(agentPath, nativeAgentToml(capability, promptContent), 'utf-8');
    }
    summary.prompts.push({ id: capability.id, installed: true, promptPath, agentPath });
  }

  for (const capability of COMPANION_SKILLS) {
    const sourceSkillDir = join(sourceSkillsDir, capability.installName);
    const sourceSkillPath = join(sourceSkillDir, BUNDLED_COMPANION_SKILL_FILE);
    const targetSkillDir = installedSkillDir(codexHome, capability.installName);
    const targetSkillPath = join(targetSkillDir, 'SKILL.md');
    const userSkillDir = installedSkillDir(userCodexHome, capability.installName);
    const userSkillPath = join(userSkillDir, 'SKILL.md');
    if (!existsSync(sourceSkillPath)) {
      summary.skills.push({ id: capability.id, installed: false, reason: 'missing-source-skill' });
      continue;
    }

    if (!targetIsUserCodexHome && existsSync(userSkillPath)) {
      const existed = existsSync(targetSkillDir);
      if (force) {
        await rm(targetSkillDir, { recursive: true, force: true });
      }
      if (existed && force) {
        summary.removed.push({ type: 'skill', id: capability.id, skillDir: targetSkillDir });
      }
      summary.skills.push({
        id: capability.id,
        installed: true,
        skillPath: userSkillPath,
        source: 'user-skill',
        skippedProjectInstall: true,
      });
      continue;
    }

    if (force || !existsSync(targetSkillDir)) {
      await rm(targetSkillDir, { recursive: true, force: true });
      await mkdir(targetSkillDir, { recursive: true });
      await copyFile(sourceSkillPath, targetSkillPath);
    }
    summary.skills.push({ id: capability.id, installed: true, skillPath: targetSkillPath });
  }

  return summary;
}

function codexConfigPath(codexHome) {
  return join(codexHome, 'config.toml');
}

function codexHooksPath(codexHome) {
  return join(codexHome, 'hooks.json');
}

function isManagedNotifyLine(line) {
  return /^\s*notify\s*=\s*\["node",\s*".*oh-my-ralpha\.js",\s*"notify"\]\s*$/.test(line);
}

async function readNotifyChain(installedSkillDir) {
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
  const serverPath = join(installedSkillDir, 'src', 'mcp', 'server.mjs');

  return [
    MANAGED_MCP_START,
    '[mcp_servers.ralpha]',
    'command = "node"',
    `args = ["${serverPath}"]`,
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

async function writeManagedConfig(codexHome) {
  const path = codexConfigPath(codexHome);
  const existing = existsSync(path) ? await readFile(path, 'utf-8') : '';
  const next = ensureCodexHooksFlag(existing);
  await mkdir(codexHome, { recursive: true });
  await writeFile(path, next, 'utf-8');
  return path;
}

function stripManagedMcpBlock(content) {
  const pattern = new RegExp(`${escapeRegex(MANAGED_MCP_START)}[\\s\\S]*?${escapeRegex(MANAGED_MCP_END)}\\n?`, 'g');
  return content.replace(pattern, '').trimEnd();
}

function stripMcpServerTables(content, names) {
  const nameSet = new Set(names);
  const lines = content.split(/\r?\n/);
  const kept = [];
  let skipping = false;

  for (const line of lines) {
    const tableMatch = line.match(/^\s*\[mcp_servers\.([A-Za-z0-9_-]+)\]\s*$/);
    if (tableMatch) {
      skipping = nameSet.has(tableMatch[1]);
    } else if (/^\s*\[.+\]\s*$/.test(line)) {
      skipping = false;
    }

    if (!skipping) kept.push(line);
  }

  return kept.join('\n').trimEnd();
}

async function writeManagedMcpConfig(codexHome, installedSkillDir) {
  const path = codexConfigPath(codexHome);
  const existing = existsSync(path) ? await readFile(path, 'utf-8') : '';
  const stripped = stripMcpServerTables(stripManagedMcpBlock(existing), [
    'ralpha',
  ]);
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
      hooks: [{ type: 'command', command, statusMessage: 'Loading ralpha session context' }],
    }],
    UserPromptSubmit: [{
      hooks: [{ type: 'command', command, statusMessage: 'Applying ralpha prompt routing' }],
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
    throw new Error('invalid hooks.json: expected valid JSON before ralpha can merge managed hooks');
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
  const withoutMcp = stripMcpServerTables(stripManagedMcpBlock(withoutNotify), [
    'ralpha',
  ]);
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
  await writeManagedConfig(targetCodexHome);
  const configPath = await writeManagedMcpConfig(targetCodexHome, installed.targetSkillDir);
  const hooksPath = await writeManagedHooks(targetCodexHome, installed.installedCliPath);
  const companions = await installBundledCompanions({
    codexHome: targetCodexHome,
    runtimeRoot,
    scope,
    force,
  });
  return {
    scope,
    codexHome: targetCodexHome,
    ...installed,
    configPath,
    hooksPath,
    companions,
  };
}

export async function uninstallCodexIntegration({
  cwd,
  codexHome,
  scope = 'user',
}) {
  const targetCodexHome = resolveScopedCodexHome({ cwd, codexHome, scope });
  const skillDir = installedSkillDir(targetCodexHome);
  const launcherPath = installedLauncherPath(targetCodexHome);
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
