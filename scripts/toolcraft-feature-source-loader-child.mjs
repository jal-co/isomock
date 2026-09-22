import { loadToolcraftFeatureVerificationPlanFromSource } from "./toolcraft-feature-source-loader.mjs";

const protectedSend = process.send?.bind(process);
if (!protectedSend) {
  throw new Error("Toolcraft isolated feature source child requires protected IPC.");
}
delete process.send;

if (process.argv.length !== 3) {
  throw new Error("Toolcraft isolated feature source child requires one request.");
}
const plan = await loadToolcraftFeatureVerificationPlanFromSource({
  projectDir: process.cwd(),
  request: JSON.parse(process.argv[2]),
});
await new Promise((resolve, reject) => {
  protectedSend(
    { kind: "toolcraft-feature-verification-plan", plan, version: 1 },
    (error) => error ? reject(error) : resolve(),
  );
});
process.disconnect?.();
