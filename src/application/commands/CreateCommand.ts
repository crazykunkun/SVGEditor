import type { SvgDocument } from '../../domain/SvgDocument.js';
import { ShapeFactory } from '../../domain/ShapeFactory.js';
import { EditCommand } from './EditCommand.js';

export class CreateCommand extends EditCommand {
  constructor(args: readonly string[]) {
    super(args);
  }

  execute(document: SvgDocument): string {
    this.requireMinimum(2, 'create <type> <id> [params…] [in <containerId>]');
    const params = this.args.slice(2);
    let parentId: string | undefined;
    if (params.length >= 2 && params.at(-2) === 'in') {
      parentId = params.at(-1);
      params.splice(-2, 2);
    }
    const shape = new ShapeFactory().create(this.argument(0), this.argument(1), params);
    document.insert(shape, parentId);
    return `${shape.label} created${parentId === undefined ? '' : ` in ${document.find(parentId).label}`}`;
  }
}
