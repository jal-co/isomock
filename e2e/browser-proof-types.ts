declare const toolcraftBrowserActionBrand: unique symbol;
declare const toolcraftBrowserObservationBrand: unique symbol;

export type ToolcraftBrowserAction<
  Kind extends string = "interaction",
  Result = void,
> = {
  readonly [toolcraftBrowserActionBrand]: true;
  readonly kind?: Kind;
  readonly result?: Result;
};

export type ToolcraftBrowserObservation<T> = {
  readonly [toolcraftBrowserObservationBrand]: T;
};
