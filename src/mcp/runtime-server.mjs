import { createMcpServer, createTool, resolveToolCwd } from './protocol.mjs';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { doctorReport } from '../doctor.mjs';
import { initWorkspace } from '../init.mjs';
import { scaffoldInterview, scaffoldPlan } from '../planning.mjs';
import { routePrompt } from '../router.mjs';
import { setupCodexIntegration, uninstallCodexIntegration } from '../setup.mjs';
import { runtimeRootFromModule } from '../paths.mjs';

const runtimeRoot = runtimeRootFromModule(import.meta.url, 2);

const server = createMcpServer({
  name: 'ralpha-runtime',
  version: '0.1.0',
  tools: [
    createTool(
      'doctor_report',
      'Read ralpha doctor status',
      {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          workingDirectory: { type: 'string' },
          codexHome: { type: 'string' },
          scope: { type: 'string' },
        },
      },
      async (args) => {
        return doctorReport({
          runtimeRoot,
          cwd: resolveToolCwd(args),
          codexHome: args.codexHome,
          scope: args.scope ?? 'user',
        });
      },
    ),
    createTool(
      'route_prompt',
      'Route an oh-my-ralpha prompt through the planning gate',
      {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          workingDirectory: { type: 'string' },
          text: { type: 'string' },
          sessionId: { type: 'string' },
          threadId: { type: 'string' },
          turnId: { type: 'string' },
          activate: { type: 'boolean' },
        },
        required: ['text'],
      },
      async (args) => {
        return await routePrompt({
          cwd: resolveToolCwd(args),
          text: args.text,
          sessionId: args.sessionId,
          threadId: args.threadId,
          turnId: args.turnId,
          activate: args.activate === true,
        });
      },
    ),
    createTool(
      'init_workspace',
      'Initialize oh-my-ralpha truth-source files',
      {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          workingDirectory: { type: 'string' },
          task: { type: 'string' },
          slug: { type: 'string' },
          overwrite: { type: 'boolean' },
        },
        required: ['task'],
      },
      async (args) => {
        return await initWorkspace({
          cwd: resolveToolCwd(args),
          task: args.task,
          slug: args.slug,
          overwrite: args.overwrite === true,
        });
      },
    ),
    createTool(
      'plan_scaffold',
      'Create PRD and test-spec scaffolds',
      {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          workingDirectory: { type: 'string' },
          task: { type: 'string' },
          slug: { type: 'string' },
          overwrite: { type: 'boolean' },
        },
        required: ['task'],
      },
      async (args) => {
        return await scaffoldPlan({
          cwd: resolveToolCwd(args),
          task: args.task,
          slug: args.slug,
          overwrite: args.overwrite === true,
        });
      },
    ),
    createTool(
      'interview_scaffold',
      'Create an interview scaffold',
      {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          workingDirectory: { type: 'string' },
          task: { type: 'string' },
          slug: { type: 'string' },
          overwrite: { type: 'boolean' },
        },
        required: ['task'],
      },
      async (args) => {
        return await scaffoldInterview({
          cwd: resolveToolCwd(args),
          task: args.task,
          slug: args.slug,
          overwrite: args.overwrite === true,
        });
      },
    ),
    createTool(
      'setup_codex_integration',
      'Install skill/runtime plus config/hooks integration',
      {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          workingDirectory: { type: 'string' },
          codexHome: { type: 'string' },
          scope: { type: 'string' },
          force: { type: 'boolean' },
        },
      },
      async (args) => {
        return await setupCodexIntegration({
          cwd: resolveToolCwd(args),
          runtimeRoot,
          codexHome: args.codexHome,
          scope: args.scope ?? 'user',
          force: args.force === true,
        });
      },
    ),
    createTool(
      'uninstall_codex_integration',
      'Remove oh-my-ralpha config/hooks integration',
      {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          workingDirectory: { type: 'string' },
          codexHome: { type: 'string' },
          scope: { type: 'string' },
        },
      },
      async (args) => {
        return await uninstallCodexIntegration({
          cwd: resolveToolCwd(args),
          runtimeRoot,
          codexHome: args.codexHome,
          scope: args.scope ?? 'user',
        });
      },
    ),
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
    process.stderr.write(`[ralpha-runtime-server] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export { server as runtimeMcpServer };
