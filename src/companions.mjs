import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { installedAgentsDir, installedPromptsDir, installedSkillDir, resolveCodexHome } from './paths.mjs';

export const COMPANION_AGENT_PROMPTS = Object.freeze([
  {
    id: 'architect',
    type: 'agent-prompt',
    installName: 'architect',
    fallback: 'manual architecture verification note in rounds/trace',
    description: 'System design, boundaries, interfaces, long-horizon tradeoffs',
    reasoningEffort: 'high',
  },
  {
    id: 'code-reviewer',
    type: 'agent-prompt',
    installName: 'code-reviewer',
    fallback: 'manual final code review note in rounds/trace',
    description: 'Comprehensive review across all concerns',
    reasoningEffort: 'medium',
  },
  {
    id: 'code-simplifier',
    type: 'agent-prompt',
    installName: 'code-simplifier',
    fallback: 'manual simplification checklist in rounds/trace',
    description: 'Reviews recently modified code for simplification opportunities without editing by default',
    reasoningEffort: 'medium',
  },
  {
    id: 'workflow-auditor',
    type: 'agent-prompt',
    installName: 'workflow-auditor',
    fallback: 'manual workflow artifact/state audit note in rounds/trace',
    description: 'Audits ralpha workboard, rounds, acceptance evidence, state, and closeout consistency',
    reasoningEffort: 'high',
  },
]);

export const OBSOLETE_COMPANION_AGENT_PROMPTS = Object.freeze([
  'analyst',
  'team-executor',
]);

export const COMPANION_SKILLS = Object.freeze([
  {
    id: 'ai-slop-cleaner',
    type: 'skill',
    installName: 'ai-slop-cleaner',
    fallback: 'manual simplification checklist in rounds/trace',
  },
  {
    id: 'tmux-cli-agent-harness',
    type: 'skill',
    installName: 'tmux-cli-agent-harness',
    fallback: 'native subagent acceptance plus manual tmux capture/recovery notes in rounds/trace',
  },
]);

export const OBSOLETE_COMPANION_SKILLS = Object.freeze([
  'deep-interview',
  'visual-verdict',
  'web-clone',
]);

export const COMPANION_CAPABILITIES = Object.freeze([
  ...COMPANION_AGENT_PROMPTS,
  ...COMPANION_SKILLS,
]);

export function resolveCompanionStatuses(codexHome) {
  return COMPANION_CAPABILITIES.map((capability) => {
    const skillPath = capability.type === 'skill'
      ? join(installedSkillDir(codexHome, capability.installName), 'SKILL.md')
      : null;
    const userSkillPath = capability.type === 'skill'
      ? join(installedSkillDir(resolveCodexHome(), capability.installName), 'SKILL.md')
      : null;
    const promptPath = capability.type === 'agent-prompt'
      ? join(installedPromptsDir(codexHome), `${capability.installName}.md`)
      : null;
    const agentPath = capability.type === 'agent-prompt'
      ? join(installedAgentsDir(codexHome), `${capability.installName}.toml`)
      : null;
    const targetSkillInstalled = capability.type === 'skill' && existsSync(skillPath);
    const userSkillInstalled = capability.type === 'skill' && existsSync(userSkillPath);
    const installed = capability.type === 'skill'
      ? targetSkillInstalled || userSkillInstalled
      : existsSync(promptPath) && existsSync(agentPath);
    return {
      ...capability,
      installed,
      skillPath: targetSkillInstalled ? skillPath : userSkillPath,
      targetSkillPath: skillPath,
      userSkillPath,
      promptPath,
      agentPath,
      source: installed
        ? (capability.type === 'skill'
          ? (targetSkillInstalled ? 'bundled-skill' : 'user-skill')
          : 'bundled-agent-prompt')
        : 'fallback',
    };
  });
}
