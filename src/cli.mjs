import { readFile } from 'node:fs/promises';
import { runtimeRootFromModule } from './paths.mjs';
import { installSkill } from './install.mjs';
import { doctorReport, formatDoctorReport } from './doctor.mjs';
import { initWorkspace } from './init.mjs';
import { runNativeHookCli } from './native-hook.mjs';
import { scaffoldInterview, scaffoldPlan } from './planning.mjs';
import { appendTraceEvent, readTraceEvents } from './trace.mjs';
import { clearModeState, readModeState, writeModeState, validateStateMutation } from './state.mjs';
import { routePrompt } from './router.mjs';
import { setupCodexIntegration, uninstallCodexIntegration } from './setup.mjs';
import { verifyInstallation } from './verify.mjs';
import { submitAcceptance, waitForAcceptance } from './acceptance.mjs';

function parseArgs(argv) {
  const args = [...argv];
  const options = {};
  const positionals = [];

  while (args.length > 0) {
    const part = args.shift();
    if (!part) continue;
    if (!part.startsWith('--')) {
      positionals.push(part);
      continue;
    }
    const key = part.slice(2);
    const next = args[0];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = args.shift();
  }

  return { positionals, options };
}

function asJson(value) {
  return JSON.stringify(value, null, 2);
}

function requiredOption(options, name) {
  const value = options[name];
  if (!value || typeof value !== 'string') {
    throw new Error(`--${name} is required`);
  }
  return value;
}

const ACCEPTANCE_ROLES = new Set([
  'architect',
  'code-reviewer',
  'code-simplifier',
  'workflow-auditor',
  'leader',
  'manual',
]);

const CLI_VERDICTS = new Set(['PASS', 'CHANGES', 'REJECT', 'COMMENT']);

function optionString(options, ...names) {
  for (const name of names) {
    if (typeof options[name] === 'string' && options[name].trim()) return options[name].trim();
  }
  return undefined;
}

function normalizeCliVerdict(value) {
  const token = String(value || '').trim();
  return CLI_VERDICTS.has(token) ? token : '';
}

function readJsonOption(options, name) {
  return options[name] ? JSON.parse(String(options[name])) : undefined;
}

