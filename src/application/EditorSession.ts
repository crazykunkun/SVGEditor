import { SvgDocument } from '../domain/SvgDocument.js';
import type { FilePort } from '../ports/FilePort.js';
import type { SvgPort } from '../ports/SvgPort.js';
import { CommandHistory } from './CommandHistory.js';
import type { EditCommand } from './commands/EditCommand.js';

/** Owns the active document, its path and the history boundary of I/O commands. */
export class EditorSession {
  private current: SvgDocument | undefined;
  private currentPath: string | undefined;
  private readonly history = new CommandHistory();
  private readonly files: FilePort;
  private readonly codec: SvgPort;

  constructor(files: FilePort, codec: SvgPort) {
    this.files = files;
    this.codec = codec;
  }

  get document(): SvgDocument {
    if (this.current === undefined) throw new Error("no document. use 'init' or 'read' first");
    return this.current;
  }

  init(args: readonly string[]): string[] {
    if (args.length > 2) throw new Error('usage: init [w] [h]');
    const width = args[0] === undefined ? 800 : this.number(args[0], 'width');
    const height = args[1] === undefined ? 600 : this.number(args[1], 'height');
    const next = new SvgDocument(width, height);
    this.current = next;
    this.currentPath = undefined;
    this.history.barrier();
    return [`canvas ${width}x${height} created`];
  }

  read(args: readonly string[]): string[] {
    this.arity(args, 1, 'read <file.svg>');
    const path = args[0]!;
    const source = this.files.read(path);
    const result = this.codec.decode(source);
    this.current = result.document;
    this.currentPath = path;
    this.history.barrier();
    return [...result.warnings, `read ${path} (${result.document.count} elements)`];
  }

  save(args: readonly string[]): string[] {
    const document = this.document;
    if (args.length > 1) throw new Error('usage: save [file.svg]');
    const path = args[0] ?? this.currentPath;
    if (path === undefined || !path) throw new Error('no file path. use save <file.svg>');
    const source = this.codec.encode(document);
    this.files.write(path, source);
    this.currentPath = path;
    this.history.barrier();
    return [`saved to ${path} (${document.count} elements)`];
  }

  canvas(args: readonly string[]): string[] {
    const document = this.document;
    if (args.length === 0) return [`canvas ${document.width}x${document.height}`];
    this.arity(args, 2, 'canvas [w h]');
    const width = this.number(args[0]!, 'width');
    const height = this.number(args[1]!, 'height');
    const next = document.clone();
    next.resize(width, height);
    this.current = next;
    this.history.barrier();
    return [`canvas resized to ${width}x${height}`];
  }

  edit(command: EditCommand): string[] {
    const result = this.history.execute(command, this.document);
    this.current = result.document;
    return [result.message];
  }

  undo(args: readonly string[]): string[] {
    this.document;
    this.arity(args, 0, 'undo');
    const result = this.history.undo();
    this.current = result.document;
    return [result.message];
  }

  redo(args: readonly string[]): string[] {
    this.document;
    this.arity(args, 0, 'redo');
    const result = this.history.redo();
    this.current = result.document;
    return [result.message];
  }

  private arity(args: readonly string[], count: number, syntax: string): void {
    if (args.length !== count) throw new Error(`usage: ${syntax}`);
  }

  private number(source: string, name: string): number {
    const value = Number(source);
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(source.trim()) || !Number.isFinite(value)) {
      throw new Error(`${name} must be a finite number`);
    }
    return value;
  }
}
