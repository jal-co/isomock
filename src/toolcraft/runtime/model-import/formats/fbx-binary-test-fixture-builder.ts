const encoder = new TextEncoder();

export type FbxBinaryFixtureNode = Readonly<{
  children?: readonly FbxBinaryFixtureNode[];
  name: string;
  properties?: readonly Uint8Array[];
}>;

function join(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function integer(value: number, bytes: 4 | 8): Uint8Array {
  const output = new Uint8Array(bytes);
  const view = new DataView(output.buffer);
  if (bytes === 4) view.setInt32(0, value, true);
  else {
    view.setUint32(0, value >>> 0, true);
    view.setUint32(4, Math.floor(value / 0x1_0000_0000), true);
  }
  return output;
}

function uint32(value: number): Uint8Array {
  const output = new Uint8Array(4);
  new DataView(output.buffer).setUint32(0, value, true);
  return output;
}

function numericArray(
  values: readonly number[],
  bytesPerValue: 4 | 8,
  write: (view: DataView, offset: number, value: number) => void,
): Uint8Array {
  const output = new Uint8Array(values.length * bytesPerValue);
  const view = new DataView(output.buffer);
  values.forEach((value, index) => write(view, index * bytesPerValue, value));
  return output;
}

function arrayProperty(type: "d" | "i", values: readonly number[]): Uint8Array {
  const bytes = type === "d"
    ? numericArray(values, 8, (view, offset, value) =>
        view.setFloat64(offset, value, true))
    : numericArray(values, 4, (view, offset, value) =>
        view.setInt32(offset, value, true));
  return join([
    encoder.encode(type),
    uint32(values.length),
    uint32(0),
    uint32(bytes.byteLength),
    bytes,
  ]);
}

export const fbxBinaryFixtureProperty = Object.freeze({
  float64: (value: number): Uint8Array => {
    const bytes = new Uint8Array(9);
    bytes[0] = "D".charCodeAt(0);
    new DataView(bytes.buffer).setFloat64(1, value, true);
    return bytes;
  },
  float64Array: (values: readonly number[]): Uint8Array =>
    arrayProperty("d", values),
  int32: (value: number): Uint8Array =>
    join([encoder.encode("I"), integer(value, 4)]),
  int32Array: (values: readonly number[]): Uint8Array =>
    arrayProperty("i", values),
  int64: (value: number): Uint8Array =>
    join([encoder.encode("L"), integer(value, 8)]),
  raw: (value: Uint8Array): Uint8Array =>
    join([encoder.encode("R"), uint32(value.byteLength), value]),
  string: (value: string): Uint8Array => {
    const bytes = encoder.encode(value);
    return join([encoder.encode("S"), uint32(bytes.byteLength), bytes]);
  },
});

function encodeNode(
  node: FbxBinaryFixtureNode,
  startOffset: number,
): Uint8Array {
  const name = encoder.encode(node.name);
  const properties = join(node.properties ?? []);
  const children: Uint8Array[] = [];
  let cursor = startOffset + 13 + name.byteLength + properties.byteLength;
  for (const child of node.children ?? []) {
    const encoded = encodeNode(child, cursor);
    children.push(encoded);
    cursor += encoded.byteLength;
  }
  const nullRecord = children.length > 0 ? new Uint8Array(13) : new Uint8Array();
  return join([
    uint32(cursor + nullRecord.byteLength),
    uint32(node.properties?.length ?? 0),
    uint32(properties.byteLength),
    new Uint8Array([name.byteLength]),
    name,
    properties,
    ...children,
    nullRecord,
  ]);
}

export function encodeBinaryFbxFixture(
  nodes: readonly FbxBinaryFixtureNode[],
): Uint8Array {
  const header = join([
    encoder.encode("Kaydara FBX Binary  \0"),
    new Uint8Array([0x1a, 0]),
    uint32(7400),
  ]);
  const encodedNodes: Uint8Array[] = [];
  let cursor = header.byteLength;
  for (const node of nodes) {
    const encoded = encodeNode(node, cursor);
    encodedNodes.push(encoded);
    cursor += encoded.byteLength;
  }
  return join([header, ...encodedNodes, new Uint8Array(176)]);
}
