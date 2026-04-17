import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const DEFAULT_SKILL_NAME = 'oh-my-ralpha';

export function resolveRepoRoot(cwd = process.cwd()) {
  return resolve(cwd);
}

export function runtimeRootFromModule(moduleUrl, levelsUp = 1) {
  const parts = new Array(levelsUp).fill('..');
  return resolve(dirname(fileURLToPath(moduleUrl)), ...parts);
}

export function resolveCodexHome(explicit) {
  if (explicit) return resolve(explicit);
  const envHome = process.env.CODEX_HOME;
  if (envHome) return resolve(envHome);
  return join(homedir(), '.codex');
}

export function workingModelDir(cwd) {
  return join(resolveRepoRoot(cwd), '.codex', DEFAULT_SKILL_NAME, 'working-model');
}

function workingModelSubdir(cwd, name) {
  return join(workingModelDir(cwd), name);
}

export function workingModelContextDir(cwd) {
  return workingModelSubdir(cwd, 'context');
}

export function workingModelStateDir(cwd) {
  return workingModelSubdir(cwd, 'state');
}

export function workingModelLogsDir(cwd) {
  return workingModelSubdir(cwd, 'logs');
}

export function workingModelPlansDir(cwd) {
  return workingModelSubdir(cwd, 'plans');
}

export function workingModelSpecsDir(cwd) {
  return workingModelSubdir(cwd, 'specs');
}

function codexHomeSubdir(codexHome, name) {
  return join(resolveCodexHome(codexHome), name);
}

export function installedSkillsDir(codexHome) {
  return codexHomeSubdir(codexHome, 'skills');
}

export function installedPromptsDir(codexHome) {
  return codexHomeSubdir(codexHome, 'prompts');
}

export function installedAgentsDir(codexHome) {
  return codexHomeSubdir(codexHome, 'agents');
}

export function installedSkillDir(codexHome, skillName = DEFAULT_SKILL_NAME) {
  return join(installedSkillsDir(codexHome), skillName);
}

export function installedBinDir(codexHome) {
  return codexHomeSubdir(codexHome, 'bin');
}

export function installedLauncherPath(codexHome, commandName = DEFAULT_SKILL_NAME) {
  return join(installedBinDir(codexHome), commandName);
}

export function resolvePackagedSkillLayout(runtimeRoot, skillName = DEFAULT_SKILL_NAME) {
  const nestedSkillDir = join(runtimeRoot, 'skills', skillName);
  const nestedSkillPath = join(nestedSkillDir, 'SKILL.md');
  if (existsSync(nestedSkillPath)) {
    return {
      skillDir: nestedSkillDir,
      skillPath: nestedSkillPath,
      flowPath: join(nestedSkillDir, 'FLOW.md'),
    };
  }

  return {
    skillDir: runtimeRoot,
    skillPath: join(runtimeRoot, 'SKILL.md'),
    flowPath: join(runtimeRoot, 'FLOW.md'),
  };
}
