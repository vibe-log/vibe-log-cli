#!/usr/bin/env node
import * as acp from '@agentclientprotocol/sdk';
import { randomUUID } from 'node:crypto';
import { Readable, Writable } from 'node:stream';

class FsAgent {
  async initialize() {
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: false,
      },
    };
  }

  async newSession() {
    return { sessionId: randomUUID() };
  }

  async authenticate() {
    return {};
  }

  async setSessionMode() {
    return {};
  }

  async prompt(params) {
    const text = params.prompt
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n');

    const match = text.match(/^WRITE\s+(\S+)\n([\s\S]*)$/);
    if (!match) {
      throw new Error('Expected prompt format: WRITE <absolute-path>\\n<content>');
    }

    const [, filePath, content] = match;
    await this.connection.writeTextFile({
      sessionId: params.sessionId,
      path: filePath,
      content,
    });

    await this.connection.sessionUpdate({
      sessionId: params.sessionId,
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text: `Wrote ${filePath}`,
        },
      },
    });

    return { stopReason: 'end_turn' };
  }

  async cancel() {
    return {};
  }

  constructor(connection) {
    this.connection = connection;
  }
}

const output = Writable.toWeb(process.stdout);
const input = Readable.toWeb(process.stdin);
const stream = acp.ndJsonStream(output, input);
new acp.AgentSideConnection((connection) => new FsAgent(connection), stream);
