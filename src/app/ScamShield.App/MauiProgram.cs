using Microsoft.Extensions.DependencyInjection;
using ScamShield.App.Configuration;
using ScamShield.App.Services;
using ScamShield.App.ViewModels;
using ScamShield.App.Views;

namespace ScamShield.App;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();

        builder.UseMauiApp<App>();

        var defaultApiBaseUrl = DeviceInfo.Current.Platform == DevicePlatform.Android
            ? "http://10.0.2.2:5000"
            : "http://localhost:5000";
        var options = ScamShieldOptions.FromEnvironment(defaultApiBaseUrl);

        builder.Services.AddSingleton(options);
        builder.Services.AddSingleton(new HttpClient
        {
            BaseAddress = options.ApiBaseUri,
            Timeout = Timeout.InfiniteTimeSpan
        });
        builder.Services.AddSingleton<MockScamAnalysisService>();
        builder.Services.AddSingleton<RemoteScamAnalysisService>();
        builder.Services.AddSingleton<IScamAnalysisService>(services =>
            options.Mode == AnalysisMode.Mock
                ? services.GetRequiredService<MockScamAnalysisService>()
                : services.GetRequiredService<RemoteScamAnalysisService>());
        builder.Services.AddSingleton<MainViewModel>();
        builder.Services.AddSingleton<MainPage>();

        return builder.Build();
    }
}
