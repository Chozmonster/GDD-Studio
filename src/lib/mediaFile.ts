/**
 * Media allowed for document embeds and Mood Board ingest.
 * SVG is excluded: scriptable XML can become XSS if ever navigated or
 * inlined outside a sandboxed <img> context.
 */

const EXT_RE =
  /\.(png|jpe?g|gif|webp|bmp|mp4|webm|mov|mkv|mp3|wav|ogg|m4a|flac)$/i;

function isDisallowedSvgMedia(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type.includes("svg") ||
    name.endsWith(".svg") ||
    name.endsWith(".svgz")
  );
}

/** True when the file is a supported raster/video/audio asset. */
export function isAllowedMediaFile(file: File): boolean {
  if (isDisallowedSvgMedia(file)) return false;
  const type = file.type.toLowerCase();
  if (
    type.startsWith("image/") ||
    type.startsWith("video/") ||
    type.startsWith("audio/")
  ) {
    return true;
  }
  return EXT_RE.test(file.name);
}
