import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftMotionReferenceContactSheet,
} from "./toolcraft-motion-reference-contact-sheet.mjs";

function frames(count) {
  return Array.from({ length: count }, (_, sourceFrameIndex) => ({
    path: `/tmp/review/review-${String(sourceFrameIndex).padStart(6, "0")}.png`,
    sourceFrameIndex,
    sourceLocator: `reference.mov#frame=${sourceFrameIndex}`,
    timeSeconds: sourceFrameIndex / 30,
  }));
}
function fakeExecutor(result = { stdout: "" }) {
  const calls = [];
  return {
    calls,
    execute: async (request) => {
      calls.push(request);
      return result;
    },
  };
}

test("lays out normalized PNG frames row-major with stable labels", async () => {
  const executor = fakeExecutor();
  const result = await createToolcraftMotionReferenceContactSheet({
    execute: executor.execute,
    frames: frames(4),
    outputPath: "/tmp/contact-sheet.png",
    sourceHeight: 900,
    sourceWidth: 1600,
  });

  assert.deepEqual({
    columns: result.columns,
    height: result.height,
    rows: result.rows,
    width: result.width,
  }, { columns: 3, height: 540, rows: 2, width: 1440 });
  assert.deepEqual(result.cells, [
    { column: 0, frameId: "source-frame:0", height: 270, row: 0,
      sourceFrameIndex: 0, width: 480, x: 0, y: 0 },
    { column: 1, frameId: "source-frame:1", height: 270, row: 0,
      sourceFrameIndex: 1, width: 480, x: 480, y: 0 },
    { column: 2, frameId: "source-frame:2", height: 270, row: 0,
      sourceFrameIndex: 2, width: 480, x: 960, y: 0 },
    { column: 0, frameId: "source-frame:3", height: 270, row: 1,
      sourceFrameIndex: 3, width: 480, x: 0, y: 270 },
  ]);
  assert.equal(result.outputPath, "/tmp/contact-sheet.png");
  assert.equal(executor.calls.length, 1);
  assert.equal(executor.calls[0].binary, "ffmpeg");
  assert.equal(executor.calls[0].stage, "contact-sheet");
  assert.match(executor.calls[0].args.join(" "), /source-frame\\:0/u);
});

test("caps the starting cell width at the source width", async () => {
  const executor = fakeExecutor();
  const result = await createToolcraftMotionReferenceContactSheet({
    execute: executor.execute,
    frames: frames(2),
    outputPath: "/tmp/contact-sheet.png",
    sourceHeight: 200,
    sourceWidth: 320,
  });

  assert.deepEqual({
    cellHeight: result.cells[0].height,
    cellWidth: result.cells[0].width,
    height: result.height,
    width: result.width,
  }, { cellHeight: 200, cellWidth: 320, height: 200, width: 640 });
  assert.match(executor.calls[0].args[executor.calls[0].args.indexOf("-filter_complex") + 1],
    /drawbox=x=0:y=172:w=320:h=28/iu);
});

test("uses numeric drawbox geometry and clamps its bar for tiny cells", async () => {
  const executor = fakeExecutor();
  await createToolcraftMotionReferenceContactSheet({
    execute: executor.execute,
    frames: frames(1),
    outputPath: "/tmp/tiny.png",
    sourceHeight: 10,
    sourceWidth: 320,
  });
  const graph = executor.calls[0].args[
    executor.calls[0].args.indexOf("-filter_complex") + 1
  ];

  assert.equal(graph,
    "[0:v]scale=320:10:force_original_aspect_ratio=decrease," +
    "pad=320:10:(ow-iw)/2:(oh-ih)/2:black," +
    "drawbox=x=0:y=0:w=320:h=10:color=black@0.65:t=fill," +
    "drawtext=text='source-frame\\:0':x=8:y=0:fontcolor=white:fontsize=16" +
    "[frame0];[frame0]null[sheet]");
});

test("uniformly scales cells down so neither final dimension exceeds 6000", async () => {
  const result = await createToolcraftMotionReferenceContactSheet({
    execute: fakeExecutor().execute,
    frames: frames(225),
    outputPath: "/tmp/contact-sheet.png",
    sourceHeight: 120,
    sourceWidth: 480,
  });

  assert.ok(result.width <= 6000);
  assert.ok(result.height <= 6000);
  assert.equal(result.columns, 30);
  assert.equal(result.rows, 8);
  assert.ok(result.cells[0].width < 480);
  assert.equal(result.cells[0].width / result.cells[0].height, 4);
});

test("rejects invalid counts, dimensions, indices, and empty PNG records", async () => {
  const valid = {
    execute: fakeExecutor().execute,
    frames: frames(1),
    outputPath: "/tmp/contact-sheet.png",
    sourceHeight: 100,
    sourceWidth: 100,
  };
  await assert.rejects(() => createToolcraftMotionReferenceContactSheet({
    ...valid, frames: [],
  }), /frame/iu);
  await assert.rejects(() => createToolcraftMotionReferenceContactSheet({
    ...valid, sourceWidth: 0,
  }), /dimensions/iu);
  await assert.rejects(() => createToolcraftMotionReferenceContactSheet({
    ...valid, frames: [{ ...frames(1)[0], sourceFrameIndex: -1 }],
  }), /sourceFrameIndex/iu);
  await assert.rejects(() => createToolcraftMotionReferenceContactSheet({
    ...valid, frames: [{ ...frames(1)[0], path: "" }],
  }), /PNG/iu);
});

test("normalizes executor failure at the contact-sheet stage", async () => {
  const cause = new Error("opaque process failure");
  await assert.rejects(
    () => createToolcraftMotionReferenceContactSheet({
      execute: fakeExecutor({ exitCode: 7, error: cause }).execute,
      frames: frames(1),
      outputPath: "/tmp/contact-sheet.png",
      sourceHeight: 100,
      sourceWidth: 100,
    }),
    (error) => error.name === "ToolcraftMotionReferenceStageError" &&
      error.stage === "contact-sheet" && error.cause === cause,
  );
});
