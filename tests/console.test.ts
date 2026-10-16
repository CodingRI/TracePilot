import { describe, expect, it } from "vitest";
import { ConsoleExporter } from "../src/exporters/console.js";
import type { Trace } from "../src/types/trace.js";

describe("ConsoleExporter UI Enhancements", () => {
  const sampleTrace: Trace = {
    id: "trace-ui-test",
    name: "manim-video-pipeline",
    startTime: 1000,
    endTime: 245270,
    duration: 244270,
    status: "success",
    metadata: {},
    spans: [
      {
        id: "s1",
        name: "structure-planning",
        type: "agent",
        startTime: 1000,
        endTime: 2760,
        duration: 1760,
        status: "success",
        attributes: {},
      },
      {
        id: "s2",
        name: "generate-scene-code",
        type: "agent",
        startTime: 2760,
        endTime: 27390,
        duration: 24630,
        status: "success",
        attributes: {},
      },
      {
        id: "s2-sub",
        parentId: "s2",
        name: "scene-1-codegen",
        type: "llm",
        startTime: 2760,
        endTime: 7770,
        duration: 5010,
        status: "success",
        attributes: {},
      },
      {
        id: "s2-sub-repair",
        parentId: "s2-sub",
        name: "scene-1-validation-and-repair",
        type: "tool",
        startTime: 7770,
        endTime: 7773,
        duration: 3,
        status: "success",
        attributes: {},
      },
    ],
  };

  it("renders distinct dividers with top, middle, and bottom framing", () => {
    const exporter = new ConsoleExporter({ colors: false });
    const output = exporter.formatTrace(sampleTrace);

    // Top divider with banner
    expect(output).toContain("╭── [TracePilot] manim-video-pipeline ─");
    // Left boundary enclosing the spans
    expect(output).toContain("│  ├─ structure-planning");
    expect(output).toContain("│  └─ generate-scene-code");
    expect(output).toContain("│     └─ scene-1-codegen");
    expect(output).toContain("│        └─ scene-1-validation-and-repair");
    // Middle divider before summary
    expect(output).toContain("├─");
    // Summary line
    expect(output).toContain("Status: success");
    expect(output).toContain("Total: 244.27s");
    expect(output).toContain("Spans: 4 recorded");
    // Bottom divider
    expect(output).toContain("╰─");
  });

  it("does NOT contain any emojis", () => {
    const errorTrace: Trace = {
      id: "trace-err",
      name: "failing-pipeline",
      startTime: 1000,
      endTime: 1500,
      duration: 500,
      status: "error",
      metadata: {},
      error: { name: "JobError", message: "Failed" },
      spans: [
        {
          id: "err-span",
          name: "render-scene",
          type: "tool",
          startTime: 1000,
          endTime: 1500,
          duration: 500,
          status: "error",
          attributes: {},
          error: { name: "RenderError", message: "Out of memory" },
        },
      ],
    };

    const exporter = new ConsoleExporter({ colors: false });
    const successOutput = exporter.formatTrace(sampleTrace);
    const errorOutput = exporter.formatTrace(errorTrace);

    // Regex matching unicode emoji characters
    const emojiRegex = /\p{Extended_Pictographic}/u;

    expect(emojiRegex.test(successOutput)).toBe(false);
    expect(emojiRegex.test(errorOutput)).toBe(false);

    // Standard ASCII/unicode check and cross marks
    expect(successOutput).toContain("✓");
    expect(errorOutput).toContain("✗");
  });

  it("injects warm ANSI colors when colors: true is set", () => {
    const exporter = new ConsoleExporter({ colors: true });
    const output = exporter.formatTrace(sampleTrace);

    // Check for ANSI escape sequences
    expect(output).toContain("\x1b[");
    // Contains trace name
    expect(output).toContain("manim-video-pipeline");
    // Contains duration
    expect(output).toContain("244.27s");
  });

  it("supports custom width for terminal dividers", () => {
    const exporter = new ConsoleExporter({ colors: false, width: 80 });
    const output = exporter.formatTrace(sampleTrace);
    const lines = output.split("\n").filter((l) => l.trim().length > 0);

    // Mid divider length: ├ + 79 dashes = 80 chars
    const midDivider = lines.find((l) => l.startsWith("├"));
    expect(midDivider).toBeDefined();
    expect(midDivider?.length).toBe(80);
  });
});
