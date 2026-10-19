import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { EditorSession } from '../src/application/EditorSession.js';
import { CommandRegistry } from '../src/cli/CommandRegistry.js';
import { Tokenizer } from '../src/cli/Tokenizer.js';
import { SvgCodec } from '../src/infrastructure/SvgCodec.js';
import { MemoryFiles } from './support/MemoryFiles.js';

test('tokenizer retains Unicode, empty strings, colors and escaped quotes/backslashes', () => {
  const tokenizer = new Tokenizer();
  assert.deepEqual(tokenizer.parse('  # a comment "'), []);
  assert.deepEqual(tokenizer.parse('   '), []);
  assert.deepEqual(tokenizer.parse('create text t 1 2 "你好 世界"'), ['create', 'text', 't', '1', '2', '你好 世界']);
  assert.deepEqual(tokenizer.parse('set t text ""'), ['set', 't', 'text', '']);
  assert.deepEqual(tokenizer.parse(String.raw`set t text "say \"hello\" \\ path"`), ['set', 't', 'text', 'say "hello" \\ path']);
  assert.deepEqual(tokenizer.parse('set r fill #aabbcc'), ['set', 'r', 'fill', '#aabbcc']);
  assert.throws(() => tokenizer.parse('set t text "open'), /unterminated double quote/);
});

test('help works before initialization and document commands report the document guard', () => {
  const commands = new CommandRegistry(new EditorSession(new MemoryFiles(), new SvgCodec()));
  assert.match(commands.execute('help').lines.join('\n'), /create <type>/);
  for (const command of ['canvas', 'save', 'tree', 'show r', 'create g root', 'delete r', 'move r 1 1', 'scale r 2', 'set r fill red', 'group g r', 'ungroup g', 'addto g r', 'front r', 'back r', 'undo', 'redo']) {
    assert.deepEqual(commands.execute(command).lines, ["error: no document. use 'init' or 'read' first"]);
  }
  assert.match(commands.execute('nonsense').lines[0]!, /^error: unknown command: nonsense/);
  assert.deepEqual(commands.execute('init').lines, ['canvas 800x600 created']);
  assert.deepEqual(commands.execute('init 42').lines, ['canvas 42x600 created']);
});

