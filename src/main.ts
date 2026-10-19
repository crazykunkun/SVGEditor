import { EditorSession } from './application/EditorSession.js';
import { CliRunner } from './cli/CliRunner.js';
import { CommandRegistry } from './cli/CommandRegistry.js';
import { NodeFileStore } from './infrastructure/NodeFileStore.js';
import { SvgCodec } from './infrastructure/SvgCodec.js';

const files = new NodeFileStore();
const session = new EditorSession(files, new SvgCodec());
const commands = new CommandRegistry(session);
const runner = new CliRunner(commands, files);
process.exitCode = await runner.run();
