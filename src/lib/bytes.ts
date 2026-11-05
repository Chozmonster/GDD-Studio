/** Chunked base64 encode — avoids call-stack limits on large media. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function fileToBase64(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  return bytesToBase64(new Uint8Array(buf));
}
