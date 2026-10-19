import { Shape } from './Shape.js';

export class Rect extends Shape {
  constructor(id: string, x: number, y: number, width: number, height: number, fill?: string) {
    super(id);
    this.defineGeometry('x', x, 'x');
    this.defineGeometry('y', y, 'y');
    this.defineGeometry('width', width, undefined, true);
    this.defineGeometry('height', height, undefined, true);
    if (fill !== undefined) this.setAttribute('fill', fill);
  }
  get tag(): string { return 'rect'; }
  position(): string { return `(${this.attribute('x')},${this.attribute('y')})`; }
  summary(): string {
    return this.styledSummary(`x=${this.attribute('x')} y=${this.attribute('y')} w=${this.attribute('width')} h=${this.attribute('height')}`);
  }
  clone(): Rect {
    return this.copyAttributesTo(new Rect(this.id, Number(this.attribute('x')), Number(this.attribute('y')), Number(this.attribute('width')), Number(this.attribute('height'))));
  }
}
