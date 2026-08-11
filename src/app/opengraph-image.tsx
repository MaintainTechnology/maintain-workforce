import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = site.name;

// Brand hexes are literal here: this renders in satori, which has no access to
// the CSS custom properties from design-system/tokens.css.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: 80,
          backgroundColor: "#07272D",
          backgroundImage:
            "radial-gradient(60% 60% at 70% 18%, rgba(255,196,0,0.20), transparent 70%)",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 96,
            height: 8,
            backgroundColor: "#FFC400",
            marginBottom: 40,
          }}
        />
        {/* letterSpacing = --tracking-caps (0.08em) at this size. */}
        <div
          style={{
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: 3.2,
            color: "#FFC400",
          }}
        >
          MAINTAIN WORKER
        </div>
        <div
          style={{
            fontSize: 60,
            fontWeight: 800,
            lineHeight: 1.1,
            marginTop: 16,
            color: "#FFFFFF",
          }}
        >
          Skilled crews, shared between trusted companies.
        </div>
      </div>
    ),
    size,
  );
}
