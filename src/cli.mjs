import { readFile } from 'node:fs/promises';
import { runtimeRootFromModule } from './paths.mjs';
import { installSkill } from './install.mjs';
import { doctorReport, formatDoctorReport } from './doctor.mjs';
import { initWorkspace } from './init.mjs';
import { runNativeHookCli } from './native-hook.mjs';
import { scaffoldInterview, scaffoldPlan } from './planning.mjs';
import { appendTraceEvent, readTraceEvents } from './trace.mjs';
import { clearModeState, readModeState, writeModeState } from './state.mjs';
import { routePrompt } from './router.mjs';
import { setupCodexIntegration, uninstallCodexIntegration } from './setup.mjs';
import { verifyInstallation } from './verify.mjs';

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
        console.log(asJson(await writeModeState({ cwd, mode, sessionId, patch })));
        return;
      }
      if (subcommand === 'clear') {
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
        'usage: oh-my-ralpha <install|setup|uninstall|doctor|verify|workflow|init|plan scaffold|interview scaffold|state|trace|route|hook native>',
      );
  }
}
