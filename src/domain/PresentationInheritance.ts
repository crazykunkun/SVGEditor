import { Shape } from './Shape.js';

/** Resolve the presentation changes needed when a group stops being an ancestor. */
export class PresentationInheritance {
  private static readonly inherited = new Set([
    'color', 'color-interpolation', 'color-interpolation-filters', 'color-rendering',
    'fill', 'fill-opacity', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width',
    'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
    'stroke-dasharray', 'stroke-dashoffset', 'font-family', 'font-size', 'font-style',
    'font-weight', 'font-stretch', 'font-variant', 'font-size-adjust', 'text-anchor',
    'dominant-baseline', 'alignment-baseline', 'direction', 'writing-mode',
    'letter-spacing', 'word-spacing', 'text-rendering', 'shape-rendering',
    'image-rendering', 'visibility', 'paint-order', 'pointer-events', 'cursor',
    'xml:space', 'xml:lang',
  ]);

  // These affect compositing as a whole, so distributing them among children is unsafe.
  private static readonly compositeDefaults = new Map([
    ['opacity', '1'], ['filter', 'none'], ['clip-path', 'none'], ['mask', 'none'],
    ['mix-blend-mode', 'normal'], ['isolation', 'auto'], ['display', 'inline'],
    ['overflow', 'visible'], ['transform-origin', '0 0'], ['transform-box', 'view-box'],
    ['vector-effect', 'none'],
  ]);

  static forUngroup(parent: Shape, child: Shape): Record<string, string> {
    const inherited = new Map<string, string>();
    for (const [name, value] of Object.entries(parent.attributes)) {
      if (this.inherited.has(name)) inherited.set(name, value);
      else if (this.compositeDefaults.has(name) && value.trim() !== this.compositeDefaults.get(name)) {
        this.reject(parent, name);
      }
    }
    for (const [name, value] of this.parseStyle(parent.attributes.style ?? '')) {
      if (this.inherited.has(name)) inherited.set(name, this.withoutImportant(value));
      else if (!this.compositeDefaults.has(name) || this.withoutImportant(value) !== this.compositeDefaults.get(name)) {
        this.reject(parent, name);
      }
    }

    const result: Record<string, string> = {};
    const childAttributes = child.attributes;
    const childStyle = this.parseStyle(childAttributes.style ?? '');
    let styleChanged = false;
    for (const [name, value] of inherited) {
      const styledValue = childStyle.get(name);
      if (styledValue !== undefined) {
        if (['inherit', 'unset'].includes(this.withoutImportant(styledValue))) {
          childStyle.set(name, `${value}${/!important\s*$/i.test(styledValue) ? ' !important' : ''}`);
          styleChanged = true;
        }
      } else if (childAttributes[name] === undefined || ['inherit', 'unset'].includes(childAttributes[name])) {
        result[name] = value;
      }
    }
    if (styleChanged) result.style = [...childStyle].map(([name, value]) => `${name}:${value}`).join(';');
    const transform = parent.attributes.transform?.trim();
    if (transform) result.transform = [transform, childAttributes.transform?.trim()].filter(Boolean).join(' ');
    return result;
  }

  private static withoutImportant(value: string): string { return value.replace(/\s*!important\s*$/i, '').trim(); }

  private static reject(parent: Shape, property: string): never {
    throw new Error(`cannot ungroup container with unsupported presentation: ${parent.id} (${property})`);
  }

  private static parseStyle(style: string): Map<string, string> {
    const declarations: string[] = [];
    let current = '';
    let quote = '';
    let depth = 0;
    let escaped = false;
    for (const character of style) {
      if (escaped) { current += character; escaped = false; continue; }
      if (character === '\\') { current += character; escaped = true; continue; }
      if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") quote = character;
      else if (character === '(') depth += 1;
      else if (character === ')') depth -= 1;
      else if (character === ';' && depth === 0) {
        declarations.push(current);
        current = '';
        continue;
      }
      current += character;
    }
    if (quote || depth !== 0 || escaped || style.includes('/*')) throw new Error('cannot ungroup container with unsupported style syntax');
    declarations.push(current);
    const result = new Map<string, string>();
    for (const declaration of declarations) {
      if (!declaration.trim()) continue;
      const separator = declaration.indexOf(':');
      if (separator < 1 || !declaration.slice(separator + 1).trim()) throw new Error('cannot ungroup container with unsupported style syntax');
      const rawName = declaration.slice(0, separator).trim();
      const name = rawName.startsWith('--') ? rawName : rawName.toLowerCase();
      const value = declaration.slice(separator + 1).trim();
      const previous = result.get(name);
      if (previous === undefined || !/!important\s*$/i.test(previous) || /!important\s*$/i.test(value)) result.set(name, value);
    }
    return result;
  }
}
