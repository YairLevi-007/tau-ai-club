// PostToolUse hook (Edit|Write|MultiEdit): lint the edited file and typecheck the project.
// On failure it exits 2 so Claude sees the errors and fixes them.
import { execSync } from "node:child_process";
import { relative } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;

let file;
try {
  file = JSON.parse(input)?.tool_input?.file_path;
} catch {
  process.exit(0);
}
if (!file || !/\.(ts|tsx|mts|js|mjs)$/.test(file) || /node_modules|[\\/]\.next[\\/]/.test(file)) process.exit(0);

const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const rel = relative(cwd, file);
if (rel.startsWith("..")) process.exit(0);

const run = (cmd) => {
  try {
    execSync(cmd, { cwd, stdio: "pipe", encoding: "utf8" });
    return null;
  } catch (e) {
    return `${cmd}\n${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
  }
};

const errors = [run(`npx --no-install eslint "${rel}"`), run("npx --no-install tsc --noEmit")].filter(Boolean);
if (errors.length) {
  process.stderr.write(`Lint/typecheck failed after editing ${rel}:\n\n${errors.join("\n\n")}\n`);
  process.exit(2);
}
