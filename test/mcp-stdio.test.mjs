import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

function encodeMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf-8');
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf-8'),
    body,
  ]);
}

function decodeMessages(buffer) {
  const messages = [];
  let rest = buffer;

  while (rest.length > 0) {
    const separatorIndex = rest.indexOf('\r\n\r\n');
    if (separatorIndex === -1) break;
    const headerText = rest.slice(0, separatorIndex).toString('utf-8');
    const lengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
    if (!lengthMatch) break;

    const bodyLength = Number.parseInt(lengthMatch[1], 10);
    const bodyStart = separatorIndex + 4;
    if (rest.length < bodyStart + bodyLength) break;

    messages.push(JSON.parse(rest.slice(bodyStart, bodyStart + bodyLength).toString('utf-8')));
    rest = rest.slice(bodyStart + bodyLength);
  }

  return { messages, rest };
}

async function requestMessages(scriptPath, requests, expectedCount) {
  const child = spawn(process.execPath, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutBuffer = Buffer.alloc(0);
  let stderr = '';
  const responses = [];

  child.stdout.on('data', (chunk) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    const decoded = decodeMessages(stdoutBuffer);
    stdoutBuffer = decoded.rest;
    responses.push(...decoded.messages);
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf-8');
  });

  for (const request of requests) {
    child.stdin.write(encodeMessage(request));
  }
  child.stdin.end();

  await new Promise((resolve, reject) => {
    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`server exited with code ${code}: ${stderr}`));
        return;
      }
      resolve();
    });
  });

  assert.equal(responses.length, expectedCount, stderr);
  return responses;
}

describe('oh-my-ralpha MCP stdio servers', () => {
  it('runtime server speaks initialize and tools/list over stdio', async () => {
    const scriptPath = join(process.cwd(), 'src', 'mcp', 'runtime-server.mjs');
    const responses = await requestMessages(
      scriptPath,
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
        { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      ],
      2,
    );

    assert.equal(responses[0].result.serverInfo.name, 'oh-my-ralpha-runtime');
    const toolNames = responses[1].result.tools.map((tool) => tool.name);
    assert.ok(toolNames.includes('doctor_report'));
    assert.ok(toolNames.includes('route_prompt'));
  });
});
