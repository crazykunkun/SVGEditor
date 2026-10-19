import assert from 'node:assert/strict';
import test from 'node:test';
import { SvgDocument } from '../src/domain/SvgDocument.js';
import { CommandHistory } from '../src/application/CommandHistory.js';
import { CreateCommand } from '../src/application/commands/CreateCommand.js';
import { DeleteCommand } from '../src/application/commands/DeleteCommand.js';
import { MoveCommand } from '../src/application/commands/MoveCommand.js';
import { ScaleCommand } from '../src/application/commands/ScaleCommand.js';
import { SetCommand } from '../src/application/commands/SetCommand.js';
import { GroupCommand } from '../src/application/commands/GroupCommand.js';
import { UngroupCommand } from '../src/application/commands/UngroupCommand.js';
import { AddToCommand } from '../src/application/commands/AddToCommand.js';
import { FrontCommand } from '../src/application/commands/FrontCommand.js';
import { BackCommand } from '../src/application/commands/BackCommand.js';
import { RejectingCommand } from './support/RejectingCommand.js';

test('execute, undo and redo each preserve independent document snapshots', () => {
  const history = new CommandHistory();
  const initial = new SvgDocument(800, 600);
  const created = history.execute(new CreateCommand(['rect', 'r', '10', '20', '30', '40']), initial);
  assert.equal(initial.children.length, 0);
  assert.equal(created.message, 'rect#r created');
  const moved = history.execute(new MoveCommand(['r', '5', '-2']), created.document);
  assert.equal(moved.message, 'rect#r moved to (15,18)');
  assert.equal(created.document.find('r').attributes.x, '10');
  const undone = history.undo();
  assert.equal(undone.message, 'rect#r moved back to (10,20)');
  assert.equal(undone.document.find('r').attributes.x, '10');
  undone.document.find('r').move(1000, 0);
  const redone = history.redo();
  assert.equal(redone.document.find('r').attributes.x, '15');
  assert.equal(history.undo().document.find('r').attributes.x, '10');
});

test('a successful edit after undo truncates the redo branch', () => {
  const history = new CommandHistory();
  let document = history.execute(new CreateCommand(['circle', 'c', '1', '2', '3']), new SvgDocument(20, 20)).document;
  document = history.execute(new MoveCommand(['c', '10', '20']), document).document;
  document = history.undo().document;
  document = history.execute(new ScaleCommand(['c', '2']), document).document;
  assert.equal(document.find('c').attributes.cx, '2');
  assert.equal(document.find('c').attributes.r, '6');
  assert.throws(() => history.redo(), /nothing to redo/);
  assert.equal(history.undo().document.find('c').attributes.r, '3');
});

test('failed commands cannot alter the document, undo stack or redo branch', () => {
  const history = new CommandHistory();
  let document = history.execute(new CreateCommand(['rect', 'r', '10', '20', '30', '40']), new SvgDocument(100, 100)).document;
  document = history.execute(new MoveCommand(['r', '5', '0']), document).document;
  document = history.undo().document;
  assert.throws(() => history.execute(new RejectingCommand(), document), /deliberately rejected/);
  assert.equal(document.find('r').attributes.x, '10');
  assert.equal(history.redo().document.find('r').attributes.x, '15');
});

test('I/O barriers block both directions until a successful edit', () => {
  const history = new CommandHistory();
  let document = history.execute(new CreateCommand(['g', 'root']), new SvgDocument(100, 100)).document;
  history.barrier();
  assert.throws(() => history.undo(), /^Error: undo not allowed after io command$/);
  assert.throws(() => history.redo(), /^Error: undo not allowed after io command$/);
  assert.throws(() => history.execute(new CreateCommand(['g', 'root']), document), /id already exists: root/);
  assert.throws(() => history.undo(), /undo not allowed after io command/);
  document = history.execute(new CreateCommand(['g', 'child', 'in', 'root']), document).document;
  assert.equal(document.find('root').children[0]?.id, 'child');
  document = history.undo().document;
  assert.equal(document.find('root').children.length, 0);
  assert.throws(() => history.undo(), /nothing to undo/);
  assert.equal(history.redo().document.find('root').children[0]?.id, 'child');
});

test('group and ungroup are single undo units preserving parents and ordering', () => {
  const history = new CommandHistory();
  let document = new SvgDocument(100, 100);
  const create = (args: string[]) => {
    document = history.execute(new CreateCommand(args), document).document;
  };
  create(['g', 'scene']);
  create(['rect', 'a', '0', '0', '1', '1', 'in', 'scene']);
  create(['rect', 'b', '1', '0', '1', '1', 'in', 'scene']);
  create(['rect', 'c', '2', '0', '1', '1', 'in', 'scene']);
  document = history.execute(new GroupCommand(['pair', 'a', 'c']), document).document;
  assert.deepEqual(document.find('pair').children.map((shape) => shape.id), ['a', 'c']);
  assert.equal(document.parentLabel('pair'), 'g#scene');
  document = history.undo().document;
  assert.deepEqual(document.find('scene').children.map((shape) => shape.id), ['a', 'b', 'c']);
  assert.throws(() => document.find('pair'), /no such shape/);
  document = history.redo().document;
  const groupedOrder = document.find('scene').children.map((shape) => shape.id);
  document = history.execute(new UngroupCommand(['pair']), document).document;
  assert.throws(() => document.find('pair'), /no such shape/);
  document = history.undo().document;
  assert.deepEqual(document.find('scene').children.map((shape) => shape.id), groupedOrder);
  assert.deepEqual(document.find('pair').children.map((shape) => shape.id), ['a', 'c']);
});

