import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { deflateSync, crc32 } from "node:zlib";
import {
  validateImage,
  checkDimensions,
} from "../../lib/server/image-validation";
import {
  readBoundedBody,
  parseMultipart,
  multipartBoundary,
} from "../../lib/server/multipart";
import { LIMITS } from "../../lib/contracts/analysis";
import { png, jpeg, upload, signal, multipart } from "../helpers/images";
describe("IMG complete image validation", () => {
  it("real PNG/JPEG, MIME case/parameters, absent filename or extension", async () => {
    for (const [bytes, mime, name] of [
      [await png(), "IMAGE/PNG; charset=binary", ""],
      [await jpeg(), "image/jpeg", "shot"],
      [await jpeg(), "image/jpeg", "shot.JPEG"],
    ] as const)
      expect(
        (await validateImage(upload(bytes, mime, name), signal())).width,
      ).toBe(10);
  });
  it("rejects empty/signature-only/truncated image", async () => {
    const bytes = await png();
    for (const value of [
      Buffer.alloc(0),
      bytes.subarray(0, 8),
      bytes.subarray(0, bytes.length - 15),
    ])
      await expect(
        validateImage(upload(value), signal()),
      ).rejects.toMatchObject({ code: "invalid_image" });
    for (const value of [
      Buffer.from([255, 216, 255]),
      (await jpeg()).subarray(0, 80),
    ])
      await expect(
        validateImage(upload(value, "image/jpeg", "a.jpg"), signal()),
      ).rejects.toMatchObject({ code: "invalid_image" });
  });
  it("rejects MIME, format and extension disagreement", async () => {
    for (const [mime, name] of [
      ["", "a.png"],
      ["image/webp", "a.png"],
      ["image/jpeg", "a.jpg"],
      ["image/png", "a.gif"],
      ["image/png", "a.jpg"],
    ])
      await expect(
        validateImage(upload(await png(), mime, name), signal()),
      ).rejects.toMatchObject({ code: "unsupported_image_format" });
  });
  it("4 MiB inclusive, +1 rejected; full decode catches damaged pixels", async () => {
    const bytes = await png();
    const padded = Buffer.concat([
      bytes,
      Buffer.alloc(LIMITS.imageBytes - bytes.length),
    ]);
    expect((await validateImage(upload(padded), signal())).width).toBe(10);
    await expect(
      validateImage(upload(Buffer.concat([padded, Buffer.alloc(1)])), signal()),
    ).rejects.toMatchObject({ code: "image_too_large" });
    const damaged = Buffer.from(bytes);
    const idat = damaged.indexOf("IDAT");
    damaged[idat + 5] ^= 255;
    await expect(
      validateImage(upload(damaged), signal()),
    ).rejects.toMatchObject({ code: "invalid_image" });
  });
  it("dimension and pixel boundaries with real decodable images", async () => {
    expect(() => checkDimensions(12000, 2000)).not.toThrow();
    for (const dims of [
      [12001, 1],
      [12000, 2001],
      [0, 10],
    ])
      expect(() => checkDimensions(...(dims as [number, number]))).toThrow();
    expect(
      (await validateImage(upload(await png(12000, 1)), signal())).width,
    ).toBe(12000);
    expect(
      (await validateImage(upload(await png(6000, 4000)), signal())).height,
    ).toBe(4000);
    await expect(
      validateImage(upload(await png(12001, 1)), signal()),
    ).rejects.toMatchObject({ code: "image_too_large" });
    await expect(
      validateImage(upload(await png(6001, 4000)), signal()),
    ).rejects.toMatchObject({ code: "image_too_large" });
  });
  it("rejects APNG chunks even if decoder would read default frame", async () => {
    const bytes = await png();
    const animation = Buffer.alloc(20);
    animation.writeUInt32BE(8);
    animation.write("acTL", 4);
    animation.writeUInt32BE(2, 8);
    await expect(
      validateImage(
        upload(
          Buffer.concat([bytes.subarray(0, 33), animation, bytes.subarray(33)]),
        ),
        signal(),
      ),
    ).rejects.toMatchObject({ code: "unsupported_image_format" });
  });
  it("rotates EXIF, strips metadata", async () => {
    const bytes = await sharp(await jpeg(20, 10))
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const output = await validateImage(
      upload(bytes, "image/jpeg", "photo.jpg"),
      signal(),
    );
    expect([output.width, output.height]).toEqual([10, 20]);
    const metadata = await sharp(output.bytes).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
  });
  it("rejects MPO multi-image APP2 rather than accepting only its first JPEG", async () => {
    const bytes = await jpeg();
    const mpf = Buffer.alloc(26);
    mpf.write("MPF\0");
    mpf.write("II", 4);
    mpf.writeUInt16LE(42, 6);
    mpf.writeUInt32LE(8, 8);
    mpf.writeUInt16LE(1, 12);
    mpf.writeUInt16LE(0xb001, 14);
    mpf.writeUInt16LE(4, 16);
    mpf.writeUInt32LE(1, 18);
    mpf.writeUInt32LE(2, 22);
    const marker = Buffer.alloc(4);
    marker[0] = 255;
    marker[1] = 0xe2;
    marker.writeUInt16BE(mpf.length + 2, 2);
    await expect(
      validateImage(
        upload(
          Buffer.concat([bytes.subarray(0, 2), marker, mpf, bytes.subarray(2)]),
          "image/jpeg",
          "a.jpg",
        ),
        signal(),
      ),
    ).rejects.toMatchObject({ code: "unsupported_image_format" });
  });
  it("re-encoding can exceed byte limit and must fail", async () => {
    // Deterministic indexed PNG: compact indexes expand into poorly compressible RGB.
    let seed = 12345;
    const next = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed & 255;
    };
    const chunk = (name: string, data: Buffer) => {
      const b = Buffer.alloc(data.length + 12);
      b.writeUInt32BE(data.length);
      b.write(name, 4);
      data.copy(b, 8);
      b.writeUInt32BE(crc32(b.subarray(4, -4)), b.length - 4);
      return b;
    };
    const size = 1800,
      header = Buffer.alloc(13);
    header.writeUInt32BE(size);
    header.writeUInt32BE(size, 4);
    header[8] = 8;
    header[9] = 3;
    const palette = Buffer.from(Array.from({ length: 768 }, next));
    const scanlines = Buffer.alloc((size + 1) * size);
    for (let y = 0; y < size; y++)
      for (let x = 1; x <= size; x++) scanlines[y * (size + 1) + x] = next();
    const bytes = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("PLTE", palette),
      chunk("IDAT", deflateSync(scanlines)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    expect(bytes.length).toBeLessThan(LIMITS.imageBytes);
    const code = await validateImage(upload(bytes), signal()).then(
      () => "accepted",
      (error) => error.code,
    );
    expect(code).toBe("image_too_large");
  });
});
describe("API multipart structural limits", () => {
  it("preserves absent filename, defaults and valid language", async () => {
    const bytes = await png();
    const parsed = parseMultipart(
      multipart([{ name: "image", mime: "image/png", data: bytes }]),
      "scamshield-test",
    );
    expect(parsed).toMatchObject({
      filename: "",
      source: "image",
      language: "zh-TW",
    });
    for (const language of [
      "zh-TW",
      " x-private ",
      "i-klingon",
      "en-US-u-ca-gregory",
    ]) {
      const result = parseMultipart(
        multipart([
          {
            name: "image",
            filename: "圖片.PNG",
            mime: "image/png",
            data: bytes,
          },
          { name: "language", data: language },
        ]),
        "scamshield-test",
      );
      expect(result.language).toBe(language.trim());
      expect(result.filename).toBe("圖片.PNG");
    }
  });
  it("exact body limit, fake/missing Content-Length, stream cancellation", async () => {
    for (const count of [LIMITS.bodyBytes, LIMITS.bodyBytes + 1])
      for (const length of [undefined, "1"]) {
        let cancelled = false;
        const body = new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(count));
            c.close();
          },
          cancel() {
            cancelled = true;
          },
        });
        const req = new Request("http://localhost", {
          method: "POST",
          body,
          duplex: "half",
          headers: length ? { "content-length": length } : {},
        } as RequestInit);
        if (count === LIMITS.bodyBytes)
          expect((await readBoundedBody(req, signal())).length).toBe(count);
        else
          await expect(readBoundedBody(req, signal())).rejects.toMatchObject({
            code: "image_too_large",
          });
        expect(typeof cancelled).toBe("boolean");
      }
  });
  it("rejects broken boundaries and structural fields", async () => {
    for (const type of [
      "",
      "application/json",
      "multipart/form-data",
      'multipart/form-data; boundary="bad\n"',
    ])
      expect(() => multipartBoundary(type)).toThrow();
    const img = {
      name: "image",
      filename: "ok.png",
      mime: "image/png",
      data: await png(),
    };
    for (const parts of [
      [],
      [img, img],
      [
        img,
        { name: "source", data: "image" },
        { name: "source", data: "image" },
      ],
      [img, { name: "language", data: "en", filename: "text.txt" }],
      [img, { name: "extra", data: "x" }],
      [img, { name: "source", data: " Image" }],
      [img, { name: "language", data: "  " }],
      [img, { name: "language", data: "zh_TW" }],
      [{ ...img, filename: "a".repeat(256) }],
      [img, { name: "language", data: "a".repeat(65) }],
    ])
      expect(() =>
        parseMultipart(multipart(parts), "scamshield-test"),
      ).toThrow();
  });
});
