import "server-only";
import { parse as parseType } from "content-type";
import { parse as parseDisposition } from "content-disposition";
import { parse as parseLanguage } from "bcp-47";
import { LIMITS } from "../contracts/analysis";
import { AppError } from "./errors";
import { abortable, checkAbort } from "./deadline";

export interface ImageUpload {
  bytes: Buffer;
  mime: string;
  filename: string;
  source: "image" | "screenshot";
  language: string;
}
const invalid = () => new AppError("invalid_request");
export async function readBoundedBody(
  request: Request,
  signal: AbortSignal,
): Promise<Buffer> {
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > LIMITS.bodyBytes)
    throw new AppError("image_too_large");
  if (!request.body) throw invalid();
  const reader = request.body.getReader();
  // A fixed arena also bounds memory for adversarial tiny/empty stream chunks.
  // Returning only the written slice never exposes uninitialized bytes.
  const buffer = Buffer.allocUnsafe(LIMITS.bodyBytes);
  let count = 0;
  try {
    while (true) {
      checkAbort(signal);
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      count += value.byteLength;
      if (count > LIMITS.bodyBytes) throw new AppError("image_too_large");
      buffer.set(value, count - value.byteLength);
    }
    return buffer.subarray(0, count);
  } finally {
    // Do not await a malicious or stalled stream's cancel promise.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
function utf8(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw invalid();
  }
}
export function multipartBoundary(contentType: string | null): string {
  try {
    const parsed = parseType(contentType ?? "");
    const boundary = parsed.parameters.boundary;
    if (
      parsed.type !== "multipart/form-data" ||
      !boundary ||
      !/^[0-9A-Za-z'()+_,\-./:=? ]{1,70}$/.test(boundary) ||
      boundary.endsWith(" ")
    )
      throw invalid();
    return boundary;
  } catch {
    throw invalid();
  }
}
// Parse only after a bounded read. Preserve original UTF-8 filename and MIME
// presence; native FormData parsers can drop absent filenames or infer MIME.
export function parseMultipart(body: Buffer, boundary: string): ImageUpload {
  const delimiter = Buffer.from(`--${boundary}`);
  const nextDelimiter = Buffer.from(`\r\n--${boundary}`);
  if (!body.subarray(0, delimiter.length).equals(delimiter)) throw invalid();
  let offset = delimiter.length;
  const parts = new Map<
    string,
    { data: Buffer; filename?: string; mime?: string }
  >();
  while (true) {
    if (body.subarray(offset, offset + 2).toString() === "--") {
      const tail = body.subarray(offset + 2);
      if (tail.length && tail.subarray(0, 2).toString() !== "\r\n")
        throw invalid();
      break;
    }
    if (
      body.subarray(offset, offset + 2).toString() !== "\r\n" ||
      parts.size >= 3
    )
      throw invalid();
    offset += 2;
    const endHeaders = body.indexOf("\r\n\r\n", offset);
    if (endHeaders < 0 || endHeaders - offset > 16_384) throw invalid();
    const headers = new Map<string, string>();
    for (const line of utf8(body.subarray(offset, endHeaders)).split("\r\n")) {
      const match = /^([\w-]+):[ \t]*([^\r\n]*)$/.exec(line);
      if (!match || headers.has(match[1].toLowerCase())) throw invalid();
      headers.set(match[1].toLowerCase(), match[2]);
    }
    let name: string, filename: string | undefined;
    try {
      const parsed = parseDisposition(headers.get("content-disposition") ?? "");
      if (parsed.type !== "form-data") throw invalid();
      name = parsed.parameters.name;
      filename = parsed.parameters.filename;
    } catch {
      throw invalid();
    }
    if (!["image", "source", "language"].includes(name) || parts.has(name))
      throw invalid();
    let end = body.indexOf(nextDelimiter, endHeaders + 4);
    // A boundary-like byte sequence is data unless followed by CRLF or --.
    while (
      end >= 0 &&
      !["\r\n", "--"].includes(
        body
          .subarray(end + nextDelimiter.length, end + nextDelimiter.length + 2)
          .toString(),
      )
    )
      end = body.indexOf(nextDelimiter, end + 1);
    if (end < 0) throw invalid();
    parts.set(name, {
      data: body.subarray(endHeaders + 4, end),
      filename,
      mime: headers.get("content-type"),
    });
    offset = end + nextDelimiter.length;
  }
  const image = parts.get("image");
  if (!image || (image.filename === undefined && image.mime === undefined))
    throw invalid();
  for (const name of ["source", "language"]) {
    const part = parts.get(name);
    if (part?.filename !== undefined) throw invalid();
    if (part?.mime) {
      try {
        if (parseType(part.mime).type !== "text/plain") throw invalid();
      } catch {
        throw invalid();
      }
    }
  }
  const sourcePart = parts.get("source");
  const languagePart = parts.get("language");
  if (
    (sourcePart?.data.length ?? 0) > LIMITS.sourceBytes ||
    (languagePart?.data.length ?? 0) > LIMITS.languageBytes ||
    Buffer.byteLength(image.filename ?? "") > LIMITS.filenameBytes
  )
    throw invalid();
  const source = sourcePart ? utf8(sourcePart.data) : "image";
  const language = languagePart ? utf8(languagePart.data).trim() : "zh-TW";
  if (source !== "image" && source !== "screenshot") throw invalid();
  const tag = parseLanguage(language);
  if (
    !language ||
    !(tag.language || tag.irregular || tag.regular || tag.privateuse.length)
  )
    throw invalid();
  if (
    new Set(tag.variants.map((v) => v.toLowerCase())).size !==
      tag.variants.length ||
    new Set(tag.extensions.map((v) => v.singleton.toLowerCase())).size !==
      tag.extensions.length
  )
    throw invalid();
  return {
    bytes: image.data,
    mime: image.mime ?? "",
    filename: image.filename ?? "",
    source,
    language,
  };
}
