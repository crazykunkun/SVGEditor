import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SvgCodec } from "../src/infrastructure/SvgCodec.js";
import { NodeFileStore } from "../src/infrastructure/NodeFileStore.js";

test("SVG round trip retains all six shape types, nesting, transforms, root metadata and Unicode", () => {
  const codec = new SvgCodec();
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400px" height="250" viewBox="10 20 800 500" fill="navy" data-note="中文 &quot;双引号&quot; &amp; 空格">
  <g id="scene" transform="translate(60,40) scale(0.8)" stroke="black">
    <rect id="r" x="1.5" y="-2" width="30" height="40" fill="red" stroke-width="2"/>
    <g id="inner" transform="translate(20 30)">
      <circle id="c" cx="5" cy="6" r="7"/>
      <ellipse id="e" cx="8" cy="9" rx="10" ry="11"/>
      <line id="l" x1="0" y1="1" x2="2" y2="3" stroke="black"/>
      <text id="t" x="12" y="13" text-anchor="middle" font-size="16" data-note="&quot; &apos; &amp; &lt; &gt;">  中文 空格 &quot; &apos; &amp; &lt; &gt; 😀
第二行 </text>
    </g>
  </g>
</svg>`;
  const { document, warnings } = codec.decode(source);
  assert.deepEqual(warnings, []);
  assert.equal(document.width, 400);
  assert.equal(document.height, 250);
  assert.equal(document.viewBox, "10 20 800 500");
  assert.equal(document.attributes.fill, "navy");
  assert.equal(document.attributes["data-note"], '中文 "双引号" & 空格');
  assert.equal(document.count, 7);
  assert.deepEqual(document.find("inner").children.map((shape) => shape.id), ["c", "e", "l", "t"]);
  assert.equal(document.find("scene").attributes.transform, "translate(60,40) scale(0.8)");
  assert.equal(document.find("t").textContent, '  中文 空格 " \' & < > 😀\n第二行 ');
  assert.equal(document.find("t").attributes["data-note"], '" \' & < >');
  const saved = codec.encode(document);
  assert.match(saved, /data-note="&quot; &apos; &amp; &lt; &gt;"/);
  const reread = codec.decode(saved);
  assert.deepEqual(reread.warnings, []);
  assert.equal(codec.encode(reread.document), saved);
});

test("generated ids reserve later explicit ids, including nested and root ids", () => {
  const codec = new SvgCodec();
  const { document, warnings } = codec.decode(`<svg id="rect2"><g><rect/></g><rect id="rect1"/><g id="g1"/></svg>`);
  assert.deepEqual(warnings, [
    "warning: assigned id g2 to unnamed <g>",
    "warning: assigned id rect3 to unnamed <rect>",
  ]);
  assert.deepEqual([...document.allIds()], ["g2", "rect3", "rect1", "g1"]);
  assert.deepEqual(codec.decode(codec.encode(document)).warnings, []);
});

test("SVG namespace prefixes, comments and mixed CDATA/text preserve supported text", () => {
  const codec = new SvgCodec();
  const { document } = codec.decode(`<?xml version="1.0"?><s:svg xmlns:s="http://www.w3.org/2000/svg" viewBox="0 0 90 60"><!-- metadata & is safe --><s:text id="t" xml:space="preserve"> A &amp; B <![CDATA[<C> &literal;]]> D </s:text></s:svg>`);
  assert.equal(document.width, 90);
  assert.equal(document.height, 60);
  assert.equal(document.find("t").textContent, " A & B <C> &literal; D ");
  assert.equal(document.find("t").attributes["xml:space"], "preserve");
  assert.equal(codec.decode(codec.encode(document)).document.find("t").textContent, " A & B <C> &literal; D ");
});

test("malformed XML, duplicate ids, foreign/unknown tags and unsupported structure are rejected", () => {
  const codec = new SvgCodec();
  const cases = [
    '<svg><g id="g"></svg>',
    '<svg/><svg/>',
    '<svg><g id="same"><rect id="same"/></g></svg>',
    '<svg id="same"><rect id="same"/></svg>',
    '<svg><path id="p" d="M0 0 L1 1"/></svg>',
    '<svg><rect id="r"><circle id="c"/></rect></svg>',
    '<svg><text id="t">Hello<tspan>nested</tspan></text></svg>',
    '<svg><g id="g">unexpected text</g></svg>',
    '<svg xmlns="https://example.com/foreign"/>',
    '<svg><x:rect xmlns:x="https://example.com/foreign" id="r"/></svg>',
    '<svg><rect id="r" xlink:href="#other"/></svg>',
    '<svg><text id="t">&unknown;</text></svg>',
    '<svg><text id="t">unescaped & text</text></svg>',
    '<svg><text id="t">&#0;</text></svg>',
    '<svg><text id="t">&#xD800;</text></svg>',
    '<svg><rect id="r" x="NaN"/></svg>',
    '<svg><circle id="c" r="-1"/></svg>',
    '<svg width="100%"/>',
    '<svg viewBox="0 0 -10 20"/>',
    '<svg><?unsafe do-something?></svg>',
    '<!DOCTYPE svg [<!ENTITY file SYSTEM "file:///etc/passwd">]><svg><text id="t">&file;</text></svg>',
  ];
  for (const xml of cases) assert.throws(() => codec.decode(xml), { name: "Error" }, xml);
  const valid = codec.decode('<svg><rect id="kept" width="20" height="10"/></svg>');
  const before = codec.encode(valid.document);
  assert.throws(() => codec.decode('<svg><g id="bad"/><path id="x"/></svg>'));
  assert.equal(codec.encode(valid.document), before);
});

test("file writes replace the completed file and preserve permissions", () => {
  const directory = mkdtempSync(join(tmpdir(), "svg-editor-file-"));
  try {
    const file = join(directory, "含 空格.svg");
    const store = new NodeFileStore();
    store.write(file, "first");
    chmodSync(file, 0o640);
    store.write(file, "第二次 & completed");
    assert.equal(store.read(file), "第二次 & completed");
    assert.equal(statSync(file).mode & 0o777, 0o640);
    assert.deepEqual(readdirSync(directory), ["含 空格.svg"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("event handlers and active/external URL attributes are rejected on import and export", () => {
  const codec = new SvgCodec();
  for (const xml of [
    '<svg onload="alert(1)"/>',
    '<svg><rect id="r" onclick="alert(1)"/></svg>',
    '<svg><text id="t" href="java&#10;script:alert(1)">x</text></svg>',
    '<svg style="fill:url(javascript:alert(1))"/>',
    '<svg><g id="g" style="fill:url(https://example.com/paint.svg)"/></svg>',
    '<svg style="fill:u\\72l(https://example.com/x)"/>',
    '<svg style="fill:u/**/rl(https://example.com/x)"/>',
    '<svg style="@import &quot;https://example.com/x&quot;"/>',
  ]) assert.throws(() => codec.decode(xml), /(?:unsafe SVG URL|SVG event attributes|unsupported CSS)/);
  const { document } = codec.decode('<svg><rect id="r" width="1" height="1"/></svg>');
  document.find("r").importSvgAttributes({ onclick: "alert(1)" });
  assert.throws(() => codec.encode(document), /SVG event attributes/);
  assert.equal(codec.decode('<svg><rect id="r" style="fill: red; stroke: black"/></svg>').document.find("r").attributes.style,
    "fill: red; stroke: black");
});

test("file failures have the required messages and clean up failed save temporaries", () => {
  const directory = mkdtempSync(join(tmpdir(), "svg-editor-failure-"));
  try {
    const store = new NodeFileStore();
    const missing = join(directory, "missing.svg");
    assert.throws(() => store.read(missing), { message: `cannot read file: ${missing}` });
    const destination = join(directory, "is-a-directory.svg");
    mkdirSync(destination);
    writeFileSync(join(destination, "kept.txt"), "original");
    assert.throws(() => store.write(destination, "replacement"), { message: `cannot write file: ${destination}` });
    assert.deepEqual(readdirSync(directory), ["is-a-directory.svg"]);
    assert.equal(readFileSync(join(destination, "kept.txt"), "utf8"), "original");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("saving over a readonly file fails without changing its bytes or leaving a temporary", { skip: process.getuid?.() === 0 }, () => {
  const directory = mkdtempSync(join(tmpdir(), "svg-editor-readonly-"));
  const file = join(directory, "readonly.svg");
  try {
    writeFileSync(file, "original");
    chmodSync(file, 0o444);
    assert.throws(() => new NodeFileStore().write(file, "replacement"), { message: `cannot write file: ${file}` });
    assert.equal(readFileSync(file, "utf8"), "original");
    assert.deepEqual(readdirSync(directory), ["readonly.svg"]);
  } finally {
    chmodSync(file, 0o644);
    rmSync(directory, { recursive: true, force: true });
  }
});
