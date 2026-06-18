import { readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { Client, FTPError } from "basic-ftp";
import SftpClient from "ssh2-sftp-client";
import { Writable } from "stream";

class StringCollector extends Writable {
  constructor() {
    super();
    this.chunks = [];
    this.bytes = 0;
  }

  _write(chunk, _encoding, callback) {
    this.chunks.push(chunk);
    this.bytes += chunk.length;
    callback();
  }

  toString() {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

function useSftp() {
  if (process.env.FTP_USE_SFTP === "true") return true;
  return Number(process.env.FTP_PORT || 21) === 22;
}

function buildConnectionErrorMessage(err, host, port, protocol) {
  const code = err?.code || "";
  const message = err?.message || String(err);

  if (code === "ETIMEDOUT" || code === "ECONNREFUSED" || code === "EHOSTUNREACH") {
    return (
      `Cannot reach ${protocol} server ${host}:${port} (${code}). ` +
      (protocol === "FTP"
        ? "Port 21 may be blocked — use FTP_PORT=22 with FTP_USE_SFTP=true."
        : "SFTP connection failed. Check credentials and try again.")
    );
  }

  if (message.toLowerCase().includes("timed out")) {
    return `SFTP timed out connecting to ${host}:${port}. Try again or check network.`;
  }

  if (err instanceof FTPError) {
    return `FTP error: ${message}`;
  }

  return message;
}

async function fetchCsvFromLocalFile() {
  const localPath = process.env.FTP_LOCAL_FILE_PATH;

  if (!localPath) {
    return null;
  }

  console.log(`[ftp] Reading local CSV: ${localPath}`);
  const content = await readFile(localPath, "utf8");

  if (!content.trim()) {
    throw new Error(`Local CSV file is empty: ${localPath}`);
  }

  console.log(
    `[ftp] Loaded local file (${(content.length / 1024 / 1024).toFixed(2)} MB)`,
  );

  return content;
}

async function fetchCsvViaSftp({ host, port, user, password, remotePath }) {
  const sftp = new SftpClient();
  const connectStart = Date.now();

  try {
    console.log(`[sftp] Connecting to ${host}:${port} as ${user}...`);

    await sftp.connect({
      host,
      port,
      username: user,
      password,
      readyTimeout: 30_000,
      retries: 2,
      retry_factor: 2,
      retry_minTimeout: 2000,
    });

    console.log(
      `[sftp] Connected in ${((Date.now() - connectStart) / 1000).toFixed(1)}s`,
    );

    const fileInfo = await sftp.stat(remotePath);
    const sizeMb = (fileInfo.size / 1024 / 1024).toFixed(2);
    console.log(`[sftp] Downloading ${remotePath} (${sizeMb} MB)...`);

    const downloadStart = Date.now();
    const tempPath = join(tmpdir(), `inv-sync-${randomUUID()}.csv`);

    try {
      await sftp.fastGet(remotePath, tempPath, {
        chunkSize: 64 * 1024,
        concurrency: 4,
      });

      const content = await readFile(tempPath, "utf8");

      console.log(
        `[sftp] Download complete (${sizeMb} MB in ${((Date.now() - downloadStart) / 1000).toFixed(1)}s)`,
      );

      if (!content.trim()) {
        throw new Error(`SFTP file is empty: ${remotePath}`);
      }

      return content;
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  } catch (err) {
    throw new Error(buildConnectionErrorMessage(err, host, port, "SFTP"));
  } finally {
    await sftp.end().catch(() => {});
  }
}

async function fetchCsvViaFtp({ host, port, user, password, remotePath, secure }) {
  const client = new Client(120_000);
  client.ftp.verbose = process.env.FTP_VERBOSE === "true";

  try {
    console.log(`[ftp] Connecting to ${host}:${port}...`);

    await client.access({
      host,
      port,
      user,
      password,
      secure,
    });

    client.ftp.ipFamily = 4;

    const collector = new StringCollector();
    await client.downloadTo(collector, remotePath);

    const content = collector.toString();

    if (!content.trim()) {
      throw new Error(`FTP file is empty: ${remotePath}`);
    }

    console.log(
      `[ftp] Downloaded ${remotePath} (${(content.length / 1024 / 1024).toFixed(2)} MB)`,
    );

    return content;
  } catch (err) {
    throw new Error(buildConnectionErrorMessage(err, host, port, "FTP"));
  } finally {
    client.close();
  }
}

export async function fetchCsvFromFtp() {
  const localContent = await fetchCsvFromLocalFile();
  if (localContent) {
    return localContent;
  }

  const host = process.env.FTP_HOST;
  const user = process.env.FTP_USER;
  const password = process.env.FTP_PASSWORD;
  const port = Number(process.env.FTP_PORT || 21);
  const remotePath = process.env.FTP_REMOTE_PATH || "/InvAdvBranchSum.csv";
  const secure = process.env.FTP_SECURE === "true";

  if (!host || !user || !password) {
    throw new Error("FTP_HOST, FTP_USER, and FTP_PASSWORD are required");
  }

  if (useSftp()) {
    return fetchCsvViaSftp({ host, port, user, password, remotePath });
  }

  return fetchCsvViaFtp({ host, port, user, password, remotePath, secure });
}
