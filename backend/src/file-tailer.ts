import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';

interface Cursor { dev: number; ino: number; offset: number; generation: string; anchor?: string; }
export interface TailRecord { line: string; identity: string; quarantinePath?: string; }

/** Single-file collector. Checkpoints advance only after durable receipt ACK. */
export class FileTailer {
  private handle: fs.promises.FileHandle | null = null;
  private cursor: Cursor | null = null;
  private polling = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly checkpointPath: string;

  constructor(private readonly filePath: string, private readonly dataDir: string,
              private readonly maxLineBytes: number,
              private readonly receive: (record: TailRecord) => Promise<void>,
              private readonly onError: (error: Error) => void,
              private readonly quarantineLimitBytes = 64 * 1024 * 1024) {
    this.checkpointPath = path.join(dataDir, 'checkpoints', createHash('sha256').update(filePath).digest('hex') + '.json');
  }

  start() {
    this.timer = setInterval(() => void this.poll().catch(this.onError), 1000);
    this.timer.unref();
    void this.poll().catch(this.onError);
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    // Do not close a descriptor while a receipt commit is in flight.
    while (this.polling) await new Promise(resolve => setTimeout(resolve, 10));
    await this.handle?.close();
    this.handle = null;
  }

  private async openCurrent() {
    let saved: Cursor | null = null;
    try { saved = JSON.parse(await fs.promises.readFile(this.checkpointPath, 'utf8')); } catch { /* first run */ }
    const current = await fs.promises.stat(this.filePath);
    let startPath = this.filePath;
    // Recover an unread rotated inode after restart, when it still exists.
    if (saved && (saved.dev !== current.dev || saved.ino !== current.ino)) {
      for (const name of (await fs.promises.readdir(path.dirname(this.filePath))).slice(0, 1000)) {
        const candidate = path.join(path.dirname(this.filePath), name);
        try {
          const stat = await fs.promises.stat(candidate);
          if (stat.isFile() && stat.dev === saved.dev && stat.ino === saved.ino) { startPath = candidate; break; }
        } catch { /* disappeared during rotation */ }
      }
      if (startPath === this.filePath) {
        this.onError(new Error('Previous log inode is unavailable; collector continuity needs investigation'));
      }
    }
    this.handle = await fs.promises.open(startPath, 'r');
    const stat = await this.handle.stat();
    this.cursor = saved && saved.dev === stat.dev && saved.ino === stat.ino && saved.offset <= stat.size
      ? saved : { dev: stat.dev, ino: stat.ino, offset: 0, generation: randomUUID() };
    if (this.cursor.anchor && this.cursor.anchor !== await this.anchorAt(this.cursor.offset)) {
      this.cursor = { dev: stat.dev, ino: stat.ino, offset: 0, generation: randomUUID() };
    }
    await this.checkpoint(); // generation survives a crash before the first ACK
  }

  private async checkpoint() {
    if (this.handle && this.cursor) this.cursor.anchor = await this.anchorAt(this.cursor.offset);
    await fs.promises.mkdir(path.dirname(this.checkpointPath), { recursive: true });
    const temp = this.checkpointPath + '.tmp';
    const handle = await fs.promises.open(temp, 'w');
    try { await handle.writeFile(JSON.stringify(this.cursor)); await handle.sync(); } finally { await handle.close(); }
    await fs.promises.rename(temp, this.checkpointPath);
  }

  private async anchorAt(offset: number) {
    const length = Math.min(64, offset), buffer = Buffer.alloc(length);
    const { bytesRead } = await this.handle!.read(buffer, 0, length, offset - length);
    return createHash('sha256').update(buffer.subarray(0, bytesRead)).digest('hex');
  }

  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      if (!this.handle) await this.openCurrent();
      await this.drain();
      const current = await fs.promises.stat(this.filePath);
      if (current.dev !== this.cursor!.dev || current.ino !== this.cursor!.ino) {
        await this.drain(true);
        await this.handle!.close();
        this.handle = await fs.promises.open(this.filePath, 'r');
        this.cursor = { dev: current.dev, ino: current.ino, offset: 0, generation: randomUUID() };
        await this.checkpoint();
        await this.drain();
      }
    } catch (err) {
      // An uncommitted record is retried from its checkpoint, never skipped.
      await this.handle?.close();
      this.handle = null;
      throw err;
    } finally { this.polling = false; }
  }

  private async drain(finalizePartial = false) {
    const handle = this.handle!;
    const stat = await handle.stat();
    if (stat.size < this.cursor!.offset || (this.cursor!.anchor && this.cursor!.anchor !== await this.anchorAt(this.cursor!.offset))) {
      this.cursor!.offset = 0;
      this.cursor!.generation = randomUUID();
      await this.checkpoint();
    }
    let position = this.cursor!.offset;
    let lineStart = position;
    let parts: Buffer[] = [], length = 0;
    let quarantine: fs.promises.FileHandle | null = null;
    let quarantinePath: string | undefined;
    let quotaUsed = 0;
    const buffer = Buffer.alloc(64 * 1024);
    const identity = () => `${this.cursor!.dev}:${this.cursor!.ino}:${this.cursor!.generation}:${lineStart}`;
    try {
      while (position < stat.size) {
        const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, stat.size - position), position);
        if (!bytesRead) break;
        let segmentStart = 0;
        for (let i = 0; i <= bytesRead; i++) {
          if (i !== bytesRead && buffer[i] !== 10) continue;
          const segment = buffer.subarray(segmentStart, i);
          length += segment.length;
          if (!quarantine && length > this.maxLineBytes) {
            const dir = path.join(this.dataDir, 'quarantine');
            await fs.promises.mkdir(dir, { recursive: true });
            quarantinePath = path.join(dir, createHash('sha256').update(identity()).digest('hex') + '.raw');
            for (const name of await fs.promises.readdir(dir)) {
              if (path.join(dir, name) !== quarantinePath) quotaUsed += (await fs.promises.stat(path.join(dir, name))).size;
            }
            if (quotaUsed + length > this.quarantineLimitBytes) throw new Error('Quarantine byte budget exhausted');
            quarantine = await fs.promises.open(quarantinePath, 'w');
            for (const part of parts) await quarantine.write(part);
            parts = [];
          }
          if (quarantine) {
            if (quotaUsed + length > this.quarantineLimitBytes) throw new Error('Quarantine byte budget exhausted');
            await quarantine.write(segment);
          } else if (segment.length) parts.push(Buffer.from(segment));
          if (i < bytesRead) {
            const record: TailRecord = { line: quarantine ? '' : Buffer.concat(parts, length).toString('utf8').replace(/\r$/, ''), identity: identity(), quarantinePath };
            if (quarantine) { await quarantine.write(Buffer.from('\n')); await quarantine.sync(); await quarantine.close(); quarantine = null; }
            await this.receive(record);
            this.cursor!.offset = position + i + 1;
            await this.checkpoint();
            lineStart = this.cursor!.offset;
            parts = []; length = 0; quarantinePath = undefined;
          }
          segmentStart = i + 1;
        }
        position += bytesRead;
      }
      if (finalizePartial && length > 0) {
        if (quarantine) { await quarantine.sync(); await quarantine.close(); quarantine = null; }
        await this.receive({ line: quarantinePath ? '' : Buffer.concat(parts, length).toString('utf8'), identity: identity(), quarantinePath });
        this.cursor!.offset = position;
        await this.checkpoint();
      }
      // Live partial lines leave the checkpoint at their start.
    } finally { await quarantine?.close(); }
  }
}
