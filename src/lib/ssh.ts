import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Client } from "ssh2";
import { BlockedRequestError, isRefusedPrivateAddress } from "./ssrf";

// What an SSH credential holds (stored encrypted, as JSON). The host is part
// of the credential on purpose: a saved key or password can only ever be
// used against the server it was saved for.
export type SshConnection = {
  host: string;
  port?: number | string;
  username: string;
  // "password" | "privateKey"
  authType?: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  // Optional: the server key's SHA256 fingerprint, as "ssh-keygen -lf" prints
  // it. When set, a server presenting another key is refused.
  hostFingerprint?: string;
};

export type SshResult = {
  stdout: string;
  stderr: string;
  // The command's exit code; null when it was ended by a signal
  code: number | null;
  signal: string | null;
  // True when the output was longer than the limit and was cut
  truncated: boolean;
};

const CONNECT_TIMEOUT_MS = 15_000;
export const SSH_DEFAULT_TIMEOUT_SECONDS = 30;
export const SSH_MAX_TIMEOUT_SECONDS = 120;
// Per stream. Step results are stored by Inngest, which caps their size.
const MAX_OUTPUT_BYTES = 512 * 1024;

// Wraps a value so the remote shell reads it as one argument, whatever it
// contains. Also available in templates as {{shellQuote value}}.
export const shellQuote = (value: unknown) =>
  `'${String(value ?? "").replace(/'/g, `'\\''`)}'`;

/**
 * Resolves the host once and returns the address to connect to, after
 * checking it is not on a private network. Connecting to this address, not
 * the name, means a DNS answer cannot change between the check and the
 * connection.
 */
export const resolveSshAddress = async (
  host: string,
  // For PRIVATE_NETWORK_ALLOWLIST entries that name a port
  port?: number
): Promise<string> => {
  const name = host.trim().replace(/^\[|\]$/g, "");

  if (!name || /[\s/@]/.test(name)) {
    throw new Error(`"${host}" is not a valid host name`);
  }

  const address = isIP(name)
    ? name
    : (await dnsLookup(name, { verbatim: true })).address;

  if (isRefusedPrivateAddress(address, name, port)) {
    throw new BlockedRequestError(
      `Connections to private or local addresses are not allowed (${name})`
    );
  }

  return address;
};

const normalizeFingerprint = (value: string) =>
  value.trim().replace(/^SHA256:/i, "").replace(/=+$/, "");

/**
 * Runs one command on a server over SSH and returns what it printed.
 */
export const runSshCommand = async (
  connection: SshConnection,
  command: string,
  { timeoutSeconds = SSH_DEFAULT_TIMEOUT_SECONDS }: { timeoutSeconds?: number } = {}
): Promise<SshResult> => {
  const username = connection.username?.trim();
  if (!username) throw new Error("The SSH credential has no username");

  const port = Number(connection.port) || 22;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("The SSH credential's port is not valid");
  }

  const usesKey = connection.authType === "privateKey";
  if (usesKey ? !connection.privateKey?.trim() : !connection.password) {
    throw new Error(
      usesKey
        ? "The SSH credential has no private key"
        : "The SSH credential has no password"
    );
  }

  const address = await resolveSshAddress(connection.host, port);

  const timeoutMs =
    Math.min(Math.max(Number(timeoutSeconds) || SSH_DEFAULT_TIMEOUT_SECONDS, 1), SSH_MAX_TIMEOUT_SECONDS) *
    1000;

  const expectedFingerprint = connection.hostFingerprint?.trim()
    ? normalizeFingerprint(connection.hostFingerprint)
    : null;

  return new Promise<SshResult>((resolve, reject) => {
    const client = new Client();
    let settled = false;
    let fingerprintMismatch = false;

    const finish = (error: Error | null, result?: SshResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.end();

      if (error) reject(error);
      else resolve(result as SshResult);
    };

    // Covers a command that never ends, and a server that stops answering
    const timer = setTimeout(() => {
      finish(new Error(`The command did not finish within ${timeoutMs / 1000} seconds`));
      client.destroy();
    }, timeoutMs + CONNECT_TIMEOUT_MS);

    const collect = () => {
      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;

      return {
        add: (chunk: Buffer) => {
          if (size >= MAX_OUTPUT_BYTES) {
            truncated = true;
            return;
          }

          const room = MAX_OUTPUT_BYTES - size;
          if (chunk.length > room) truncated = true;

          chunks.push(chunk.subarray(0, room));
          size += Math.min(chunk.length, room);
        },
        text: () => Buffer.concat(chunks).toString("utf8"),
        truncated: () => truncated,
      };
    };

    client
      .on("ready", () => {
        const stdout = collect();
        const stderr = collect();

        // The time limit counts from here: the command, not the login
        clearTimeout(timer);
        const commandTimer = setTimeout(() => {
          finish(new Error(`The command did not finish within ${timeoutMs / 1000} seconds`));
          client.destroy();
        }, timeoutMs);

        client.exec(command, (error, stream) => {
          if (error) {
            clearTimeout(commandTimer);
            finish(error);
            return;
          }

          stream
            .on("data", (chunk: Buffer) => stdout.add(chunk))
            .on("close", (code: number | null, signal: string | null) => {
              clearTimeout(commandTimer);
              finish(null, {
                stdout: stdout.text(),
                stderr: stderr.text(),
                code: code ?? null,
                signal: signal ?? null,
                truncated: stdout.truncated() || stderr.truncated(),
              });
            });

          stream.stderr.on("data", (chunk: Buffer) => stderr.add(chunk));
        });
      })
      .on("error", (error: Error & { level?: string }) => {
        finish(
          new Error(
            fingerprintMismatch
              ? "The server's host key does not match the fingerprint saved in the credential"
              : error.level === "client-authentication"
                ? "The server rejected the username, password or key"
                : error.message
          )
        );
      })
      // (connect is wrapped below: a key that cannot be read throws at once)
      ;

    try {
      client.connect({
        host: address,
        port,
        username,
        ...(usesKey
          ? {
              privateKey: connection.privateKey,
              ...(connection.passphrase ? { passphrase: connection.passphrase } : {}),
            }
          : { password: connection.password }),
        readyTimeout: CONNECT_TIMEOUT_MS,
        // Only the given credential: no agent, no keys from this server
        agent: undefined,
        ...(expectedFingerprint
          ? {
              hostVerifier: (key: Buffer) => {
                const actual = createHash("sha256")
                  .update(key)
                  .digest("base64")
                  .replace(/=+$/, "");

                fingerprintMismatch = actual !== expectedFingerprint;

                return !fingerprintMismatch;
              },
            }
          : {}),
      });
    } catch (error) {
      finish(
        new Error(
          /privateKey|passphrase|key/i.test(String((error as Error)?.message))
            ? `The private key could not be read (${(error as Error).message})`
            : String((error as Error)?.message ?? error)
        )
      );
    }
  });
};
