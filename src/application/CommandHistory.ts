import type { SvgDocument } from '../domain/SvgDocument.js';
import type { EditCommand } from './commands/EditCommand.js';
import { CommandRecord } from './CommandRecord.js';

/** Atomic edits plus undo/redo; persistence and the CLI stay outside this layer. */
export class CommandHistory {
  private readonly undoStack: CommandRecord[] = [];
  private readonly redoStack: CommandRecord[] = [];
  private blocked = false;

  execute(command: EditCommand, document: SvgDocument): { document: SvgDocument; message: string } {
    const candidate = document.clone();
    const message = command.execute(candidate);
    const record = new CommandRecord(command, document, candidate, message);
    this.undoStack.push(record);
    this.redoStack.length = 0;
    this.blocked = false;
    return { document: candidate, message };
  }

  undo(): { document: SvgDocument; message: string } {
    this.checkBarrier();
    const record = this.undoStack.at(-1);
    if (record === undefined) throw new Error('nothing to undo');
    const result = record.undo();
    this.undoStack.pop();
    this.redoStack.push(record);
    return result;
  }

  redo(): { document: SvgDocument; message: string } {
    this.checkBarrier();
    const record = this.redoStack.at(-1);
    if (record === undefined) throw new Error('nothing to redo');
    const result = record.redo();
    this.redoStack.pop();
    this.undoStack.push(record);
    return result;
  }

  barrier(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.blocked = true;
  }

  private checkBarrier(): void {
    if (this.blocked) throw new Error('undo not allowed after io command');
  }
}
