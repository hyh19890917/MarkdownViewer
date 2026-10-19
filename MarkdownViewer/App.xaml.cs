using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Windows;
using System.Windows.Threading;
using MarkdownViewer.Helpers;

namespace MarkdownViewer
{
    public partial class App : Application
    {
        private const string MutexName = @"Local\MarkdownViewer.SingleInstance";
        private const string PipeName = "MarkdownViewer.OpenFile";

        private Mutex? _mutex;
        private CancellationTokenSource? _pipeCts;

        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);
            DispatcherUnhandledException += OnDispatcherUnhandledException;

            bool isFirst;
            try
            {
                // 单实例：双击 .md 时复用已打开的窗口，避免起多个 Chromium 内核
                _mutex = new Mutex(true, MutexName, out isFirst);
            }
            catch (Exception ex)
            {
                Logger.Warn("单实例互斥量创建失败：" + ex.Message);
                isFirst = true;
            }

            if (!isFirst)
            {
                ForwardToRunningInstance(e.Args);
                Shutdown();
                return;
            }

            StartPipeServer();
            Exit += (_, _) =>
            {
                try { _pipeCts?.Cancel(); } catch { /* 忽略 */ }
                try { _mutex?.Dispose(); } catch { /* 忽略 */ }
            };
        }

        /// <summary>把命令行参数（待打开的文件）转发给已运行的实例。</summary>
        private static void ForwardToRunningInstance(string[] args)
        {
            try
            {
                using var client = new NamedPipeClientStream(".", PipeName, PipeDirection.Out);
                client.Connect(1500);
                using var writer = new StreamWriter(client, new UTF8Encoding(false));
                writer.Write(string.Join("\n", args));
                writer.Flush();
            }
            catch (Exception ex)
            {
                Logger.Warn("转发到已运行实例失败：" + ex.Message);
            }
        }

        private void StartPipeServer()
        {
            _pipeCts = new CancellationTokenSource();
            var token = _pipeCts.Token;
            _ = Task.Run(async () =>
            {
                while (!token.IsCancellationRequested)
                {
                    try
                    {
                        using var server = new NamedPipeServerStream(
                            PipeName, PipeDirection.In, 1, PipeTransmissionMode.Byte,
                            PipeOptions.Asynchronous);
                        await server.WaitForConnectionAsync(token);
                        using var reader = new StreamReader(server, new UTF8Encoding(false));
                        var payload = await reader.ReadToEndAsync(token);
                        var files = payload.Split('\n',
                            StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                        await Dispatcher.InvokeAsync(
                            () => global::MarkdownViewer.MainWindow.RouteExternalOpen(files));
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                    catch (Exception ex)
                    {
                        Logger.Warn("IPC 监听异常：" + ex.Message);
                        try { await Task.Delay(500, token); } catch { break; }
                    }
                }
            }, token);
        }

        /// <summary>兜底异常处理：记录日志并提示用户，而不是直接崩溃退出。</summary>
        private static void OnDispatcherUnhandledException(
            object sender, DispatcherUnhandledExceptionEventArgs e)
        {
            Logger.Error("未处理的 UI 异常", e.Exception);
            MessageBox.Show(
                "程序发生未处理的异常：\n\n" + e.Exception.Message +
                "\n\n详细信息已写入日志：" + Logger.CurrentFile,
                "MarkdownViewer", MessageBoxButton.OK, MessageBoxImage.Error);
            e.Handled = true;
        }
    }
}
