function jsonRpcResult(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

function jsonRpcError(id, code, message) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  };
}

function textContent(data) {
  return {
    content: [
      {
        type: 'text',
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function encodeMessage(payload, framing = 'content-length') {
  if (framing === 'newline') {
    return Buffer.from(`${JSON.stringify(payload)}\n`, 'utf-8');
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf-8');
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf-8');
  return Buffer.concat([header, body]);
}

function decodeMessages(buffer) {
  const records = [];
  let rest = buffer;

  while (rest.length > 0) {
    const textPrefix = rest.slice(0, Math.min(rest.length, 64)).toString('utf-8');
    if (/^Content-Length:/i.test(textPrefix)) {
      const separatorIndex = rest.indexOf('\r\n\r\n');
      if (separatorIndex === -1) break;

      const headerText = rest.slice(0, separatorIndex).toString('utf-8');
      const lengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        throw new Error('missing Content-Length header');
      }

      const bodyLength = Number.parseInt(lengthMatch[1], 10);
      const bodyStart = separatorIndex + 4;
      if (rest.length < bodyStart + bodyLength) break;

      const bodyText = rest.slice(bodyStart, bodyStart + bodyLength).toString('utf-8');
      records.push({ message: JSON.parse(bodyText), framing: 'content-length' });
      rest = rest.slice(bodyStart + bodyLength);
      continue;
    }

    const newlineIndex = rest.indexOf('\n');
    if (newlineIndex === -1) break;

    const line = rest.slice(0, newlineIndex).toString('utf-8').replace(/\r$/, '');
    rest = rest.slice(newlineIndex + 1);
    if (!line.trim()) continue;
    records.push({ message: JSON.parse(line), framing: 'newline' });
  }

  return { records, rest };
}

function buildInitializeResult(serverInfo) {
  return {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {},
    },
    serverInfo,
  };
}

export function resolveToolCwd(args = {}) {
  return args.cwd || args.workingDirectory || process.cwd();
}

export function createTool(name, description, inputSchema, handler) {
  return { name, description, inputSchema, handler };
}

export function createMcpServer({ name, version, tools }) {
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

  async function handleRequest(request) {
    if (!request || typeof request !== 'object') return null;
    const { id, method, params } = request;

    if (method === 'initialize') {
      return jsonRpcResult(id, buildInitializeResult({ name, version }));
    }

    if (method === 'notifications/initialized') {
      return null;
    }

    if (method === 'ping') {
      return jsonRpcResult(id, {});
    }

    if (method === 'tools/list') {
      return jsonRpcResult(id, {
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      });
    }

    if (method === 'tools/call') {
      const tool = toolMap.get(params?.name);
      if (!tool) {
        return jsonRpcError(id, -32601, `unknown tool: ${params?.name || '<missing>'}`);
      }
      try {
        const result = await tool.handler(params?.arguments ?? {});
        return jsonRpcResult(id, textContent(result));
      } catch (error) {
        return jsonRpcResult(id, {
          ...textContent({
            error: error instanceof Error ? error.message : String(error),
          }),
          isError: true,
        });
      }
    }

    return jsonRpcError(id, -32601, `unsupported method: ${method || '<missing>'}`);
  }

  return {
    async start({ input = process.stdin, output = process.stdout } = {}) {
      let buffer = Buffer.alloc(0);
      for await (const chunk of input) {
        buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))]);
        const decoded = decodeMessages(buffer);
        buffer = decoded.rest;
        for (const { message, framing } of decoded.records) {
          const response = await handleRequest(message);
          if (response) {
            output.write(encodeMessage(response, framing));
          }
        }
      }
    },
    handleRequest,
  };
}
