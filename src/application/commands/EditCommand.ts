import type { SvgDocument } from '../../domain/SvgDocument.js';

/** One user edit. The history executes it against an isolated document. */
export abstract class EditCommand {
  protected readonly args: readonly string[];

  protected constructor(args: readonly string[]) {
    this.args = [...args];
  }

  abstract execute(document: SvgDocument): string;

  undoFeedback(_before: SvgDocument, _after: SvgDocument, message: string): string {
    return `undone: ${message}`;
  }

  protected requireArity(count: number, syntax: string): void {
    if (this.args.length !== count) throw new Error(`usage: ${syntax}`);
  }

  protected requireMinimum(count: number, syntax: string): void {
    if (this.args.length < count) throw new Error(`usage: ${syntax}`);
  }

  protected argument(index: number): string {
    const value = this.args[index];
    if (value === undefined) throw new Error('missing command argument');
    return value;
  }

  protected number(index: number, name: string): number {
    const source = this.argument(index);
    const value = Number(source);
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(source.trim()) || !Number.isFinite(value)) {
      throw new Error(`${name} must be a finite number`);
    }
    return value;
  }
}
