import type { SvgDocument } from '../../domain/SvgDocument.js';
import { EditCommand } from './EditCommand.js';

export class FrontCommand extends EditCommand {
  constructor(args: readonly string[]) {
    super(args);
  }

  execute(document: SvgDocument): string {
    this.requireArity(1, 'front <id>');
    const id = this.argument(0);
    document.reorder(id, true);
    return `${document.find(id).label} brought to front`;
  }
}
