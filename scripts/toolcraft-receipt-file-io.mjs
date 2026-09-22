import fs from "node:fs/promises";

export async function readToolcraftReceiptFile(receiptPath) {
  let source;
  try {
    source = await fs.readFile(receiptPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { missing: true };
    throw error;
  }
  try {
    return { receipt: JSON.parse(source) };
  } catch {
    return { malformed: true };
  }
}
