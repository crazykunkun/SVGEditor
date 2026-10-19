import type { SvgDocument } from '../../src/domain/SvgDocument.js';
import { EditCommand } from '../../src/application/commands/EditCommand.js';

/** Deliberate partial mutation proves that history isolates failed commands. */
export class RejectingCommand extends EditCommand {
  constructor() {
    super([]);
  }

  execute(document: SvgDocument): string {
    document.find('r').move(100, 100);
    throw new Error('deliberately rejected after a partial change');
  }
}
