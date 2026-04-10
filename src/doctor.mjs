import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  installedLauncherPath,
  installedSkillDir,
  resolvePackagedSkillLayout,
} from './paths.mjs';
import { resolveCompanionStatuses } from './companions.mjs';
import { resolveScopedCodexHome } from './setup.mjs';

export function doctorReport({ runtimeRoot, codexHome, cwd = process.cwd(), scope = 'user' } = {}) {
  const resolvedCodexHome = resolveScopedCodexHome({ cwd, codexHome, scope });
  const { skillPath, flowPath } = resolvePackagedSkillLayout(runtimeRoot);
  const cliPath = join(runtimeRoot, 'bin', 'oh-my-ralpha.js');
  const installedSkillPath = join(installedSkillDir(resolvedCodexHome), 'SKILL.md');
  const launcherPath = installedLauncherPath(resolvedCodexHome);
  const codexBinPath = join(resolvedCodexHome, 'bin');
  const companions = resolveCompanionStatuses(resolvedCodexHome);
  const configPath = join(resolvedCodexHome, 'config.toml');
  const configContent = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : '';
  const checks = {
    packagedSkill: existsSync(skillPath),
    packagedFlow: existsSync(flowPath),
    cli: existsSync(cliPath),
    installedSkill: existsSync(installedSkillPath),
    launcher: existsSync(launcherPath),
    codexBinOnPath: (process.env.PATH || '').split(':').includes(codexBinPath),
    notifyConfigured: /^notify\s*=\s*\["node",\s*".*oh-my-ralpha\.js",\s*"notify"\]\s*$/m.test(configContent),
    mcpStateConfigured: /\[mcp_servers\.oh_my_ralpha_state\]/.test(configContent),
    mcpTraceConfigured: /\[mcp_servers\.oh_my_ralpha_trace\]/.test(configContent),
    mcpRuntimeConfigured: /\[mcp_servers\.oh_my_ralpha_runtime\]/.test(configContent),
  };
  const suggestions = [];

  if (!checks.installedSkill || !checks.launcher) {
    suggestions.push(`Run "oh-my-ralpha setup --scope ${scope}" or "node bin/oh-my-ralpha.js setup --scope ${scope}" to install the runtime surface.`);
  }
  if (!checks.codexBinOnPath) {
    suggestions.push(`Add ${codexBinPath} to PATH, or keep using "node ${join(runtimeRoot, 'bin', 'oh-my-ralpha.js')}" directly.`);
  }
  if (!checks.mcpStateConfigured || !checks.mcpTraceConfigured || !checks.mcpRuntimeConfigured) {
    suggestions.push(`Re-run "oh-my-ralpha setup --scope ${scope} --force" to restore MCP server configuration.`);
  }
  if (!checks.notifyConfigured) {
    suggestions.push(`Re-run "oh-my-ralpha setup --scope ${scope} --force" to restore notify-based session logging capture.`);
  }

  return {
    runtimeRoot,
    codexHome: resolvedCodexHome,
    scope,
    nodeVersion: process.version,
    checks,
    builtInRuntime: [
      'install',
      'doctor',
      'init',
      'plan scaffold',
      'interview scaffold',
      'state read/write/clear',
      'trace append/show',
      'route',
      'MCP state/trace/runtime servers',
    ],
    companions,
    suggestions,
  };
}

export function formatDoctorReport(report) {
  const lines = [
    `Runtime Root: ${report.runtimeRoot}`,
    `CODEX_HOME: ${report.codexHome}`,
    `Node: ${report.nodeVersion}`,
    '',
    'Checks:',
  ];

  for (const [name, ok] of Object.entries(report.checks)) {
    lines.push(`- ${name}: ${ok ? 'ok' : 'missing'}`);
  }

  lines.push('', 'Built-in Runtime:', ...report.builtInRuntime.map((entry) => `- ${entry}`));
  lines.push('', 'Companions:');
  for (const companion of report.companions) {
    lines.push(`- ${companion.id}: ${companion.installed ? 'installed' : `fallback (${companion.fallback})`}`);
  }
  if (Array.isArray(report.suggestions) && report.suggestions.length > 0) {
    lines.push('', 'Suggested Next Steps:');
    for (const suggestion of report.suggestions) {
      lines.push(`- ${suggestion}`);
    }
  }

  return lines.join('\n');
}
