/** Tokenizes one command line while preserving quoted whitespace and empty text. */
export class Tokenizer {
  parse(line: string): string[] {
    if (line.trimStart().startsWith('#')) return [];
    const tokens: string[] = [];
    let value = '';
    let quoted = false;
    let started = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]!;
      if (character === '"') {
        quoted = !quoted;
        started = true;
      } else if (quoted && character === '\\' && (line[index + 1] === '"' || line[index + 1] === '\\')) {
        index += 1;
        value += line[index]!;
        started = true;
      } else if (!quoted && /\s/.test(character)) {
        if (started) tokens.push(value);
        value = '';
        started = false;
      } else {
        value += character;
        started = true;
      }
    }
    if (quoted) throw new Error('unterminated double quote');
    if (started) tokens.push(value);
    return tokens;
  }
}
