namespace ScamShield.App.Services;

public static class ImageFileValidator
{
    public const long MaximumImageSizeBytes = 10 * 1024 * 1024;

    public static void EnsureValidSize(long byteCount)
    {
        if (byteCount <= 0)
        {
            throw new ImageValidationException("選擇的圖片是空白檔案，請改選其他圖片。");
        }

        if (byteCount > MaximumImageSizeBytes)
        {
            throw new ImageValidationException("圖片大小不可超過 10 MiB。請選擇較小的圖片。");
        }
    }

    public static string DetectContentType(string fileName, ReadOnlySpan<byte> imageBytes)
    {
        EnsureValidSize(imageBytes.Length);

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        var isJpeg = imageBytes.Length >= 3
            && imageBytes[0] == 0xFF
            && imageBytes[1] == 0xD8
            && imageBytes[2] == 0xFF;
        var isPng = imageBytes.Length >= 8
            && imageBytes[0] == 0x89
            && imageBytes[1] == 0x50
            && imageBytes[2] == 0x4E
            && imageBytes[3] == 0x47
            && imageBytes[4] == 0x0D
            && imageBytes[5] == 0x0A
            && imageBytes[6] == 0x1A
            && imageBytes[7] == 0x0A;

        if (isJpeg && extension is ".jpg" or ".jpeg")
        {
            return "image/jpeg";
        }

        if (isPng && extension == ".png")
        {
            return "image/png";
        }

        throw new ImageValidationException(
            "僅支援副檔名與內容一致的 JPEG 或 PNG 圖片。");
    }
}

public sealed class ImageValidationException(string message) : Exception(message);
