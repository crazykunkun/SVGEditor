import { createInterface } from 'node:readline';
import type { FilePort } from '../ports/FilePort.js';
import type { CommandRegistry, CommandResult } from './CommandRegistry.js';

/** Terminal adapter: startup arguments, scripts and the line-oriented REPL. */
export class CliRunner {
  private readonly commands: CommandRegistry;
  private readonly files: FilePort;

  constructor(commands: CommandRegistry, files: FilePort) {
    this.commands = commands;
    this.files = files;
  }

  async run(
    args: readonly string[] = process.argv.slice(2),
    input: NodeJS.ReadableStream & { isTTY?: boolean } = process.stdin,
    output: NodeJS.WritableStream & { isTTY?: boolean } = process.stdout,
  ): Promise<number> {
    if (args.length === 1 && args[0] === '--help') {
      this.write(this.commands.execute('help'), output);
      return 0;
    }
    if (args.length !== 0 && !(args.length === 2 && args[0] === '--script')) {
      output.write('error: usage: npm run cli -- [--script <commands.txt> | --help]\n');
      return 1;
    }
    output.write("svg-editor 0.1 — type 'help' for commands\n");
    if (args[0] === '--script') {
      let script: string;
      try {
        script = this.files.read(args[1]!);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.write(`error: ${message.replace(/[\r\n]+/g, ' ')}\n`);
        return 1;
      }
      let failed = false;
      for (const line of script.split(/\r?\n/)) {
        const result = this.commands.execute(line);
        failed ||= result.lines.some((value) => value.startsWith('error:'));
        this.write(result, output);
        if (result.exit) break;
      }
      return failed ? 1 : 0;
    }

    const interactive = Boolean(input.isTTY && output.isTTY);
    const reader = createInterface({ input, output, terminal: interactive, crlfDelay: Infinity });
    reader.setPrompt('svg> ');
    if (interactive) reader.prompt();
    for await (const line of reader) {
      const result = this.commands.execute(line);
      this.write(result, output);
      if (result.exit) {
        reader.close();
        break;
      }
      if (interactive) reader.prompt();
    }
    return 0;
  }

  private write(result: CommandResult, output: NodeJS.WritableStream): void {
    for (const line of result.lines) output.write(`${line}\n`);
  }
}
