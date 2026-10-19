import type { SvgDocument } from '../../domain/SvgDocument.js';
import { EditCommand } from './EditCommand.js';

export class GroupCommand extends EditCommand {
  constructor(args: readonly string[]) {
    super(args);
  }

  execute(document: SvgDocument): string {
    this.requireMinimum(2, 'group <newGid> <id1> [id2…]');
    const group = document.group(this.argument(0), this.args.slice(1));
    return `${group.label} created with ${group.children.length} children`;
  }
}
