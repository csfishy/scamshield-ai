using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Input;
using ScamShield.App.Configuration;
using ScamShield.App.Models;
using ScamShield.App.Services;

namespace ScamShield.App.ViewModels;

public sealed class MainViewModel : INotifyPropertyChanged
{
    private const long MaximumImageSizeBytes = 10 * 1024 * 1024;

    private readonly IScamAnalysisService _analysisService;
    private readonly AsyncCommand _selectImageCommand;
    private readonly AsyncCommand _analyzeCommand;
    private readonly AsyncCommand _retryCommand;

    private byte[]? _selectedImageBytes;
    private string? _selectedFileName;
    private string? _selectedContentType;
    private ImageSource? _previewSource;
    private string _selectedFileDetails = "尚未選擇圖片";
    private string? _errorMessage;
    private bool _isBusy;
    private bool _canRetry;

    public MainViewModel(
        IScamAnalysisService analysisService,
        ScamShieldOptions options)
    {
        _analysisService = analysisService;
        ModeDisplay = options.Mode == AnalysisMode.Mock
            ? "Demo Mode · 使用預存分析結果"
            : "Remote Mode · 連線分析服務";

        _selectImageCommand = new AsyncCommand(SelectImageAsync, () => !IsBusy);
        _analyzeCommand = new AsyncCommand(AnalyzeAsync, () => CanAnalyze);
        _retryCommand = new AsyncCommand(AnalyzeAsync, () => CanRetry && CanAnalyze);
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public event EventHandler<ScamAnalysisResult>? AnalysisCompleted;

    public ICommand SelectImageCommand => _selectImageCommand;

    public ICommand AnalyzeCommand => _analyzeCommand;

    public ICommand RetryCommand => _retryCommand;

    public string ModeDisplay { get; }

    public ImageSource? PreviewSource
    {
        get => _previewSource;
        private set => SetProperty(ref _previewSource, value);
    }

    public string SelectedFileDetails
    {
        get => _selectedFileDetails;
        private set => SetProperty(ref _selectedFileDetails, value);
    }

    public bool HasSelectedImage => _selectedImageBytes is { Length: > 0 };

    public bool CanAnalyze => HasSelectedImage && !IsBusy;

    public bool IsBusy
    {
        get => _isBusy;
        private set
        {
            if (!SetProperty(ref _isBusy, value))
            {
                return;
            }

            OnPropertyChanged(nameof(CanAnalyze));
            RefreshCommands();
        }
    }

    public bool HasError => !string.IsNullOrWhiteSpace(ErrorMessage);

    public string? ErrorMessage
    {
        get => _errorMessage;
        private set
        {
            if (SetProperty(ref _errorMessage, value))
            {
                OnPropertyChanged(nameof(HasError));
            }
        }
    }

    public bool CanRetry
    {
        get => _canRetry;
        private set
        {
            if (SetProperty(ref _canRetry, value))
            {
                _retryCommand.RaiseCanExecuteChanged();
            }
        }
    }

    private async Task SelectImageAsync()
    {
        try
        {
            var file = await FilePicker.Default.PickAsync(new PickOptions
            {
                PickerTitle = "選擇要分析的截圖",
                FileTypes = CreateSupportedImageTypes()
            });

            if (file is null)
            {
                return;
            }

            var imageBytes = await ReadImageAsync(file);
            var detectedContentType = ValidateImage(file.FileName, imageBytes);

            _selectedImageBytes = imageBytes;
            _selectedFileName = file.FileName;
            _selectedContentType = detectedContentType;
            PreviewSource = ImageSource.FromStream(
                () => new MemoryStream(imageBytes, writable: false));
            SelectedFileDetails = $"{file.FileName} · {FormatFileSize(imageBytes.LongLength)}";
            ClearError();

            OnPropertyChanged(nameof(HasSelectedImage));
            OnPropertyChanged(nameof(CanAnalyze));
            RefreshCommands();
        }
        catch (ImageSelectionException exception)
        {
            SetError(exception.Message, retryable: false);
        }
        catch (OperationCanceledException)
        {
            // The user cancelled the picker. Keep the current selection unchanged.
        }
        catch
        {
            SetError("無法讀取選擇的圖片，請改選其他 JPEG 或 PNG 檔案。", retryable: false);
        }
    }

    private async Task AnalyzeAsync()
    {
        if (_selectedImageBytes is not { Length: > 0 }
            || string.IsNullOrWhiteSpace(_selectedFileName)
            || string.IsNullOrWhiteSpace(_selectedContentType))
        {
            SetError("請先選擇一張 JPEG 或 PNG 圖片。", retryable: false);
            return;
        }

        ScamAnalysisResult? result = null;
        IsBusy = true;
        ClearError();

        try
        {
            await using var image = new MemoryStream(_selectedImageBytes, writable: false);
            result = await _analysisService.AnalyzeAsync(
                image,
                _selectedFileName,
                _selectedContentType);
        }
        catch (ScamAnalysisServiceException exception)
        {
            SetError(exception.Message, exception.Retryable);
        }
        catch (OperationCanceledException)
        {
            SetError("分析已取消。", retryable: true);
        }
        catch
        {
            SetError("目前無法完成分析，請稍後再試。", retryable: true);
        }
        finally
        {
            IsBusy = false;
        }

        if (result is not null)
        {
            AnalysisCompleted?.Invoke(this, result);
        }
    }

    private static FilePickerFileType CreateSupportedImageTypes()
    {
        return new FilePickerFileType(new Dictionary<DevicePlatform, IEnumerable<string>>
        {
            [DevicePlatform.Android] = ["image/jpeg", "image/png"],
            [DevicePlatform.iOS] = ["public.jpeg", "public.png"]
        });
    }

    private static async Task<byte[]> ReadImageAsync(FileResult file)
    {
        await using var input = await file.OpenReadAsync();
        using var output = new MemoryStream();
        var buffer = new byte[81920];

        while (true)
        {
            var bytesRead = await input.ReadAsync(buffer);
            if (bytesRead == 0)
            {
                break;
            }

            if (output.Length + bytesRead > MaximumImageSizeBytes)
            {
                throw new ImageSelectionException("圖片大小不可超過 10 MiB。請選擇較小的圖片。");
            }

            await output.WriteAsync(buffer.AsMemory(0, bytesRead));
        }

        if (output.Length == 0)
        {
            throw new ImageSelectionException("選擇的圖片是空白檔案，請改選其他圖片。");
        }

        return output.ToArray();
    }

    private static string ValidateImage(string fileName, byte[] imageBytes)
    {
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

        throw new ImageSelectionException("僅支援副檔名與內容一致的 JPEG 或 PNG 圖片。");
    }

    private static string FormatFileSize(long byteCount)
    {
        return byteCount >= 1024 * 1024
            ? $"{byteCount / (1024d * 1024d):0.0} MiB"
            : $"{byteCount / 1024d:0.0} KiB";
    }

    private void SetError(string message, bool retryable)
    {
        ErrorMessage = message;
        CanRetry = retryable && HasSelectedImage;
    }

    private void ClearError()
    {
        ErrorMessage = null;
        CanRetry = false;
    }

    private void RefreshCommands()
    {
        _selectImageCommand.RaiseCanExecuteChanged();
        _analyzeCommand.RaiseCanExecuteChanged();
        _retryCommand.RaiseCanExecuteChanged();
    }

    private bool SetProperty<T>(ref T storage, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(storage, value))
        {
            return false;
        }

        storage = value;
        OnPropertyChanged(name);
        return true;
    }

    private void OnPropertyChanged([CallerMemberName] string? name = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }

    private sealed class ImageSelectionException(string message) : Exception(message);
}
