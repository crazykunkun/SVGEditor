import type { FilePort } from '../../src/ports/FilePort.js';

/** In-memory file adapter with a controllable write failure for session tests. */
export class MemoryFiles implements FilePort {
  private readonly storage: Map<string, string>;
  private rejectedPath: string | undefined;

  constructor(initial: Record<string, string> = {}) {
    this.storage = new Map(Object.entries(initial));
  }

  rejectWrite(path: string): void { this.rejectedPath = path; }

  read(path: string): string {
    const content = this.storage.get(path);
    if (content === undefined) throw new Error(`cannot read file: ${path}`);
    return content;
  }

  write(path: string, content: string): void {
    if (path === this.rejectedPath) throw new Error(`cannot write file: ${path}`);
    this.storage.set(path, content);
  }
}
