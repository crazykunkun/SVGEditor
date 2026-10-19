import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { SvgCodec } from "../src/infrastructure/SvgCodec.js";

const entry = fileURLToPath(new URL("../src/main.js", import.meta.url));

test("assignment flowchart transcript runs through the real CLI and saves a browser SVG", () => {
  const directory = mkdtempSync(join(tmpdir(), "svg-requirements-flow-"));
  try {
    const commands = [
      "# Real process acceptance: create parents before children",
      "init 800 600",
      "create g flowchart",
      "create g node1 in flowchart",
      "create rect start 120 100 160 60 #4a90d9 in node1",
      'create text start-label 155 135 "开始 & 检查" in node1',
      "create g node2 in flowchart",
      "create rect process 520 100 160 60 #f5a623 in node2",
      'create text process-label 545 135 "处理数据" in node2',
      "create line arrow1 280 130 520 130 black in flowchart",
      "move node2 0 100",
      "undo",
      "redo",
      "scale node1 2",
      'set process-label text "处理数据 v2"',
      "tree",
      "show start",
      'save "diagram with spaces.svg"',
      "quit",
    ];
    const result = spawnSync(process.execPath, [entry], { cwd: directory, input: `${commands.join("\n")}\n`, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /error:/);
    assert.match(result.stdout, /svg-editor 0\.1/);
    assert.match(result.stdout, /svg \(800x600\)/);
    assert.match(result.stdout, /rect#start\s+parent=g#node1/);
    assert.match(result.stdout, /saved to diagram with spaces\.svg \(8 elements\)/);
    const xml = readFileSync(join(directory, "diagram with spaces.svg"), "utf8");
    assert.match(xml, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(xml, /开始 &amp; 检查/);
    const document = new SvgCodec().decode(xml).document;
    assert.equal(document.count, 8);
    assert.equal(document.find("start").attributes.x, "240");
    assert.equal(document.find("start").attributes.width, "320");
    assert.equal(document.find("process").attributes.y, "200");
    assert.equal(document.find("process-label").textContent, "处理数据 v2");
    assert.deepEqual(document.find("flowchart").children.map((shape) => shape.id), ["node1", "node2", "arrow1"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("all editing commands preserve hierarchy, sibling order, subtree history and case-sensitive ids", () => {
  const directory = mkdtempSync(join(tmpdir(), "svg-requirements-edit-"));
  try {
    const commands = [
      "init",
      "create g outer",
      "create g inner in outer",
      "create rect r 1 2 3 4 in inner",
      "create circle c 5 6 7 red in outer",
      "create ellipse e 8 9 10 11 in outer",
      "create line l 0 1 2 3 black",
      'create text R 4 5 ""',
      "group bundle c e",
      "addto bundle l",
      "back l",
      "front c",
      "ungroup bundle",
      "move inner 3 4",
      "scale inner 2",
      "set r fill #eee",
      "delete inner",
      "undo",
      "redo",
      "undo",
      "tree outer",
      "save result.svg",
    ];
    const result = spawnSync(process.execPath, [entry], { cwd: directory, input: `${commands.join("\n")}\n`, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /error:/);
    const document = new SvgCodec().decode(readFileSync(join(directory, "result.svg"), "utf8")).document;
    assert.deepEqual(document.find("outer").children.map((shape) => shape.id), ["inner", "l", "e", "c"]);
    assert.equal(document.find("r").attributes.x, "8");
    assert.equal(document.find("r").attributes.y, "12");
    assert.equal(document.find("r").attributes.width, "6");
    assert.equal(document.find("r").attributes.fill, "#eee");
    assert.equal(document.find("R").textContent, "");
    assert.equal(document.parentLabel("r"), "g#inner");
    assert.throws(() => document.find("bundle"), /no such shape/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("failed edits and reads preserve document and redo, and new edits invalidate redo", () => {
  const directory = mkdtempSync(join(tmpdir(), "svg-requirements-atomic-"));
  try {
    writeFileSync(join(directory, "bad.svg"), '<svg><g id="bad"/><path id="unsupported"/></svg>');
    const commands = [
      "init",
      "create rect r 1 2 3 4",
      "move r 5 0",
      "read bad.svg",
      "undo",
      "create rect r 0 0 1 1",
      "redo",
      "undo",
      "set r unknown value",
      "redo",
      "undo",
      "create circle c 10 20 3",
      "redo",
      "save atomic.svg",
    ];
    const result = spawnSync(process.execPath, [entry], { cwd: directory, input: `${commands.join("\n")}\n`, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /error: unknown shape type: path/);
    assert.match(result.stdout, /error: id already exists: r/);
    assert.match(result.stdout, /error: unknown attribute: unknown/);
    assert.match(result.stdout, /error: nothing to redo/);
    assert.equal((result.stdout.match(/rect#r moved to \(6,2\)/g) ?? []).length, 3);
    const document = new SvgCodec().decode(readFileSync(join(directory, "atomic.svg"), "utf8")).document;
    assert.equal(document.find("r").attributes.x, "1");
    assert.equal(document.count, 2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("document commands enforce history barriers; save remembers read path; display does not edit history", () => {
  const directory = mkdtempSync(join(tmpdir(), "svg-requirements-io-"));
  try {
    writeFileSync(join(directory, "imported.svg"), '<svg width="50" height="60"><rect width="1" height="2"/><rect id="rect1"/></svg>');
    const commands = [
      "help",
      "show missing",
      "read imported.svg",
      "undo",
      "move rect2 1 2",
      "tree rect2",
      "show rect2",
      "help",
      "canvas",
      "undo",
      "redo",
      "save",
      "redo",
      "set rect2 fill red",
      "canvas 100 120",
      "undo",
      "set rect2 stroke black",
      "undo",
      "save",
    ];
    const result = spawnSync(process.execPath, [entry], { cwd: directory, input: `${commands.join("\n")}\n`, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /error: no document\. use 'init' or 'read' first/);
    assert.match(result.stdout, /warning: assigned id rect2 to unnamed <rect>/);
    assert.equal((result.stdout.match(/error: undo not allowed after io command/g) ?? []).length, 3);
    assert.equal((result.stdout.match(/saved to imported\.svg/g) ?? []).length, 2);
    assert.match(result.stdout, /canvas 50x60/);
    const document = new SvgCodec().decode(readFileSync(join(directory, "imported.svg"), "utf8")).document;
    assert.equal(document.width, 100);
    assert.equal(document.height, 120);
    assert.equal(document.find("rect2").attributes.x, "1");
    assert.equal(document.find("rect2").attributes.fill, "red");
    assert.equal(document.find("rect2").attributes.stroke, undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("script mode reports required error cases, keeps running, and returns a failing status", () => {
  const directory = mkdtempSync(join(tmpdir(), "svg-requirements-errors-"));
  try {
    writeFileSync(join(directory, "errors.commands"), [
      "init",
      "create box unsupported 0 0 10 10 title",
      "create rect r 0 0 10 10",
      "create rect r 0 0 10 10",
      "move absent 1 2",
      "create g bad in absent",
      "create g bad in r",
      "scale r 0",
      "create g outer",
      "create g inner in outer",
      "group invalid inner outer",
      "ungroup outer",
      "read missing.svg",
      "save missing-directory/out.svg",
      "save survived.svg",
    ].join("\n"));
    const result = spawnSync(process.execPath, [entry, "--script", "errors.commands"], { cwd: directory, encoding: "utf8" });
    assert.equal(result.status, 1, result.stderr);
    for (const message of [
      "unknown shape type: box (is the plugin loaded?)",
      "id already exists: r",
      "no such shape: absent",
      "no such container: absent",
      "not a container: r",
      "scale factor must be positive",
      "cannot group a container into its own descendant: outer",
      "cannot ungroup top-level container: outer",
      "cannot read file: missing.svg",
      "cannot write file: missing-directory/out.svg",
    ]) assert.ok(result.stdout.includes(`error: ${message}\n`), message);
    assert.match(result.stdout, /saved to survived\.svg/);
    assert.equal(new SvgCodec().decode(readFileSync(join(directory, "survived.svg"), "utf8")).document.count, 3);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
