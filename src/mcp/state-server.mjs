import { createMcpServer, createTool, resolveToolCwd } from './protocol.mjs';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { readModeState, writeModeState, clearModeState, validateStateMutation } from '../state.mjs';

const server = createMcpServer({
  name: 'ralpha-state',
  version: '0.1.0',
  tools: [
    createTool(
      'state_read',
      'Read ralpha mode state',
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
      'Write or merge ralpha mode state',
      {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          workingDirectory: { type: 'string' },
          mode: { type: 'string' },
          sessionId: { type: 'string' },
          patch: { type: 'object' },
          replace: { type: 'boolean' },
          actorRole: { type: 'string', description: 'Required for write. Use "leader" from the main workflow thread; acceptance subagents are read-only.' },
          mutationReason: { type: 'string', description: 'Required for write/clear. Use current_phase="awaiting_plan_review" only after decision-complete planning artifacts are ready for user review.' },
        },
        required: ['mode', 'patch'],
      },
      async (args) => {
        const guard = validateStateMutation({
          command: 'write',
          patch: args.patch,
          actorRole: args.actorRole,
          mutationReason: args.mutationReason,
          requireActor: true,
        });
        if (!guard.ok) {
          return {
            ok: false,
            error: guard.error,
            expected: {
              mode: args.mode,
              actorRole: 'leader',
              mutationReason: '<why the leader is changing state>',
            },
          };
        }
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
      'Clear ralpha mode state',
      {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          workingDirectory: { type: 'string' },
          mode: { type: 'string' },
          sessionId: { type: 'string' },
          actorRole: { type: 'string', description: 'Required for clear. Use "leader" from the main workflow thread; acceptance subagents are read-only.' },
          mutationReason: { type: 'string', description: 'Why the leader is clearing state.' },
        },
        required: ['mode'],
      },
      async (args) => {
        const guard = validateStateMutation({
          command: 'clear',
          actorRole: args.actorRole,
          mutationReason: args.mutationReason,
          requireActor: true,
        });
        if (!guard.ok) {
          return {
            ok: false,
            error: guard.error,
            expected: {
              mode: args.mode,
              actorRole: 'leader',
              mutationReason: '<why the leader is clearing state>',
            },
          };
        }
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
    process.stderr.write(`[ralpha-state-server] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export { server as stateMcpServer };
