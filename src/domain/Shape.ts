/** Common behavior for leaf shapes and composite containers. */
export abstract class Shape {
  private readonly identifier: string;
  private readonly values: Record<string, string> = {};
  private readonly geometry = new Map<string, { axis?: 'x' | 'y'; nonnegative: boolean }>();

  protected constructor(id: string) {
    Shape.validateIdentifier(id);
    this.identifier = id;
  }

  static validateIdentifier(id: string): void {
    if (!id || !id.trim()) throw new Error('id must not be empty');
    if (/\s/.test(id)) throw new Error('id must not contain whitespace');
  }

  get id(): string { return this.identifier; }
  abstract get tag(): string;
  get label(): string { return `${this.tag}#${this.id}`; }
  get children(): readonly Shape[] { return Object.freeze([]); }
  get attributes(): Readonly<Record<string, string>> { return Object.freeze({ ...this.values }); }
  get textContent(): string | undefined { return undefined; }

  protected defineGeometry(name: string, value: number, axis?: 'x' | 'y', nonnegative = false): void {
    this.geometry.set(name, { axis, nonnegative });
    this.setAttribute(name, String(value));
  }

  protected attribute(name: string): string { return this.values[name] ?? ''; }

  protected copyAttributesTo<T extends Shape>(target: T): T {
    target.importSvgAttributes(this.values);
    return target;
  }

  static number(value: string | number, name: string): number {
    if (typeof value === 'string' && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:px)?$/.test(value.trim())) {
      throw new Error(`${name} must be a finite number`);
    }
    const parsed = typeof value === 'number' ? value : Number(value.trim().replace(/px$/, ''));
    if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number`);
    return Object.is(parsed, -0) ? 0 : parsed;
  }

  setAttribute(name: string, value: string): void {
    const specification = this.geometry.get(name);
    if (specification || name === 'stroke-width') {
      const number = Shape.number(value, name);
      if ((specification?.nonnegative || name === 'stroke-width') && number < 0) {
        throw new Error(`${name} must be nonnegative`);
      }
      this.values[name] = String(number);
      return;
    }
    if (name === 'fill' || name === 'stroke') {
      this.values[name] = value;
      return;
    }
    throw new Error(`unknown attribute: ${name}`);
  }

  /** SVG import preserves presentation metadata; CLI set deliberately remains a whitelist. */
  importSvgAttributes(attributes: Readonly<Record<string, string>>): void {
    const next = { ...this.values };
    for (const [name, value] of Object.entries(attributes)) {
      if (name === 'id') continue;
      if (this.geometry.has(name) || name === 'stroke-width') {
        const number = Shape.number(value, name);
        if ((this.geometry.get(name)?.nonnegative || name === 'stroke-width') && number < 0) {
          throw new Error(`${name} must be nonnegative`);
        }
        next[name] = String(number);
      } else {
        if (name === 'transform') Shape.validateTransform(value);
        next[name] = value;
      }
    }
    Object.assign(this.values, next);
  }

  private static validateTransform(value: string): void {
    let rest = value.trim();
    const number = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?';
    const argumentPattern = new RegExp(`^\\s*(${number})(?:(?:\\s*,\\s*|\\s+)(${number}))?\\s*$`);
    while (rest) {
      const operation = /^(translate|scale)\s*\(([^)]*)\)\s*/.exec(rest);
      if (!operation) throw new Error('unsupported transform: only translate and scale are supported');
      const arguments_ = argumentPattern.exec(operation[2]!);
      if (!arguments_) throw new Error('invalid transform');
      Shape.number(arguments_[1]!, 'transform');
      if (arguments_[2] !== undefined) Shape.number(arguments_[2], 'transform');
      rest = rest.slice(operation[0].length);
      if (rest.startsWith(',')) {
        rest = rest.slice(1).trimStart();
        if (!rest) throw new Error('invalid transform');
      }
    }
  }

  /** Snapshot the traversal so callers cannot mutate a container's internal array. */
  preorder(): readonly Shape[] {
    return Object.freeze([this, ...this.children.flatMap(child => [...child.preorder()])]);
  }

  move(dx: number, dy: number): void {
    Shape.number(dx, 'dx');
    Shape.number(dy, 'dy');
    this.transformGeometry((value, axis) => value + (axis === 'x' ? dx : axis === 'y' ? dy : 0));
  }

  scale(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) throw new Error('scale factor must be positive');
    this.transformGeometry(value => value * factor);
  }

  private transformGeometry(operation: (value: number, axis?: 'x' | 'y') => number): void {
    const pending: Array<{ shape: Shape; values: Record<string, string> }> = [];
    for (const shape of this.preorder()) {
      const values: Record<string, string> = {};
      for (const [name, specification] of shape.geometry) {
        const result = Shape.number(operation(Number(shape.values[name]), specification.axis), name);
        if (specification.nonnegative && result < 0) throw new Error(`${name} must be nonnegative`);
        values[name] = String(result);
      }
      pending.push({ shape, values });
    }
    // Validation of the whole subtree precedes every write, including overflow failures.
    for (const item of pending) Object.assign(item.shape.values, item.values);
  }

  protected styledSummary(geometry: string): string {
    const style = ['fill', 'stroke', 'stroke-width']
      .filter(name => this.values[name] !== undefined)
      .map(name => `${name}=${this.values[name]}`)
      .join(' ');
    return [this.label, geometry, style].filter(Boolean).join('  ');
  }

  abstract position(): string;
  abstract summary(): string;
  abstract clone(): Shape;
}
