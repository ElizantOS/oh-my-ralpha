import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createMcpServer, createTool, resolveToolCwd } from './protocol.mjs';
import { doctorReport } from '../doctor.mjs';
import { initWorkspace } from '../init.mjs';
import { scaffoldInterview, scaffoldPlan } from '../planning.mjs';
import { routePrompt } from '../router.mjs';
import { getModeStatePath, readModeState, writeModeState, clearModeState } from '../state.mjs';
import { appendTraceEvent, getTracePath, readTraceEvents } from '../trace.mjs';
import { setupCodexIntegration, uninstallCodexIntegration, resolveScopedCodexHome } from '../setup.mjs';
import { verifyInstallation } from '../verify.mjs';
import { DEFAULT_SKILL_NAME, runtimeRootFromModule } from '../paths.mjs';
import { COMPANION_AGENT_PROMPTS, COMPANION_SKILLS } from '../companions.mjs';

const runtimeRoot = runtimeRootFromModule(import.meta.url, 2);

function commandError(command, error, expected) {
  return {
    ok: false,
    command,
    error,
    expected,
    next: {
      instruction: 'Retry with the required command-specific fields.',
    },
  };
}

function readCommand(args, allowed) {
  const command = typeof args.command === 'string' ? args.command.trim() : '';
  if (!allowed.includes(command)) {
    return {
      ok: false,
      response: commandError(command || '<missing>', `command must be one of: ${allowed.join(', ')}`, {
        command: allowed.join(' | '),
      }),
    };
  }
  return { ok: true, command };
}

function requiredText(args, field, command) {
  if (typeof args[field] === 'string' && args[field].trim()) {
    return { ok: true, value: args[field] };
  }
  return {
    ok: false,
    response: commandError(command, `${field} is required for command=${command}`, {
      command,
      [field]: '<non-empty string>',
    }),
  };
}

function ralphaStateTool() {
  return createTool(
    'ralpha_state',
    'Manage active oh-my-ralpha execution state. Use only for reading, writing, or clearing mode state during an active ralpha workflow; do not use for workflow setup, prompt routing, trace logs, or admin maintenance.',
    {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['read', 'write', 'clear'] },
        mode: { type: 'string' },
        patch: { type: 'object', description: 'Required for command=write.' },
        replace: { type: 'boolean', description: 'Only for command=write.' },
        sessionId: { type: 'string' },
        cwd: { type: 'string' },
        workingDirectory: { type: 'string' },
      },
      required: ['command', 'mode'],
    },
    async (args) => {
      const parsed = readCommand(args, ['read', 'write', 'clear']);
      if (!parsed.ok) return parsed.response;
      const { command } = parsed;
      const mode = requiredText(args, 'mode', command);
      if (!mode.ok) return mode.response;
      const cwd = resolveToolCwd(args);
      const statePath = getModeStatePath(cwd, mode.value, args.sessionId);

      if (command === 'read') {
        return {
          ok: true,
          command,
          statePath,
          state: await readModeState({ cwd, mode: mode.value, sessionId: args.sessionId }),
          next: {
            instruction: 'Resume from this state if it is active; use ralpha_state write for state transitions.',
          },
        };
      }

      if (command === 'write') {
        if (!args.patch || typeof args.patch !== 'object' || Array.isArray(args.patch)) {
          return commandError(command, 'patch is required for command=write', {
            command: 'write',
            mode: mode.value,
            patch: { active: true },
          });
        }
        return {
          ok: true,
          command,
          statePath,
          state: await writeModeState({
            cwd,
            mode: mode.value,
            sessionId: args.sessionId,
            patch: args.patch,
            replace: args.replace === true,
          }),
          next: {
            instruction: 'Record fresh verification or continue the active slice.',
          },
        };
      }

      return {
        ok: true,
        command,
        statePath,
        cleared: await clearModeState({ cwd, mode: mode.value, sessionId: args.sessionId }),
        next: {
          instruction: 'State cleanup is complete; do not continue ralpha unless a new workflow is activated.',
        },
      };
    },
  );
}

