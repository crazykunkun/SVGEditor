import assert from 'node:assert/strict';
import test from 'node:test';
import { Circle, Ellipse, Group, Line, Rect, ShapeFactory, SvgDocument, Text } from '../src/domain/index.js';

test('factory creates six polymorphic types without adding optional styles', () => {
  const factory = new ShapeFactory();
  const shapes = [
    factory.create('rect', 'r', ['1', '2', '3', '4']),
    factory.create('circle', 'c', ['1', '2', '3']),
    factory.create('ellipse', 'e', ['1', '2', '3', '4']),
    factory.create('line', 'l', ['1', '2', '3', '4']),
    factory.create('text', 't', ['1', '2', 'hello world']),
    factory.create('g', 'g', []),
  ];
  assert.deepEqual(shapes.map(shape => shape.tag), ['rect', 'circle', 'ellipse', 'line', 'text', 'g']);
  for (const shape of shapes) {
    assert.equal(shape.attributes.fill, undefined);
    assert.equal(shape.attributes.stroke, undefined);
    assert.equal(shape.clone().summary(), shape.summary());
  }
  assert.equal(shapes[4]!.textContent, 'hello world');
  assert.throws(() => factory.create('box', 'n1', []), { message: 'unknown shape type: box (is the plugin loaded?)' });
  assert.throws(() => factory.create('rect', 'r', ['1']), /invalid parameters/);
  assert.throws(() => factory.create('g', 'g', ['extra']), /invalid parameters/);
});

test('all geometric properties scale and move with the SVG coordinate convention', () => {
  const group = new Group('scene');
  const rect = new Rect('r', 10, 20, 30, 40, 'red');
  const nested = new Group('nested');
  const circle = new Circle('c', 5, 6, 7);
  const ellipse = new Ellipse('e', 2, 3, 4, 5);
  const line = new Line('l', 1, 2, 3, 4, 'black');
  const text = new Text('t', 5, 10, '开始');
  nested.add(circle);
  nested.add(ellipse);
  group.add(rect);
  group.add(nested);
  group.add(line);
  group.add(text);
  group.setAttribute('fill', 'blue');
  rect.setAttribute('stroke-width', '2');
  group.move(10, -5);
  group.scale(2);
  assert.deepEqual(rect.attributes, { x: '40', y: '30', width: '60', height: '80', fill: 'red', 'stroke-width': '2' });
  assert.deepEqual(circle.attributes, { cx: '30', cy: '2', r: '14' });
  assert.deepEqual(ellipse.attributes, { cx: '24', cy: '-4', rx: '8', ry: '10' });
  assert.deepEqual(line.attributes, { x1: '22', y1: '-6', x2: '26', y2: '-2', stroke: 'black' });
  assert.equal(text.position(), '(30,10)');
  assert.equal(text.textContent, '开始');
  assert.equal(group.attributes.fill, 'blue');
  assert.equal(Reflect.get(circle.attributes, 'fill'), undefined, 'container styles use SVG inheritance instead of overwriting children');
});

test('geometry failures validate the whole subtree before writing', () => {
  const group = new Group('g');
  const first = new Rect('small', 1, 2, 3, 4);
  const second = new Circle('large', Number.MAX_VALUE, 0, 1);
  group.add(first);
  group.add(second);
  const before = group.preorder().map(shape => shape.attributes);
  assert.throws(() => group.scale(2), /finite number/);
  assert.deepEqual(group.preorder().map(shape => shape.attributes), before);
  assert.throws(() => group.move(Number.MAX_VALUE, 0), /finite number/);
  assert.deepEqual(group.preorder().map(shape => shape.attributes), before);
  for (const factor of [0, -1, NaN, Infinity]) {
    assert.throws(() => group.scale(factor), { message: 'scale factor must be positive' });
  }
  assert.throws(() => group.move(NaN, 0), /dx must be a finite number/);
});

