import type { SvgDocument } from '../domain/SvgDocument.js';

/** Application-facing serialization contract, independent of an XML library. */
export interface SvgPort {
  encode(document: SvgDocument): string;
  decode(xml: string): { document: SvgDocument; warnings: string[] };
}
