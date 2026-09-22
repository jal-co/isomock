export type ToolcraftCommandHandlers<State, Command extends { type: string; }> = {
  readonly [Type in Command["type"]]: (state: State, command: Extract<Command, { type: Type; }>) => State;
};

export function createToolcraftCommandRouter<State, Command extends { type: string; }>(
  handlers: ToolcraftCommandHandlers<State, Command>,
): (state: State, command: Command) => State {
  const snapshot = Object.freeze({ ...handlers });
  return (state, command) => {
    if (!Object.hasOwn(snapshot, command.type)) throw new Error(`Unsupported Toolcraft command: ${String(command.type)}`);
    // The mapped type guarantees that the indexed handler accepts this discriminant.
    const reduce = snapshot[command.type as Command["type"]] as (state: State, command: Command) => State;
    return reduce(state, command);
  };
}

/** Reject overlaps before spreads can overwrite another owner's handler. */
export function assertUniqueToolcraftCommandOwners(
  owners: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): void {
  const ownerByCommand = new Map<string, string>();
  for (const [owner, handlers] of Object.entries(owners)) {
    for (const type of Object.keys(handlers)) {
      const previous = ownerByCommand.get(type);
      if (previous !== undefined) throw new Error(`Toolcraft command "${type}" has multiple owners: ${previous}, ${owner}.`);
      ownerByCommand.set(type, owner);
    }
  }
}