test('set validates type geometry and common style whitelist atomically', () => {
  const rect = new Rect('r', 1, 2, 3, 4);
  assert.throws(() => rect.setAttribute('width', '-1'), /width must be nonnegative/);
  assert.throws(() => rect.setAttribute('height', 'Infinity'), /finite number/);
  assert.throws(() => rect.setAttribute('stroke-width', '-1'), /stroke-width must be nonnegative/);
  assert.throws(() => rect.setAttribute('id', 'renamed'), { message: 'unknown attribute: id' });
  assert.throws(() => rect.setAttribute('r', '20'), { message: 'unknown attribute: r' });
  assert.throws(() => rect.setAttribute('text', 'no'), { message: 'unknown attribute: text' });
  assert.equal(rect.attributes.width, '3');
  rect.setAttribute('x', '-0');
  assert.equal(rect.attributes.x, '0');
  const text = new Text('t', 0, 0, 'before');
  text.setAttribute('text', 'after "quoted" & <escaped>');
  assert.equal(text.textContent, 'after "quoted" & <escaped>');
  assert.equal(text.attributes.text, undefined);
  assert.equal(text.clone().textContent, text.textContent);
});

test('document IDs are unique throughout subtrees and remain case sensitive', () => {
  const document = new SvgDocument();
  document.insert(new Rect('r', 0, 0, 1, 1));
  document.insert(new Rect('R', 0, 0, 1, 1));
  const group = new Group('g');
  group.add(new Circle('r', 1, 2, 3));
  assert.throws(() => document.insert(group), { message: 'id already exists: r' });
  assert.equal(document.count, 2);
  assert.equal(document.find('R').id, 'R');
  assert.throws(() => document.find('missing'), { message: 'no such shape: missing' });
  assert.throws(() => document.findContainer('missing'), { message: 'no such container: missing' });
  assert.throws(() => document.findContainer('r'), { message: 'not a container: r' });
  assert.throws(() => new Group(''), /id must not be empty/);
  assert.throws(() => new Group('two words'), /id must not contain whitespace/);
});

test('an imported SVG root id remains reserved for later editing and snapshots', () => {
  const document = new SvgDocument(100, 100, undefined, { id: 'canvas' });
  document.insert(new Rect('r', 0, 0, 1, 1));
  assert.throws(() => document.insert(new Circle('canvas', 0, 0, 1)), { message: 'id already exists: canvas' });
  assert.throws(() => document.group('canvas', ['r']), { message: 'id already exists: canvas' });
  assert.throws(() => document.clone().insert(new Group('canvas')), { message: 'id already exists: canvas' });
  assert.deepEqual(document.children.map(shape => shape.id), ['r']);
  assert.equal(document.allIds().has('canvas'), false, 'allIds enumerates shape ids, excluding root metadata');
  assert.throws(() => new SvgDocument(100, 100, undefined, { id: 'bad id' }), /id must not contain whitespace/);
});

test('grouping uses document preorder and the first selected node parent', () => {
  const document = new SvgDocument();
  const a = new Group('a');
  const b = new Group('b');
  const head = new Rect('head', 0, 0, 1, 1);
  const first = new Rect('first', 2, 0, 1, 1);
  const tail = new Rect('tail', 4, 0, 1, 1);
  a.add(head);
  a.add(first);
  a.add(tail);
  b.add(new Circle('later', 5, 6, 7));
  document.insert(a);
  document.insert(b);
  const group = document.group('selection', ['later', 'first']);
  assert.deepEqual(a.children.map(shape => shape.id), ['head', 'selection', 'tail']);
  assert.deepEqual(group.children.map(shape => shape.id), ['first', 'later']);
  assert.equal(b.children.length, 0);
  assert.equal(document.parentLabel('selection'), 'g#a');
  assert.equal(document.parentLabel('later'), 'g#selection');
  assert.equal(document.find('later').position(), '(5,6)', 'reparenting keeps local coordinates');
});

test('ancestor grouping, duplicate requests, and missing IDs leave the tree unchanged', () => {
  const document = new SvgDocument();
  const outer = new Group('outer');
  const inner = new Group('inner');
  inner.add(new Rect('leaf', 0, 0, 1, 1));
  outer.add(inner);
  document.insert(outer);
  const before = document.find('outer').preorder().map(shape => shape.id);
  assert.throws(() => document.group('bad', ['leaf', 'outer']), { message: 'cannot group a container into its own descendant: outer' });
  assert.throws(() => document.group('bad', ['inner', 'leaf']), { message: 'cannot group a container into its own descendant: inner' });
  assert.throws(() => document.group('bad', ['leaf', 'leaf']), /duplicate shape: leaf/);
  assert.throws(() => document.group('bad', ['leaf', 'missing']), /no such shape: missing/);
  assert.throws(() => document.group('outer', ['leaf']), /id already exists: outer/);
  assert.deepEqual(document.find('outer').preorder().map(shape => shape.id), before);
});

