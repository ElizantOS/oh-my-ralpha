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
    mcpConfigured: /\[mcp_servers\.ralpha\]/.test(configContent),
  };
  const suggestions = [];

  if (!checks.installedSkill || !checks.launcher) {
    suggestions.push(`Run "ralpha setup --scope ${scope}" or "node bin/oh-my-ralpha.js setup --scope ${scope}" to install the runtime surface.`);
  }
  if (!checks.codexBinOnPath) {
    suggestions.push(`Add ${codexBinPath} to PATH, or keep using "node ${join(runtimeRoot, 'bin', 'oh-my-ralpha.js')}" directly.`);
  }
  if (!checks.mcpConfigured) {
    suggestions.push(`Re-run "ralpha setup --scope ${scope} --force" to restore MCP server configuration.`);
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
      'PRD/test-spec scaffold',
      'interview scaffold',
      'state read/write/clear',
      'trace append/show',
      'route',
      'workflow route/init/plan/interview',
      'single MCP command-group server',
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
