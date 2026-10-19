import { Shape } from './Shape.js';

export class Ellipse extends Shape {
  constructor(id: string, cx: number, cy: number, rx: number, ry: number, fill?: string) {
    super(id);
    this.defineGeometry('cx', cx, 'x');
    this.defineGeometry('cy', cy, 'y');
    this.defineGeometry('rx', rx, undefined, true);
    this.defineGeometry('ry', ry, undefined, true);
    if (fill !== undefined) this.setAttribute('fill', fill);
  }
  get tag(): string { return 'ellipse'; }
  position(): string { return `(${this.attribute('cx')},${this.attribute('cy')})`; }
  summary(): string {
    return this.styledSummary(`cx=${this.attribute('cx')} cy=${this.attribute('cy')} rx=${this.attribute('rx')} ry=${this.attribute('ry')}`);
  }
  clone(): Ellipse {
    return this.copyAttributesTo(new Ellipse(this.id, Number(this.attribute('cx')), Number(this.attribute('cy')), Number(this.attribute('rx')), Number(this.attribute('ry'))));
  }
}
