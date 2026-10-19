import type { SvgDocument } from '../domain/SvgDocument.js';
import type { EditCommand } from './commands/EditCommand.js';

/** Encapsulates snapshots so callers cannot modify a past history state. */
export class CommandRecord {
  private readonly before: SvgDocument;
  private readonly after: SvgDocument;
  private readonly command: EditCommand;
  private readonly message: string;

  constructor(command: EditCommand, before: SvgDocument, after: SvgDocument, message: string) {
    this.before = before.clone();
    this.after = after.clone();
    this.command = command;
    this.message = message;
  }

  undo(): { document: SvgDocument; message: string } {
    return {
      document: this.before.clone(),
      message: this.command.undoFeedback(this.before, this.after, this.message),
    };
  }

  redo(): { document: SvgDocument; message: string } {
    return { document: this.after.clone(), message: this.message };
  }
}
