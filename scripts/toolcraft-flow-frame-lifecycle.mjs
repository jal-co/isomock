function factValues(fact) {
  return fact?.kind === "exact" ? fact.values : fact?.possibleValues ?? [];
}

export function restoreToolcraftFlowFrame({
  callerEnvironment, callerState, fact, index, state,
}) {
  const cells = new Set(callerState.cells.keys());
  const identities = new Set([
    ...callerState.callables.keys(), ...callerState.objects.keys(),
  ]);
  const cellQueue = [...cells];
  const identityQueue = [...identities];
  const factQueue = [fact, state.returnFact, state.thisFact];
  let cellPosition = 0;
  let identityPosition = 0;
  let factPosition = 0;

  function retainCell(cell) {
    if (!cell || cells.has(cell)) return;
    cells.add(cell);
    cellQueue.push(cell);
  }
  function retainIdentity(value) {
    const identity = value && index.unwrap(value);
    if (!identity || identities.has(identity) ||
      !state.callables.has(identity) && !state.objects.has(identity)) return;
    identities.add(identity);
    identityQueue.push(identity);
  }
  function retainShape(shape) {
    for (const variant of shape?.variants ?? []) {
      for (const value of variant) retainIdentity(value);
    }
    for (const value of shape?.tails ?? []) retainIdentity(value);
  }
  function retainCandidate(candidate) {
    for (const bound of candidate?.bound ?? []) factQueue.push(bound);
    factQueue.push(candidate?.thisFact);
    for (const cell of candidate?.capturedEnvironment?.values?.() ?? []) {
      retainCell(cell);
    }
    for (const value of candidate?.boundSources ?? []) retainIdentity(value);
    retainShape(candidate?.boundSourceShape);
    for (const base of candidate?.construction?.bases ?? []) {
      retainCandidate(base);
    }
    for (const field of candidate?.construction?.fields ?? []) {
      for (const cell of field.capturedEnvironment?.values?.() ?? []) {
        retainCell(cell);
      }
      factQueue.push(field.keyFact);
    }
    factQueue.push(candidate?.construction?.prototypeFact);
  }

  for (const cell of callerEnvironment.values()) retainCell(cell);
  while (cellPosition < cellQueue.length ||
    identityPosition < identityQueue.length || factPosition < factQueue.length) {
    while (factPosition < factQueue.length) {
      for (const value of factValues(factQueue[factPosition])) {
        retainIdentity(value);
      }
      factPosition += 1;
    }
    while (cellPosition < cellQueue.length) {
      factQueue.push(state.cells.get(cellQueue[cellPosition]));
      cellPosition += 1;
    }
    while (identityPosition < identityQueue.length) {
      const identity = identityQueue[identityPosition];
      const object = state.objects.get(identity);
      factQueue.push(object?.prototypeFact);
      for (const descriptor of object?.propertyDescriptors?.values?.() ?? []) {
        for (const alternative of descriptor.alternatives ?? []) {
          factQueue.push(alternative.valueFact, alternative.getFact,
            alternative.setFact);
        }
      }
      for (const domain of ["string", "symbol"]) {
        for (const alternative of object?.propertyRemainder?.[domain]
          ?.alternatives ?? []) {
          factQueue.push(alternative.valueFact, alternative.getFact,
            alternative.setFact);
        }
      }
      for (const value of object?.array?.slots ?? []) factQueue.push(value);
      for (const value of object?.array?.tails ?? []) retainIdentity(value);
      for (const candidate of state.callables.get(identity) ?? []) {
        retainCandidate(candidate);
      }
      identityPosition += 1;
    }
  }
  return Object.freeze({
    ...state,
    callables: new Map([...state.callables].filter(([identity]) =>
      identities.has(identity)
    )),
    cells: new Map([...state.cells].filter(([cell]) => cells.has(cell))),
    environment: callerEnvironment,
    objects: new Map([...state.objects].filter(([identity]) =>
      identities.has(identity)
    )),
  });
}
