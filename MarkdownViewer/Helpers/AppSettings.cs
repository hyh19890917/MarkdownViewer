using System.IO;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace MarkdownViewer.Helpers
{
    /// <summary>上一个会话中打开的标签。</summary>
    public class SessionTabState
    {
        public string? Path { get; set; }
        public string DisplayName { get; set; } = "未命名.md";
        public string Text { get; set; } = "";
        public bool Dirty { get; set; }
        public string Encoding { get; set; } = "Utf8NoBom";
        public double PreviewScroll { get; set; }
        public int CursorLine { get; set; }
        public int CursorCh { get; set; }
        public double EditorScroll { get; set; }
    }

    /// <summary>窗口位置尺寸。</summary>
    public class WindowPlacement
    {
        public double Left { get; set; }
        public double Top { get; set; }
        public double Width { get; set; } = 1280;
        public double Height { get; set; } = 820;
        public bool Maximized { get; set; }
    }

    /// <summary>全部用户偏好（JSON 持久化，原子写入）。</summary>
    public class AppSettings
    {
        public string Theme { get; set; } = "light";   // light / green / dark / system
        public string View { get; set; } = "preview";  // preview / split / edit
        public bool TocVisible { get; set; } = true;
        public double TocWidth { get; set; } = 280;
        public double SplitRatio { get; set; } = 0.5;
        public double Zoom { get; set; } = 1.0;
        public bool Typewriter { get; set; } = false;
        public bool AutoSave { get; set; } = true;
        public int AutoSaveSeconds { get; set; } = 30;
        public List<string> RecentFiles { get; set; } = new();
        public WindowPlacement? Window { get; set; }
        public List<SessionTabState> Session { get; set; } = new();
        public int ActiveTabIndex { get; set; }

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            WriteIndented = true,
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        };

        public static AppSettings Load()
        {
            try
            {
                if (File.Exists(AppPaths.SettingsFile))
                {
                    var json = File.ReadAllText(AppPaths.SettingsFile, Encoding.UTF8);
                    var settings = JsonSerializer.Deserialize<AppSettings>(json, JsonOptions);
                    if (settings != null) return settings.Normalize();
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("读取设置失败，使用默认设置：" + ex.Message);
            }
            return new AppSettings();
        }

        /// <summary>修正越界值，避免损坏的配置文件导致界面异常。</summary>
        public AppSettings Normalize()
        {
            if (Theme is not ("light" or "green" or "dark" or "system")) Theme = "light";
            if (View is not ("preview" or "split" or "edit")) View = "preview";
            Zoom = Math.Clamp(Zoom, 0.6, 2.5);
            SplitRatio = Math.Clamp(SplitRatio, 0.15, 0.85);
            TocWidth = Math.Clamp(TocWidth, 140, 900);
            AutoSaveSeconds = Math.Clamp(AutoSaveSeconds, 5, 600);
            RecentFiles = (RecentFiles ?? new List<string>()).Where(File.Exists).Take(12).ToList();
            Session ??= new List<SessionTabState>();
            return this;
        }

        public void AddRecent(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return;
            RecentFiles.RemoveAll(p => string.Equals(p, path, StringComparison.OrdinalIgnoreCase));
            RecentFiles.Insert(0, path);
            if (RecentFiles.Count > 12) RecentFiles.RemoveRange(12, RecentFiles.Count - 12);
        }

        public void Save()
        {
            try
            {
                Directory.CreateDirectory(AppPaths.Root);
                var json = JsonSerializer.Serialize(this, JsonOptions);
                var tmp = AppPaths.SettingsFile + ".tmp";
                File.WriteAllText(tmp, json, new UTF8Encoding(false));
                if (File.Exists(AppPaths.SettingsFile))
                {
                    try { File.Replace(tmp, AppPaths.SettingsFile, null, true); }
                    catch (Exception) { File.Copy(tmp, AppPaths.SettingsFile, true); File.Delete(tmp); }
                }
                else
                {
                    File.Move(tmp, AppPaths.SettingsFile);
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("保存设置失败：" + ex.Message);
            }
        }
    }
}
