import { run } from "./run";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const argv = process.argv.slice(2);
const wantsStdin = argv.includes("-");
const { output, code } = await run(argv, process.env, wantsStdin ? await readStdin() : "");
if (output) (code === 0 ? process.stdout : process.stderr).write(output.endsWith("\n") ? output : `${output}\n`);
process.exit(code);
