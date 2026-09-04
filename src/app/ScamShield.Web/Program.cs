using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using ScamShield.Web;
using ScamShield.Web.Configuration;
using ScamShield.Web.Services;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

var options = ScamShieldOptions.FromConfiguration(
    builder.Configuration,
    new Uri(builder.HostEnvironment.BaseAddress));

builder.Services.AddSingleton(options);
builder.Services.AddScoped(_ => new HttpClient
{
    BaseAddress = options.ApiBaseUri,
    Timeout = Timeout.InfiniteTimeSpan
});
builder.Services.AddScoped<MockScamAnalysisService>();
builder.Services.AddScoped<RemoteScamAnalysisService>();
builder.Services.AddScoped<IScamAnalysisService>(services =>
{
    return options.Mode == AnalysisMode.Mock
        ? services.GetRequiredService<MockScamAnalysisService>()
        : services.GetRequiredService<RemoteScamAnalysisService>();
});

await builder.Build().RunAsync();
