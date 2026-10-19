import { Shape } from './Shape.js';

export class Text extends Shape {
  private content: string;
  constructor(id: string, x: number, y: number, content: string) {
    super(id);
    this.content = content;
    this.defineGeometry('x', x, 'x');
    this.defineGeometry('y', y, 'y');
  }
  get tag(): string { return 'text'; }
  override get textContent(): string { return this.content; }
  override setAttribute(name: string, value: string): void {
    if (name === 'text') this.content = value;
    else super.setAttribute(name, value);
  }
  position(): string { return `(${this.attribute('x')},${this.attribute('y')})`; }
  summary(): string { return this.styledSummary(`${this.position()} ${JSON.stringify(this.content)}`); }
  clone(): Text {
    return this.copyAttributesTo(new Text(this.id, Number(this.attribute('x')), Number(this.attribute('y')), this.content));
  }
}
