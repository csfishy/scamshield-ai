import sharp from "sharp";
export const signal = () => new AbortController().signal;
export async function png(width = 10, height = 10): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
}
export async function jpeg(width = 10, height = 10): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: "#ffffff" },
  })
    .jpeg()
    .toBuffer();
}
export function upload(
  bytes: Buffer,
  mime = "image/png",
  filename = "test.png",
) {
  return { bytes, mime, filename, source: "image" as const, language: "zh-TW" };
}
export interface Part {
  name: string;
  data: string | Buffer;
  filename?: string;
  mime?: string;
}
export function multipart(parts: Part[], boundary = "scamshield-test"): Buffer {
  return Buffer.concat([
    ...parts.flatMap((p) => [
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"${p.filename === undefined ? "" : `; filename="${p.filename}"`}\r\n${p.mime === undefined ? "" : `Content-Type: ${p.mime}\r\n`}\r\n`,
      ),
      Buffer.from(p.data),
      Buffer.from("\r\n"),
    ]),
    Buffer.from(`--${boundary}--\r\n`),
  ]);
}
export function request(
  bytes: Buffer,
  parts: Part[] = [],
  options: { mime?: string; filename?: string; signal?: AbortSignal } = {},
) {
  const body = multipart([
    {
      name: "image",
      data: bytes,
      filename: options.filename ?? "test.png",
      mime: options.mime ?? "image/png",
    },
    ...parts,
  ]);
  return new Request("http://localhost/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "multipart/form-data; boundary=scamshield-test",
    },
    body: new Uint8Array(body),
    signal: options.signal,
  });
}
