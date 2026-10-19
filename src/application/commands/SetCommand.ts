import type { SvgDocument } from '../../domain/SvgDocument.js';
import { EditCommand } from './EditCommand.js';

export class SetCommand extends EditCommand {
  constructor(args: readonly string[]) {
    super(args);
  }

  execute(document: SvgDocument): string {
    this.requireArity(3, 'set <id> <attr> <value>');
    const shape = document.find(this.argument(0));
    const attr = this.argument(1);
    const value = this.argument(2);
    shape.setAttribute(attr, value);
    return `${shape.label} updated: ${attr}=${JSON.stringify(value)}`;
  }

  override undoFeedback(before: SvgDocument): string {
    const shape = before.find(this.argument(0));
    const attr = this.argument(1);
    const previous = attr === 'text' ? shape.textContent : shape.attributes[attr];
    return `${shape.label} updated: ${attr}=${previous === undefined ? '(unset)' : JSON.stringify(previous)}`;
  }
}