test('ungroup splices children into the same sibling position and rejects root groups', () => {
  const document = new SvgDocument();
  const outer = new Group('outer');
  outer.add(new Rect('before', 0, 0, 1, 1));
  const nested = new Group('nested');
  nested.add(new Circle('c', 1, 2, 3));
  nested.add(new Rect('r', 4, 5, 6, 7));
  outer.add(nested);
  outer.add(new Rect('after', 0, 0, 1, 1));
  document.insert(outer);
  assert.throws(() => document.ungroup('outer'), { message: 'cannot ungroup top-level container: outer' });
  document.ungroup('nested');
  assert.deepEqual(outer.children.map(shape => shape.id), ['before', 'c', 'r', 'after']);
  assert.equal(document.parentLabel('c'), 'g#outer');
  assert.throws(() => document.find('nested'), /no such shape/);
});

test('ungroup retains inherited styles and composes transforms without overriding child styles', () => {
  const document = new SvgDocument();
  const outer = new Group('outer');
  const group = ShapeFactory.fromSvg('g', 'g', {
    fill: 'red', stroke: 'black', 'stroke-width': '2',
    style: 'fill:green;font-size:16; font-family:"A; B"', transform: 'translate(20,30)',
  }, '') as Group;
  const plain = new Rect('plain', 1, 2, 3, 4);
  const explicit = new Rect('explicit', 1, 2, 3, 4, 'blue');
  explicit.importSvgAttributes({ transform: 'scale(2)', style: 'stroke:yellow' });
  const inherited = new Rect('inherited', 1, 2, 3, 4);
  inherited.importSvgAttributes({ fill: 'inherit', style: 'stroke:inherit !important' });
  group.add(plain);
  group.add(explicit);
  group.add(inherited);
  outer.add(group);
  document.insert(outer);
  document.ungroup('g');
  assert.equal(plain.attributes.fill, 'green');
  assert.equal(plain.attributes.stroke, 'black');
  assert.equal(plain.attributes['stroke-width'], '2');
  assert.equal(plain.attributes['font-size'], '16');
  assert.equal(plain.attributes['font-family'], '"A; B"');
  assert.equal(plain.attributes.transform, 'translate(20,30)');
  assert.equal(explicit.attributes.fill, 'blue');
  assert.equal(explicit.attributes.style, 'stroke:yellow');
  assert.equal(explicit.attributes.transform, 'translate(20,30) scale(2)');
  assert.equal(inherited.attributes.fill, 'green');
  assert.equal(inherited.attributes.style, 'stroke:black !important');
});

test('ungroup refuses composite opacity/filter effects atomically instead of changing rendering', () => {
  const document = new SvgDocument();
  const outer = new Group('outer');
  const group = ShapeFactory.fromSvg('g', 'g', { fill: 'red', opacity: '0.5' }, '') as Group;
  const first = new Rect('first', 0, 0, 10, 10);
  group.add(first);
  group.add(new Rect('second', 5, 5, 10, 10));
  outer.add(group);
  document.insert(outer);
  assert.throws(() => document.ungroup('g'), /cannot ungroup container with unsupported presentation: g \(opacity\)/);
  assert.equal(document.parentLabel('first'), 'g#g');
  assert.equal(first.attributes.fill, undefined);
  assert.deepEqual(outer.children.map(shape => shape.id), ['g']);
});

test('reparenting forbids cycles and appends without changing geometry', () => {
  const document = new SvgDocument();
  const outer = new Group('outer');
  const inner = new Group('inner');
  outer.add(inner);
  document.insert(outer);
  document.insert(new Rect('r', 10, 20, 30, 40));
  assert.throws(() => document.addTo('inner', 'outer'), /cannot group a container into its own descendant: outer/);
  assert.throws(() => document.addTo('inner', 'inner'), /cannot group a container into its own descendant: inner/);
  assert.equal(document.parentLabel('outer'), 'svg');
  document.addTo('inner', 'r');
  assert.equal(document.parentLabel('r'), 'g#inner');
  assert.equal(document.find('r').position(), '(10,20)');
  document.addTo('inner', 'r');
  assert.deepEqual(inner.children.map(shape => shape.id), ['r']);
});

