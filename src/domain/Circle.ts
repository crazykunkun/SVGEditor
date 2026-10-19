import { Shape } from './Shape.js';

export class Circle extends Shape {
  constructor(id: string, cx: number, cy: number, radius: number, fill?: string) {
    super(id);
    this.defineGeometry('cx', cx, 'x');
    this.defineGeometry('cy', cy, 'y');
    this.defineGeometry('r', radius, undefined, true);
    if (fill !== undefined) this.setAttribute('fill', fill);
  }
  get tag(): string { return 'circle'; }
  position(): string { return `(${this.attribute('cx')},${this.attribute('cy')})`; }
  summary(): string {
    return this.styledSummary(`cx=${this.attribute('cx')} cy=${this.attribute('cy')} r=${this.attribute('r')}`);
  }
  clone(): Circle {
    return this.copyAttributesTo(new Circle(this.id, Number(this.attribute('cx')), Number(this.attribute('cy')), Number(this.attribute('r'))));
  }
}
