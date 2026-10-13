import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

// The image a link to RXJ shows when it is shared: the logo and the
// headline, 1200 x 630. Made at build time from the files below.
export const alt = "RXJ: build AI agents that actually do the work";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const [logo, font] = await Promise.all([
    readFile(path.join(process.cwd(), "public/brand/rxj-wordmark.png")),
    readFile(path.join(process.cwd(), "assets/fonts/NotoSans-Bold.ttf")),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 88px",
        color: "#f3f4fb",
        fontFamily: "Noto Sans",
        // The logo's own background, so the logo sits on it without an edge
        backgroundColor: "#03031a",
        backgroundImage:
          "radial-gradient(circle at 18% 12%, rgba(152,41,253,0.45), transparent 46%), radial-gradient(circle at 88% 92%, rgba(0,153,254,0.38), transparent 48%)",
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: next/og draws plain <img> */}
      <img
        src={`data:image/png;base64,${logo.toString("base64")}`}
        alt=""
        width={342}
        height={169}
        style={{ borderRadius: 24 }}
      />
      <div
        style={{
          marginTop: 44,
          fontSize: 76,
          lineHeight: 1.05,
          letterSpacing: -2,
          maxWidth: 980,
        }}
      >
        Build AI agents that actually do the work
      </div>
      <div
        style={{ marginTop: 26, fontSize: 30, color: "#a4a9c6", maxWidth: 940 }}
      >
        Visual workflows, agents with tools, human approval, any model.
      </div>
    </div>,
    {
      ...size,
      fonts: [{ name: "Noto Sans", data: font, weight: 700, style: "normal" }],
    },
  );
}