function ralphaTraceTool() {
  return createTool(
    'ralpha_trace',
    'Record or inspect oh-my-ralpha evidence and recovery trace events. Use only for execution evidence, resume context, and diagnostics; do not use for state transitions, workflow setup, or install/admin actions.',
    {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['append', 'show'] },
        type: { type: 'string', description: 'Required for command=append.' },
        metadata: { type: 'object', description: 'Only for command=append.' },
        limit: { type: 'integer', description: 'Only for command=show.' },
        cwd: { type: 'string' },
        workingDirectory: { type: 'string' },
      },
      required: ['command'],
    },
    async (args) => {
      const parsed = readCommand(args, ['append', 'show']);
      if (!parsed.ok) return parsed.response;
      const { command } = parsed;
      const cwd = resolveToolCwd(args);
      const tracePath = getTracePath(cwd);

      if (command === 'append') {
        const type = requiredText(args, 'type', command);
        if (!type.ok) return type.response;
        return {
          ok: true,
          command,
          tracePath,
          event: await appendTraceEvent({
            cwd,
            type: type.value,
            metadata: args.metadata ?? {},
          }),
          next: {
            instruction: 'Use this trace event as evidence in the workboard or rounds ledger.',
          },
        };
      }

      return {
        ok: true,
        command,
        tracePath,
        events: await readTraceEvents({
          cwd,
          limit: Number.isInteger(args.limit) ? args.limit : undefined,
        }),
        next: {
          instruction: 'Use the newest relevant event to reconstruct the last stop point.',
        },
      };
    },
  );
}

function ralphaWorkflowTool() {
  return createTool(
    'ralpha_workflow',
    'Run one ralpha workflow command. Use only for entering or shaping a ralpha task: route a prompt, initialize truth-source files, create PRD/test-spec scaffolds, or create interview scaffolds. Do not use for active state transitions, trace logging, setup, uninstall, verification, or doctor checks.',
    {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['route', 'init', 'plan', 'interview'] },
        text: { type: 'string', description: 'Required for command=route.' },
        task: { type: 'string', description: 'Required for command=init, command=plan, and command=interview.' },
        slug: { type: 'string' },
        activate: { type: 'boolean', description: 'Only for command=route.' },
        overwrite: { type: 'boolean', description: 'Only for command=init, command=plan, and command=interview.' },
        sessionId: { type: 'string' },
        threadId: { type: 'string' },
        turnId: { type: 'string' },
        cwd: { type: 'string' },
        workingDirectory: { type: 'string' },
      },
      required: ['command'],
    },
    async (args) => {
      const parsed = readCommand(args, ['route', 'init', 'plan', 'interview']);
      if (!parsed.ok) return parsed.response;
      const { command } = parsed;
      const cwd = resolveToolCwd(args);

      if (command === 'route') {
        const text = requiredText(args, 'text', command);
        if (!text.ok) return text.response;
        const result = await routePrompt({
          cwd,
          text: text.value,
          sessionId: args.sessionId,
          threadId: args.threadId,
          turnId: args.turnId,
          activate: args.activate === true,
        });
        return {
          ok: true,
          command,
          result,
          next: result.finalSkill === 'ralpha'
            ? { instruction: 'Read the workboard and rounds files, then resume the active slice instead of restarting discovery.' }
            : { instruction: 'Complete the oh-my-ralpha planning artifacts before direct execution.' },
        };
      }

      const task = requiredText(args, 'task', command);
      if (!task.ok) return task.response;

      if (command === 'init') {
        const result = await initWorkspace({
          cwd,
          task: task.value,
          slug: args.slug,
          overwrite: args.overwrite === true,
        });
        return {
          ok: true,
          command,
          result,
          createdPaths: [result.contextPath, result.todoPath, result.roundsPath].filter(Boolean),
          next: {
            recommendedTool: 'ralpha_workflow',
            command: 'plan',
            instruction: 'Create PRD/test-spec scaffolds before implementation when the task is larger than a tiny one-shot fix.',
          },
        };
      }

      if (command === 'plan') {
        const result = await scaffoldPlan({
          cwd,
          task: task.value,
          slug: args.slug,
          overwrite: args.overwrite === true,
        });
        return {
          ok: true,
          command,
          result,
          createdPaths: [result.prdPath, result.testSpecPath],
          next: {
            instruction: 'Review and refine PRD/test-spec, then implement the first bounded slice.',
          },
        };
      }

      const result = await scaffoldInterview({
        cwd,
        task: task.value,
        slug: args.slug,
        overwrite: args.overwrite === true,
      });
      return {
        ok: true,
        command,
        result,
        createdPaths: [result.specPath],
        next: {
          instruction: 'Use the interview scaffold to resolve ambiguity before implementation.',
        },
      };
    },
  );
}

