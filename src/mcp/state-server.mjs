import { createMcpServer, createTool, resolveToolCwd } from './protocol.mjs';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { readModeState, writeModeState, clearModeState } from '../state.mjs';

const server = createMcpServer({
  name: 'oh-my-ralpha-state',
  version: '0.1.0',
  tools: [
    createTool(
      'state_read',
      'Read oh-my-ralpha mode state',
      {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          workingDirectory: { type: 'string' },
          mode: { type: 'string' },
          sessionId: { type: 'string' },
        },
        required: ['mode'],
      },
      async (args) => {
        return await readModeState({
          cwd: resolveToolCwd(args),
          mode: args.mode,
          sessionId: args.sessionId,
        });
      },
    ),
    createTool(
      'state_write',
      'Write or merge oh-my-ralpha mode state',
      {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          workingDirectory: { type: 'string' },
          mode: { type: 'string' },
          sessionId: { type: 'string' },
          patch: { type: 'object' },
          replace: { type: 'boolean' },
        },
        required: ['mode', 'patch'],
      },
      async (args) => {
        return await writeModeState({
          cwd: resolveToolCwd(args),
          mode: args.mode,
          sessionId: args.sessionId,
          patch: args.patch,
          replace: args.replace === true,
        });
      },
    ),
    createTool(
      'state_clear',
      'Clear oh-my-ralpha mode state',
      {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          workingDirectory: { type: 'string' },
          mode: { type: 'string' },
          sessionId: { type: 'string' },
        },
        required: ['mode'],
      },
      async (args) => {
        return {
          cleared: await clearModeState({
            cwd: resolveToolCwd(args),
            mode: args.mode,
            sessionId: args.sessionId,
          }),
        };
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
    process.stderr.write(`[oh-my-ralpha-state-server] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export { server as stateMcpServer };
