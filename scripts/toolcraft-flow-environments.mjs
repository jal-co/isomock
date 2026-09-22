let nextCellId = 0;

export function createToolcraftFlowCell() {
  nextCellId += 1;
  return Object.freeze({ id: nextCellId, kind: "flow-cell" });
}

export function readToolcraftBinding(state, symbol) {
  const cell = symbol && state.environment.get(symbol);
  return cell && state.cells.get(cell);
}

export function hasToolcraftBinding(state, symbol) {
  return Boolean(symbol && state.environment.has(symbol));
}

export function assignToolcraftBinding(state, symbol, fact, fresh = false) {
  if (!symbol) return state;
  const existingCell = !fresh && state.environment.get(symbol);
  const cell = existingCell || createToolcraftFlowCell();
  const environment = existingCell ? state.environment : new Map(state.environment);
  if (!existingCell) environment.set(symbol, cell);
  const cells = new Map(state.cells);
  cells.set(cell, fact);
  return Object.freeze({ ...state, cells, environment });
}

export function captureToolcraftEnvironment(state) {
  return new Map(state.environment);
}

export function activateToolcraftEnvironment(
  state,
  capturedEnvironment,
  localSymbols = [],
) {
  const environment = new Map(capturedEnvironment ?? state.environment);
  for (const symbol of localSymbols) environment.delete(symbol);
  return Object.freeze({ ...state, environment });
}

export function restoreToolcraftEnvironment(state, environment) {
  return Object.freeze({ ...state, environment });
}
