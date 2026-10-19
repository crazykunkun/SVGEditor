import type { SvgDocument } from '../../domain/SvgDocument.js';
import { EditCommand } from './EditCommand.js';

export class BackCommand extends EditCommand {
  constructor(args: readonly string[]) {
    super(args);
  }

  execute(document: SvgDocument): string {
    this.requireArity(1, 'back <id>');
    const id = this.argument(0);
    document.reorder(id, false);
    return `${document.find(id).label} sent to back`;
  }
}
