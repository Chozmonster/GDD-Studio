import type { CSSProperties } from "react";
import {
  borderCss,
  cropImageStyle,
  normalizeCrop,
} from "../../lib/moodBoardEdit";
import type { MoodBoardBorder, MoodBoardCrop } from "../../types";

type MoodMediaFrameProps = {
  src: string;
  alt: string;
  kind: string;
  crop?: MoodBoardCrop | null;
  border?: MoodBoardBorder | null;
  /** Optional outer class for tile vs embed chrome. */
  className?: string;
  style?: CSSProperties;
};

/**
 * Shared crop + border renderer for Mood Board tiles and live document embeds.
 * Video/audio ignore crop (still get border when set).
 */
export function MoodMediaFrame({
  src,
  alt,
  kind,
  crop,
  border,
  className,
  style,
}: MoodMediaFrameProps) {
  const borderStyle = borderCss(border);
  const isRaster = kind === "image" || kind === "gif";
  const c = normalizeCrop(crop);
  const { outer, frame, img } = cropImageStyle(c);
  const cropped = Boolean(c);

  const rootClass = [
    "mood-media-frame",
    isRaster ? "mood-media-raster" : null,
    kind === "video" ? "mood-media-video" : null,
    cropped ? "mood-media-cropped" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (kind === "audio") {
    return (
      <div
        className={className ? `mood-media-frame ${className}` : "mood-media-frame"}
        style={{ ...borderStyle, ...style }}
      >
        <audio src={src} controls preload="metadata" />
      </div>
    );
  }

  if (kind === "video") {
    return (
      <div
        className={
          className
            ? `mood-media-frame mood-media-video ${className}`
            : "mood-media-frame mood-media-video"
        }
        style={{ ...borderStyle, ...style }}
      >
        <video src={src} controls playsInline preload="metadata" />
      </div>
    );
  }

  if (!isRaster) {
    return (
      <div
        className={className ? `mood-media-frame ${className}` : "mood-media-frame"}
        style={{ ...borderStyle, ...style }}
      >
        <img src={src} alt={alt} draggable={false} />
      </div>
    );
  }

  return (
    <div
      className={rootClass}
      style={{ ...borderStyle, ...outer, ...style }}
    >
      <div className="mood-media-crop" style={frame}>
        <img src={src} alt={alt} draggable={false} style={img} />
      </div>
    </div>
  );
}
