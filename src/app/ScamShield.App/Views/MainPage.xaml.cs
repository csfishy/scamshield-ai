using ScamShield.App.Models;
using ScamShield.App.ViewModels;

namespace ScamShield.App.Views;

public partial class MainPage : ContentPage
{
    private readonly MainViewModel _viewModel;

    public MainPage(MainViewModel viewModel)
    {
        InitializeComponent();
        _viewModel = viewModel;
        BindingContext = viewModel;
        _viewModel.AnalysisCompleted += OnAnalysisCompleted;
    }

    private async void OnAnalysisCompleted(object? sender, ScamAnalysisResult result)
    {
        await Navigation.PushAsync(new ResultPage(new ResultViewModel(result)));
    }
}