test('invalid ancestor grouping leaves existing history and trees untouched', () => {
  const history = new CommandHistory();
  let document = history.execute(new CreateCommand(['g', 'outer']), new SvgDocument(100, 100)).document;
  document = history.execute(new CreateCommand(['g', 'inner', 'in', 'outer']), document).document;
  assert.throws(() => history.execute(new GroupCommand(['bad', 'inner', 'outer']), document), /cannot group a container into its own descendant: outer/);
  assert.equal(document.parentLabel('inner'), 'g#outer');
  assert.throws(() => document.find('bad'), /no such shape/);
  document = history.undo().document;
  assert.equal(document.find('outer').children.length, 0);
});

test('delete undo restores a complete subtree at its original sibling index', () => {
  const history = new CommandHistory();
  let document = new SvgDocument(100, 100);
  for (const args of [['g', 'a'], ['g', 'middle'], ['g', 'z'], ['text', 't', '10', '20', 'hello', 'in', 'middle']]) {
    document = history.execute(new CreateCommand(args), document).document;
  }
  document = history.execute(new DeleteCommand(['middle']), document).document;
  assert.deepEqual(document.children.map((shape) => shape.id), ['a', 'z']);
  assert.throws(() => document.find('t'), /no such shape/);
  const undone = history.undo();
  assert.equal(undone.message, 'g#middle restored into svg');
  assert.deepEqual(undone.document.children.map((shape) => shape.id), ['a', 'middle', 'z']);
  assert.equal(undone.document.find('t').textContent, 'hello');
});

test('addto and z-order commands are reversible and remain scoped to their parent', () => {
  const history = new CommandHistory();
  let document = new SvgDocument(100, 100);
  for (const args of [['g', 'p'], ['g', 'a', 'in', 'p'], ['g', 'b', 'in', 'p'], ['g', 'c', 'in', 'p'], ['g', 'q']]) {
    document = history.execute(new CreateCommand(args), document).document;
  }
  document = history.execute(new FrontCommand(['a']), document).document;
  assert.deepEqual(document.find('p').children.map((shape) => shape.id), ['b', 'c', 'a']);
  document = history.execute(new BackCommand(['c']), document).document;
  assert.deepEqual(document.find('p').children.map((shape) => shape.id), ['c', 'b', 'a']);
  document = history.execute(new AddToCommand(['q', 'b']), document).document;
  assert.equal(document.parentLabel('b'), 'g#q');
  document = history.undo().document;
  assert.deepEqual(document.find('p').children.map((shape) => shape.id), ['c', 'b', 'a']);
  assert.equal(document.find('q').children.length, 0);
});

test('attribute and text edits restore absent and previous values', () => {
  const history = new CommandHistory();
  let document = history.execute(new CreateCommand(['text', 't', '1', '2', 'old content']), new SvgDocument(100, 100)).document;
  document = history.execute(new SetCommand(['t', 'text', 'new content']), document).document;
  const oldText = history.undo();
  assert.equal(oldText.document.find('t').textContent, 'old content');
  assert.equal(oldText.message, 'text#t updated: text="old content"');
  document = history.redo().document;
  document = history.execute(new SetCommand(['t', 'fill', 'red']), document).document;
  assert.equal(document.find('t').attributes.fill, 'red');
  const noFill = history.undo();
  assert.equal(noFill.document.find('t').attributes.fill, undefined);
  assert.match(noFill.message, /fill=\(unset\)/);
});

test('command validation rejects extra arguments and invalid numeric input', () => {
  const history = new CommandHistory();
  const document = history.execute(new CreateCommand(['circle', 'c', '10', '20', '3']), new SvgDocument(100, 100)).document;
  for (const command of [
    new MoveCommand(['c', '1', '2', 'extra']),
    new MoveCommand(['c', 'NaN', '0']),
    new MoveCommand(['c', '', '0']),
    new MoveCommand(['c', '0x10', '0']),
    new ScaleCommand(['c', 'Infinity']),
    new ScaleCommand(['c', '0']),
    new ScaleCommand(['c', '-1']),
    new DeleteCommand(['c', 'extra']),
    new GroupCommand(['empty']),
    new SetCommand(['c', 'r']),
    new SetCommand(['c', 'id', 'other']),
  ]) {
    assert.throws(() => history.execute(command, document));
    assert.equal(document.find('c').attributes.cx, '10');
  }
});
