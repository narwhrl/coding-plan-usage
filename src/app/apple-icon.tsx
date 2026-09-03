import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS 主屏图标：满幅方底，系统再套 squircle；三根额度条与 BrandMark 同一构图。 */
export default function AppleIcon(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#262626",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ width: 108, height: 20, borderRadius: 10, background: "#fafafa" }} />
          <div style={{ width: 72, height: 20, borderRadius: 10, background: "#fafafa" }} />
          <div style={{ width: 44, height: 20, borderRadius: 10, background: "#fafafa" }} />
        </div>
      </div>
    ),
    size,
  );
}
