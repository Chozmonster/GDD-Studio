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
  const { frame, img } = cropImageStyle(c);

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
      className={
        className
          ? `mood-media-frame mood-media-raster ${className}`
          : "mood-media-frame mood-media-raster"
      }
      style={{ ...borderStyle, ...style }}
    >
      <div className="mood-media-crop" style={frame}>
        <img src={src} alt={alt} draggable={false} style={img} />
      </div>
    </div>
  );
}
