import type { CSSProperties, ReactNode } from "react";

/**
 * The graphite page ground every Overlay component sits on. The app paints it
 * on <body>; the preview card chrome paints white, so each story restores it.
 */
export function Frame({ children, width, style }: { children: ReactNode; width?: number; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: "var(--color-bg)",
        color: "var(--color-ink)",
        padding: 16,
        borderRadius: 8,
        width,
        maxWidth: "100%",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
