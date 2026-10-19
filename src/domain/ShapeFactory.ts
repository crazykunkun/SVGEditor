import { Shape } from './Shape.js';
import { Rect } from './Rect.js';
import { Circle } from './Circle.js';
import { Ellipse } from './Ellipse.js';
import { Line } from './Line.js';
import { Text } from './Text.js';
import { Group } from './Group.js';

type Provider = {
  create: (id: string, parameters: readonly string[]) => Shape;
  fromSvg: (id: string, attributes: Readonly<Record<string, string>>, content: string) => Shape;
};

/** The sole type-name dispatch point. New shapes register providers here. */
export class ShapeFactory {
  private readonly providers = new Map<string, Provider>();
  private static readonly defaults = new ShapeFactory();

  constructor() {
    this.register('rect', {
      create: (id, p) => {
        this.expect('rect', p, 4, 5);
        return new Rect(id, this.number(p, 0, 'x'), this.number(p, 1, 'y'), this.number(p, 2, 'width'), this.number(p, 3, 'height'), p[4]);
      },
      fromSvg: (id, a) => new Rect(id, this.importNumber(a, 'x'), this.importNumber(a, 'y'), this.importNumber(a, 'width'), this.importNumber(a, 'height')),
    });
    this.register('circle', {
      create: (id, p) => {
        this.expect('circle', p, 3, 4);
        return new Circle(id, this.number(p, 0, 'cx'), this.number(p, 1, 'cy'), this.number(p, 2, 'r'), p[3]);
      },
      fromSvg: (id, a) => new Circle(id, this.importNumber(a, 'cx'), this.importNumber(a, 'cy'), this.importNumber(a, 'r')),
    });
    this.register('ellipse', {
      create: (id, p) => {
        this.expect('ellipse', p, 4, 5);
        return new Ellipse(id, this.number(p, 0, 'cx'), this.number(p, 1, 'cy'), this.number(p, 2, 'rx'), this.number(p, 3, 'ry'), p[4]);
      },
      fromSvg: (id, a) => new Ellipse(id, this.importNumber(a, 'cx'), this.importNumber(a, 'cy'), this.importNumber(a, 'rx'), this.importNumber(a, 'ry')),
    });
    this.register('line', {
      create: (id, p) => {
        this.expect('line', p, 4, 5);
        return new Line(id, this.number(p, 0, 'x1'), this.number(p, 1, 'y1'), this.number(p, 2, 'x2'), this.number(p, 3, 'y2'), p[4]);
      },
      fromSvg: (id, a) => new Line(id, this.importNumber(a, 'x1'), this.importNumber(a, 'y1'), this.importNumber(a, 'x2'), this.importNumber(a, 'y2')),
    });
    this.register('text', {
      create: (id, p) => {
        this.expect('text', p, 3, 3);
        return new Text(id, this.number(p, 0, 'x'), this.number(p, 1, 'y'), p[2]!);
      },
      fromSvg: (id, a, content) => new Text(id, this.importNumber(a, 'x'), this.importNumber(a, 'y'), content),
    });
    this.register('g', {
      create: (id, p) => { this.expect('g', p, 0, 0); return new Group(id); },
      fromSvg: id => new Group(id),
    });
  }

  register(type: string, provider: Provider): void {
    if (this.providers.has(type)) throw new Error(`shape type already registered: ${type}`);
    this.providers.set(type, provider);
  }

  create(type: string, id: string, parameters: readonly string[]): Shape {
    return this.provider(type).create(id, parameters);
  }

  fromSvg(type: string, id: string, attributes: Record<string, string>, content: string): Shape {
    const shape = this.provider(type).fromSvg(id, attributes, content);
    if (shape.textContent === undefined && content.trim()) throw new Error(`unexpected text content in <${type}>`);
    shape.importSvgAttributes(attributes);
    return shape;
  }

  static create(type: string, id: string, parameters: readonly string[]): Shape {
    return ShapeFactory.defaults.create(type, id, parameters);
  }

  static fromSvg(type: string, id: string, attributes: Record<string, string>, content: string): Shape {
    return ShapeFactory.defaults.fromSvg(type, id, attributes, content);
  }

  private provider(type: string): Provider {
    const provider = this.providers.get(type);
    if (!provider) throw new Error(`unknown shape type: ${type} (is the plugin loaded?)`);
    return provider;
  }
  private expect(type: string, parameters: readonly string[], minimum: number, maximum: number): void {
    if (parameters.length < minimum || parameters.length > maximum) throw new Error(`invalid parameters for ${type}`);
  }
  private number(parameters: readonly string[], index: number, name: string): number {
    return Shape.number(parameters[index]!, name);
  }
  private importNumber(attributes: Readonly<Record<string, string>>, name: string): number {
    return Shape.number(attributes[name] ?? '0', name);
  }
}
