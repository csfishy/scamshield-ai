using ScamShield.App.ViewModels;

namespace ScamShield.App.Views;

public partial class ResultPage : ContentPage
{
    public ResultPage(ResultViewModel viewModel)
    {
        InitializeComponent();
        BindingContext = viewModel;
    }

    private async void OnAnalyzeAnotherClicked(object? sender, EventArgs e)
    {
        await Navigation.PopAsync();
    }
}
