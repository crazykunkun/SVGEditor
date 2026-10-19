/** Files are synchronous here so an individual CLI command finishes atomically. */
export interface FilePort {
  read(path: string): string;
  write(path: string, content: string): void;
}