function adminDryRunPaths({ cwd, codexHome, scope }) {
  const resolvedCodexHome = resolveScopedCodexHome({ cwd, codexHome, scope });
  return [
    join(resolvedCodexHome, 'config.toml'),
    join(resolvedCodexHome, 'hooks.json'),
    join(resolvedCodexHome, 'skills', DEFAULT_SKILL_NAME),
    join(resolvedCodexHome, 'bin', DEFAULT_SKILL_NAME),
    ...COMPANION_AGENT_PROMPTS.flatMap((capability) => [
      join(resolvedCodexHome, 'prompts', `${capability.installName}.md`),
      join(resolvedCodexHome, 'agents', `${capability.installName}.toml`),
    ]),
    ...COMPANION_SKILLS.map((capability) => join(resolvedCodexHome, 'skills', capability.installName)),
  ];
}

function removedCompanionPaths(companions) {
  if (!companions) return [];
  return [
    ...companions.prompts.flatMap((entry) => [
      entry.removedPrompt ? entry.promptPath : null,
      entry.removedAgent ? entry.agentPath : null,
    ]),
    ...companions.skills.map((entry) => entry.removed ? entry.skillDir : null),
  ].filter(Boolean);
}

function ralphaAdminTool() {
  return createTool(
    'ralpha_admin',
    'Run low-frequency oh-my-ralpha maintenance commands. Use only for doctor, verify, setup, or uninstall. setup and uninstall default to dryRun=true and require explicit dryRun=false before changing Codex config or installed files.',
    {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['doctor', 'verify', 'setup', 'uninstall'] },
        scope: { type: 'string', enum: ['user', 'project'] },
        dryRun: { type: 'boolean', description: 'Required false to execute setup/uninstall; defaults true for setup/uninstall.' },
        force: { type: 'boolean', description: 'Only for command=setup.' },
        codexHome: { type: 'string' },
        cwd: { type: 'string' },
        workingDirectory: { type: 'string' },
      },
      required: ['command'],
    },
    async (args) => {
      const parsed = readCommand(args, ['doctor', 'verify', 'setup', 'uninstall']);
      if (!parsed.ok) return parsed.response;
      const { command } = parsed;
      const cwd = resolveToolCwd(args);
      const scope = args.scope ?? 'user';

      if (command === 'doctor') {
        return {
          ok: true,
          command,
          report: doctorReport({ runtimeRoot, cwd, codexHome: args.codexHome, scope }),
          next: {
            instruction: 'Follow suggested next steps only if they match the current task.',
          },
        };
      }

      if (command === 'verify') {
        return {
          ok: true,
          command,
          result: await verifyInstallation({ runtimeRoot, cwd, codexHome: args.codexHome, scope }),
          next: {
            instruction: 'If verification fails, inspect failed check details before changing setup.',
          },
        };
      }

      const dryRun = args.dryRun !== false;
      if (dryRun) {
        return {
          ok: true,
          command,
          dryRun: true,
          wouldChange: adminDryRunPaths({ cwd, codexHome: args.codexHome, scope }),
          next: {
            recommendedTool: 'ralpha_admin',
            command,
            arguments: { ...args, dryRun: false },
            instruction: `Call ${command} again with dryRun=false only when config-changing maintenance is explicitly desired.`,
          },
        };
      }

      if (command === 'setup') {
        const result = await setupCodexIntegration({
          cwd,
          runtimeRoot,
          codexHome: args.codexHome,
          scope,
          force: args.force === true,
        });
        return {
          ok: true,
          command,
          dryRun: false,
          result,
          changedPaths: [result.configPath, result.hooksPath, result.targetSkillDir, result.launcherPath].filter(Boolean),
          next: {
            recommendedTool: 'ralpha_admin',
            command: 'verify',
            instruction: 'Run verify after setup to confirm the MCP and hook surfaces are usable.',
          },
        };
      }

      const result = await uninstallCodexIntegration({
        cwd,
        runtimeRoot,
        codexHome: args.codexHome,
        scope,
      });
      return {
        ok: true,
        command,
        dryRun: false,
        result,
        changedPaths: [
          result.configPath,
          result.hooksPath,
          result.removedSkillDir,
          result.removedLauncherPath,
          ...removedCompanionPaths(result.companions),
        ].filter(Boolean),
        next: {
          instruction: 'Uninstall finished; do not use ralpha MCP tools until setup is run again.',
        },
      };
    },
  );
}

const server = createMcpServer({
  name: 'ralpha',
  version: '0.1.0',
  tools: [
    ralphaStateTool(),
    ralphaTraceTool(),
    ralphaWorkflowTool(),
    ralphaAdminTool(),
  ],
});

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return fileURLToPath(import.meta.url) === process.argv[1];
  }
}

if (isMainModule()) {
  await server.start().catch((error) => {
    process.stderr.write(`[ralpha-server] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export { server as ralphaMcpServer };
