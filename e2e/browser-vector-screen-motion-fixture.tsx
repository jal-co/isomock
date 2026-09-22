// Framework-only adversarial fixture: real built-in pads, intentionally selectable renderer faults.
import { useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { VectorControl, type VectorControlValue } from "@/toolcraft/ui/components/controls";
import { drawVectorShaderFixture } from "./browser-vector-shader-fixture";

export type VectorFixtureMode =
  | "dom"
  | "canvas"
  | "mirror-x"
  | "mirror-y"
  | "swapped"
  | "stationary"
  | "release-only"
  | "moving-frame"
  | "missing-marker"
  | "nested-mirror"
  | "cartesian"
  | "shader"
  | "shader-mirrored";

function Fixture({ mode }: { mode: VectorFixtureMode }) {
  const [values, setValues] = useState<VectorControlValue[]>([
    { x: "0", y: "0" },
    { x: "0", y: "0" },
  ]);
  const [released, setReleased] = useState(values);
  const canvas = useRef<HTMLCanvasElement>(null);
  const rendered = mode === "release-only" ? released : values;
  let x = Number(rendered[0]!.x) * 70;
  let y = Number(rendered[0]!.y) * 70;
  if (mode === "mirror-x") x = -x;
  if (mode === "mirror-y" || mode === "cartesian") y = -y;
  if (mode === "swapped") [x, y] = [y, x];
  if (mode === "stationary") {
    x = 0;
    y = 0;
  }
  if (mode === "nested-mirror") {
    x -= Number(rendered[1]!.x) * 70;
    y += Number(rendered[1]!.y) * 70;
  }

  useLayoutEffect(() => {
    if (!canvas.current) return;
    if (mode === "shader" || mode === "shader-mirrored") {
      return drawVectorShaderFixture(
        canvas.current,
        x,
        y,
        mode === "shader-mirrored",
      );
    }
    const context = canvas.current.getContext("2d")!;
    context.fillStyle = "#101010";
    context.fillRect(0, 0, 320, 320);
    context.fillStyle = "rgb(255, 0, 128)";
    context.fillRect(148 + x, 148 + y, 24, 24);
  }, [x, y, mode]);

  return (
    <>
      <div
        data-toolcraft-control-target="proof.offset"
        style={{
          position: "fixed",
          left: 60,
          top: 80,
          width: 220,
          zIndex: 9999,
          background: "#181818",
        }}
        onPointerUpCapture={() => setReleased(values)}
      >
        {values
          .slice(0, mode === "nested-mirror" ? 2 : 1)
          .map((value, index) => (
            <VectorControl
              key={index}
              name={`Offset ${index + 1}`}
              {...value}
              padCoordinateMode={mode === "cartesian" ? "cartesian" : "screen"}
              onValueChange={(next) =>
                setValues((current) =>
                  current.map((item, i) => (i === index ? next : item)),
                )
              }
            />
          ))}
      </div>
      <div
        data-toolcraft-product-output="vector-fixture"
        style={{
          position: "fixed",
          left: 500,
          top: 100,
          width: 320,
          height: 320,
          zIndex: 9999,
          background: "#101010",
          transform:
            mode === "moving-frame" ? `translate(${x}px, ${y}px)` : undefined,
        }}
      >
        {mode === "canvas" ||
        mode === "shader" ||
        mode === "shader-mirrored" ? (
          <canvas ref={canvas} width={320} height={320} />
        ) : (
          <div
            style={{
              position: "absolute",
              left: 148 + x,
              top: 148 + y,
              width: 24,
              height: 24,
              background:
                mode === "missing-marker" ? "#101010" : "rgb(255, 0, 128)",
            }}
          />
        )}
      </div>
    </>
  );
}

export function mountVectorFixture(mode: VectorFixtureMode): void {
  const host = document.createElement("div");
  document.querySelector('[data-slot="toolcraft-runtime-app"]')!.append(host);
  createRoot(host).render(<Fixture mode={mode} />);
}
