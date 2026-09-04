using Microsoft.Extensions.DependencyInjection;
using ScamShield.App.Views;

namespace ScamShield.App;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();

        builder.UseMauiApp<App>();
        builder.Services.AddSingleton<MainPage>();

        return builder.Build();
    }
}