function optionInteger(options, name) {
  if (options[name] === undefined) return undefined;
  const parsed = Number.parseInt(String(options[name]), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseVerdictCommand(positionals, options) {
  const sliceId = optionString(options, 'slice') ?? positionals[1];
  const role = optionString(options, 'role') ?? positionals[2];
  const verdict = normalizeCliVerdict(optionString(options, 'verdict') ?? positionals[3]);
  if (!sliceId || !role || !verdict) {
    throw new Error('usage: ralpha verdict <slice> <role> <PASS|CHANGES|REJECT|COMMENT> "summary"');
  }
  if (!ACCEPTANCE_ROLES.has(String(role).toLowerCase())) {
    throw new Error('role must be one of: architect, code-reviewer, code-simplifier, workflow-auditor, leader, manual');
  }

  const summary = optionString(options, 'summary') ?? positionals.slice(4).join(' ').trim();

  return {
    sliceId,
    role,
    verdict,
    summary,
    findings: readJsonOption(options, 'findings'),
    evidence: readJsonOption(options, 'evidence'),
    suggestedLedgerText: optionString(options, 'suggested-ledger-text'),
    reviewRound: optionString(options, 'review-round', 'reviewRound'),
    reviewLens: optionString(options, 'review-lens', 'reviewLens'),
    reviewCycleId: optionString(options, 'review-cycle-id', 'reviewCycleId'),
  };
}

export async function runCli(argv) {
  const { positionals, options } = parseArgs(argv);
  const [command, subcommand] = positionals;
  const cwd = options.cwd ? String(options.cwd) : process.cwd();
  const runtimeRoot = runtimeRootFromModule(import.meta.url);

  switch (command) {
    case 'install': {
      const result = await installSkill({
        runtimeRoot,
        codexHome: options['codex-home'],
        force: Boolean(options.force),
      });
      console.log(asJson(result));
      return;
    }
    case 'setup': {
      const result = await setupCodexIntegration({
        cwd,
        runtimeRoot,
        codexHome: options['codex-home'],
        scope: options.scope ? String(options.scope) : 'user',
        force: Boolean(options.force),
      });
      console.log(asJson(result));
      return;
    }
    case 'uninstall': {
      const result = await uninstallCodexIntegration({
        cwd,
        runtimeRoot,
        codexHome: options['codex-home'],
        scope: options.scope ? String(options.scope) : 'user',
      });
      console.log(asJson(result));
      return;
    }
    case 'doctor': {
      const report = doctorReport({
        runtimeRoot,
        codexHome: options['codex-home'],
        cwd,
        scope: options.scope ? String(options.scope) : 'user',
      });
      if (options.json) {
        console.log(asJson(report));
      } else {
        console.log(formatDoctorReport(report));
      }
      return;
    }
    case 'verify': {
      const result = await verifyInstallation({
        runtimeRoot,
        cwd,
        codexHome: options['codex-home'],
        scope: options.scope ? String(options.scope) : 'user',
      });
      console.log(asJson(result));
      return;
    }
    case 'workflow': {
      if (subcommand === 'route') {
        const text = requiredOption(options, 'text');
        const result = await routePrompt({
          cwd,
          text,
          sessionId: options.session ? String(options.session) : undefined,
          threadId: options.thread ? String(options.thread) : undefined,
          turnId: options.turn ? String(options.turn) : undefined,
          activate: Boolean(options.activate),
        });
        console.log(asJson(result));
        return;
      }
      if (subcommand === 'init') {
        const task = requiredOption(options, 'task');
        const result = await initWorkspace({
          cwd,
          task,
          slug: options.slug ? String(options.slug) : undefined,
          overwrite: Boolean(options.overwrite),
        });
        console.log(asJson(result));
        return;
      }
      if (subcommand === 'plan') {
        const task = requiredOption(options, 'task');
        const result = await scaffoldPlan({
          cwd,
          task,
          slug: options.slug ? String(options.slug) : undefined,
          overwrite: Boolean(options.overwrite),
        });
        console.log(asJson(result));
        return;
      }
      if (subcommand === 'interview') {
        const task = requiredOption(options, 'task');
        const result = await scaffoldInterview({
          cwd,
          task,
          slug: options.slug ? String(options.slug) : undefined,
          overwrite: Boolean(options.overwrite),
        });
        console.log(asJson(result));
        return;
      }
      throw new Error('usage: ralpha workflow <route|init|plan|interview>');
    }
    case 'init': {
      const task = requiredOption(options, 'task');
      const result = await initWorkspace({
        cwd,
        task,
        slug: options.slug ? String(options.slug) : undefined,
        overwrite: Boolean(options.overwrite),
      });
      console.log(asJson(result));
      return;
    }
    case 'plan': {
      if (subcommand !== 'scaffold') throw new Error('usage: ralpha plan scaffold --task "<task>"');
      const task = requiredOption(options, 'task');
      const result = await scaffoldPlan({
        cwd,
        task,
        slug: options.slug ? String(options.slug) : undefined,
        overwrite: Boolean(options.overwrite),
      });
      console.log(asJson(result));
      return;
    }
    case 'interview': {
      if (subcommand !== 'scaffold') throw new Error('usage: ralpha interview scaffold --task "<task>"');
      const task = requiredOption(options, 'task');
      const result = await scaffoldInterview({
        cwd,
        task,
        slug: options.slug ? String(options.slug) : undefined,
        overwrite: Boolean(options.overwrite),
      });
      console.log(asJson(result));
      return;
    }
    case 'state': {
      const mode = requiredOption(options, 'mode');
      const sessionId = options.session ? String(options.session) : undefined;
      if (subcommand === 'read') {
        console.log(asJson(await readModeState({ cwd, mode, sessionId })));
        return;
      }
      if (subcommand === 'write') {
        const jsonText = requiredOption(options, 'json');
        const patch = JSON.parse(jsonText);
        const actorRole = options.actor ? String(options.actor) : options.actorRole ? String(options.actorRole) : undefined;
        const mutationReason = options.reason ? String(options.reason) : options.mutationReason ? String(options.mutationReason) : undefined;
        const guard = validateStateMutation({
          command: 'write',
          patch,
          actorRole,
          mutationReason,
          requireActor: true,
        });
        if (!guard.ok) throw new Error(guard.error);
        console.log(asJson(await writeModeState({ cwd, mode, sessionId, patch })));
        return;
      }
      if (subcommand === 'clear') {
        const actorRole = options.actor ? String(options.actor) : options.actorRole ? String(options.actorRole) : undefined;
        const mutationReason = options.reason ? String(options.reason) : options.mutationReason ? String(options.mutationReason) : undefined;
        const guard = validateStateMutation({
          command: 'clear',
          actorRole,
          mutationReason,
          requireActor: true,
        });
        if (!guard.ok) throw new Error(guard.error);
        console.log(asJson({ cleared: await clearModeState({ cwd, mode, sessionId }) }));
        return;
      }
      throw new Error('usage: ralpha state <read|write|clear> --mode <name>');
    }
    case 'trace': {
      if (subcommand === 'append') {
        const type = requiredOption(options, 'type');
        const metadata = options.json ? JSON.parse(String(options.json)) : {};
        console.log(asJson(await appendTraceEvent({ cwd, type, metadata })));
        return;
      }
      if (subcommand === 'show') {
        const limit = options.limit ? Number.parseInt(String(options.limit), 10) : undefined;
        console.log(asJson(await readTraceEvents({ cwd, limit })));
        return;
      }
      throw new Error('usage: ralpha trace <append|show>');
    }
    case 'acceptance': {
      if (subcommand !== 'wait') throw new Error('usage: ralpha acceptance wait --slice <id> [--role <role>|--roles <roles>]');
      const sliceId = optionString(options, 'slice', 'slice-id', 'sliceId');
      if (!sliceId) throw new Error('--slice is required');
      const result = await waitForAcceptance({
        cwd,
        sliceId,
        role: optionString(options, 'role'),
        roles: optionString(options, 'roles'),
        tmuxTarget: optionString(options, 'tmux', 'tmux-target', 'tmuxTarget'),
        logPath: optionString(options, 'log', 'log-path', 'logPath'),
        idleMs: optionInteger(options, 'idle-ms'),
        maxMs: optionInteger(options, 'max-ms'),
        pollMs: optionInteger(options, 'poll-ms'),
      });
      console.log(asJson(result));
      return;
    }
    case 'verdict': {
      const acceptance = parseVerdictCommand(positionals, options);
      const result = await submitAcceptance({ cwd, ...acceptance });
      console.log(asJson(result));
      return;
    }
    case 'route': {
      const text = requiredOption(options, 'text');
      const result = await routePrompt({
        cwd,
        text,
        sessionId: options.session ? String(options.session) : undefined,
        threadId: options.thread ? String(options.thread) : undefined,
        turnId: options.turn ? String(options.turn) : undefined,
        activate: Boolean(options.activate),
      });
      console.log(asJson(result));
      return;
    }
    case 'cat': {
      const path = requiredOption(options, 'path');
      console.log(await readFile(path, 'utf-8'));
      return;
    }
    case 'hook': {
      if (subcommand !== 'native') {
        throw new Error('usage: oh-my-ralpha hook native');
      }
      await runNativeHookCli();
      return;
    }
    default:
      throw new Error(
        'usage: oh-my-ralpha <install|setup|uninstall|doctor|verify|workflow|init|plan scaffold|interview scaffold|state|trace|acceptance wait|route|hook native>',
      );
  }
}