test('a complete editing session exercises all required commands and Composite behavior', () => {
  const files = new MemoryFiles();
  const session = new EditorSession(files, new SvgCodec());
  const commands = new CommandRegistry(session);
  const run = (line: string) => {
    const result = commands.execute(line);
    assert.equal(result.lines.some((value) => value.startsWith('error:')), false, `${line}: ${result.lines.join('\n')}`);
    return result.lines;
  };
  run('init 320 200');
  run('create g scene');
  run('create g one in scene');
  run('create g two in scene');
  run('create rect r 10 20 30 40 #eee in one');
  run('create circle c 50 60 7 red in one');
  run('create ellipse e 90 80 5 3 blue in two');
  run('create line l 1 2 3 4 black in scene');
  run('create text t 10 20 "中文 & <标题>" in two');
  const tree = run('tree').join('\n');
  assert.match(tree, /^svg \(320x200\)\n└── g#scene/);
  assert.match(tree, /│   ├── rect#r  x=10 y=20 w=30 h=40\s+fill=#eee/);
  assert.match(run('show r').join('\n'), /rect#r  parent=g#one\n  x=10 y=20 width=30 height=40\n  fill=#eee/);
  assert.deepEqual(run('move one 2 3'), ['g#one moved by (2,3)']);
  assert.equal(session.document.find('c').attributes.cy, '63');
  run('scale one 2');
  assert.equal(session.document.find('r').attributes.x, '24');
  assert.equal(session.document.find('c').attributes.r, '14');
  run('set t text ""');
  assert.equal(session.document.find('t').textContent, '');
  run('set r fill #123456');
  run('group pair r c');
  assert.deepEqual(session.document.find('pair').children.map((shape) => shape.id), ['r', 'c']);
  run('ungroup pair');
  run('addto two c');
  assert.equal(session.document.parentLabel('c'), 'g#two');
  run('front r');
  run('back r');
  run('delete e');
  run('undo');
  assert.equal(session.document.find('e').tag, 'ellipse');
  run('redo');
  assert.throws(() => session.document.find('e'), /no such shape/);
  run('help');
  run('save "绘图 output.svg"');
  assert.match(files.read('绘图 output.svg'), /id="r"/);
  assert.deepEqual(commands.execute('undo').lines, ['error: undo not allowed after io command']);
  run('read "绘图 output.svg"');
  assert.equal(session.document.find('t').textContent, '');
  run('save');
  run('canvas 640 480');
  assert.deepEqual(run('canvas'), ['canvas 640x480']);
  assert.deepEqual(commands.execute('redo').lines, ['error: undo not allowed after io command']);
});

test('display commands leave undo/redo intact and top-level ungroup is rejected', () => {
  const session = new EditorSession(new MemoryFiles(), new SvgCodec());
  const commands = new CommandRegistry(session);
  for (const line of ['init', 'create g scene', 'create text t 0 0 "in" in scene', 'move t 2 3', 'undo', 'tree scene', 'show t', 'help', 'canvas']) commands.execute(line);
  assert.deepEqual(commands.execute('redo').lines, ['text#t moved to (2,3)']);
  assert.equal(session.document.find('t').textContent, 'in');
  assert.deepEqual(commands.execute('ungroup scene').lines, ['error: cannot ungroup top-level container: scene']);
  assert.deepEqual(commands.execute('undo').lines, ['text#t moved back to (0,0)']);
});

test('read warnings publish only on success; failed reads/writes preserve path, document and history', () => {
  const good = '<svg width="100" height="80"><rect id="r" x="1" y="2" width="3" height="4"/></svg>';
  const files = new MemoryFiles({ 'original.svg': good, 'unnamed.svg': '<svg><rect/></svg>', 'bad.svg': '<svg><rect/><hexagon/></svg>', 'broken.svg': '<svg><g></svg>' });
  files.rejectWrite('forbidden.svg');
  const session = new EditorSession(files, new SvgCodec());
  const commands = new CommandRegistry(session);
  assert.deepEqual(commands.execute('read unnamed.svg').lines, ['warning: assigned id rect1 to unnamed <rect>', 'read unnamed.svg (1 elements)']);
  commands.execute('read original.svg');
  commands.execute('move r 4 0');
  const failed = commands.execute('read bad.svg').lines;
  assert.equal(failed.length, 1);
  assert.match(failed[0]!, /^error: unknown shape type: hexagon/);
  assert.equal(session.document.find('r').attributes.x, '5');
  assert.match(commands.execute('read broken.svg').lines[0]!, /^error: invalid SVG XML:/);
  assert.deepEqual(commands.execute('read missing.svg').lines, ['error: cannot read file: missing.svg']);
  assert.deepEqual(commands.execute('save forbidden.svg').lines, ['error: cannot write file: forbidden.svg']);
  assert.deepEqual(commands.execute('undo').lines, ['rect#r moved back to (1,2)']);
  commands.execute('redo');
  assert.deepEqual(commands.execute('save').lines, ['saved to original.svg (1 elements)']);
  assert.equal(new SvgCodec().decode(files.read('original.svg')).document.find('r').attributes.x, '5');
  commands.execute('save copied.svg');
  commands.execute('move r 1 0');
  assert.deepEqual(commands.execute('save').lines, ['saved to copied.svg (1 elements)']);
  assert.equal(new SvgCodec().decode(files.read('copied.svg')).document.find('r').attributes.x, '6');
  assert.equal(new SvgCodec().decode(files.read('original.svg')).document.find('r').attributes.x, '5');
});

test('init clears the remembered save path, and each successful I/O operation is a history barrier', () => {
  const files = new MemoryFiles({ 'input.svg': '<svg><g id="loaded"/></svg>' });
  const session = new EditorSession(files, new SvgCodec());
  const commands = new CommandRegistry(session);
  commands.execute('init');
  for (const operation of ['save output.svg', 'read input.svg', 'canvas 400 300', 'init 200 100']) {
    commands.execute('create g editable');
    const result = commands.execute(operation);
    assert.equal(result.lines.some((line) => line.startsWith('error:')), false);
    assert.deepEqual(commands.execute('undo').lines, ['error: undo not allowed after io command']);
    assert.deepEqual(commands.execute('redo').lines, ['error: undo not allowed after io command']);
    if (operation === 'canvas 400 300') commands.execute('delete editable');
  }
  assert.deepEqual(commands.execute('save').lines, ['error: no file path. use save <file.svg>']);
});

test('bad arguments, syntax and finite-number validation leave the redo branch unchanged', () => {
  const session = new EditorSession(new MemoryFiles(), new SvgCodec());
  const commands = new CommandRegistry(session);
  for (const line of ['init', 'create rect r 1 2 3 4', 'move r 5 0', 'undo']) commands.execute(line);
  const badCommands = [
    'init 1 2 3', 'init NaN', 'init -1 2', 'read', 'read a b', 'save a b', 'canvas 10', 'canvas Infinity 10', 'canvas 10 -2',
    'create', 'create box b 0 0 1 1 "title"', 'create g r', 'create rect bad 0 0 1', 'create g bad in missing', 'create g bad in r',
    'delete r extra', 'move r 1', 'move r 0x10 1', 'move r NaN 1', 'move r 1e309 0', 'scale r 0', 'scale r -2', 'scale r Infinity',
    'set r fill', 'set r id new', 'group empty', 'ungroup r extra', 'addto r', 'front r extra', 'back',
    'tree r extra', 'show', 'help extra', 'undo extra', 'redo extra', 'quit extra', 'set r fill "unterminated',
  ];
  for (const line of badCommands) {
    const result = commands.execute(line);
    assert.equal(result.lines.length, 1, line);
    assert.match(result.lines[0]!, /^error:/, line);
    assert.equal(session.document.find('r').attributes.x, '1', line);
  }
  assert.deepEqual(commands.execute('redo').lines, ['rect#r moved to (6,2)']);
  const multilinePath = commands.execute('read "missing\nfile.svg"').lines[0]!;
  assert.equal(multilinePath.includes('\n'), false);
  assert.match(multilinePath, /^error: cannot read file: missing file.svg$/);
});

test('real CLI reads piped commands until EOF and round-trips Unicode with spaced paths', () => {
  const folder = mkdtempSync(join(tmpdir(), 'svg-cli-test-'));
  try {
    const svg = join(folder, '有 空格.svg');
    const mainJs = fileURLToPath(new URL('../src/main.js', import.meta.url));
    const main = existsSync(mainJs) ? mainJs : fileURLToPath(new URL('../src/main.ts', import.meta.url));
    const options = main.endsWith('.ts') ? ['--import', 'tsx'] : [];
    const processResult = spawnSync(process.execPath, [...options, main], {
      input: `# script from stdin\ninit 80 40\ncreate text t 5 10 "你好 & <世界>"\nsave "${svg}"\nread "${svg}"\ntree\n`,
      encoding: 'utf8', timeout: 10000,
    });
    assert.equal(processResult.error, undefined);
    assert.equal(processResult.status, 0, processResult.stderr);
    assert.equal(processResult.stderr, '');
    assert.match(processResult.stdout, /svg-editor 0\.1/);
    assert.match(processResult.stdout, /text#t.*你好 & <世界>/);
    assert.equal(processResult.stdout.includes('svg>'), false);
    assert.match(readFileSync(svg, 'utf8'), /你好 &amp; &lt;世界&gt;/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('real CLI supports --script, startup help, script error status and exit commands', () => {
  const folder = mkdtempSync(join(tmpdir(), 'svg-cli-script-'));
  try {
    const mainJs = fileURLToPath(new URL('../src/main.js', import.meta.url));
    const main = existsSync(mainJs) ? mainJs : fileURLToPath(new URL('../src/main.ts', import.meta.url));
    const options = main.endsWith('.ts') ? ['--import', 'tsx'] : [];
    const script = join(folder, 'commands with spaces.txt');
    writeFileSync(script, '# comment\r\ninit\r\ncreate g root\r\nmove absent 1 1\r\ntree\r\nexit\r\ncreate g afterExit\r\n');
    const result = spawnSync(process.execPath, [...options, main, '--script', script], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /error: no such shape: absent/);
    assert.match(result.stdout, /└── g#root/);
    assert.equal(result.stdout.includes('afterExit'), false);
    const help = spawnSync(process.execPath, [...options, main, '--help'], { encoding: 'utf8', timeout: 10000 });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Document:/);
    const badOption = spawnSync(process.execPath, [...options, main, '--invalid'], { encoding: 'utf8', timeout: 10000 });
    assert.equal(badOption.status, 1);
    assert.match(badOption.stdout, /^error: usage:/);
    const missing = spawnSync(process.execPath, [...options, main, '--script', join(folder, 'missing')], { encoding: 'utf8', timeout: 10000 });
    assert.equal(missing.status, 1);
    assert.match(missing.stdout, /error: cannot read file:/);
    const quit = spawnSync(process.execPath, [...options, main], { input: 'init\nquit\ncreate g afterQuit\n', encoding: 'utf8', timeout: 10000 });
    assert.equal(quit.status, 0);
    assert.equal(quit.stdout.includes('afterQuit'), false);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
