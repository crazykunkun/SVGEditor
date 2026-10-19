import { Shape } from './Shape.js';

export class Line extends Shape {
  constructor(id: string, x1: number, y1: number, x2: number, y2: number, stroke?: string) {
    super(id);
    this.defineGeometry('x1', x1, 'x');
    this.defineGeometry('y1', y1, 'y');
    this.defineGeometry('x2', x2, 'x');
    this.defineGeometry('y2', y2, 'y');
    if (stroke !== undefined) this.setAttribute('stroke', stroke);
  }
  get tag(): string { return 'line'; }
  position(): string {
    return `(${this.attribute('x1')},${this.attribute('y1')}) -> (${this.attribute('x2')},${this.attribute('y2')})`;
  }
  summary(): string { return this.styledSummary(this.position()); }
  clone(): Line {
    return this.copyAttributesTo(new Line(this.id, Number(this.attribute('x1')), Number(this.attribute('y1')), Number(this.attribute('x2')), Number(this.attribute('y2'))));
  }
}
