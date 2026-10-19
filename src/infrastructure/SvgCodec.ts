import { XMLParser, XMLValidator } from "fast-xml-parser";
import { Group } from "../domain/Group.js";
import { Shape } from "../domain/Shape.js";
import { ShapeFactory } from "../domain/ShapeFactory.js";
import { SvgDocument } from "../domain/SvgDocument.js";

type XmlNode = Record<string, unknown>;
type SvgElement = {
  name: string;
  attributes: Record<string, string>;
  children: SvgElement[];
  text: string;
};

/**
 * SVG subset: the factory's six shapes, nested groups, plain text/CDATA, numeric
 * canvas dimensions (also px), and arbitrary retained attributes. Comments are
 * presentation metadata. DTDs, entity declarations, foreign namespaces, nested
 * markup in text, processing instructions, and unknown elements are rejected.
 */
export class SvgCodec {
  private readonly namespace = "http://www.w3.org/2000/svg";
  private readonly factory = new ShapeFactory();
  private readonly parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    processEntities: false,
    cdataPropName: "#cdata",
    commentPropName: "#comment",
    ignoreDeclaration: false,
    ignorePiTags: false,
  });

  encode(document: SvgDocument): string {
    const attributes: Record<string, string> = {
      xmlns: this.namespace,
      width: String(document.width),
      height: String(document.height),
      viewBox: document.viewBox,
      ...document.attributes,
    };
    const rootId = attributes.id;
    if (rootId !== undefined && document.allIds().has(rootId)) {
      throw new Error(`id already exists: ${rootId}`);
    }
    const children = document.children.map((shape) => this.encodeShape(shape, 1)).join("\n");
    const output = `<?xml version="1.0" encoding="UTF-8"?>\n<svg${this.encodeAttributes(attributes)}>\n${children}${children ? "\n" : ""}</svg>\n`;
    if (XMLValidator.validate(output) !== true) throw new Error("invalid SVG attributes");
    return output;
  }

  decode(xml: string): { document: SvgDocument; warnings: string[] } {
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
      throw new Error("SVG DTDs and entity declarations are not supported");
    }
    this.validateCharacters(xml);
    const validation = XMLValidator.validate(xml, { allowBooleanAttributes: false });
    if (validation !== true) throw new Error(`invalid SVG XML: ${validation.err.msg}`);
    let nodes: XmlNode[];
    try {
      nodes = this.parser.parse(xml) as XmlNode[];
    } catch {
      throw new Error("invalid SVG XML");
    }
    const roots = nodes.filter((node) => !this.isMetadata(node, true));
    if (roots.length !== 1 || !roots[0]) throw new Error("SVG must have exactly one root element");
    const root = this.parseElement(roots[0], new Map([["xml", "http://www.w3.org/XML/1998/namespace"]]));
    if (root.name !== "svg") throw new Error("SVG root element must be <svg>");
    if (root.text.trim()) throw new Error("<svg> cannot contain text");

    const reserved = new Set<string>();
    this.reserveIds(root, reserved);
    const viewBox = root.attributes.viewBox;
    const coordinates = viewBox === undefined ? undefined : this.parseViewBox(viewBox);
    const width = root.attributes.width === undefined
      ? (coordinates?.[2] ?? 800)
      : this.parseDimension(root.attributes.width, "width");
    const height = root.attributes.height === undefined
      ? (coordinates?.[3] ?? 600)
      : this.parseDimension(root.attributes.height, "height");
    const { width: ignoredWidth, height: ignoredHeight, viewBox: ignoredViewBox, ...attributes } = root.attributes;
    const document = new SvgDocument(width, height, viewBox, attributes);
    const warnings: string[] = [];
    const sequences = new Map<string, number>();
    for (const child of root.children) {
      document.insert(this.decodeShape(child, reserved, sequences, warnings));
    }
    return { document, warnings };
  }

  private encodeShape(shape: Shape, depth: number): string {
    const indentation = "  ".repeat(depth);
    const opening = `${indentation}<${shape.tag}${this.encodeAttributes({ id: shape.id, ...shape.attributes })}`;
    if (shape.textContent !== undefined) {
      return `${opening}>${this.escapeText(shape.textContent)}</${shape.tag}>`;
    }
    if (shape.children.length === 0) return `${opening}/>`;
    const children = shape.children.map((child) => this.encodeShape(child, depth + 1)).join("\n");
    return `${opening}>\n${children}\n${indentation}</${shape.tag}>`;
  }

  private encodeAttributes(attributes: Readonly<Record<string, string>>): string {
    return Object.entries(attributes)
      .map(([name, value]) => {
        this.validateAttribute(name, value);
        return ` ${name}="${this.escapeText(value)
          .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
          .replace(/\n/g, "&#10;").replace(/\t/g, "&#9;")}"`;
      })
      .join("");
  }

  private escapeText(value: string): string {
    this.validateCharacters(value);
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#13;");
  }

  private parseElement(node: XmlNode, inherited: ReadonlyMap<string, string>): SvgElement {
    const keys = Object.keys(node).filter((key) => key !== ":@");
    const qualifiedName = keys[0];
    if (keys.length !== 1 || !qualifiedName || qualifiedName.startsWith("#") || qualifiedName.startsWith("?")) {
      throw new Error("unsupported SVG XML structure");
    }
    const rawAttributes = (node[":@"] ?? {}) as Record<string, unknown>;
    const namespaces = new Map(inherited);
    for (const [name, value] of Object.entries(rawAttributes)) {
      if (name === "xmlns") namespaces.set("", this.decodeEntities(String(value)));
      if (name.startsWith("xmlns:")) namespaces.set(name.slice(6), this.decodeEntities(String(value)));
    }
    const parts = qualifiedName.split(":");
    const localName = parts.at(-1)!;
    const uri = namespaces.get(parts.length === 1 ? "" : parts[0]!);
    if (parts.length > 2 || (parts.length === 2 && uri === undefined) || (uri !== undefined && uri !== this.namespace)) {
      throw new Error(`unsupported SVG namespace: ${qualifiedName}`);
    }
    const attributes: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [name, value] of Object.entries(rawAttributes)) {
      if (name === "xmlns" || name.startsWith("xmlns:")) continue;
      if (name.includes(":") && !["xml:space", "xml:lang"].includes(name)) {
        throw new Error(`unsupported namespaced SVG attribute: ${name}`);
      }
      const decoded = this.decodeEntities(String(value));
      this.validateAttribute(name, decoded);
      attributes[name] = decoded;
    }
    const result: SvgElement = { name: localName, attributes, children: [], text: "" };
    const content = node[qualifiedName];
    if (!Array.isArray(content)) throw new Error("unsupported SVG XML structure");
    for (const child of content as XmlNode[]) {
      if ("#text" in child) {
        result.text += this.decodeEntities(String(child["#text"]));
      } else if ("#cdata" in child) {
        const data = child["#cdata"];
        if (!Array.isArray(data)) throw new Error("invalid SVG CDATA");
        result.text += (data as XmlNode[]).map((part) => String(part["#text"] ?? "")).join("");
      } else if (!this.isMetadata(child, false)) {
        result.children.push(this.parseElement(child, namespaces));
      }
    }
    return result;
  }

  private isMetadata(node: XmlNode, topLevel: boolean): boolean {
    if ("#comment" in node) return true;
    if (topLevel && "?xml" in node) return true;
    if (topLevel && "#text" in node && String(node["#text"]).trim() === "") return true;
    return false;
  }

  private reserveIds(element: SvgElement, ids: Set<string>): void {
    const id = element.attributes.id;
    if (id !== undefined) {
      if (id.trim() === "") throw new Error("SVG id must not be empty");
      if (ids.has(id)) throw new Error(`id already exists: ${id}`);
      ids.add(id);
    }
    for (const child of element.children) this.reserveIds(child, ids);
  }

  private decodeShape(element: SvgElement, reserved: Set<string>, sequences: Map<string, number>, warnings: string[]): Shape {
    let id = element.attributes.id;
    if (id === undefined) {
      let sequence = sequences.get(element.name) ?? 1;
      while (reserved.has(`${element.name}${sequence}`)) sequence += 1;
      id = `${element.name}${sequence}`;
      sequences.set(element.name, sequence + 1);
      reserved.add(id);
      warnings.push(`warning: assigned id ${id} to unnamed <${element.name}>`);
    }
    const { id: ignoredId, ...attributes } = element.attributes;
    const shape = this.factory.fromSvg(element.name, id, attributes, element.text);
    if (element.children.length > 0 && !(shape instanceof Group)) {
      throw new Error(`<${element.name}> cannot contain child elements`);
    }
    if (shape instanceof Group) {
      for (const child of element.children) shape.add(this.decodeShape(child, reserved, sequences, warnings));
    }
    return shape;
  }

  private parseDimension(value: string, name: string): number {
    const match = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(?:px)?\s*$/.exec(value);
    const number = match?.[1] === undefined ? Number.NaN : Number(match[1]);
    if (!Number.isFinite(number) || number < 0) throw new Error(`invalid SVG ${name}: ${value}`);
    return number;
  }

  private parseViewBox(value: string): [number, number, number, number] {
    const tokens = value.trim().split(/[\s,]+/);
    const values = tokens.map((token) => Number(token));
    if (tokens.length !== 4 || tokens.some((token) => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token))
      || values.some((number) => !Number.isFinite(number)) || values[2]! < 0 || values[3]! < 0) {
      throw new Error(`invalid SVG viewBox: ${value}`);
    }
    return values as [number, number, number, number];
  }

  private decodeEntities(value: string): string {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    return value.replace(/&(?:#x([\da-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos));|&/g, (entity, hex: string | undefined, decimal: string | undefined, name: string | undefined) => {
      if (entity === "&") throw new Error("invalid or unsupported XML entity");
      if (name !== undefined) return named[name]!;
      const codePoint = Number.parseInt(hex ?? decimal!, hex === undefined ? 10 : 16);
      if (!this.isXmlCharacter(codePoint)) throw new Error("invalid XML character reference");
      return String.fromCodePoint(codePoint);
    });
  }

  private validateAttribute(name: string, value: string): void {
    if (/^on/i.test(name)) throw new Error(`SVG event attributes are not supported: ${name}`);
    const compact = value.replace(/[\u0000-\u0020]/g, "");
    if (/^(?:href|src)$/i.test(name) && /^(?:javascript|vbscript):/i.test(compact)) {
      throw new Error(`unsafe SVG URL in attribute: ${name}`);
    }
    const cssAttributes = new Set(["style", "fill", "stroke", "filter", "clip-path", "mask", "cursor"]);
    if (cssAttributes.has(name.toLowerCase())) {
      // CSS escapes/comments can disguise URL tokens. This editor accepts plain CSS
      // declarations, not a full CSS grammar or a general-purpose SVG sanitizer.
      if (/\\|\/\*/.test(value) || /(?:expression|@import)\s*\(?/i.test(value)) {
        throw new Error(`unsupported CSS in SVG attribute: ${name}`);
      }
      for (const match of value.matchAll(/url\s*\(([^)]*)\)/gi)) {
        const target = match[1]!.trim().replace(/^(['"])(.*)\1$/, "$2").trim();
        if (!/^#[^\s]+$/.test(target)) throw new Error(`unsafe SVG URL in attribute: ${name}`);
      }
    }
  }

  private validateCharacters(value: string): void {
    for (const character of value) {
      if (!this.isXmlCharacter(character.codePointAt(0)!)) throw new Error("invalid XML character");
    }
  }

  private isXmlCharacter(value: number): boolean {
    return value === 0x9 || value === 0xa || value === 0xd || (value >= 0x20 && value <= 0xd7ff)
      || (value >= 0xe000 && value <= 0xfffd) || (value >= 0x10000 && value <= 0x10ffff);
  }
}
