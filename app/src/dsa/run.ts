import { invoke } from "@tauri-apps/api/core";
import { buildDriver, canExecute, parseOutcome, type Language, type RunOutcome } from "./harness";
import type { Problem } from "./problems";

interface RawExecResult {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  timed_out: boolean;
  duration_ms: number;
  runtime_missing: boolean;
}

/** Function name from a signature line, e.g. "def foo(a, b):" -> "foo". */
export function functionNameFrom(signature: string): string {
  const m =
    signature.match(/def\s+([A-Za-z_]\w*)/) ??
    signature.match(/function\s+([A-Za-z_]\w*)/) ??
    signature.match(/(?:const|let|var)\s+([A-Za-z_]\w*)\s*=/) ??
    signature.match(/\b([A-Za-z_]\w*)\s*\(/);
  if (!m) throw new Error(`Could not find a function name in signature: ${signature}`);
  return m[1];
}

export async function runSolution(
  problem: Problem,
  language: Language,
  source: string,
): Promise<RunOutcome> {
  if (!canExecute(language)) {
    throw new Error(`${language} is not executable in V1`);
  }

  const fnName = functionNameFrom(problem.signatures[language]);
  const driver = buildDriver(language, fnName, source);
  const stdin = JSON.stringify(problem.testCases.map((c) => ({ input: c.input })));

  const raw = await invoke<RawExecResult>("run_code", {
    language,
    source: driver,
    stdinData: stdin,
    timeoutMs: 10_000,
  });

  return parseOutcome(raw.stdout, raw.stderr, problem.testCases, {
    timedOut: raw.timed_out,
    runtimeMissing: raw.runtime_missing,
    exitCode: raw.exit_code,
  });
}

export async function availableLanguages(): Promise<Language[]> {
  const langs = await invoke<string[]>("available_languages");
  return langs.filter((l): l is Language =>
    ["python", "javascript", "cpp", "java"].includes(l),
  );
}
