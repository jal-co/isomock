type DracoDecoderConfig = Readonly<{
  wasmBinary?: ArrayBuffer | Uint8Array;
}>;

declare const createDracoDecoderModule: (
  config?: DracoDecoderConfig,
) => Promise<unknown>;

export = createDracoDecoderModule;
