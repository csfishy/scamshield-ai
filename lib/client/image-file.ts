import { LIMITS } from "../contracts/analysis";

export class ImageSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageSelectionError";
  }
}

export type ClientImageInfo = {
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
};

function matchesSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/png") {
    const png = [137, 80, 78, 71, 13, 10, 26, 10];
    return png.every((value, index) => bytes[index] === value);
  }
  return (
    mimeType === "image/jpeg" &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

function validateExtension(filename: string, mimeType: string): void {
  const match = filename.toLowerCase().match(/\.([^.]+)$/);
  if (!match) return;
  const extension = match[1];
  const expected = mimeType === "image/png" ? ["png"] : ["jpg", "jpeg"];
  if (!expected.includes(extension)) {
    throw new ImageSelectionError(
      "檔案副檔名與圖片格式不一致，請重新匯出 JPEG 或 PNG。",
    );
  }
}

function loadDimensions(
  objectUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () =>
      reject(new ImageSelectionError("圖片已損壞或無法讀取。"));
    image.src = objectUrl;
  });
}

export async function validateImageFile(
  file: File,
  objectUrl: string,
): Promise<ClientImageInfo> {
  if (new TextEncoder().encode(file.name).byteLength > LIMITS.filenameBytes) {
    throw new ImageSelectionError("圖片檔名過長，請縮短至 255 bytes 以內。");
  }
  if (file.size === 0) {
    throw new ImageSelectionError("圖片檔案是空的，請重新選擇有效截圖。");
  }
  if (file.size > LIMITS.imageBytes) {
    throw new ImageSelectionError("圖片不可超過 4 MiB，請選擇較小的截圖。");
  }

  const mimeType = file.type.toLowerCase();
  if (mimeType !== "image/jpeg" && mimeType !== "image/png") {
    throw new ImageSelectionError("僅支援單張 JPEG 或 PNG 圖片。");
  }

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!matchesSignature(header, mimeType)) {
    throw new ImageSelectionError(
      "檔案內容與宣告的圖片格式不一致，請選擇有效的 JPEG 或 PNG。",
    );
  }
  validateExtension(file.name, mimeType);

  const dimensions = await loadDimensions(objectUrl);
  if (dimensions.width <= 0 || dimensions.height <= 0) {
    throw new ImageSelectionError("圖片尺寸無效，請重新選擇截圖。");
  }
  if (
    dimensions.width > LIMITS.dimension ||
    dimensions.height > LIMITS.dimension ||
    dimensions.width * dimensions.height > LIMITS.pixels
  ) {
    throw new ImageSelectionError(
      "圖片尺寸過大；每邊最多 12,000 像素，總像素最多 24,000,000。",
    );
  }

  return {
    mimeType,
    width: dimensions.width,
    height: dimensions.height,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
  return `${Math.max(bytes / 1024, 0.1).toFixed(1)} KiB`;
}
