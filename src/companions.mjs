import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { installedSkillDir } from './paths.mjs';

export const COMPANION_CAPABILITIES = Object.freeze([
  {
    id: 'plan',
    type: 'skill',
    installName: 'plan',
    fallback: 'built-in plan scaffold',
  },
  {
    id: 'deep-interview',
    type: 'skill',
    installName: 'deep-interview',
    fallback: 'built-in interview scaffold',
  },
  {
    id: 'visual-verdict',
    type: 'skill',
    installName: 'visual-verdict',
    fallback: 'manual visual review note in rounds/trace',
  },
  {
    id: 'web-clone',
    type: 'skill',
    installName: 'web-clone',
    fallback: 'manual cloning workflow note in rounds/trace',
  },
  {
    id: 'ai-slop-cleaner',
    type: 'skill',
    installName: 'ai-slop-cleaner',
    fallback: 'manual simplification checklist in rounds/trace',
  },
]);

export function resolveCompanionStatuses(codexHome) {
  return COMPANION_CAPABILITIES.map((capability) => {
    const skillPath = join(installedSkillDir(codexHome, capability.installName), 'SKILL.md');
    const installed = existsSync(skillPath);
    return {
      ...capability,
      installed,
      source: installed ? 'external-skill' : 'fallback',
    };
  });
}
