function getDependencyValueKind(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function inspectRendererProviderDependencyValue(value) {
  if (typeof value === "string") {
    return Object.freeze({
      actualVersion: value,
      errorRepresentation: JSON.stringify(value),
      valid: true,
    });
  }

  const actualVersion = `<invalid:${getDependencyValueKind(value)}>`;
  return Object.freeze({
    actualVersion,
    errorRepresentation: actualVersion,
    valid: false,
  });
}

function createDependencyVersionError(dependency, errorRepresentation) {
  return `packageJson.dependencies.${dependency.name} must equal approved version "${dependency.version}"; received ${errorRepresentation}.`;
}

export function inspectRendererProviderDependencies({
  dependencies,
  provider,
}) {
  const presentCount = provider.dependencies.filter(({ name }) =>
    Object.hasOwn(dependencies, name),
  ).length;
  if (presentCount === 0) {
    return {
      errors: [],
      mismatchedDependencies: [],
      missingDependencies: [...provider.dependencies],
      status: "absent",
    };
  }

  const missingDependencies = [];
  const mismatchedDependencies = [];
  const errors = [];
  for (const dependency of provider.dependencies) {
    if (!Object.hasOwn(dependencies, dependency.name)) {
      missingDependencies.push(dependency);
      errors.push(createDependencyVersionError(dependency, "undefined"));
      continue;
    }
    const valueInspection = inspectRendererProviderDependencyValue(
      dependencies[dependency.name],
    );
    if (
      valueInspection.valid &&
      valueInspection.actualVersion === dependency.version
    ) {
      continue;
    }
    const error = createDependencyVersionError(
      dependency,
      valueInspection.errorRepresentation,
    );
    mismatchedDependencies.push({
      actualVersion: valueInspection.actualVersion,
      dependency,
      error,
    });
    errors.push(error);
  }

  return {
    errors,
    mismatchedDependencies,
    missingDependencies,
    status: errors.length === 0 ? "exact" : "drifted",
  };
}