test('front and back reorder siblings and delete removes whole subtrees', () => {
  const document = new SvgDocument();
  const group = new Group('g');
  for (const id of ['a', 'b', 'c']) group.add(new Rect(id, 0, 0, 1, 1));
  document.insert(group);
  document.insert(new Group('other'));
  document.reorder('a', true);
  assert.deepEqual(group.children.map(shape => shape.id), ['b', 'c', 'a']);
  document.reorder('a', false);
  assert.deepEqual(group.children.map(shape => shape.id), ['a', 'b', 'c']);
  document.reorder('g', true);
  assert.deepEqual(document.children.map(shape => shape.id), ['other', 'g']);
  const removed = document.remove('g');
  assert.deepEqual(removed.preorder().map(shape => shape.id), ['g', 'a', 'b', 'c']);
  assert.equal(document.count, 1);
  assert.throws(() => document.find('a'), /no such shape: a/);
});

test('clones have independent geometry, content, hierarchy, styles, and root metadata', () => {
  const document = new SvgDocument(400, 200, '-10 -20 800 400', { fill: 'red', 'data-name': 'sample' });
  const group = new Group('g');
  group.add(new Text('t', 10, 20, 'original'));
  document.insert(group);
  const clone = document.clone();
  clone.find('t').setAttribute('text', 'changed');
  clone.find('g').move(10, 10);
  clone.insert(new Circle('new', 1, 2, 3), 'g');
  clone.resize(100, 50);
  assert.equal(document.find('t').textContent, 'original');
  assert.equal(document.find('t').position(), '(10,20)');
  assert.equal(document.count, 2);
  assert.equal(document.viewBox, '-10 -20 800 400');
  assert.equal(clone.viewBox, '0 0 100 50');
  assert.deepEqual(clone.attributes, { fill: 'red', 'data-name': 'sample' });
  assert.throws(() => (document.children as unknown as unknown[]).pop(), TypeError);
});

test('import preserves presentation data and local transforms while set stays strict', () => {
  const text = ShapeFactory.fromSvg('text', 't', {
    x: '10px', y: '2.5', fill: 'red', 'font-size': '16', 'text-anchor': 'middle',
    transform: 'translate(20, 30) scale(0.8)', 'data-kind': 'label',
  }, '  keep whitespace  ');
  assert.equal(text.textContent, '  keep whitespace  ');
  text.move(1, 2);
  assert.equal(text.attributes.x, '11');
  assert.equal(text.attributes.transform, 'translate(20, 30) scale(0.8)');
  assert.equal(text.clone().attributes['font-size'], '16');
  assert.throws(() => text.setAttribute('font-size', '20'), /unknown attribute: font-size/);
  assert.throws(() => ShapeFactory.fromSvg('rect', 'r', { transform: 'rotate(45)' }, ''), /unsupported transform/);
  for (const transform of ['scale(2px)', 'translate(1,,2)', 'translate(1,)', 'translate(1),']) {
    assert.throws(() => ShapeFactory.fromSvg('g', 'invalid', { transform }, ''), /invalid transform/);
  }
  assert.throws(() => ShapeFactory.fromSvg('rect', 'r', { width: '-10' }, ''), /width must be nonnegative/);
  assert.throws(() => ShapeFactory.fromSvg('rect', 'r', {}, 'unexpected'), /unexpected text content/);
  assert.equal(ShapeFactory.fromSvg('g', 'g', {}, '\n  ').tag, 'g');
});

test('invalid canvas geometry and failed resizing preserve dimensions', () => {
  assert.throws(() => new SvgDocument(-1, 10), /nonnegative/);
  assert.throws(() => new SvgDocument(Infinity, 10), /finite number/);
  assert.throws(() => new SvgDocument(10, 10, '0 0 -1 10'), /viewBox dimensions/);
  const document = new SvgDocument(100, 200);
  assert.throws(() => document.resize(400, -1), /nonnegative/);
  assert.equal(document.width, 100);
  assert.equal(document.height, 200);
  assert.equal(document.viewBox, '0 0 100 200');
  assert.throws(() => new Circle('c', 0, 0, -1), /r must be nonnegative/);
  assert.throws(() => new Ellipse('e', 0, 0, 1, -1), /ry must be nonnegative/);
});
