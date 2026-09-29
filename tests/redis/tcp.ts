import { createConnection } from "node:net";
import { RedisTestError, type RedisCommand } from "./support";
export function createLocalCommand(port: number): RedisCommand {
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
    throw new RedisTestError("configuration");
  function parse(
    buffer: Buffer,
    offset = 0,
  ): { value: unknown; next: number } | undefined {
    const end = buffer.indexOf("\r\n", offset);
    if (end < 0) return;
    const kind = String.fromCharCode(buffer[offset]),
      line = buffer.toString("utf8", offset + 1, end);
    let next = end + 2;
    if (kind === "+") return { value: line, next };
    if (kind === "-") throw new RedisTestError("response");
    if (kind === ":") return { value: Number(line), next };
    if (kind === "$") {
      const length = Number(line);
      if (length === -1) return { value: null, next };
      if (buffer.length < next + length + 2) return;
      return {
        value: buffer.toString("utf8", next, next + length),
        next: next + length + 2,
      };
    }
    if (kind === "*") {
      const length = Number(line);
      if (length === -1) return { value: null, next };
      const value: unknown[] = [];
      for (let i = 0; i < length; i++) {
        const child = parse(buffer, next);
        if (!child) return;
        value.push(child.value);
        next = child.next;
      }
      return { value, next };
    }
    throw new Error("Unexpected local Redis protocol");
  }

  return function command(parts: string[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      // Literal loopback only: no host/URL option and no production credentials.
      const socket = createConnection({ host: "127.0.0.1", port });
      let received = Buffer.alloc(0),
        settled = false;
      const finish = (error?: Error, value?: unknown) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error)
          reject(
            error instanceof RedisTestError
              ? error
              : new RedisTestError("connection"),
          );
        else resolve(value);
      };
      socket.setTimeout(3000, () => finish(new Error("Local Redis timeout")));
      socket.on("error", (error) => finish(error));
      socket.on("close", () => {
        if (!settled) finish(new Error("Local Redis connection closed"));
      });
      socket.on("connect", () =>
        socket.write(
          `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`,
        ),
      );
      socket.on("data", (chunk) => {
        received = Buffer.concat([received, chunk]);
        try {
          const result = parse(received);
          if (result) finish(undefined, result.value);
        } catch (error) {
          finish(error as Error);
        }
      });
    });
  };
}
