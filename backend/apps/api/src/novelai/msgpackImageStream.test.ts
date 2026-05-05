import { Readable } from "node:stream";
import { pack } from "msgpackr";
import { describe, expect, it, vi } from "vitest";
import { decodeNovelAiMsgpackImageStream } from "./msgpackImageStream.js";

function frame(value: unknown) {
  const payload = pack(value);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

describe("decodeNovelAiMsgpackImageStream", () => {
  it("emits every final image from length-prefixed msgpack frames", async () => {
    const preview = frame({ event_type: "intermediate", step_ix: 5, total_steps: 10, sigma: 0.5, image: Buffer.from("preview") });
    const finalOne = frame({ event_type: "final", image: Buffer.from("final-image-1") });
    const finalTwo = frame({ event_type: "final", image: Buffer.from("final-image-2") });
    const output = await decodeNovelAiMsgpackImageStream(Readable.from([preview, finalOne, finalTwo]));

    expect(output.map((image) => image.toString())).toEqual(["final-image-1", "final-image-2"]);
  });

  it("forwards intermediate frames incrementally across chunk boundaries", async () => {
    const onIntermediateFrame = vi.fn();
    const preview = frame({
      event_type: "intermediate",
      samp_ix: 1,
      step_ix: 6,
      total_steps: 28,
      sigma: 0.75,
      gen_id: 1497277,
      image: Buffer.from("preview-frame"),
    });
    const final = frame({ event_type: "final", image: Buffer.from("final-image") });
    const chunkedPreview = [preview.subarray(0, 3), preview.subarray(3, 11), preview.subarray(11)];

    const output = await decodeNovelAiMsgpackImageStream(Readable.from([...chunkedPreview, final]), {
      onIntermediateFrame,
    });

    expect(onIntermediateFrame).toHaveBeenCalledTimes(1);
    expect(onIntermediateFrame).toHaveBeenCalledWith({
      outputIndex: 1,
      stepIndex: 6,
      totalSteps: 28,
      sigma: 0.75,
      providerGenerationId: "1497277",
      mimeType: "image/jpeg",
      buffer: Buffer.from("preview-frame"),
    });
    expect(output.map((image) => image.toString())).toEqual(["final-image"]);
  });
});
