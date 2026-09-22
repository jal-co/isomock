export function toolcraftDeclarationIsExternal(declaration) {
  const sourceFile = declaration?.getSourceFile();
  if (!sourceFile) return false;
  return sourceFile.hasNoDefaultLib === true ||
    sourceFile.isDeclarationFile === true &&
      sourceFile.fileName.replaceAll("\\", "/").includes("/node_modules/");
}
