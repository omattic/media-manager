import type { OutputOptions } from "./types.js";

export function writeOutput(options: OutputOptions, text: string, data: unknown): void {
  if (options.quiet) {
    return;
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${text}\n`);
}
