import { chmod, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_SKILL_NAME,
  installedBinDir,
  installedLauncherPath,
  installedSkillDir,
  resolvePackagedSkillLayout,
} from './paths.mjs';

const EXTRA_RUNTIME_ENTRIES = [
  'AGENTS.md',
  'README.md',
  'package.json',
  'bin',
  'src',
  'companions',
  '.codex/oh-my-ralpha',
  'test',
  'docs',
];

export async function installSkill({ runtimeRoot, codexHome, force = false }) {
  const { skillDir: sourceSkillDir, skillPath } = resolvePackagedSkillLayout(runtimeRoot);
  if (!existsSync(skillPath)) {
    throw new Error(`could not locate packaged skill bundle under ${runtimeRoot}`);
  }

  const targetSkillDir = installedSkillDir(codexHome, DEFAULT_SKILL_NAME);
  const launcherPath = installedLauncherPath(codexHome, DEFAULT_SKILL_NAME);
  const installedCliPath = join(targetSkillDir, 'bin', 'oh-my-ralpha.js');

  if (!force && existsSync(targetSkillDir)) {
    throw new Error(`skill already installed at ${targetSkillDir}; rerun with --force to replace`);
  }

  await rm(targetSkillDir, { recursive: true, force: true });
  await mkdir(targetSkillDir, { recursive: true });
  await cp(sourceSkillDir, targetSkillDir, { recursive: true, force });
  for (const entry of EXTRA_RUNTIME_ENTRIES) {
    const sourcePath = join(runtimeRoot, entry);
    if (!existsSync(sourcePath)) continue;
    await cp(sourcePath, join(targetSkillDir, entry), { recursive: true, force });
  }

  await mkdir(installedBinDir(codexHome), { recursive: true });
  const launcher = `#!/usr/bin/env bash\nnode "${installedCliPath}" "$@"\n`;
  await writeFile(launcherPath, launcher, 'utf-8');
  await chmod(launcherPath, 0o755);

  return {
    targetSkillDir,
    launcherPath,
    installedCliPath,
  };
}
