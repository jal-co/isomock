import path from "node:path";

export function createProofProcessError({
  command,
  code,
  signal,
  stderr,
  stdout,
}) {
  const outcome = signal
    ? `after signal ${signal}`
    : `with code ${code ?? 1}`;
  const capturedOutput = [stdout, stderr]
    .filter((output) => output.length > 0)
    .join("\n");
  const error = new Error(
    `${path.basename(command)} exited ${outcome}.${capturedOutput ? `\n${capturedOutput}` : ""}`,
  );
  error.code = code;
  error.signal = signal;
  error.stderr = stderr;
  error.stdout = stdout;
  return error;
}

export function createProofProcessSpawnError({ command, error, stderr, stdout }) {
  const reason = error.code ? `${error.code}: ${error.message}` : error.message;
  const capturedOutput = [stdout, stderr]
    .filter((output) => output.length > 0)
    .join("\n");
  const wrapped = new Error(
    `${path.basename(command)} failed to start: ${reason}.${capturedOutput ? `\n${capturedOutput}` : ""}`,
    { cause: error },
  );
  wrapped.code = error.code ?? null;
  wrapped.signal = null;
  wrapped.stderr = stderr;
  wrapped.stdout = stdout;
  return wrapped;
}

export function createProofProcessDeadlineError({ cleanupErrors = [], command, deadlineMs, stderr, stdout }) {
  const capturedOutput = [stdout, stderr]
    .filter((output) => output.length > 0)
    .join("\n");
  const cleanupSummary = cleanupErrors.length === 0
    ? ""
    : ` Cleanup failures: ${cleanupErrors.map((error) => error.message).join(" | ")}.`;
  const error = new Error(
    `${path.basename(command)} exceeded its protected ${deadlineMs}ms wall deadline.${cleanupSummary}${capturedOutput ? `\n${capturedOutput}` : ""}`,
  );
  error.code = "TOOLCRAFT_PROOF_PROCESS_DEADLINE";
  error.signal = "SIGKILL";
  error.stderr = stderr;
  error.stdout = stdout;
  error.cleanupErrors = cleanupErrors;
  return error;
}

export function createProofProcessResourceError({ command, resource }) {
  const error = new Error(`${path.basename(command)} exceeded its protected proof-process resource limit (${resource}).`);
  error.code = "TOOLCRAFT_PROOF_PROCESS_RESOURCE_LIMIT";
  error.resource = resource;
  return error;
}

