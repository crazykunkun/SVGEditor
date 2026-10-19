import type { SvgDocument } from '../../domain/SvgDocument.js';
import { EditCommand } from './EditCommand.js';

export class AddToCommand extends EditCommand {
  constructor(args: readonly string[]) {
    super(args);
  }

  execute(document: SvgDocument): string {
    this.requireArity(2, 'addto <gid> <id>');
    const targetId = this.argument(0);
    const id = this.argument(1);
    document.addTo(targetId, id);
    return `${document.find(id).label} added to ${document.find(targetId).label}`;
  }
}
