import { createMcpServer, createTool, resolveToolCwd } from './protocol.mjs';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { appendTraceEvent, readTraceEvents } from '../trace.mjs';

const server = createMcpServer({
  name: 'ralpha-trace',
  version: '0.1.0',
  tools: [
    createTool(
      'trace_show',
      'Show ralpha trace events',
      {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          workingDirectory: { type: 'string' },
          limit: { type: 'integer' },
        },
      },
      async (args) => {
        return await readTraceEvents({
          cwd: resolveToolCwd(args),
          limit: args.limit,
        });
      },
    ),
    createTool(
      'trace_append',
      'Append a ralpha trace event',
      {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          workingDirectory: { type: 'string' },
          type: { type: 'string' },
          metadata: { type: 'object' },
        },
        required: ['type'],
      },
      async (args) => {
        return await appendTraceEvent({
          cwd: resolveToolCwd(args),
          type: args.type,
          metadata: args.metadata ?? {},
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
    process.stderr.write(`[ralpha-trace-server] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export { server as traceMcpServer };
