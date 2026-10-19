import type { Shape } from '../domain/Shape.js';
import type { SvgDocument } from '../domain/SvgDocument.js';

/** Presentation traverses the Composite uniformly, without dispatch by shape tag. */
export class DocumentPresenter {
  tree(document: SvgDocument, args: readonly string[]): string[] {
    if (args.length > 1) throw new Error('usage: tree [id]');
    if (args[0] !== undefined) {
      const shape = document.find(args[0]);
      return [this.oneLine(shape.summary()), ...this.children(shape.children, '')];
    }
    return [`svg (${document.width}x${document.height})`, ...this.children(document.children, '')];
  }

  show(document: SvgDocument, args: readonly string[]): string[] {
    if (args.length !== 1) throw new Error('usage: show <id>');
    const shape = document.find(args[0]!);
    const styles = new Set(['fill', 'stroke', 'stroke-width']);
    const entries = Object.entries(shape.attributes);
    const geometry = entries.filter(([name]) => !styles.has(name));
    const presentation = entries.filter(([name]) => styles.has(name));
    const lines = [`${shape.label}  parent=${document.parentLabel(shape.id)}`];
    for (const attributes of [geometry, presentation]) {
      if (attributes.length > 0) lines.push(`  ${attributes.map(([name, value]) => `${name}=${this.value(value)}`).join(' ')}`);
    }
    if (shape.textContent !== undefined) lines.push(`  text=${JSON.stringify(shape.textContent)}`);
    if (shape.children.length > 0) lines.push(`  children=${shape.children.length}`);
    return lines;
  }

  private children(shapes: readonly Shape[], prefix: string): string[] {
    return shapes.flatMap((shape, index) => {
      const last = index === shapes.length - 1;
      return [
        `${prefix}${last ? '└── ' : '├── '}${this.oneLine(shape.summary())}`,
        ...this.children(shape.children, `${prefix}${last ? '    ' : '│   '}`),
      ];
    });
  }

  private value(value: string): string {
    return /[\s"\\]/.test(value) ? JSON.stringify(value) : value;
  }

  private oneLine(value: string): string {
    return value.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  }
}
