using System.IO;

namespace MarkdownViewer.Helpers
{
    /// <summary>
    /// 应用数据根目录。
    /// 绿色版（程序目录可写且不在系统安装目录下）放在 exe 旁的 userdata，
    /// 安装版回落到 %APPDATA%\MarkdownViewer，保证设置/日志/缓存始终可写。
    /// </summary>
    public static class AppPaths
    {
        private static readonly Lazy<string> LazyRoot = new(Resolve);

        public static string Root => LazyRoot.Value;
        public static string SettingsFile => Path.Combine(Root, "settings.json");
        public static string LogDir => Path.Combine(Root, "logs");
        public static string WebViewDataDir => Path.Combine(Root, "WebView2");
        public static string DraftImageDir => Path.Combine(Root, "images");

        private static string Resolve()
        {
            var beside = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
            var localPrograms = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs");
            var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            var programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);

            var installed = new[] { localPrograms, programFiles, programFilesX86 }
                .Where(p => !string.IsNullOrWhiteSpace(p))
                .Any(p => beside.StartsWith(p.TrimEnd(Path.DirectorySeparatorChar) +
                                            Path.DirectorySeparatorChar,
                                            StringComparison.OrdinalIgnoreCase));

            if (!installed && CanWrite(beside))
            {
                try
                {
                    var dir = Path.Combine(beside, "userdata");
                    Directory.CreateDirectory(dir);
                    return dir;
                }
                catch
                {
                    // 忽略，走回落目录
                }
            }

            var fallback = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "MarkdownViewer");
            try { Directory.CreateDirectory(fallback); } catch { /* 最后兜底由调用方处理 */ }
            return fallback;
        }

        private static bool CanWrite(string dir)
        {
            try
            {
                var probe = Path.Combine(dir, ".write-test");
                File.WriteAllText(probe, "1");
                File.Delete(probe);
                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}
