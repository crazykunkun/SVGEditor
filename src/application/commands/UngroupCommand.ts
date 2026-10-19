import type { SvgDocument } from '../../domain/SvgDocument.js';
import { EditCommand } from './EditCommand.js';

export class UngroupCommand extends EditCommand {
  constructor(args: readonly string[]) {
    super(args);
  }

  execute(document: SvgDocument): string {
    this.requireArity(1, 'ungroup <gid>');
    const group = document.find(this.argument(0));
    const label = group.label;
    const count = group.children.length;
    document.ungroup(this.argument(0));
    return `${label} ungrouped (${count} children promoted)`;
  }
}
