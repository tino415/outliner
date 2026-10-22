import { withConfigFile } from "./config";
import { run } from "./run";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function outcome(argv: string[]): Promise<{ output: string; code: number }> {
  let env: Record<string, string | undefined>;
  try {
    env = withConfigFile(process.env);
  } catch (error) {
    return { output: `outline: ${(error as Error).message}`, code: 1 };
  }
  return run(argv, env, argv.includes("-") ? await readStdin() : "");
}

const { output, code } = await outcome(process.argv.slice(2));
if (output) (code === 0 ? process.stdout : process.stderr).write(output.endsWith("\n") ? output : `${output}\n`);
process.exitCode = code;
