import { randomUUID } from "node:crypto";
import { accessSync, closeSync, constants, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { FilePort } from "../ports/FilePort.js";

/** Save to a sibling first, then replace the destination with a single rename. */
export class NodeFileStore implements FilePort {
  read(path: string): string {
    try {
      return readFileSync(path, "utf8");
    } catch {
      throw new Error(`cannot read file: ${path}`);
    }
  }

  write(path: string, content: string): void {
    const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
    let created = false;
    let descriptor: number | undefined;
    try {
      let mode = 0o666;
      try {
        mode = statSync(path).mode & 0o777;
        accessSync(path, constants.W_OK);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      descriptor = openSync(temporary, "wx", mode);
      created = true;
      writeFileSync(descriptor, content, "utf8");
      closeSync(descriptor);
      descriptor = undefined;
      renameSync(temporary, path);
    } catch {
      throw new Error(`cannot write file: ${path}`);
    } finally {
      if (descriptor !== undefined) {
        try { closeSync(descriptor); } catch { /* Preserve the original write error. */ }
      }
      if (created) {
        try {
          unlinkSync(temporary);
        } catch {
          // Rename consumes the temporary file; cleanup also handles a failed rename.
        }
      }
    }
  }
}
