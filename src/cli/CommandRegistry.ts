import type { EditorSession } from '../application/EditorSession.js';
import { AddToCommand } from '../application/commands/AddToCommand.js';
import { BackCommand } from '../application/commands/BackCommand.js';
import { CreateCommand } from '../application/commands/CreateCommand.js';
import { DeleteCommand } from '../application/commands/DeleteCommand.js';
import { FrontCommand } from '../application/commands/FrontCommand.js';
import { GroupCommand } from '../application/commands/GroupCommand.js';
import { MoveCommand } from '../application/commands/MoveCommand.js';
import { ScaleCommand } from '../application/commands/ScaleCommand.js';
import { SetCommand } from '../application/commands/SetCommand.js';
import { UngroupCommand } from '../application/commands/UngroupCommand.js';
import { DocumentPresenter } from './DocumentPresenter.js';
import { Tokenizer } from './Tokenizer.js';

export type CommandResult = { lines: readonly string[]; exit: boolean };
type Handler = (args: readonly string[]) => CommandResult;

/** The single command-name dispatch table; each edit has its own Command class. */
export class CommandRegistry {
  private readonly tokenizer = new Tokenizer();
  private readonly presenter = new DocumentPresenter();
  private readonly handlers: ReadonlyMap<string, Handler>;

  constructor(session: EditorSession) {
    this.handlers = new Map<string, Handler>([
      ['init', (args) => this.result(session.init(args))],
      ['read', (args) => this.result(session.read(args))],
      ['save', (args) => this.result(session.save(args))],
      ['canvas', (args) => this.result(session.canvas(args))],
      ['create', (args) => this.result(session.edit(new CreateCommand(args)))],
      ['delete', (args) => this.result(session.edit(new DeleteCommand(args)))],
      ['move', (args) => this.result(session.edit(new MoveCommand(args)))],
      ['scale', (args) => this.result(session.edit(new ScaleCommand(args)))],
      ['set', (args) => this.result(session.edit(new SetCommand(args)))],
      ['group', (args) => this.result(session.edit(new GroupCommand(args)))],
      ['ungroup', (args) => this.result(session.edit(new UngroupCommand(args)))],
      ['addto', (args) => this.result(session.edit(new AddToCommand(args)))],
      ['front', (args) => this.result(session.edit(new FrontCommand(args)))],
      ['back', (args) => this.result(session.edit(new BackCommand(args)))],
      ['tree', (args) => this.result(this.presenter.tree(session.document, args))],
      ['show', (args) => this.result(this.presenter.show(session.document, args))],
      ['help', (args) => this.help(args)],
      ['undo', (args) => this.result(session.undo(args))],
      ['redo', (args) => this.result(session.redo(args))],
      ['quit', (args) => this.exit(args)],
      ['exit', (args) => this.exit(args)],
    ]);
  }

  execute(line: string): CommandResult {
    try {
      const tokens = this.tokenizer.parse(line);
      const name = tokens[0];
      if (name === undefined) return this.result([]);
      const handler = this.handlers.get(name);
      if (handler === undefined) throw new Error(`unknown command: ${name} (type 'help' for commands)`);
      return handler(tokens.slice(1));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.result([`error: ${message.replace(/[\r\n]+/g, ' ')}`]);
    }
  }

  private result(lines: readonly string[]): CommandResult {
    return { lines, exit: false };
  }

  private exit(args: readonly string[]): CommandResult {
    if (args.length !== 0) throw new Error('usage: quit / exit');
    return { lines: [], exit: true };
  }

  private help(args: readonly string[]): CommandResult {
    if (args.length !== 0) throw new Error('usage: help');
    return this.result([
      'Document:',
      '  init [w] [h]                         new canvas (default 800x600)',
      '  read <file.svg>                       open SVG',
      '  save [file.svg]                       save SVG (remember last path)',
      '  canvas [w h]                          show or resize the canvas',
      'Edit (each supports undo/redo):',
      '  create <type> <id> [params…] [in <containerId>]',
      '    rect <id> <x> <y> <w> <h> [fill]',
      '    circle <id> <cx> <cy> <r> [fill]',
      '    ellipse <id> <cx> <cy> <rx> <ry> [fill]',
      '    line <id> <x1> <y1> <x2> <y2> [stroke]',
      '    text <id> <x> <y> "content"',
      '    g <id>',
      '  delete <id>',
      '  move <id> <dx> <dy>',
      '  scale <id> <factor>',
      '  set <id> <attr> <value>',
      '  group <newGid> <id1> [id2…]',
      '  ungroup <gid>',
      '  addto <gid> <id>',
      '  front <id> / back <id>',
      'Display: tree [id] / show <id> / help',
      'History: undo / redo',
      'Exit: quit / exit',
      'Double-quote values with spaces; escape quoted " and \\ with a backslash.',
      'Lines starting with # are comments. I/O and canvas resize reset undo/redo.',
    ]);
  }
}
