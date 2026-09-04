import "server-only";
import sharp from "sharp";
import { parse as parseType } from "content-type";
import { LIMITS } from "../contracts/analysis";
import { AppError } from "./errors";
import { abortable, checkAbort } from "./deadline";
import type { ImageUpload } from "./multipart";
// Do not retain decoded upload operations in libvips' cross-request cache.
sharp.cache(false);
export interface ValidatedImage {
  bytes: Buffer;
  mimeType: "image/png" | "image/jpeg";
  width: number;
  height: number;
  sizeBytes: number;
}
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export function checkDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  )
    throw new AppError("invalid_image");
  if (
    width > LIMITS.dimension ||
    height > LIMITS.dimension ||
    width * height > LIMITS.pixels
  )
    throw new AppError("image_too_large");
}
function checkPngChunks(bytes: Buffer): void {
  let offset = 8,
    ended = false;
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset);
    const name = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    if (offset + size + 12 > bytes.length) throw new AppError("invalid_image");
    // libvips may decode only APNG's default frame. Reject animation chunks explicitly.
    if (["acTL", "fcTL", "fdAT"].includes(name))
      throw new AppError("unsupported_image_format");
    offset += size + 12;
    if (name === "IEND") {
      if (size !== 0) throw new AppError("invalid_image");
      ended = true;
      break;
    }
  }
  if (!ended) throw new AppError("invalid_image");
}
function checkJpegFrames(bytes: Buffer): void {
  // MPO stores multiple JPEG images in APP2 MPF. Some decoders report only the
  // first page, so inspect its TIFF NumberOfImages before decoding.
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 255) throw new AppError("invalid_image");
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) return;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) throw new AppError("invalid_image");
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length)
      throw new AppError("invalid_image");
    const data = bytes.subarray(offset + 2, offset + length);
    if (marker === 0xe2 && data.subarray(0, 4).equals(Buffer.from("MPF\0"))) {
      const tiff = data.subarray(4),
        little = tiff.subarray(0, 2).toString() === "II";
      try {
        if (!little && tiff.subarray(0, 2).toString() !== "MM")
          throw new Error();
        const u16 = (i: number) =>
          little ? tiff.readUInt16LE(i) : tiff.readUInt16BE(i);
        const u32 = (i: number) =>
          little ? tiff.readUInt32LE(i) : tiff.readUInt32BE(i);
        if (u16(2) !== 42) throw new Error();
        const directory = u32(4),
          count = u16(directory);
        let found = false;
        for (let i = 0; i < count; i++) {
          const entry = directory + 2 + i * 12;
          if (u16(entry) === 0xb001) {
            if (u16(entry + 2) !== 4 || u32(entry + 4) !== 1) throw new Error();
            if (u32(entry + 8) > 1)
              throw new AppError("unsupported_image_format");
            if (u32(entry + 8) !== 1) throw new Error();
            found = true;
          }
        }
        if (!found) throw new Error();
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError("invalid_image");
      }
    }
    offset += length;
  }
}
export async function validateImage(
  upload: ImageUpload,
  signal: AbortSignal,
): Promise<ValidatedImage> {
  checkAbort(signal);
  const { bytes, filename } = upload;
  if (!bytes.length) throw new AppError("invalid_image");
  if (bytes.length > LIMITS.imageBytes) throw new AppError("image_too_large");
  let mime: string;
  try {
    mime = parseType(upload.mime).type;
  } catch {
    throw new AppError("unsupported_image_format");
  }
  if (!["image/png", "image/jpeg"].includes(mime))
    throw new AppError("unsupported_image_format");
  const format = bytes.subarray(0, 8).equals(PNG)
    ? "png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? "jpeg"
      : undefined;
  if (!format) throw new AppError("invalid_image");
  if (mime !== `image/${format}`)
    throw new AppError("unsupported_image_format");
  const extension = /\.([^./\\]*)$/.exec(filename)?.[1].toLowerCase();
  if (
    extension !== undefined &&
    !(format === "png"
      ? extension === "png"
      : ["jpg", "jpeg"].includes(extension))
  )
    throw new AppError("unsupported_image_format");
  if (format === "png") checkPngChunks(bytes);
  else checkJpegFrames(bytes);
  const decoder = sharp(bytes, {
    failOn: "warning",
    limitInputPixels: LIMITS.pixels,
  });
  try {
    const metadata = await abortable(decoder.metadata(), signal);
    checkDimensions(metadata.width, metadata.height);
    if ((metadata.pages ?? 1) !== LIMITS.frames)
      throw new AppError("unsupported_image_format");
    if (metadata.format !== format)
      throw new AppError("unsupported_image_format");
    checkAbort(signal);
    // toBuffer forces complete decode. Sharp strips metadata unless explicitly retained.
    const { data, info } = await abortable(
      decoder.rotate().toFormat(format).toBuffer({ resolveWithObject: true }),
      signal,
    );
    checkDimensions(info.width, info.height);
    if (data.length > LIMITS.imageBytes) throw new AppError("image_too_large");
    return {
      bytes: data,
      mimeType: format === "png" ? "image/png" : "image/jpeg",
      width: info.width,
      height: info.height,
      sizeBytes: data.length,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && /pixel limit/i.test(error.message))
      throw new AppError("image_too_large");
    throw new AppError("invalid_image");
  } finally {
    decoder.destroy();
  }
}
