using System.IO;
using System.Text;

namespace MarkdownViewer.Helpers
{
    /// <summary>
    /// 轻量日志：写入 &lt;数据目录&gt;\logs\app-yyyyMMdd.log，保留最近 7 天。
    /// 所有写入失败都被吞掉——日志不允许影响主流程。
    /// </summary>
    public static class Logger
    {
        private static readonly object Gate = new();
        private static bool _cleaned;

        public static string CurrentFile =>
            Path.Combine(AppPaths.LogDir, $"app-{DateTime.Now:yyyyMMdd}.log");

        public static void Info(string message) => Write("INFO", message, null);

        public static void Warn(string message) => Write("WARN", message, null);

        public static void Error(string message, Exception? ex = null) => Write("ERROR", message, ex);

        private static void Write(string level, string message, Exception? ex)
        {
            try
            {
                lock (Gate)
                {
                    Directory.CreateDirectory(AppPaths.LogDir);
                    var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] [{level}] {message}";
                    if (ex != null) line += Environment.NewLine + ex;
                    File.AppendAllText(CurrentFile, line + Environment.NewLine, Encoding.UTF8);
                    if (!_cleaned)
                    {
                        _cleaned = true;
                        CleanupOldFiles();
                    }
                }
            }
            catch
            {
                // 日志失败不影响程序
            }
        }

        private static void CleanupOldFiles()
        {
            try
            {
                var limit = DateTime.Now.AddDays(-7);
                foreach (var file in Directory.GetFiles(AppPaths.LogDir, "app-*.log"))
                {
                    try
                    {
                        if (File.GetLastWriteTime(file) < limit) File.Delete(file);
                    }
                    catch
                    {
                        // 忽略单个文件删除失败
                    }
                }
            }
            catch
            {
                // 忽略
            }
        }
    }
}
