import type { SvgDocument } from '../../domain/SvgDocument.js';
import { EditCommand } from './EditCommand.js';

export class MoveCommand extends EditCommand {
  constructor(args: readonly string[]) {
    super(args);
  }

  execute(document: SvgDocument): string {
    this.requireArity(3, 'move <id> <dx> <dy>');
    const dx = this.number(1, 'dx');
    const dy = this.number(2, 'dy');
    const shape = document.find(this.argument(0));
    shape.move(dx, dy);
    const position = shape.position();
    return !position
      ? `${shape.label} moved by (${dx},${dy})`
      : `${shape.label} moved to ${position}`;
  }

  override undoFeedback(before: SvgDocument): string {
    const shape = before.find(this.argument(0));
    const position = shape.position();
    return !position
      ? `${shape.label} moved back by (${-this.number(1, 'dx')},${-this.number(2, 'dy')})`
      : `${shape.label} moved back to ${position}`;
  }
}
