import type { SvgDocument } from '../../domain/SvgDocument.js';
import { EditCommand } from './EditCommand.js';

export class DeleteCommand extends EditCommand {
  constructor(args: readonly string[]) {
    super(args);
  }

  execute(document: SvgDocument): string {
    this.requireArity(1, 'delete <id>');
    const shape = document.remove(this.argument(0));
    return `${shape.label} deleted`;
  }

  override undoFeedback(before: SvgDocument): string {
    const id = this.argument(0);
    return `${before.find(id).label} restored into ${before.parentLabel(id)}`;
  }
}
