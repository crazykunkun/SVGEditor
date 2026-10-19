import type { SvgDocument } from '../../domain/SvgDocument.js';
import { EditCommand } from './EditCommand.js';

export class ScaleCommand extends EditCommand {
  constructor(args: readonly string[]) {
    super(args);
  }

  execute(document: SvgDocument): string {
    this.requireArity(2, 'scale <id> <factor>');
    const factor = this.number(1, 'scale factor');
    if (factor <= 0) throw new Error('scale factor must be positive');
    const shape = document.find(this.argument(0));
    shape.scale(factor);
    return `${shape.label} scaled by ${factor}`;
  }
}
