import { Shape } from './Shape.js';

export class Group extends Shape {
  private readonly members: Shape[] = [];
  constructor(id: string) { super(id); }
  get tag(): string { return 'g'; }
  override get children(): readonly Shape[] { return Object.freeze([...this.members]); }

  add(shape: Shape, index = this.members.length): void {
    if (shape.preorder().includes(this)) {
      throw new Error(`cannot group a container into its own descendant: ${shape.id}`);
    }
    if (!Number.isInteger(index) || index < 0 || index > this.members.length) throw new Error('invalid child index');
    const existing = new Set(this.preorder().map(item => item.id));
    const incoming = new Set<string>();
    for (const member of shape.preorder()) {
      if (existing.has(member.id) || incoming.has(member.id)) throw new Error(`id already exists: ${member.id}`);
      incoming.add(member.id);
    }
    this.members.splice(index, 0, shape);
  }

  remove(shape: Shape): void {
    const index = this.members.indexOf(shape);
    if (index < 0) throw new Error(`no such shape: ${shape.id}`);
    this.members.splice(index, 1);
  }

  position(): string { return ''; }
  summary(): string { return this.styledSummary(''); }
  clone(): Group {
    const group = this.copyAttributesTo(new Group(this.id));
    for (const member of this.members) group.add(member.clone());
    return group;
  }
}
