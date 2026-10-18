using System.Windows;
using System.Windows.Threading;

namespace MarkdownViewer
{
    public partial class App : Application
    {
        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);
            DispatcherUnhandledException += OnDispatcherUnhandledException;
        }

        /// <summary>兜底异常处理：提示用户而不是直接崩溃退出。</summary>
        private static void OnDispatcherUnhandledException(
            object sender, DispatcherUnhandledExceptionEventArgs e)
        {
            MessageBox.Show(
                "程序发生未处理的异常：\n\n" + e.Exception.Message,
                "MarkdownViewer", MessageBoxButton.OK, MessageBoxImage.Error);
            e.Handled = true;
        }
    }
}
