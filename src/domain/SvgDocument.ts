import { Shape } from './Shape.js';
import { Group } from './Group.js';
import { PresentationInheritance } from './PresentationInheritance.js';

export class SvgDocument {
  private canvasWidth: number;
  private canvasHeight: number;
  private coordinateBox: string;
  private readonly metadata: Record<string, string>;
  private readonly roots: Shape[] = [];

  constructor(width = 800, height = 600, viewBox?: string, attributes: Record<string, string> = {}) {
    this.validateDimensions(width, height);
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.coordinateBox = viewBox === undefined ? `0 0 ${width} ${height}` : this.validateViewBox(viewBox);
    this.metadata = { ...attributes };
    for (const reserved of ['width', 'height', 'viewBox', 'xmlns']) delete this.metadata[reserved];
    if (this.metadata.id !== undefined) Shape.validateIdentifier(this.metadata.id);
  }

  get width(): number { return this.canvasWidth; }
  get height(): number { return this.canvasHeight; }
  get viewBox(): string { return this.coordinateBox; }
  get attributes(): Readonly<Record<string, string>> { return Object.freeze({ ...this.metadata }); }
  get children(): readonly Shape[] { return Object.freeze([...this.roots]); }
  get count(): number { return this.preorder().length; }

  resize(width: number, height: number): void {
    this.validateDimensions(width, height);
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.coordinateBox = `0 0 ${width} ${height}`;
  }

  find(id: string): Shape {
    const shape = this.preorder().find(item => item.id === id);
    if (!shape) throw new Error(`no such shape: ${id}`);
    return shape;
  }

  findContainer(id: string): Group {
    const shape = this.preorder().find(item => item.id === id);
    if (!shape) throw new Error(`no such container: ${id}`);
    if (!(shape instanceof Group)) throw new Error(`not a container: ${id}`);
    return shape;
  }

  insert(shape: Shape, parentId?: string, index?: number): void {
    const parent = parentId === undefined ? undefined : this.findContainer(parentId);
    const all = this.allIds();
    const incoming = new Set<string>();
    for (const member of shape.preorder()) {
      if (this.metadata.id === member.id || all.has(member.id) || incoming.has(member.id)) throw new Error(`id already exists: ${member.id}`);
      incoming.add(member.id);
    }
    this.attach(shape, parent, index);
  }

  remove(id: string): Shape {
    const shape = this.find(id);
    this.detach(shape, this.parent(shape));
    return shape;
  }

  group(newId: string, ids: readonly string[]): Group {
    const group = new Group(newId);
    if (this.metadata.id === newId || this.allIds().has(newId)) throw new Error(`id already exists: ${newId}`);
    if (ids.length === 0) throw new Error('group requires at least one shape');
    const requested = new Set<string>();
    for (const id of ids) {
      this.find(id);
      if (requested.has(id)) throw new Error(`duplicate shape: ${id}`);
      requested.add(id);
    }
    const selected = this.preorder().filter(shape => requested.has(shape.id));
    for (const shape of selected) {
      if (shape.children.some(child => child.preorder().some(descendant => requested.has(descendant.id)))) {
        throw new Error(`cannot group a container into its own descendant: ${shape.id}`);
      }
    }
    // Stable document preorder resolves arguments from different parents deterministically.
    const anchor = selected[0]!;
    const parent = this.parent(anchor);
    const index = this.siblings(parent).indexOf(anchor);
    for (const shape of selected) this.detach(shape, this.parent(shape));
    for (const shape of selected) group.add(shape);
    this.attach(group, parent, index);
    return group;
  }

  ungroup(id: string): void {
    const group = this.findContainer(id);
    const parent = this.parent(group);
    if (!parent) throw new Error(`cannot ungroup top-level container: ${id}`);
    const index = parent.children.indexOf(group);
    const children = [...group.children];
    const promoted = children.map(child => ({ child, attributes: PresentationInheritance.forUngroup(group, child) }));
    for (const item of promoted) item.child.clone().importSvgAttributes(item.attributes);
    for (const item of promoted) item.child.importSvgAttributes(item.attributes);
    parent.remove(group);
    for (const [offset, child] of children.entries()) {
      group.remove(child);
      parent.add(child, index + offset);
    }
  }

  addTo(groupId: string, id: string): void {
    const target = this.findContainer(groupId);
    const shape = this.find(id);
    if (shape.preorder().includes(target)) {
      throw new Error(`cannot group a container into its own descendant: ${shape.id}`);
    }
    this.detach(shape, this.parent(shape));
    target.add(shape);
  }

  reorder(id: string, front: boolean): void {
    const shape = this.find(id);
    const parent = this.parent(shape);
    this.detach(shape, parent);
    this.attach(shape, parent, front ? undefined : 0);
  }

  parentLabel(id: string): string {
    return this.parent(this.find(id))?.label ?? 'svg';
  }

  clone(): SvgDocument {
    const document = new SvgDocument(this.width, this.height, this.viewBox, this.metadata);
    for (const root of this.roots) document.insert(root.clone());
    return document;
  }

  allIds(): ReadonlySet<string> { return new Set(this.preorder().map(shape => shape.id)); }

  private preorder(): Shape[] { return this.roots.flatMap(shape => [...shape.preorder()]); }

  private parent(shape: Shape): Group | undefined {
    return this.preorder().find(item => item instanceof Group && item.children.includes(shape)) as Group | undefined;
  }

  private siblings(parent?: Group): readonly Shape[] { return parent ? parent.children : this.roots; }

  private attach(shape: Shape, parent?: Group, index = this.siblings(parent).length): void {
    if (!Number.isInteger(index) || index < 0 || index > this.siblings(parent).length) throw new Error('invalid child index');
    if (parent) parent.add(shape, index);
    else this.roots.splice(index, 0, shape);
  }

  private detach(shape: Shape, parent?: Group): void {
    if (parent) parent.remove(shape);
    else this.roots.splice(this.roots.indexOf(shape), 1);
  }

  private validateDimensions(width: number, height: number): void {
    Shape.number(width, 'width');
    Shape.number(height, 'height');
    if (width < 0 || height < 0) throw new Error('canvas dimensions must be nonnegative');
  }

  private validateViewBox(value: string): string {
    const values = value.trim().split(/[\s,]+/);
    if (values.length !== 4) throw new Error('invalid viewBox');
    const numbers = values.map(part => Shape.number(part, 'viewBox'));
    if (numbers[2]! < 0 || numbers[3]! < 0) throw new Error('viewBox dimensions must be nonnegative');
    return numbers.join(' ');
  }
}
