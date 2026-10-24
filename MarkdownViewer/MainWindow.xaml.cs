using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Interop;
using System.Windows.Threading;
using MarkdownViewer.Helpers;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;

namespace MarkdownViewer
{
    public partial class MainWindow : Window
    {
        private const string AppHost = "https://mdviewer.local/";   // 前端静态资源虚拟主机

        private bool _webReady;
        private bool _suppressTocSelection;   // 滚动联动高亮时，不触发跳转
        private Guid? _tocOwnerId;            // 当前目录面板对应的标签
        private GridLength _lastTocWidth = new(280);
        private string _themeMode = "light";  // light / green / dark（跟随系统后解析出的实际主题）
        private string _themeSetting = "light"; // light / green / dark / system（用户选择）
        private string _viewMode = "preview"; // preview / split / edit
        private bool _reallyClosing;          // 关闭检查通过后真正关闭窗口
        private bool _closeConfirming;        // 正在逐个确认未保存标签，避免重复弹窗

        // ---- 用户设置 / 自动保存 / 外部修改监听 ----
        private AppSettings _settings = new();
        private DispatcherTimer? _autoSaveTimer;
        private DispatcherTimer? _draftTimer;
        private bool _draftSaving;
        private FileSystemWatcher? _watcher;
        private string? _watchedPath;
        private DateTime _lastKnownWriteUtc;
        private int _watcherSuppress;
        private DispatcherTimer? _watcherDebounce;
        private bool _isFullScreen;
        private WindowStyle _prevWindowStyle;
        private WindowState _prevWindowState;

        private readonly ObservableCollection<TabDoc> _tabs = new();
        private readonly Dictionary<string, Task<TabDoc?>> _openingTabs =
            new(StringComparer.OrdinalIgnoreCase);
        private static readonly List<string> PendingExternalOpens = new();
        private bool _webCrashHandling;
        private TabDoc? CurrentTab => Tabs.SelectedItem as TabDoc;

        // ---- 多窗口（独立窗口 / 拖回合并） ----
        private static readonly List<MainWindow> AllWindows = new();
        private readonly bool _isFloating;
        private readonly TabDoc? _pendingTab;
        private DispatcherTimer? _dragTimer;
        private MainWindow? _hoverTarget;
        private bool _nDragging;

        // Win32：检测窗口拖动时鼠标左键状态与位置（用于拖回合并）
        private const int VK_LBUTTON = 0x01;
        private const int WM_NCLBUTTONDOWN = 0x00A1;
        private const int WM_MOVE = 0x0003;
        private const int WM_EXITSIZEMOVE = 0x0232;
        private const int HTCAPTION = 2;
        [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int v);
        [DllImport("user32.dll")] private static extern bool GetCursorPos(out POINT pt);
        [StructLayout(LayoutKind.Sequential)] private struct POINT { public int X; public int Y; }

        // 标签色板（实色 + 文字色），每个标签循环分配不同颜色
        private static readonly (string Hex, string Fg)[] Palette =
        {
            ("#3B82F6", "#FFFFFF"), // 蓝
            ("#10B981", "#FFFFFF"), // 绿
            ("#F59E0B", "#3A2A00"), // 橙
            ("#8B5CF6", "#FFFFFF"), // 紫
            ("#EC4899", "#FFFFFF"), // 粉
            ("#EF4444", "#FFFFFF"), // 红
            ("#06B6D4", "#FFFFFF"), // 青
            ("#6366F1", "#FFFFFF"), // 靛蓝
        };
        private static int _colorCounter;
        private static int _untitledCounter;

        // 三套主题（WPF 侧面板 + Web 侧正文）
        private static readonly Dictionary<string, ThemePalette> Themes = new()
        {
            ["light"] = new ThemePalette
            {
                MainBg = (Color)ColorConverter.ConvertFromString("#F3F3F3")!,
                TocPanelBg = (Color)ColorConverter.ConvertFromString("#F6F8FA")!,
                TocText = (Color)ColorConverter.ConvertFromString("#24292F")!,
                TocSelected = (Color)ColorConverter.ConvertFromString("#CCE4FF")!,
                Splitter = (Color)ColorConverter.ConvertFromString("#D0D7DE")!,
                Border = (Color)ColorConverter.ConvertFromString("#D0D7DE")!,
                Status = (Color)ColorConverter.ConvertFromString("#57606A")!,
                WebTheme = "light"
            },
            // 豆沙护眼绿（经典 #C7EDCC）
            ["green"] = new ThemePalette
            {
                MainBg = (Color)ColorConverter.ConvertFromString("#C7EDCC")!,
                TocPanelBg = (Color)ColorConverter.ConvertFromString("#C7EDCC")!,
                TocText = (Color)ColorConverter.ConvertFromString("#233423")!,
                TocSelected = (Color)ColorConverter.ConvertFromString("#9ED8A8")!,
                Splitter = (Color)ColorConverter.ConvertFromString("#93C59C")!,
                Border = (Color)ColorConverter.ConvertFromString("#93C59C")!,
                Status = (Color)ColorConverter.ConvertFromString("#3D5A40")!,
                WebTheme = "green"
            },
            // 黑底白字
            ["dark"] = new ThemePalette
            {
                MainBg = (Color)ColorConverter.ConvertFromString("#1E1E1E")!,
                TocPanelBg = (Color)ColorConverter.ConvertFromString("#252526")!,
                TocText = (Color)ColorConverter.ConvertFromString("#E6EDF3")!,
                TocSelected = (Color)ColorConverter.ConvertFromString("#37373D")!,
                Splitter = (Color)ColorConverter.ConvertFromString("#3C3C3C")!,
                Border = (Color)ColorConverter.ConvertFromString("#3C3C3C")!,
                Status = (Color)ColorConverter.ConvertFromString("#9DA5B4")!,
                WebTheme = "dark"
            }
        };

        public MainWindow() : this(false, null, "light", "preview") { }

        /// <summary>
        /// 构造窗口。
        /// </summary>
        /// <param name="isFloating">是否为双击标签弹出的独立窗口</param>
        /// <param name="initialTab">独立窗口承载的初始标签</param>
        /// <param name="theme">继承的主题</param>
        /// <param name="view">继承的视图模式</param>
        public MainWindow(bool isFloating, TabDoc? initialTab, string theme, string view)
        {
            InitializeComponent();
            _isFloating = isFloating;
            _pendingTab = initialTab;
            _themeMode = theme;
            _viewMode = view;
            Tabs.ItemsSource = _tabs;
            AllWindows.Add(this);
            Loaded += MainWindow_Loaded;
            Closing += MainWindow_Closing;
        }

        private void MainWindow_Closing(object? sender, CancelEventArgs e)
        {
            // 尚未通过未保存检查：先拦截，异步处理完再真正关闭
            if (!_reallyClosing)
            {
                e.Cancel = true;
                // 用户反复点关闭按钮时，不重复发起确认流程（否则会叠加多个对话框）
                if (_closeConfirming) return;
                _closeConfirming = true;
                _ = ConfirmCloseAndCloseAsync();
                return;
            }
            AllWindows.Remove(this);
            _dragTimer?.Stop();
            _autoSaveTimer?.Stop();
            _draftTimer?.Stop();
            _watcher?.Dispose();
            _watcher = null;
        }

        /// <summary>关闭整个窗口前，对所有未保存标签逐一确认。</summary>
        private async Task ConfirmCloseAndCloseAsync()
        {
            try
            {
                foreach (var tab in _tabs.ToList())
                {
                    await SyncTabFromEditorAsync(tab);
                    if (tab.IsDirty)
                    {
                        var r = MessageBox.Show(
                            $"文档「{tab.BaseTitle}」有未保存的修改，是否保存？",
                            "保存修改", MessageBoxButton.YesNoCancel, MessageBoxImage.Question);
                        if (r == MessageBoxResult.Cancel) return;
                        if (r == MessageBoxResult.Yes)
                        {
                            var ok = await SaveTabAsync(tab);
                            if (!ok) return; // 保存失败（如另存被取消）则不关闭
                        }
                        else
                        {
                            // 用户选择不保存：清除脏标记，避免下次会话恢复出已丢弃的修改
                            tab.IsDirty = false;
                            tab.EditText = null;
                        }
                    }
                }
                if (!_isFloating)
                {
                    await SaveSessionAsync();
                    SaveSettings();
                }
                _reallyClosing = true;
                Close();
            }
            finally
            {
                // 用户取消关闭（或保存失败）后，允许下次重新发起确认
                if (!_reallyClosing) _closeConfirming = false;
            }
        }

        private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            _settings = AppSettings.Load();
            if (!_isFloating)
            {
                // 独立窗口由构造函数参数继承源窗口的主题/视图
                _viewMode = _settings.View;
            }

            _themeSetting = !_isFloating ? _settings.Theme : _themeMode;
            _themeMode = ResolveTheme(_themeSetting);
            SelectThemeRadio(_themeSetting);
            ApplyWpfTheme();
            SyncViewButtons();
            ApplyTocSettings();
            TypewriterToggle.IsChecked = _settings.Typewriter;
            AutoSaveToggle.IsChecked = _settings.AutoSave;
            ApplyWindowPlacement();
            RebuildRecentMenu();

            try
            {
                // 设置/日志/缓存目录：绿色版在 exe 旁的 userdata，安装版在 %APPDATA%
                var env = await CoreWebView2Environment.CreateAsync(null, AppPaths.WebViewDataDir);
                await WebView.EnsureCoreWebView2Async(env);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "初始化 WebView2 失败，请确认已安装 Microsoft Edge WebView2 Runtime。\n\n" + ex.Message,
                    "无法启动预览内核", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            // 把磁盘目录映射为虚拟主机，不生成临时文件
            var assetsDir = Path.Combine(AppContext.BaseDirectory, "WebAssets");
            WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "mdviewer.local", assetsDir, CoreWebView2HostResourceAccessKind.Allow);

            WebView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;

            // 外链一律交给系统浏览器，禁止 WebView 自身导航离开应用页面
            WebView.CoreWebView2.NewWindowRequested += (s, ev) =>
            {
                ev.Handled = true;
                OpenNavigatedUri(ev.Uri);
            };
            WebView.CoreWebView2.NavigationStarting += (s, ev) =>
            {
                _webReady = false;
                var uri = ev.Uri;
                if (uri.StartsWith(AppHost, StringComparison.OrdinalIgnoreCase) ||
                    uri.StartsWith("https://mdfile.local/", StringComparison.OrdinalIgnoreCase) ||
                    uri.Equals("about:blank", StringComparison.OrdinalIgnoreCase))
                    return;
                ev.Cancel = true;
                OpenNavigatedUri(uri);
            };

            WebView.CoreWebView2.NavigationCompleted += (s, ev) =>
            {
                _webReady = true;
                _webCrashHandling = false;
                ApplyWebTheme();
                ApplyWebView();
                ApplySettingsToWeb();
                if (CurrentTab != null) PushMarkdown(CurrentTab);
            };

            // 预览内核崩溃/被系统杀进程时自动尝试恢复，避免白屏
            WebView.CoreWebView2.ProcessFailed += (s, ev) =>
            {
                Logger.Error($"WebView2 进程异常：{ev.ProcessFailedKind}");
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    // 防止崩溃→Reload→再崩溃的死循环
                    if (_webCrashHandling) return;
                    _webCrashHandling = true;
                    try
                    {
                        MessageBox.Show("预览内核异常退出，正在尝试恢复。", "MarkdownViewer",
                            MessageBoxButton.OK, MessageBoxImage.Warning);
                        WebView.Reload();
                    }
                    catch (Exception ex)
                    {
                        Logger.Error("恢复 WebView2 失败", ex);
                    }
                }));
            };

            WebView.CoreWebView2.Navigate(AppHost + "index.html");

            if (_isFloating && _pendingTab != null)
            {
                // 独立窗口：承载弹出的标签
                _tabs.Add(_pendingTab);
                Tabs.SelectedItem = _pendingTab;
            }
            else if (!_isFloating)
            {
                // 有命令行文件时优先打开文件，否则恢复上次会话
                if (!await OpenCommandLineFiles()) await RestoreSessionAsync();

                // 启动期间由资源管理器/其它实例转交过来的文件，窗口就绪后再统一打开
                List<string> pending;
                lock (PendingExternalOpens)
                {
                    pending = new List<string>(PendingExternalOpens);
                    PendingExternalOpens.Clear();
                }
                if (pending.Count > 0) await OpenFromShellAsync(pending);
            }

            StartAutoSave();
        }

        /// <summary>命令行参数：MarkdownViewer.exe  a.md b.md</summary>
        private async Task<bool> OpenCommandLineFiles()
        {
            var opened = false;
            var args = Environment.GetCommandLineArgs();
            for (var i = 1; i < args.Length; i++)
            {
                if (File.Exists(args[i]) && IsTextDocument(args[i]))
                {
                    await OpenTabAsync(args[i]);
                    opened = true;
                }
            }
            return opened;
        }

        // ======================= 设置 / 会话 / 自动保存 / 文件监听 =======================

        /// <summary>解析主题：跟随系统时按注册表读取 Windows 应用深浅色。</summary>
        private static string ResolveTheme(string theme)
        {
            if (theme != "system") return theme;
            return IsSystemDark() ? "dark" : "light";
        }

        private static bool IsSystemDark()
        {
            try
            {
                using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                    @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
                return key?.GetValue("AppsUseLightTheme") is int i && i == 0;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>恢复窗口位置尺寸（屏幕变化导致越界时忽略）。</summary>
        private void ApplyWindowPlacement()
        {
            var p = _settings.Window;
            if (p == null || _isFloating) return;
            if (p.Width < 400 || p.Height < 300) return;

            var vLeft = SystemParameters.VirtualScreenLeft;
            var vTop = SystemParameters.VirtualScreenTop;
            var vRight = vLeft + SystemParameters.VirtualScreenWidth;
            var vBottom = vTop + SystemParameters.VirtualScreenHeight;
            if (p.Left >= vLeft && p.Top >= vTop &&
                p.Left + 120 < vRight && p.Top + 80 < vBottom)
            {
                Left = p.Left;
                Top = p.Top;
            }
            Width = p.Width;
            Height = p.Height;
            if (p.Maximized) WindowState = WindowState.Maximized;
        }

        private void ApplyTocSettings()
        {
            TocToggle.IsChecked = _settings.TocVisible;
            if (_settings.TocVisible)
            {
                TocColumn.Width = new GridLength(_settings.TocWidth);
                _lastTocWidth = new GridLength(_settings.TocWidth);
            }
        }

        /// <summary>把用户设置推送给前端（缩放、分栏比例、打字机模式）。</summary>
        private void ApplySettingsToWeb()
        {
            if (!_webReady || WebView.CoreWebView2 == null) return;
            WebView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new
            {
                type = "settings",
                zoom = _settings.Zoom,
                splitRatio = _settings.SplitRatio,
                typewriter = _settings.Typewriter,
                autoSave = _settings.AutoSave
            }));
        }

        private void SaveSettings()
        {
            _settings.Theme = _themeSetting;
            _settings.View = _viewMode;
            _settings.TocVisible = TocToggle.IsChecked == true;
            if (TocColumn.ActualWidth > 0) _settings.TocWidth = TocColumn.ActualWidth;
            if (!_isFloating)
            {
                var b = RestoreBounds;
                if (!b.IsEmpty && b.Width >= 400 && b.Height >= 300)
                {
                    _settings.Window = new WindowPlacement
                    {
                        Left = b.Left,
                        Top = b.Top,
                        Width = b.Width,
                        Height = b.Height,
                        Maximized = WindowState == WindowState.Maximized
                    };
                }
            }
            _settings.Save();
        }

        /// <summary>执行 JS 并解析返回的 JSON（兼容字符串包裹一层的情况）。</summary>
        private async Task<JsonElement?> ExecuteJsonAsync(string script)
        {
            if (!_webReady || WebView.CoreWebView2 == null) return null;
            try
            {
                var raw = await WebView.CoreWebView2.ExecuteScriptAsync(script);
                if (string.IsNullOrWhiteSpace(raw) || raw == "null") return null;
                using var doc = JsonDocument.Parse(raw);
                var root = doc.RootElement.Clone();
                if (root.ValueKind == JsonValueKind.String)
                {
                    var inner = root.GetString();
                    if (string.IsNullOrWhiteSpace(inner)) return null;
                    using var doc2 = JsonDocument.Parse(inner);
                    return doc2.RootElement.Clone();
                }
                return root.ValueKind == JsonValueKind.Object ? root : null;
            }
            catch (Exception ex)
            {
                Logger.Warn("执行脚本失败：" + ex.Message);
                return null;
            }
        }

        private sealed record TabSnapshot(
            string Text, bool Dirty, double PreviewScroll, double EditorScroll, int CursorLine, int CursorCh);

        private async Task<TabSnapshot> ReadTabSnapshotAsync(TabDoc tab)
        {
            var text = tab.EditText ?? tab.MarkdownText;
            var preview = tab.ScrollY;
            var editor = tab.RestoreEditorScroll ?? 0;
            var line = tab.RestoreLine < 0 ? 0 : tab.RestoreLine;
            var ch = tab.RestoreCh;
            var dirty = tab.IsDirty;

            var root = await ExecuteJsonAsync(
                $"window.getTabSnapshot ? window.getTabSnapshot('{tab.Id}') : null");
            if (root is { } r)
            {
                if (r.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String)
                    text = t.GetString() ?? text;
                if (r.TryGetProperty("dirty", out var d) &&
                    (d.ValueKind == JsonValueKind.True || d.ValueKind == JsonValueKind.False))
                    dirty = d.GetBoolean();
                if (r.TryGetProperty("previewScroll", out var ps) && ps.ValueKind == JsonValueKind.Number)
                    preview = ps.GetDouble();
                if (r.TryGetProperty("editorScroll", out var es) && es.ValueKind == JsonValueKind.Number)
                    editor = es.GetDouble();
                if (r.TryGetProperty("cursorLine", out var cl) && cl.ValueKind == JsonValueKind.Number)
                    line = cl.GetInt32();
                if (r.TryGetProperty("cursorCh", out var cc) && cc.ValueKind == JsonValueKind.Number)
                    ch = cc.GetInt32();
            }
            return new TabSnapshot(text, dirty, preview, editor, line, ch);
        }

        /// <summary>关闭前保存会话（标签、滚动、光标、分栏比例）。</summary>
        private async Task SaveSessionAsync()
        {
            var session = new List<SessionTabState>();
            foreach (var tab in _tabs.ToList())
            {
                try
                {
                    var snap = await ReadTabSnapshotAsync(tab);
                    var keepText = tab.IsDirty || string.IsNullOrEmpty(tab.FilePath);
                    session.Add(new SessionTabState
                    {
                        Path = string.IsNullOrEmpty(tab.FilePath) ? null : tab.FilePath,
                        DisplayName = tab.DisplayName,
                        Text = keepText ? snap.Text : "",
                        Dirty = tab.IsDirty,
                        Encoding = tab.Encoding.ToString(),
                        CodePage = tab.EncodingCodePage,
                        PreviewScroll = snap.PreviewScroll,
                        EditorScroll = snap.EditorScroll,
                        CursorLine = snap.CursorLine,
                        CursorCh = snap.CursorCh
                    });
                }
                catch (Exception ex)
                {
                    Logger.Warn("保存会话片段失败：" + ex.Message);
                }
            }
            _settings.Session = session;
            _settings.ActiveTabIndex = Math.Max(0, Tabs.SelectedIndex);

            var ui = await ExecuteJsonAsync("window.getUiState ? window.getUiState() : null");
            if (ui is { } state && state.TryGetProperty("splitRatio", out var sr) &&
                sr.ValueKind == JsonValueKind.Number)
            {
                _settings.SplitRatio = Math.Clamp(sr.GetDouble(), 0.15, 0.85);
            }
        }

        private async Task<bool> RestoreSessionAsync()
        {
            var list = _settings.Session;
            if (list == null || list.Count == 0) return false;

            var restored = 0;
            foreach (var s in list)
            {
                try
                {
                    var path = s.Path;
                    TabDoc tab;
                    if (!string.IsNullOrEmpty(path))
                    {
                        if (!File.Exists(path)) continue;
                        // 后台读取，避免会话多标签时阻塞窗口显示
                        var read = await Task.Run(() => FileReaderHelper.ReadMarkdownFileEx(path));
                        tab = CreateTabDoc(path, read.Text, read.Encoding, read.Guessed, read.CodePage);
                        if (s.Dirty)
                        {
                            tab.EditText = s.Text ?? read.Text;
                            tab.IsDirty = true;
                            if (Enum.TryParse<MdEncoding>(s.Encoding, out var savedEnc))
                            {
                                tab.Encoding = savedEnc;
                                tab.EncodingCodePage = s.CodePage;
                            }
                        }
                    }
                    else
                    {
                        tab = CreateTabDoc("", s.Text ?? "", MdEncoding.Utf8NoBom);
                        tab.DisplayName = string.IsNullOrWhiteSpace(s.DisplayName)
                            ? $"未命名-{Interlocked.Increment(ref _untitledCounter)}.md"
                            : s.DisplayName;
                        if (s.Dirty)
                        {
                            tab.EditText = s.Text ?? "";
                            tab.IsDirty = true;
                        }
                        if (Enum.TryParse<MdEncoding>(s.Encoding, out var untitledEnc))
                        {
                            tab.Encoding = untitledEnc;
                            tab.EncodingCodePage = s.CodePage;
                        }
                    }
                    tab.ScrollY = s.PreviewScroll;
                    tab.RestoreEditorScroll = s.EditorScroll;
                    tab.RestoreLine = s.CursorLine;
                    tab.RestoreCh = s.CursorCh;
                    _tabs.Add(tab);
                    restored++;
                }
                catch (Exception ex)
                {
                    Logger.Warn($"恢复「{s.Path}」失败：{ex.Message}");
                }
            }

            if (restored == 0) return false;
            Tabs.SelectedIndex = Math.Clamp(_settings.ActiveTabIndex, 0, _tabs.Count - 1);
            return true;
        }

        private void StartAutoSave()
        {
            if (_autoSaveTimer == null)
            {
                _autoSaveTimer = new DispatcherTimer();
                _autoSaveTimer.Tick += async (_, _) => await AutoSaveTickAsync();
            }
            _autoSaveTimer.Interval = TimeSpan.FromSeconds(Math.Max(5, _settings.AutoSaveSeconds));
            if (_settings.AutoSave) _autoSaveTimer.Start();
            else _autoSaveTimer.Stop();

            // 未命名草稿与自动保存开关无关：始终定时写入会话文件，防止异常退出丢失
            if (_draftTimer == null)
            {
                _draftTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
                _draftTimer.Tick += async (_, _) => await PersistDraftsTickAsync();
            }
            _draftTimer.Start();
        }

        private async Task PersistDraftsTickAsync()
        {
            if (_draftSaving) return;
            if (!_tabs.Any(t => string.IsNullOrEmpty(t.FilePath))) return;
            _draftSaving = true;
            try
            {
                await SaveSessionAsync();
                _settings.Save();
            }
            catch (Exception ex)
            {
                Logger.Warn("定时保存草稿失败：" + ex.Message);
            }
            finally
            {
                _draftSaving = false;
            }
        }

        /// <summary>自动保存所有有路径且已修改的标签（静默，无对话框）。</summary>
        private async Task AutoSaveTickAsync()
        {
            foreach (var tab in _tabs.ToList())
            {
                if (string.IsNullOrEmpty(tab.FilePath) || !_tabs.Contains(tab)) continue;
                // 只处理已标记为脏的标签，避免每次自动保存都同步所有文档
                if (!tab.IsDirty) continue;
                // 编码是推测出来的文件，自动写回可能损坏原文件：交给用户手动确认
                if (tab.EncodingGuessed)
                {
                    if (ReferenceEquals(tab, CurrentTab))
                        StatusText.Text = "自动保存已跳过：文件编码为推测结果，请手动保存确认";
                    continue;
                }
                await SyncTabFromEditorAsync(tab);
                if (!tab.IsDirty) continue;
                try
                {
                    var text = tab.EditText ?? tab.MarkdownText;
                    _watcherSuppress++;
                    FileReaderHelper.WriteMarkdownFile(tab.FilePath, text, tab.Encoding, tab.EncodingCodePage);
                    _lastKnownWriteUtc = SafeLastWrite(tab.FilePath);
                    tab.MarkdownText = text;
                    tab.EditText = null;
                    tab.IsDirty = false;
                    WebView.CoreWebView2?.PostWebMessageAsJson(JsonSerializer.Serialize(
                        new { type = "saved", tabId = tab.Id.ToString(), text }));
                    if (ReferenceEquals(tab, CurrentTab))
                    {
                        RefreshWindowTitle();
                        StatusText.Text = "已自动保存：" + tab.FilePath;
                    }
                }
                catch (Exception ex)
                {
                    Logger.Error("自动保存失败：" + tab.FilePath, ex);
                    if (ReferenceEquals(tab, CurrentTab))
                        StatusText.Text = "自动保存失败：" + ex.Message;
                }
                finally
                {
                    _watcherSuppress--;
                }
            }
        }

        private static DateTime SafeLastWrite(string? path)
        {
            try
            {
                return string.IsNullOrEmpty(path) ? DateTime.MinValue : File.GetLastWriteTimeUtc(path!);
            }
            catch
            {
                return DateTime.MinValue;
            }
        }

        /// <summary>只监听当前标签对应的文件，检测外部修改。</summary>
        private void UpdateWatcher(TabDoc? tab)
        {
            var path = tab?.FilePath;
            _lastKnownWriteUtc = SafeLastWrite(path);
            if (string.Equals(path, _watchedPath, StringComparison.OrdinalIgnoreCase)) return;

            _watchedPath = path;
            _watcher?.Dispose();
            _watcher = null;

            if (string.IsNullOrEmpty(path)) return;
            try
            {
                var dir = Path.GetDirectoryName(path);
                if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir)) return;
                _watcher = new FileSystemWatcher(dir, Path.GetFileName(path))
                {
                    NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size |
                                   NotifyFilters.FileName | NotifyFilters.CreationTime
                };
                _watcher.Changed += OnWatchedFileChanged;
                _watcher.Created += OnWatchedFileChanged;
                _watcher.Renamed += OnWatchedFileChanged;
                _watcher.Deleted += OnWatchedFileChanged;
                _watcher.EnableRaisingEvents = true;
            }
            catch (Exception ex)
            {
                Logger.Warn("文件监听启动失败：" + ex.Message);
            }
        }

        private void OnWatchedFileChanged(object sender, FileSystemEventArgs e)
        {
            // 文件系统事件可能连续触发，统一延迟 600ms 再判断
            Dispatcher.BeginInvoke(new Action(() =>
            {
                if (_watcherDebounce == null)
                {
                    _watcherDebounce = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(600) };
                    _watcherDebounce.Tick += (_, _) =>
                    {
                        _watcherDebounce!.Stop();
                        HandleExternalChange();
                    };
                }
                _watcherDebounce.Stop();
                _watcherDebounce.Start();
            }));
        }

        private void HandleExternalChange()
        {
            if (_watcherSuppress > 0) return;
            var tab = CurrentTab;
            if (tab == null || string.IsNullOrEmpty(tab.FilePath)) return;
            if (!string.Equals(tab.FilePath, _watchedPath, StringComparison.OrdinalIgnoreCase)) return;

            try
            {
                if (!File.Exists(tab.FilePath))
                {
                    StatusText.Text = "文件已被其它程序删除：" + tab.FilePath;
                    return;
                }
                var write = SafeLastWrite(tab.FilePath);
                if (write <= _lastKnownWriteUtc) return;
                _lastKnownWriteUtc = write;
                if (tab.IsDirty)
                {
                    // 本地有未保存修改：不能静默丢弃，也不能静默忽略
                    var choose = MessageBox.Show(
                        "文件已被其它程序修改，而当前编辑器中还有未保存的修改。\n\n" +
                        "是：重新加载磁盘内容（丢弃本地修改）\n" +
                        "否：保留本地修改（下次保存会覆盖外部修改）",
                        "文件已变更", MessageBoxButton.YesNo, MessageBoxImage.Warning);
                    if (choose == MessageBoxResult.Yes) ReloadCurrentTabSilently();
                    else StatusText.Text = "文件已被外部修改：已保留本地未保存内容";
                    return;
                }

                var r = MessageBox.Show(
                    "文件已被其它程序修改，是否重新加载？\n\n" + tab.FilePath,
                    "文件已变更", MessageBoxButton.YesNo, MessageBoxImage.Question);
                if (r == MessageBoxResult.Yes) ReloadCurrentTabSilently();
            }
            catch (Exception ex)
            {
                Logger.Warn("处理外部修改失败：" + ex.Message);
            }
        }

        private void ReloadCurrentTabSilently()
        {
            var tab = CurrentTab;
            if (tab == null || string.IsNullOrEmpty(tab.FilePath)) return;
            try
            {
                var read = FileReaderHelper.ReadMarkdownFileEx(tab.FilePath);
                tab.MarkdownText = read.Text;
                tab.Encoding = read.Encoding;
                tab.EncodingCodePage = read.CodePage;
                tab.EncodingGuessed = read.Guessed;
                tab.EditText = null;
                tab.IsDirty = false;
                _lastKnownWriteUtc = SafeLastWrite(tab.FilePath);
                if (_webReady) PushMarkdown(tab, reset: true);
                RefreshWindowTitle();
                StatusText.Text = "已重新加载：" + tab.FilePath;
            }
            catch (Exception ex)
            {
                Logger.Error("重新加载失败", ex);
                MessageBox.Show("重新加载失败：" + ex.Message, "错误",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void RebuildRecentMenu()
        {
            if (RecentMenu == null) return;
            RecentMenu.Items.Clear();
            var files = _settings.RecentFiles.Where(File.Exists).ToList();
            foreach (var path in files)
            {
                var item = new System.Windows.Controls.MenuItem { Header = path, ToolTip = path };
                item.Click += (_, _) => OpenTab(path);
                RecentMenu.Items.Add(item);
            }
            if (files.Count == 0)
            {
                RecentMenu.Items.Add(new System.Windows.Controls.MenuItem
                {
                    Header = "（暂无最近文件）",
                    IsEnabled = false
                });
                return;
            }
            RecentMenu.Items.Add(new Separator());
            var clear = new System.Windows.Controls.MenuItem { Header = "清除最近列表" };
            clear.Click += (_, _) =>
            {
                _settings.RecentFiles.Clear();
                RebuildRecentMenu();
            };
            RecentMenu.Items.Add(clear);
        }

        /// <summary>按色板创建带颜色的标签文档。</summary>
        private static TabDoc CreateTabDoc(string filePath, string text, MdEncoding encoding,
            bool encodingGuessed = false, int encodingCodePage = 0)
        {
            var ci = System.Threading.Interlocked.Increment(ref _colorCounter) - 1;
            var idx = ((ci % Palette.Length) + Palette.Length) % Palette.Length;
            var main = (Color)ColorConverter.ConvertFromString(Palette[idx].Hex)!;
            var fg = (Color)ColorConverter.ConvertFromString(Palette[idx].Fg)!;
            var light = Color.FromArgb(42, main.R, main.G, main.B); // 约 16% 浅色底
            return new TabDoc
            {
                FilePath = filePath,
                MarkdownText = text,
                Encoding = encoding,
                EncodingCodePage = encodingCodePage,
                EncodingGuessed = encodingGuessed,
                ColorIndex = idx,
                TabBrush = Frozen(main),
                TabBrushLight = Frozen(light),
                TabFgBrush = Frozen(fg)
            };
        }

        private static SolidColorBrush Frozen(Color c)
        {
            var b = new SolidColorBrush(c);
            b.Freeze();
            return b;
        }

        /// <summary>打开一个 Markdown 文件为标签页（不等待读取完成）。</summary>
        public void OpenTab(string filePath) => _ = OpenTabAsync(filePath);

        /// <summary>打开一个 Markdown 文件；同一路径的并发打开会复用同一个任务。</summary>
        public Task<TabDoc?> OpenTabAsync(string filePath)
        {
            string full;
            try
            {
                full = Path.GetFullPath(filePath);
            }
            catch (Exception ex)
            {
                Logger.Error("打开文件失败：" + filePath, ex);
                MessageBox.Show($"打开文件失败：{ex.Message}", "错误",
                    MessageBoxButton.OK, MessageBoxImage.Error);
                return Task.FromResult<TabDoc?>(null);
            }

            lock (_openingTabs)
            {
                if (_openingTabs.TryGetValue(full, out var running)) return running;
            }

            var task = OpenTabCoreAsync(full);
            lock (_openingTabs) _openingTabs[full] = task;
            _ = task.ContinueWith(_ =>
            {
                lock (_openingTabs) _openingTabs.Remove(full);
            }, TaskScheduler.Default);
            return task;
        }

        private async Task<TabDoc?> OpenTabCoreAsync(string full)
        {
            try
            {
                var existing = _tabs.FirstOrDefault(t =>
                    string.Equals(t.FilePath, full, StringComparison.OrdinalIgnoreCase));
                if (existing != null)
                {
                    Tabs.SelectedItem = existing;
                    return existing;
                }

                // 后台读取，大文件不会卡住 UI
                var read = await Task.Run(() => FileReaderHelper.ReadMarkdownFileEx(full));

                // 读取期间可能已由其它路径把同一文件加进来
                var raced = _tabs.FirstOrDefault(t =>
                    string.Equals(t.FilePath, full, StringComparison.OrdinalIgnoreCase));
                if (raced != null)
                {
                    Tabs.SelectedItem = raced;
                    return raced;
                }

                var tab = CreateTabDoc(full, read.Text, read.Encoding, read.Guessed, read.CodePage);
                _tabs.Add(tab);
                Tabs.SelectedItem = tab;
                _settings.AddRecent(full);
                RebuildRecentMenu();
                if (read.Guessed)
                {
                    StatusText.Text += " · 编码为推测结果，若显示异常请用「编码」菜单切换";
                }
                return tab;
            }
            catch (Exception ex)
            {
                Logger.Error("打开文件失败：" + full, ex);
                MessageBox.Show($"打开文件失败：{ex.Message}", "错误",
                    MessageBoxButton.OK, MessageBoxImage.Error);
                return null;
            }
        }

        /// <summary>新建一个未命名标签页；首次保存时再选择文件路径。</summary>
        public void NewTab()
        {
            var n = System.Threading.Interlocked.Increment(ref _untitledCounter);
            var tab = CreateTabDoc("", "", MdEncoding.Utf8NoBom);
            tab.DisplayName = $"未命名-{n}.md";
            _tabs.Add(tab);
            Tabs.SelectedItem = tab;
        }

        /// <summary>标签切换：同步标题、状态栏、文件目录映射，并推送渲染该标签内容。</summary>
        /// <summary>根据当前标签的 Title（含未保存圆点）刷新窗口标题。</summary>
        private void RefreshWindowTitle()
        {
            var tab = CurrentTab;
            if (tab == null)
                Title = _isFloating ? "MarkdownViewer" : "MarkdownViewer - Markdown 阅读与编辑器";
            else
                Title = $"MarkdownViewer - {tab.Title}";
        }

        private void Tabs_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            var tab = CurrentTab;
            if (tab == null)
            {
                _tocOwnerId = null;
                TocListBox.Items.Clear();
                StatusText.Text = "将 .md 文件拖入窗口，或点击「打开文件」";
                RefreshWindowTitle();
                return;
            }

            RefreshWindowTitle();
            var encName = FileReaderHelper.Name(tab.Encoding, tab.EncodingCodePage);
            StatusText.Text = string.IsNullOrEmpty(tab.FilePath)
                ? $"{tab.BaseTitle}（尚未保存） · {encName}"
                : $"{tab.FilePath} · {encName}";

            // 立即显示该标签缓存的目录（首次打开时为空，待前端渲染后回传）
            if (_tocOwnerId != tab.Id) ShowCachedToc(tab);

            UpdateWatcher(tab);

            // 把该标签 md 所在目录映射为虚拟主机，使相对路径图片可正常显示
            var dir = string.IsNullOrEmpty(tab.FilePath) ? null : Path.GetDirectoryName(tab.FilePath);
            if (WebView.CoreWebView2 != null && !string.IsNullOrEmpty(dir))
            {
                WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "mdfile.local", dir, CoreWebView2HostResourceAccessKind.Allow);
            }

            if (_webReady) PushMarkdown(tab);
        }

        /// <summary>用标签缓存的目录树刷新左侧面板。</summary>
        private void ShowCachedToc(TabDoc tab)
        {
            _tocOwnerId = tab.Id;
            TocListBox.Items.Clear();
            AddNodesRecursive(tab.TocRoots);
            ApplyTocVisibility(tab.TocRoots);
        }

        /// <summary>关闭标签；关闭当前标签后自动切换到相邻标签；未保存则提示。</summary>
        private async void CloseTab_Click(object sender, RoutedEventArgs e)
        {
            if (sender is FrameworkElement fe && fe.DataContext is TabDoc tab)
                await CloseTabAsync(tab);
            e.Handled = true;
        }

        /// <summary>关闭指定标签（工具栏按钮、Ctrl+W、标签上的 ✕ 共用）。</summary>
        private async Task CloseTabAsync(TabDoc tab)
        {
            // 独立窗口只有一个标签：点关闭即关闭整个窗口（走窗口级未保存确认）
            if (_isFloating && _tabs.Count == 1)
            {
                Close();
                return;
            }

            await SyncTabFromEditorAsync(tab);
            if (!_tabs.Contains(tab)) return; // 可能已被其它操作关闭
            if (tab.IsDirty)
            {
                var r = MessageBox.Show(
                    $"文档「{tab.BaseTitle}」有未保存的修改，是否保存？",
                    "保存修改", MessageBoxButton.YesNoCancel, MessageBoxImage.Question);
                if (r == MessageBoxResult.Cancel) return;
                if (r == MessageBoxResult.Yes && !await SaveTabAsync(tab)) return;
            }

            var idx = _tabs.IndexOf(tab);
            if (idx < 0) return;
            var wasSelected = ReferenceEquals(tab, CurrentTab);
            _tabs.Remove(tab);
            // 通知前端释放该标签的编辑缓冲区
            WebView.CoreWebView2?.PostWebMessageAsJson(
                JsonSerializer.Serialize(new { type = "dropTab", tabId = tab.Id.ToString() }));

            if (_tabs.Count == 0)
            {
                WebView.CoreWebView2?.Navigate(AppHost + "index.html");
            }
            else if (wasSelected)
            {
                Tabs.SelectedItem = _tabs[Math.Min(idx, _tabs.Count - 1)];
            }
        }

        /// <summary>切换标签（Ctrl+Tab / Ctrl+Shift+Tab）。</summary>
        private void SwitchTab(int delta)
        {
            if (_tabs.Count < 2) return;
            var i = Tabs.SelectedIndex + delta;
            if (i < 0) i = _tabs.Count - 1;
            if (i >= _tabs.Count) i = 0;
            Tabs.SelectedIndex = i;
        }

        /// <summary>双击标签：把该标签弹出为独立窗口（仅当窗口内不止一个标签）。</summary>
        private async void TabHeader_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ClickCount < 2) return;
            if (sender is not FrameworkElement fe || fe.DataContext is not TabDoc tab) return;
            if (_tabs.Count <= 1 || _isFloating) return;

            if (_webReady)
            {
                tab.ScrollY = await ReadScrollY();
                await SyncTabFromEditorAsync(tab);
            }

            _tabs.Remove(tab);
            // 该标签已移交独立窗口：释放本窗口的前端缓冲区
            WebView.CoreWebView2?.PostWebMessageAsJson(
                JsonSerializer.Serialize(new { type = "dropTab", tabId = tab.Id.ToString() }));

            var win = new MainWindow(true, tab, _themeMode, _viewMode)
            {
                Width = 1040,
                Height = 740,
                WindowStartupLocation = WindowStartupLocation.Manual
            };
            win.Show();
            win.Left = Left + 60;
            win.Top = Top + 60;
            e.Handled = true;
        }

        private async Task<double> ReadScrollY()
        {
            try
            {
                var raw = await WebView.CoreWebView2.ExecuteScriptAsync("window.getScrollY()");
                return double.TryParse(raw, out var y) ? y : 0;
            }
            catch { return 0; }
        }

        /// <summary>
        /// 从前端编辑器同步某个标签的最新文本与脏标记（关闭/保存/弹出/合并前调用）。
        /// </summary>
        private async Task SyncTabFromEditorAsync(TabDoc tab)
        {
            if (!_webReady || WebView.CoreWebView2 == null) return;
            try
            {
                var raw = await WebView.CoreWebView2
                    .ExecuteScriptAsync($"window.getTabState('{tab.Id}')");
                using var doc = JsonDocument.Parse(raw);
                var root = doc.RootElement.Clone();
                // 兼容：若前端误返回 JSON 字符串，会再包一层引号，这里解一层
                if (root.ValueKind == JsonValueKind.String)
                {
                    var inner = root.GetString();
                    if (string.IsNullOrWhiteSpace(inner)) return;
                    using var doc2 = JsonDocument.Parse(inner);
                    root = doc2.RootElement.Clone();
                }
                if (root.ValueKind != JsonValueKind.Object) return;

                if (root.TryGetProperty("text", out var te) && te.ValueKind == JsonValueKind.String)
                {
                    var text = te.GetString();
                    if (text != null) tab.EditText = text;
                }
                if (root.TryGetProperty("dirty", out var de) &&
                    (de.ValueKind == JsonValueKind.True || de.ValueKind == JsonValueKind.False))
                    tab.IsDirty = de.GetBoolean();
                // 干净标签无需保留编辑副本，避免下次切换带回旧文本
                if (!tab.IsDirty) tab.EditText = null;
            }
            catch (Exception ex)
            {
                // 前端尚未就绪时可能拿不到 JSON：记录一条即可，不打断保存流程
                Logger.Warn("同步编辑器内容失败：" + ex.Message);
            }
        }

        /// <summary>编码是推测出来的文件，写回前请用户确认。</summary>
        private static bool ConfirmGuessedEncoding(TabDoc tab)
        {
            if (!tab.EncodingGuessed) return true;
            var r = MessageBox.Show(
                $"「{tab.DisplayName}」的编码是自动推测的（{FileReaderHelper.Name(tab.Encoding, tab.EncodingCodePage)}）。\n\n" +
                "直接保存可能改变原文件编码，导致其它程序打开乱码。\n" +
                "是：按推测编码保存；否：取消，先用「编码」菜单确认正确编码。",
                "保存编码确认", MessageBoxButton.YesNo, MessageBoxImage.Warning);
            if (r != MessageBoxResult.Yes) return false;
            tab.EncodingGuessed = false;
            return true;
        }

        /// <summary>保存标签到磁盘（按原编码写回）。未命名文档会先弹出另存为。返回是否成功。</summary>
        private async Task<bool> SaveTabAsync(TabDoc tab)
        {
            if (string.IsNullOrEmpty(tab.FilePath))
                return await SaveTabAsAsync(tab);

            if (!ConfirmGuessedEncoding(tab)) return false;

            await SyncTabFromEditorAsync(tab);
            try
            {
                var text = tab.EditText ?? tab.MarkdownText;
                FileReaderHelper.WriteMarkdownFile(tab.FilePath, text, tab.Encoding, tab.EncodingCodePage);
                tab.MarkdownText = text;
                tab.EditText = null;
                tab.IsDirty = false;
                tab.EncodingGuessed = false;
                _lastKnownWriteUtc = SafeLastWrite(tab.FilePath);
                _settings.AddRecent(tab.FilePath);
                RebuildRecentMenu();
                WebView.CoreWebView2?.PostWebMessageAsJson(JsonSerializer.Serialize(
                    new { type = "saved", tabId = tab.Id.ToString(), text }));
                StatusText.Text = $"已保存：{tab.FilePath} · {FileReaderHelper.Name(tab.Encoding, tab.EncodingCodePage)}";
                if (ReferenceEquals(tab, CurrentTab)) RefreshWindowTitle();
                return true;
            }
            catch (Exception ex)
            {
                MessageBox.Show($"保存失败：{ex.Message}", "错误",
                    MessageBoxButton.OK, MessageBoxImage.Error);
                return false;
            }
        }

        /// <summary>另存为：选择新路径并写回，成功返回 true。</summary>
        private async Task<bool> SaveTabAsAsync(TabDoc tab)
        {
            var dlg = new SaveFileDialog
            {
                Filter = "Markdown 文件 (*.md;*.markdown;*.mdx)|*.md;*.markdown;*.mdx|所有文件 (*.*)|*.*",
                FileName = tab.BaseTitle
            };
            if (dlg.ShowDialog() != true) return false;

            if (!ConfirmGuessedEncoding(tab)) return false;

            await SyncTabFromEditorAsync(tab);
            try
            {
                var newPath = Path.GetFullPath(dlg.FileName);
                var text = tab.EditText ?? tab.MarkdownText;
                FileReaderHelper.WriteMarkdownFile(newPath, text, tab.Encoding, tab.EncodingCodePage);
                tab.FilePath = newPath;
                tab.MarkdownText = text;
                tab.EditText = null;
                tab.IsDirty = false;
                tab.EncodingGuessed = false;
                tab.RefreshTitle();
                _lastKnownWriteUtc = SafeLastWrite(newPath);
                _settings.AddRecent(newPath);
                RebuildRecentMenu();

                // 新文件所在目录映射为图片虚拟主机，保证相对路径图片继续可用
                var newDir = Path.GetDirectoryName(newPath);
                if (WebView.CoreWebView2 != null && !string.IsNullOrEmpty(newDir))
                {
                    WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                        "mdfile.local", newDir, CoreWebView2HostResourceAccessKind.Allow);
                }

                // 路径变了：重新监听新文件，并让前端强制重建预览以重新请求相对图片
                UpdateWatcher(tab);
                RefreshWindowTitle();
                WebView.CoreWebView2?.PostWebMessageAsJson(JsonSerializer.Serialize(
                    new { type = "saved", tabId = tab.Id.ToString(), text }));
                WebView.CoreWebView2?.PostWebMessageAsJson(
                    JsonSerializer.Serialize(new { type = "reloadImages" }));
                StatusText.Text = "已另存为：" + newPath;
                return true;
            }
            catch (Exception ex)
            {
                MessageBox.Show($"另存为失败：{ex.Message}", "错误",
                    MessageBoxButton.OK, MessageBoxImage.Error);
                return false;
            }
        }

        /// <summary>切换视图模式（预览/分栏/编辑）。</summary>
        private void View_Changed(object sender, RoutedEventArgs e)
        {
            if (!IsLoaded) return;
            if (ViewSplit.IsChecked == true) _viewMode = "split";
            else if (ViewEdit.IsChecked == true) _viewMode = "edit";
            else _viewMode = "preview";
            ApplyWebView();
        }

        private void ApplyWebView()
        {
            if (!_webReady) return;
            WebView.CoreWebView2.PostWebMessageAsJson(
                JsonSerializer.Serialize(new { type = "view", mode = _viewMode }));
        }

        protected override void OnPreviewKeyDown(KeyEventArgs e)
        {
            base.OnPreviewKeyDown(e);

            if (e.Key == Key.F11)
            {
                ToggleFullScreen();
                e.Handled = true;
                return;
            }
            if (e.Key == Key.F3)
            {
                FindNext_Click(this, new RoutedEventArgs());
                e.Handled = true;
                return;
            }

            var ctrl = (Keyboard.Modifiers & ModifierKeys.Control) == ModifierKeys.Control;
            if (!ctrl) return;
            var shift = (Keyboard.Modifiers & ModifierKeys.Shift) == ModifierKeys.Shift;

            switch (e.Key)
            {
                case Key.Tab:
                    SwitchTab(shift ? -1 : 1);
                    e.Handled = true;
                    break;
                case Key.W:
                    if (CurrentTab != null) _ = CloseTabAsync(CurrentTab);
                    e.Handled = true;
                    break;
                case Key.S when shift:
                    if (CurrentTab != null) _ = SaveTabAsAsync(CurrentTab);
                    e.Handled = true;
                    break;
                case Key.F when shift:
                    SearchInFolder_Click(this, new RoutedEventArgs());
                    e.Handled = true;
                    break;
                case Key.F:
                    PostToWeb(new { type = "find", mode = "find" });
                    e.Handled = true;
                    break;
                case Key.H:
                    PostToWeb(new { type = "find", mode = "replace" });
                    e.Handled = true;
                    break;
                case Key.P:
                    Print_Click(this, new RoutedEventArgs());
                    e.Handled = true;
                    break;
                case Key.OemPlus:
                case Key.Add:
                    SetZoom(_settings.Zoom + 0.1);
                    e.Handled = true;
                    break;
                case Key.OemMinus:
                case Key.Subtract:
                    SetZoom(_settings.Zoom - 0.1);
                    e.Handled = true;
                    break;
                case Key.D0:
                case Key.NumPad0:
                    SetZoom(1.0);
                    e.Handled = true;
                    break;
            }
        }

        private void SyncViewButtons()
        {
            if (_viewMode == "split") ViewSplit.IsChecked = true;
            else if (_viewMode == "edit") ViewEdit.IsChecked = true;
            else ViewPreview.IsChecked = true;
        }

        /// <summary>接收由独立窗口合并回来的标签。</summary>
        public void ReceiveTab(TabDoc tab, double scrollY)
        {
            tab.ScrollY = scrollY;
            if (!_tabs.Contains(tab))
            {
                _tabs.Add(tab);
                Tabs.SelectedItem = tab;
            }
            if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
            Activate();
            Topmost = true; Topmost = false;
        }

        // ---------- 独立窗口拖回标签区合并 ----------

        protected override void OnSourceInitialized(EventArgs e)
        {
            base.OnSourceInitialized(e);
            // 独立窗口：钩住标题栏拖动，仅真实拖动才参与拖回合并
            if (_isFloating)
            {
                var helper = new WindowInteropHelper(this);
                var src = HwndSource.FromHwnd(helper.Handle);
                src?.AddHook(FloatingWndProc);
            }
        }

        private IntPtr FloatingWndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
        {
            switch (msg)
            {
                // 用户按住标题栏（程序化移动不会产生该消息，避免误合并）
                case WM_NCLBUTTONDOWN when wParam.ToInt32() == HTCAPTION && _tabs.Count == 1:
                    _nDragging = true;
                    StartDragWatch(); // 兜底：Dispatcher 恢复后也能检测松开
                    break;
                // 系统移动模态循环中持续发 WM_MOVE，实时刷新停靠目标
                case WM_MOVE when _nDragging && _tabs.Count == 1:
                    UpdateDropTarget();
                    break;
                // 系统移动模态循环结束（标题栏拖动松手）
                case WM_EXITSIZEMOVE when _nDragging:
                    _nDragging = false;
                    _dragTimer?.Stop();
                    var target = _hoverTarget;
                    ClearDropHints();
                    _hoverTarget = null;
                    if (target != null && target != this && _tabs.Count == 1)
                    {
                        var t = target;
                        // 延迟到 Dispatcher 空闲，避免在消息处理中重入关闭
                        Dispatcher.BeginInvoke(new Action(() => { _ = MergeIntoAsync(t); }));
                    }
                    break;
            }
            return IntPtr.Zero;
        }

        protected override void OnLocationChanged(EventArgs e)
        {
            base.OnLocationChanged(e);
            // 拖动过程中位置变化，实时刷新停靠目标（双保险）
            if (_isFloating && _nDragging && _tabs.Count == 1)
                UpdateDropTarget();
        }

        private static bool IsLeftDown() => (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;

        private void StartDragWatch()
        {
            if (_dragTimer == null)
            {
                _dragTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(40) };
                _dragTimer.Tick += DragWatch_Tick;
            }
            if (!_dragTimer.IsEnabled) _dragTimer.Start();
        }

        private void DragWatch_Tick(object? sender, EventArgs e)
        {
            bool leftDown = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;
            if (leftDown)
            {
                UpdateDropTarget();
            }
            else
            {
                // 鼠标松开
                _dragTimer?.Stop();
                var target = _hoverTarget;
                ClearDropHints();
                _hoverTarget = null;
                if (target != null && target != this && _tabs.Count == 1)
                {
                    _ = MergeIntoAsync(target);
                }
            }
        }

        private void UpdateDropTarget()
        {
            GetCursorPos(out var pt);
            MainWindow? found = null;

            foreach (var w in AllWindows)
            {
                if (w == this || !w.IsLoaded || w.Tabs.ActualWidth <= 0) continue;
                var rect = w.GetTabStripScreenRect();
                if (rect.HasValue && rect.Value.Contains(pt.X, pt.Y))
                {
                    found = w;
                    break;
                }
            }

            if (found != _hoverTarget)
            {
                ClearDropHints();
                _hoverTarget = found;
                if (found != null) found.DropHint.Visibility = Visibility.Visible;
            }
        }

        /// <summary>获取标签栏在物理屏幕坐标下的矩形（含 DPI 换算）。</summary>
        private Rect? GetTabStripScreenRect()
        {
            var src = PresentationSource.FromVisual(Tabs);
            if (src?.CompositionTarget == null) return null;
            var topLeft = Tabs.PointToScreen(new Point(0, 0));
            var d = src.CompositionTarget.TransformToDevice;
            return new Rect(topLeft.X, topLeft.Y,
                Tabs.ActualWidth * d.M11, Tabs.ActualHeight * d.M22);
        }

        private static void ClearDropHints()
        {
            foreach (var w in AllWindows)
            {
                if (w.DropHint != null) w.DropHint.Visibility = Visibility.Collapsed;
            }
        }

        private async Task MergeIntoAsync(MainWindow target)
        {
            if (_tabs.Count != 1) return;
            var tab = _tabs[0];
            if (_webReady)
            {
                tab.ScrollY = await ReadScrollY();
                await SyncTabFromEditorAsync(tab);
            }

            _tabs.Remove(tab);
            target.ReceiveTab(tab, tab.ScrollY);
            // 标签所有权已转移：释放本窗口前端缓冲区，关闭时不再弹未保存确认
            WebView.CoreWebView2?.PostWebMessageAsJson(
                JsonSerializer.Serialize(new { type = "dropTab", tabId = tab.Id.ToString() }));
            _reallyClosing = true;
            Close();
        }

        private void PushMarkdown(TabDoc tab, bool reset = false)
        {
            var payload = JsonSerializer.Serialize(new
            {
                type = "load",
                tabId = tab.Id.ToString(),
                text = tab.EditText ?? tab.MarkdownText,
                title = tab.Title,
                dirty = tab.IsDirty,
                reset = reset,
                initialScroll = tab.ScrollY,
                cursorLine = tab.RestoreLine,
                cursorCh = tab.RestoreCh,
                editorScroll = tab.RestoreEditorScroll
            });
            WebView.CoreWebView2.PostWebMessageAsJson(payload);
            // 首次加载已经把会话光标/滚动交给前端；之后切标签改用前端自己的位置
            tab.RestoreLine = -1;
            tab.RestoreCh = 0;
            tab.RestoreEditorScroll = null;
        }

        /// <summary>接收前端 JS 消息：目录数据 / 当前滚动位置对应的标题。</summary>
        private void CoreWebView2_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                ReceiveWebMessage(e.WebMessageAsJson);
            }
            catch (Exception ex)
            {
                // 非法/不完整的消息忽略，但要留下日志方便定位前端问题
                Logger.Warn("处理前端消息失败：" + ex.Message);
            }
        }

        private void ReceiveWebMessage(string json)
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return;

            var type = root.TryGetProperty("type", out var t) ? t.GetString() : null;
            switch (type)
            {
                case "toc":
                    var tid = root.TryGetProperty("tabId", out var tt) ? tt.GetString() : null;
                    var tab = _tabs.FirstOrDefault(x => x.Id.ToString() == tid);
                    if (tab != null && root.TryGetProperty("items", out var items))
                        RenderToc(tab, items);
                    break;
                case "active":
                    if (CurrentTab == null) return;
                    var iid = root.TryGetProperty("id", out var aid) ? aid.GetString() : null;
                    var atid = root.TryGetProperty("tabId", out var att) ? att.GetString() : null;
                    // 防止切换标签瞬间收到旧标签的滚动消息，误高亮新标签目录
                    if (atid != null && atid != CurrentTab.Id.ToString()) return;
                    HighlightTocItem(CurrentTab.TocRoots, iid);
                    break;
                case "dirty":
                    var dtid = root.TryGetProperty("tabId", out var dtt) ? dtt.GetString() : null;
                    var dtab = _tabs.FirstOrDefault(x => x.Id.ToString() == dtid);
                    if (dtab != null && root.TryGetProperty("dirty", out var dv))
                    {
                        dtab.IsDirty = dv.GetBoolean();
                        // 撤销回保存基线后，不再保留过期的编辑缓存
                        if (!dtab.IsDirty) dtab.EditText = null;
                        if (ReferenceEquals(dtab, CurrentTab)) RefreshWindowTitle();
                    }
                    break;
                case "save":
                    var stid = root.TryGetProperty("tabId", out var stt) ? stt.GetString() : null;
                    var stab = _tabs.FirstOrDefault(x => x.Id.ToString() == stid);
                    if (stab != null)
                    {
                        var text = root.TryGetProperty("text", out var tx) ? tx.GetString() : null;
                        if (text != null) stab.EditText = text;
                        _ = SaveTabAsync(stab);
                    }
                    break;
                case "openLink":
                    // 预览中点击相对路径链接（例如指向另一个 .md 文档）
                    var olid = root.TryGetProperty("tabId", out var olt) ? olt.GetString() : null;
                    var oltab = _tabs.FirstOrDefault(x => x.Id.ToString() == olid) ?? CurrentTab;
                    var olhref = root.TryGetProperty("href", out var olh) ? olh.GetString() : null;
                    if (oltab != null && !string.IsNullOrWhiteSpace(olhref)) OpenLocalLink(oltab, olhref!);
                    break;
                case "switchTab":
                    SwitchTab(root.TryGetProperty("delta", out var dl) ? dl.GetInt32() : 1);
                    break;
                case "newTab":
                    NewTab();
                    break;
                case "closeTab":
                    var ctid = root.TryGetProperty("tabId", out var ctt) ? ctt.GetString() : null;
                    var ctab = _tabs.FirstOrDefault(x => x.Id.ToString() == ctid) ?? CurrentTab;
                    if (ctab != null) _ = CloseTabAsync(ctab);
                    break;
                case "zoom":
                    if (root.TryGetProperty("absolute", out var za) && za.ValueKind == JsonValueKind.Number)
                        SetZoom(za.GetDouble());
                    else if (root.TryGetProperty("delta", out var zd) && zd.ValueKind == JsonValueKind.Number)
                        SetZoom(_settings.Zoom + zd.GetDouble());
                    break;
                case "fullscreen":
                    ToggleFullScreen();
                    break;
                case "print":
                    Print_Click(this, new RoutedEventArgs());
                    break;
                case "saveImage":
                    HandleSaveImage(root);
                    break;
                case "draft":
                    // 编辑草稿：只缓存文本，不改变脏状态（脏状态以 dirty 消息为准）
                    var drid = root.TryGetProperty("tabId", out var drt) ? drt.GetString() : null;
                    var drab = _tabs.FirstOrDefault(x => x.Id.ToString() == drid);
                    if (drab != null && root.TryGetProperty("text", out var drx) &&
                        drx.ValueKind == JsonValueKind.String)
                    {
                        drab.EditText = drx.GetString();
                    }
                    break;
                case "status":
                    if (root.TryGetProperty("text", out var stx) && stx.ValueKind == JsonValueKind.String)
                        StatusText.Text = stx.GetString() ?? "";
                    break;
                case "openFile":
                    OpenFile_Click(this, new RoutedEventArgs());
                    break;
                case "saveAs":
                    SaveAs_Click(this, new RoutedEventArgs());
                    break;
                case "reload":
                    Reload_Click(this, new RoutedEventArgs());
                    break;
                case "searchFolder":
                    SearchInFolder_Click(this, new RoutedEventArgs());
                    break;
            }
        }

        /// <summary>把从剪贴板/拖拽得到的图片数据保存到文档同级 assets 目录并插入链接。</summary>
        private void HandleSaveImage(JsonElement root)
        {
            var tabId = root.TryGetProperty("tabId", out var t) ? t.GetString() : null;
            var tab = _tabs.FirstOrDefault(x => x.Id.ToString() == tabId) ?? CurrentTab;
            if (tab == null) return;
            if (string.IsNullOrEmpty(tab.FilePath))
            {
                StatusText.Text = "请先保存文档，再粘贴图片（图片会存到同级 assets 目录）";
                return;
            }
            if (!root.TryGetProperty("dataUrl", out var du) || du.ValueKind != JsonValueKind.String) return;

            var dataUrl = du.GetString() ?? "";
            if (!dataUrl.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)) return;
            var comma = dataUrl.IndexOf(',');
            if (comma < 0) return;
            var header = dataUrl.Substring(0, comma);
            var base64 = dataUrl.Substring(comma + 1);
            if (base64.Length > 20_000_000)
            {
                StatusText.Text = "图片过大（超过约 15MB），已取消插入";
                return;
            }
            var ext = header.Contains("image/jpeg", StringComparison.OrdinalIgnoreCase) ? ".jpg"
                : header.Contains("image/gif", StringComparison.OrdinalIgnoreCase) ? ".gif"
                : header.Contains("image/webp", StringComparison.OrdinalIgnoreCase) ? ".webp"
                : header.Contains("image/svg", StringComparison.OrdinalIgnoreCase) ? ".svg"
                : ".png";
            try
            {
                var bytes = Convert.FromBase64String(base64);
                var rel = CopyImageToAssets(tab, "image" + ext, bytes);
                PostToWeb(new { type = "insert", tabId = tab.Id.ToString(), text = $"![]({rel})" });
                StatusText.Text = "图片已保存到 " + rel;
            }
            catch (Exception ex)
            {
                Logger.Error("保存粘贴图片失败", ex);
            }
        }

        /// <summary>把前端返回的扁平 H1~H6 列表组装成可折叠树，存入标签。</summary>
        private void RenderToc(TabDoc tab, JsonElement items)
        {
            // 先构建新树（不直接修改 UI）
            var roots = new List<TocItem>();
            var stack = new Stack<TocItem>();
            foreach (var item in items.EnumerateArray())
            {
                var node = new TocItem
                {
                    Text = item.GetProperty("text").GetString() ?? "",
                    Id = item.GetProperty("id").GetString() ?? "",
                    Level = item.GetProperty("level").GetInt32()
                };

                // 弹出层级不小于当前节点的栈顶，找到父节点
                while (stack.Count > 0 && stack.Peek().Level >= node.Level)
                    stack.Pop();

                if (stack.Count > 0)
                {
                    node.Parent = stack.Peek();
                    stack.Peek().Children.Add(node);
                }
                else
                {
                    roots.Add(node);
                }
                stack.Push(node);
            }

            // 同一标签且目录内容没变：不重建 UI，避免打字时目录闪烁/展开状态丢失
            if (_tocOwnerId == tab.Id && TocEquals(tab.TocRoots, roots)) return;

            // 迁移旧的展开状态
            var expanded = new Dictionary<string, bool>(StringComparer.Ordinal);
            void Collect(IEnumerable<TocItem> nodes)
            {
                foreach (var n in nodes)
                {
                    if (n.HasChildren) expanded[n.Id] = n.IsExpanded;
                    Collect(n.Children);
                }
            }
            Collect(tab.TocRoots);
            void Restore(IEnumerable<TocItem> nodes)
            {
                foreach (var n in nodes)
                {
                    if (n.HasChildren && expanded.TryGetValue(n.Id, out var e)) n.IsExpanded = e;
                    Restore(n.Children);
                }
            }
            Restore(roots);

            tab.TocRoots.Clear();
            tab.TocRoots.AddRange(roots);

            // 仅当前标签的目录直接显示；其他标签只缓存，切换时再显示
            if (!ReferenceEquals(tab, CurrentTab)) return;

            _tocOwnerId = tab.Id;
            TocListBox.Items.Clear();
            AddNodesRecursive(tab.TocRoots);
            ApplyTocVisibility(tab.TocRoots);
        }

        /// <summary>比较两棵目录树的标题、层级、id 是否完全一致。</summary>
        private static bool TocEquals(List<TocItem> current, List<TocItem> next)
        {
            var a = new List<TocItem>();
            var b = new List<TocItem>();
            void Flat(List<TocItem> nodes, List<TocItem> target)
            {
                foreach (var n in nodes)
                {
                    target.Add(n);
                    Flat(n.Children, target);
                }
            }
            Flat(current, a);
            Flat(next, b);

            if (a.Count != b.Count) return false;
            for (int i = 0; i < a.Count; i++)
            {
                if (a[i].Level != b[i].Level ||
                    !string.Equals(a[i].Id, b[i].Id, StringComparison.Ordinal) ||
                    !string.Equals(a[i].Text, b[i].Text, StringComparison.Ordinal))
                    return false;
            }
            return true;
        }

        private void AddNodesRecursive(List<TocItem> roots)
        {
            foreach (var node in roots)
            {
                TocListBox.Items.Add(node);
                AddNodesRecursive(node.Children);
            }
        }

        /// <summary>根据各节点的展开状态，统一刷新子树可见性。</summary>
        private void ApplyTocVisibility(List<TocItem> roots)
        {
            void Walk(IEnumerable<TocItem> nodes, bool parentVisible)
            {
                foreach (var node in nodes)
                {
                    node.Visibility = parentVisible ? Visibility.Visible : Visibility.Collapsed;
                    Walk(node.Children, parentVisible && node.IsExpanded);
                }
            }
            Walk(roots, true);
        }

        /// <summary>点击三角箭头：折叠/展开子级目录。</summary>
        private void Glyph_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (sender is FrameworkElement fe && fe.DataContext is TocItem item && item.HasChildren)
            {
                item.IsExpanded = !item.IsExpanded;
                if (CurrentTab != null) ApplyTocVisibility(CurrentTab.TocRoots);
                e.Handled = true;
            }
        }

        private void HighlightTocItem(List<TocItem> roots, string? id)
        {
            if (id == null) return;
            var node = FindTocItem(roots, id);
            if (node == null) return;

            // 展开所有祖先
            var p = node.Parent;
            while (p != null) { p.IsExpanded = true; p = p.Parent; }
            ApplyTocVisibility(roots);

            _suppressTocSelection = true;
            TocListBox.SelectedItem = node;
            _suppressTocSelection = false;
            // 让高亮项滚动到可视区域（避免目录很长时看不到当前章节）
            try { TocListBox.ScrollIntoView(node); } catch { /* 布局尚未就绪时忽略 */ }
        }

        private static TocItem? FindTocItem(IEnumerable<TocItem> nodes, string id)
        {
            foreach (var n in nodes)
            {
                if (n.Id == id) return n;
                var found = FindTocItem(n.Children, id);
                if (found != null) return found;
            }
            return null;
        }

        private void TocListBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (_suppressTocSelection) return;
            if (TocListBox.SelectedItem is TocItem item)
            {
                WebView.CoreWebView2?.PostWebMessageAsJson(
                    JsonSerializer.Serialize(new { type = "scrollTo", id = item.Id }));
            }
        }

        /// <summary>主题切换：WPF 面板 + WebView 正文同步。</summary>
        private void ThemeRadio_Checked(object sender, RoutedEventArgs e)
        {
            if (!IsLoaded) return;
            if (sender is not FrameworkElement fe || fe.Tag is not string value) return;
            _themeSetting = value;
            _themeMode = ResolveTheme(value);   // 跟随系统时解析为实际主题
            ApplyWpfTheme();
            ApplyWebTheme();
        }

        /// <summary>按设置名称选中对应的显示模式按钮。</summary>
        private void SelectThemeRadio(string theme)
        {
            var radio = theme switch
            {
                "green" => ThemeGreenRadio,
                "dark" => ThemeDarkRadio,
                "system" => ThemeSystemRadio,
                _ => ThemeLightRadio
            };
            if (radio != null) radio.IsChecked = true;
        }

        private void ApplyWpfTheme()
        {
            if (!Themes.TryGetValue(_themeMode, out var p)) return;

            Resources["MainBgBrush"] = new SolidColorBrush(p.MainBg);
            Resources["ToolbarBgBrush"] = new SolidColorBrush(p.MainBg);
            Resources["TocPanelBgBrush"] = new SolidColorBrush(p.TocPanelBg);
            Resources["TocTextBrush"] = new SolidColorBrush(p.TocText);
            Resources["TocSelectedBrush"] = new SolidColorBrush(p.TocSelected);
            Resources["SplitterBrush"] = new SolidColorBrush(p.Splitter);
            Resources["BorderBrush2"] = new SolidColorBrush(p.Border);
            Resources["StatusTextBrush"] = new SolidColorBrush(p.Status);
        }

        private void ApplyWebTheme()
        {
            if (!_webReady) return;
            var webTheme = Themes[_themeMode].WebTheme;
            // 让 WebView2 自身（含原生右键菜单、滚动条、表单控件）跟随应用主题
            try
            {
                WebView.CoreWebView2.Profile.PreferredColorScheme = webTheme == "dark"
                    ? CoreWebView2PreferredColorScheme.Dark
                    : CoreWebView2PreferredColorScheme.Light;
            }
            catch (Exception ex)
            {
                Logger.Warn("设置 WebView2 配色方案失败：" + ex.Message);
            }
            WebView.CoreWebView2.PostWebMessageAsJson(
                JsonSerializer.Serialize(new { type = "theme", mode = webTheme }));
        }

        // ======================= 新增菜单命令 =======================

        private void PostToWeb(object payload)
        {
            if (!_webReady || WebView.CoreWebView2 == null) return;
            WebView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(payload));
        }

        private void Find_Click(object sender, RoutedEventArgs e)
            => PostToWeb(new { type = "find", mode = "find" });

        private void FindNext_Click(object sender, RoutedEventArgs e)
            => PostToWeb(new { type = "find", mode = "next" });

        private void ViewMenu_Click(object sender, RoutedEventArgs e)
        {
            if (sender is not FrameworkElement fe || fe.Tag is not string mode) return;
            _viewMode = mode;
            SyncViewButtons();
            ApplyWebView();
        }

        private void TypewriterToggle_Click(object sender, RoutedEventArgs e)
        {
            _settings.Typewriter = TypewriterToggle.IsChecked == true;
            ApplySettingsToWeb();
        }

        private void AutoSaveToggle_Click(object sender, RoutedEventArgs e)
        {
            _settings.AutoSave = AutoSaveToggle.IsChecked == true;
            StartAutoSave();
            StatusText.Text = _settings.AutoSave
                ? $"已开启自动保存（每 {Math.Max(5, _settings.AutoSaveSeconds)} 秒）"
                : "已关闭自动保存";
        }

        // ======================= Office 风格功能区 =======================

        private void RibbonTab_Checked(object sender, RoutedEventArgs e)
        {
            if (sender is not FrameworkElement fe || fe.Tag is not string tag) return;
            ShowRibbonPanel(tag);
        }

        /// <summary>根据选中的功能区标签，只显示对应的一组工具栏按钮。</summary>
        private void ShowRibbonPanel(string tag)
        {
            if (RibbonFilePanel == null) return;   // InitializeComponent 期间面板尚未创建
            RibbonFilePanel.Visibility = tag == "file" ? Visibility.Visible : Visibility.Collapsed;
            RibbonEditPanel.Visibility = tag == "edit" ? Visibility.Visible : Visibility.Collapsed;
            RibbonViewPanel.Visibility = tag == "view" ? Visibility.Visible : Visibility.Collapsed;
            RibbonEncodingPanel.Visibility = tag == "encoding" ? Visibility.Visible : Visibility.Collapsed;
            RibbonHelpPanel.Visibility = tag == "help" ? Visibility.Visible : Visibility.Collapsed;
        }

        private void ZoomIn_Click(object sender, RoutedEventArgs e) => SetZoom(_settings.Zoom + 0.1);

        private void ZoomOut_Click(object sender, RoutedEventArgs e) => SetZoom(_settings.Zoom - 0.1);

        private void ZoomReset_Click(object sender, RoutedEventArgs e) => SetZoom(1.0);

        private void SetZoom(double zoom)
        {
            _settings.Zoom = Math.Clamp(Math.Round(zoom, 2), 0.6, 2.5);
            ApplySettingsToWeb();
            StatusText.Text = $"缩放：{Math.Round(_settings.Zoom * 100)}%";
        }

        private void FullScreen_Click(object sender, RoutedEventArgs e) => ToggleFullScreen();

        private void ToggleFullScreen()
        {
            if (!_isFullScreen)
            {
                _prevWindowStyle = WindowStyle;
                _prevWindowState = WindowState;
                WindowStyle = WindowStyle.None;
                WindowState = WindowState.Normal;
                WindowState = WindowState.Maximized;
                _isFullScreen = true;
            }
            else
            {
                WindowStyle = _prevWindowStyle;
                WindowState = _prevWindowState;
                _isFullScreen = false;
            }
        }

        private void EncodingMenu_Click(object sender, RoutedEventArgs e)
        {
            if (sender is not FrameworkElement fe || fe.Tag is not string name) return;
            if (Enum.TryParse<MdEncoding>(name, out var enc)) SetSaveEncoding(enc);
        }

        private void ReloadWithEncoding_Click(object sender, RoutedEventArgs e)
        {
            // 「以当前编码重新读取」：按标签当前编码重新解码磁盘文件
            if (CurrentTab != null) ApplyEncoding(CurrentTab.Encoding, CurrentTab.EncodingCodePage);
        }

        /// <summary>只设置“保存时使用的编码”，不立即重读文件（避免误丢编辑内容）。</summary>
        private void SetSaveEncoding(MdEncoding enc)
        {
            var tab = CurrentTab;
            if (tab == null) return;
            tab.Encoding = enc;
            tab.EncodingCodePage = 0;
            tab.EncodingGuessed = false;
            StatusText.Text = $"保存编码已设为 {FileReaderHelper.Name(enc)}；如需重新解码请用「以当前编码重新读取」";
        }

        /// <summary>按指定编码重新解码当前文件（用于修正乱码或切换写回编码）。</summary>
        private void ApplyEncoding(MdEncoding enc, int codePage = 0)
        {
            var tab = CurrentTab;
            if (tab == null) return;

            if (string.IsNullOrEmpty(tab.FilePath))
            {
                tab.Encoding = enc;
                tab.EncodingCodePage = codePage;
                StatusText.Text = $"后续保存将使用 {FileReaderHelper.Name(enc, codePage)}";
                return;
            }

            if (tab.IsDirty)
            {
                var r = MessageBox.Show(
                    "切换编码会重新读取磁盘文件，未保存的修改将丢失，是否继续？",
                    "切换编码", MessageBoxButton.YesNo, MessageBoxImage.Warning);
                if (r != MessageBoxResult.Yes) return;
            }

            try
            {
                var bytes = File.ReadAllBytes(tab.FilePath);
                tab.MarkdownText = FileReaderHelper.DecodeWith(enc, bytes, codePage);
                tab.Encoding = enc;
                tab.EncodingCodePage = codePage;
                tab.EncodingGuessed = false;
                tab.EditText = null;
                tab.IsDirty = false;
                _lastKnownWriteUtc = SafeLastWrite(tab.FilePath);
                if (_webReady) PushMarkdown(tab, reset: true);
                RefreshWindowTitle();
                StatusText.Text = $"已按 {FileReaderHelper.Name(enc, codePage)} 重新读取：{tab.FilePath}";
            }
            catch (Exception ex)
            {
                Logger.Error("按指定编码读取失败", ex);
                MessageBox.Show("读取失败：" + ex.Message, "错误",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private async void ExportHtml_Click(object sender, RoutedEventArgs e)
        {
            var tab = CurrentTab;
            if (tab == null) return;
            var dlg = new SaveFileDialog
            {
                Filter = "HTML 文件 (*.html)|*.html",
                FileName = Path.GetFileNameWithoutExtension(tab.BaseTitle) + ".html"
            };
            if (dlg.ShowDialog() != true) return;
            if (string.IsNullOrEmpty(tab.FilePath) &&
                MessageBox.Show("当前文档尚未保存，导出后相对路径图片可能无法显示。是否继续？",
                    "导出 HTML", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes)
                return;
            try
            {
                var title = JsonSerializer.Serialize(tab.BaseTitle);
                var raw = await WebView.CoreWebView2.ExecuteScriptAsync(
                    $"window.buildExportHtml({title})");
                var html = JsonSerializer.Deserialize<string>(raw);
                if (string.IsNullOrEmpty(html)) throw new InvalidOperationException("导出内容为空");

                // 预览中的图片使用 https://mdfile.local/ 虚拟主机，导出文件必须换成绝对 file:/// 路径
                if (!string.IsNullOrEmpty(tab.FilePath))
                {
                    var dir = Path.GetDirectoryName(tab.FilePath);
                    if (!string.IsNullOrEmpty(dir))
                    {
                        var baseUri = new Uri(dir + Path.DirectorySeparatorChar).AbsoluteUri;
                        html = html.Replace("https://mdfile.local/", baseUri,
                            StringComparison.OrdinalIgnoreCase);
                    }
                }

                File.WriteAllText(dlg.FileName, html, new System.Text.UTF8Encoding(false));
                StatusText.Text = "已导出 HTML：" + dlg.FileName;
            }
            catch (Exception ex)
            {
                Logger.Error("导出 HTML 失败", ex);
                MessageBox.Show("导出 HTML 失败：" + ex.Message, "错误",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private async void ExportPdf_Click(object sender, RoutedEventArgs e)
        {
            var tab = CurrentTab;
            if (tab == null) return;
            var dlg = new SaveFileDialog
            {
                Filter = "PDF 文件 (*.pdf)|*.pdf",
                FileName = Path.GetFileNameWithoutExtension(tab.BaseTitle) + ".pdf"
            };
            if (dlg.ShowDialog() != true) return;
            try
            {
                var ok = await WebView.CoreWebView2.PrintToPdfAsync(dlg.FileName);
                StatusText.Text = ok ? "已导出 PDF：" + dlg.FileName : "导出 PDF 失败";
            }
            catch (Exception ex)
            {
                Logger.Error("导出 PDF 失败", ex);
                MessageBox.Show("导出 PDF 失败：" + ex.Message, "错误",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void Print_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                WebView.CoreWebView2?.ShowPrintUI(CoreWebView2PrintDialogKind.Browser);
            }
            catch (Exception ex)
            {
                Logger.Error("打开打印对话框失败", ex);
            }
        }

        private void InsertImage_Click(object sender, RoutedEventArgs e)
        {
            var tab = CurrentTab;
            if (tab == null) return;
            if (string.IsNullOrEmpty(tab.FilePath))
            {
                MessageBox.Show("请先保存文档，再插入本地图片（图片会复制到同级 assets 目录）。",
                    "插入图片", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }
            var dlg = new OpenFileDialog
            {
                Filter = "图片 (*.png;*.jpg;*.jpeg;*.gif;*.webp;*.svg)|*.png;*.jpg;*.jpeg;*.gif;*.webp;*.svg|所有文件 (*.*)|*.*"
            };
            if (dlg.ShowDialog() != true) return;
            try
            {
                var name = Path.GetFileNameWithoutExtension(dlg.FileName)
                    .Replace('[', '(').Replace(']', ')');
                var rel = CopyImageToAssets(tab, dlg.FileName);
                PostToWeb(new { type = "insert", tabId = tab.Id.ToString(), text = $"![{name}]({rel})" });
                StatusText.Text = "图片已复制到 " + rel;
            }
            catch (Exception ex)
            {
                Logger.Error("插入图片失败", ex);
                MessageBox.Show("插入图片失败：" + ex.Message, "错误",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        /// <summary>把图片复制到文档同级 assets 目录，返回相对路径（正斜杠）。</summary>
        private static string CopyImageToAssets(TabDoc tab, string sourcePath, byte[]? bytes = null)
        {
            var dir = Path.GetDirectoryName(tab.FilePath);
            if (string.IsNullOrEmpty(dir)) throw new IOException("文档尚未保存");
            var assets = Path.Combine(dir, "assets");
            Directory.CreateDirectory(assets);

            var ext = Path.GetExtension(sourcePath);
            if (string.IsNullOrEmpty(ext)) ext = ".png";
            var baseName = Path.GetFileNameWithoutExtension(sourcePath);
            if (string.IsNullOrWhiteSpace(baseName)) baseName = "image";
            // 文件名中的空格/括号/井号会破坏 Markdown 链接语法，统一替换为 -
            var safeStem = new string(baseName.Select(c =>
                char.IsLetterOrDigit(c) || c is '-' or '_' or '.' ? c : '-').ToArray());
            if (string.IsNullOrWhiteSpace(safeStem)) safeStem = "image";
            var name = $"{safeStem}-{DateTime.Now:yyyyMMdd-HHmmss-fff}{ext}";
            var dest = Path.Combine(assets, name);

            if (bytes != null) File.WriteAllBytes(dest, bytes);
            else File.Copy(sourcePath, dest, true);

            return "assets/" + name;
        }

        /// <summary>在当前标签的光标处插入 Markdown 片段。</summary>
        private void InsertMarkdown(string text)
        {
            var tab = CurrentTab;
            PostToWeb(new { type = "insert", tabId = tab?.Id.ToString(), text });
        }

        private void InsertTable_Click(object sender, RoutedEventArgs e)
        {
            if (CurrentTab == null)
            {
                StatusText.Text = "请先打开或新建一个文档";
                return;
            }
            var dlg = new TableInsertDialog(this);
            if (dlg.ShowDialog() != true) return;
            InsertMarkdown(dlg.BuildMarkdown());
        }

        private void InsertMermaid_Click(object sender, RoutedEventArgs e)
        {
            if (CurrentTab == null)
            {
                StatusText.Text = "请先打开或新建一个文档";
                return;
            }
            PostToWeb(new { type = "mermaidEditor" });
        }

        private void InsertCodeBlock_Click(object sender, RoutedEventArgs e) =>
            InsertMarkdown("```text\n\n```\n");

        private void InsertTaskList_Click(object sender, RoutedEventArgs e) =>
            InsertMarkdown("- [ ] 待办事项\n- [x] 已完成事项\n");

        private void SearchInFolder_Click(object sender, RoutedEventArgs e)
        {
            var tab = CurrentTab;
            var start = tab != null && !string.IsNullOrEmpty(tab.FilePath)
                ? Path.GetDirectoryName(tab.FilePath)
                : null;
            var win = new SearchWindow(this, start) { Owner = this };
            win.Show();
        }

        /// <summary>打开文件并跳转到指定行（文件夹搜索使用）。</summary>
        public async void OpenTabAtLine(string filePath, int line)
        {
            var tab = await OpenTabAsync(filePath);
            if (tab == null) return;
            tab.RestoreLine = Math.Max(0, line - 1);
            tab.RestoreCh = 0;
            PostToWeb(new { type = "gotoLine", line = tab.RestoreLine, ch = 0 });
        }

        private void CloseCurrentTab_Click(object sender, RoutedEventArgs e)
        {
            if (CurrentTab != null) _ = CloseTabAsync(CurrentTab);
        }

        private void Shortcuts_Click(object sender, RoutedEventArgs e)
        {
            MessageBox.Show(
                "Ctrl+N 新建　Ctrl+O 打开　Ctrl+S 保存　Ctrl+W 关闭标签\n" +
                "Ctrl+Tab / Ctrl+Shift+Tab 切换标签　Ctrl+Shift+F 文件夹搜索\n" +
                "Ctrl+F 查找 / 替换　F3 查找下一个　Esc 关闭查找栏\n" +
                "Ctrl+= 放大　Ctrl+- 缩小　Ctrl+0 重置缩放　F11 全屏\n" +
                "Ctrl+P 打印　F5 重新加载　Ctrl+滚轮 缩放",
                "快捷键", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private void OpenLogDir_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                Directory.CreateDirectory(AppPaths.LogDir);
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(AppPaths.LogDir)
                {
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                Logger.Warn("打开日志目录失败：" + ex.Message);
            }
        }

        // ---------- 标签右键菜单 ----------

        private async void TabMenu_Close(object sender, RoutedEventArgs e)
        {
            if ((sender as MenuItem)?.DataContext is TabDoc tab) await CloseTabAsync(tab);
        }

        private async void TabMenu_CloseOthers(object sender, RoutedEventArgs e)
        {
            if ((sender as MenuItem)?.DataContext is not TabDoc tab) return;
            await CloseTabsAsync(_tabs.Where(t => !ReferenceEquals(t, tab)).ToList());
        }

        private async void TabMenu_CloseRight(object sender, RoutedEventArgs e)
        {
            if ((sender as MenuItem)?.DataContext is not TabDoc tab) return;
            var idx = _tabs.IndexOf(tab);
            if (idx < 0) return;
            await CloseTabsAsync(_tabs.Skip(idx + 1).ToList());
        }

        private async Task CloseTabsAsync(IEnumerable<TabDoc> tabs)
        {
            foreach (var tab in tabs.ToList())
            {
                if (!_tabs.Contains(tab)) continue;
                await CloseTabAsync(tab);
            }
        }

        private void TabMenu_CopyPath(object sender, RoutedEventArgs e)
        {
            if ((sender as MenuItem)?.DataContext is not TabDoc tab) return;
            if (string.IsNullOrEmpty(tab.FilePath))
            {
                StatusText.Text = "未命名文档还没有文件路径";
                return;
            }
            try
            {
                Clipboard.SetText(tab.FilePath);
                StatusText.Text = "已复制路径：" + tab.FilePath;
            }
            catch (Exception ex)
            {
                Logger.Warn("复制路径失败：" + ex.Message);
            }
        }

        private void TabMenu_Reveal(object sender, RoutedEventArgs e)
        {
            if ((sender as MenuItem)?.DataContext is not TabDoc tab ||
                string.IsNullOrEmpty(tab.FilePath)) return;
            try
            {
                System.Diagnostics.Process.Start("explorer.exe", $"/select,\"{tab.FilePath}\"");
            }
            catch (Exception ex)
            {
                Logger.Warn("打开资源管理器失败：" + ex.Message);
            }
        }

        private async void TabMenu_Reload(object sender, RoutedEventArgs e)
        {
            if ((sender as MenuItem)?.DataContext is not TabDoc tab) return;
            Tabs.SelectedItem = tab;
            await Task.Yield();
            Reload_Click(sender, new RoutedEventArgs());
        }

        /// <summary>外部进程（第二个实例）请求打开文件。</summary>
        public void OpenFromShell(IEnumerable<string> files) => _ = OpenFromShellAsync(files);

        private async Task OpenFromShellAsync(IEnumerable<string> files)
        {
            var list = files.Where(f => File.Exists(f) && IsTextDocument(f)).ToList();
            foreach (var f in list) await OpenTabAsync(f);
            if (list.Count == 0) return;
            if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
            Activate();
        }

        /// <summary>由另一个实例转发参数时调用（静态入口）。</summary>
        public static void RouteExternalOpen(IEnumerable<string> files)
        {
            var list = files.Where(f => File.Exists(f) && IsTextDocument(f)).ToList();
            if (list.Count == 0) return;
            var win = AllWindows.FirstOrDefault(w => !w._isFloating && w.IsLoaded)
                      ?? AllWindows.FirstOrDefault(w => w.IsLoaded);
            if (win != null)
            {
                win.OpenFromShell(list);
                return;
            }
            // 主窗口尚未 Loaded：先排队，窗口就绪后再打开，避免文件被丢弃
            lock (PendingExternalOpens) PendingExternalOpens.AddRange(list);
        }

        private void OpenFile_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new OpenFileDialog
            {
                Filter = "Markdown 文件 (*.md;*.markdown;*.mdx)|*.md;*.markdown;*.mdx|所有文件 (*.*)|*.*"
            };
            if (dlg.ShowDialog() == true) OpenTab(dlg.FileName);
        }

        private void NewFile_Click(object sender, RoutedEventArgs e) => NewTab();

        private void Exit_Click(object sender, RoutedEventArgs e) => Close();

        private void About_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new AboutWindow(this);
            dlg.ShowDialog();
        }

        // ---- 窗口级快捷键（焦点在 WPF 控件上时生效；编辑器内由 CodeMirror 处理） ----
        private void NewCommand_Executed(object sender, ExecutedRoutedEventArgs e) => NewTab();

        private void SaveCommand_Executed(object sender, ExecutedRoutedEventArgs e)
            => Save_Click(sender, new RoutedEventArgs());

        private void OpenCommand_Executed(object sender, ExecutedRoutedEventArgs e)
            => OpenFile_Click(sender, new RoutedEventArgs());

        private void ReloadCommand_Executed(object sender, ExecutedRoutedEventArgs e)
            => Reload_Click(sender, new RoutedEventArgs());

        /// <summary>用系统默认程序打开 http/https/mailto 链接。</summary>
        private static void OpenExternalUri(string uri)
        {
            try
            {
                if (!Uri.TryCreate(uri, UriKind.Absolute, out var u)) return;
                if (u.Scheme != Uri.UriSchemeHttp && u.Scheme != Uri.UriSchemeHttps &&
                    u.Scheme != Uri.UriSchemeMailto) return;
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(u.AbsoluteUri)
                {
                    UseShellExecute = true
                });
            }
            catch { /* 系统无法打开时静默忽略 */ }
        }

        /// <summary>可以直接交给系统打开的文档/图片类型（不需要二次确认）。</summary>
        private static readonly HashSet<string> SafeOpenExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".md", ".markdown", ".mdx", ".txt", ".text", ".pdf",
            ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico",
            ".html", ".htm", ".json", ".xml", ".csv", ".log", ".yaml", ".yml"
        };

        /// <summary>非文档/可执行文件交给系统打开前，让用户确认。</summary>
        private static bool ConfirmOpenNonDocument(string path)
        {
            var ext = Path.GetExtension(path);
            var r = MessageBox.Show(
                $"该链接指向非文档文件：\n{path}\n\n" +
                $"扩展名：{(string.IsNullOrEmpty(ext) ? "（无）" : ext)}\n\n" +
                "可执行文件/脚本可能带来安全风险，是否继续用系统默认程序打开？",
                "确认打开文件", MessageBoxButton.YesNo, MessageBoxImage.Warning);
            return r == MessageBoxResult.Yes;
        }

        /// <summary>
        /// 处理 WebView 尝试导航的目标：
        /// markdown 文件（例如直接拖放 .md 到预览区）在应用内打开，其它交给系统。
        /// </summary>
        private void OpenNavigatedUri(string uri)
        {
            try
            {
                if (uri.StartsWith("file://", StringComparison.OrdinalIgnoreCase) &&
                    Uri.TryCreate(uri, UriKind.Absolute, out var fu) && File.Exists(fu.LocalPath))
                {
                    var ext = Path.GetExtension(fu.LocalPath).ToLowerInvariant();
                    if (ext is ".md" or ".markdown" or ".mdx")
                    {
                        OpenTab(fu.LocalPath);
                        return;
                    }
                    if (!SafeOpenExtensions.Contains(ext) && !ConfirmOpenNonDocument(fu.LocalPath)) return;
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(fu.LocalPath)
                    {
                        UseShellExecute = true
                    });
                    return;
                }
            }
            catch { /* 忽略无效文件路径 */ }

            OpenExternalUri(uri);
        }

        /// <summary>预览中点击相对路径链接：md 文档打开为新标签，其它文件交给系统默认程序。</summary>
        private void OpenLocalLink(TabDoc tab, string href)
        {
            var clean = href;
            var hash = clean.IndexOf('#');
            if (hash >= 0) clean = clean.Substring(0, hash);
            if (clean.Length == 0) return;
            try { clean = Uri.UnescapeDataString(clean); } catch { /* 保持原样 */ }

            try
            {
                var baseDir = Path.GetDirectoryName(tab.FilePath) ?? AppContext.BaseDirectory;
                var full = Path.GetFullPath(Path.Combine(baseDir, clean.Replace('/', '\\')));
                if (!File.Exists(full))
                {
                    MessageBox.Show($"找不到文件：{full}", "打开链接失败",
                        MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }

                var ext = Path.GetExtension(full).ToLowerInvariant();
                if (ext is ".md" or ".markdown" or ".mdx")
                {
                    OpenTab(full);
                }
                else
                {
                    if (!SafeOpenExtensions.Contains(ext) && !ConfirmOpenNonDocument(full)) return;
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(full)
                    {
                        UseShellExecute = true
                    });
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"打开链接失败：{ex.Message}", "错误",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private async void Reload_Click(object sender, RoutedEventArgs e)
        {
            var tab = CurrentTab;
            if (tab == null) return;
            if (string.IsNullOrEmpty(tab.FilePath))
            {
                StatusText.Text = "未命名文档尚未保存，无法重新加载";
                return;
            }

            await SyncTabFromEditorAsync(tab);
            if (tab.IsDirty)
            {
                var c = MessageBox.Show(
                    "当前文档有未保存的修改，重新加载会丢弃这些修改，是否继续？",
                    "确认重新加载", MessageBoxButton.YesNo, MessageBoxImage.Warning);
                if (c != MessageBoxResult.Yes) return;
            }

            try
            {
                var read = FileReaderHelper.ReadMarkdownFileEx(tab.FilePath);
                tab.MarkdownText = read.Text;
                tab.Encoding = read.Encoding;
                tab.EncodingCodePage = read.CodePage;
                tab.EncodingGuessed = read.Guessed;
                tab.EditText = null;
                tab.IsDirty = false;
                if (_webReady) PushMarkdown(tab, reset: true);
                RefreshWindowTitle();   // IsDirty 变更不会自动刷新窗口标题
                StatusText.Text = "已重新加载：" + tab.FilePath;
            }
            catch (Exception ex)
            {
                MessageBox.Show($"重新加载失败：{ex.Message}", "错误",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private async void Save_Click(object sender, RoutedEventArgs e)
        {
            if (CurrentTab != null) await SaveTabAsync(CurrentTab);
        }

        private async void SaveAs_Click(object sender, RoutedEventArgs e)
        {
            var tab = CurrentTab;
            if (tab != null) await SaveTabAsAsync(tab);
        }

        private void TocToggle_Changed(object sender, RoutedEventArgs e)
        {
            if (TocColumn == null) return;
            if (TocToggle.IsChecked == true)
            {
                TocColumn.Width = _lastTocWidth.Value > 0 ? _lastTocWidth : new GridLength(280);
                if (TocSplitterColumn != null) TocSplitterColumn.Width = new GridLength(5);
                if (TocSplitter != null) TocSplitter.Visibility = Visibility.Visible;
                TocToggle.Content = "隐藏目录";
            }
            else
            {
                if (TocColumn.ActualWidth > 0)
                    _lastTocWidth = new GridLength(TocColumn.ActualWidth);
                TocColumn.Width = new GridLength(0);
                if (TocSplitterColumn != null) TocSplitterColumn.Width = new GridLength(0);
                if (TocSplitter != null) TocSplitter.Visibility = Visibility.Collapsed;
                TocToggle.Content = "显示目录";
            }
        }

        private void Window_DragOver(object sender, DragEventArgs e)
        {
            e.Effects = e.Data.GetDataPresent(DataFormats.FileDrop)
                ? DragDropEffects.Copy : DragDropEffects.None;
            e.Handled = true;
        }

        private static readonly string[] TextExts =
            { ".md", ".markdown", ".mdx", ".mdown", ".mkd", ".txt", ".text" };

        private static bool IsTextDocument(string path) =>
            TextExts.Contains(Path.GetExtension(path).ToLowerInvariant());

        private async void Window_Drop(object sender, DragEventArgs e)
        {
            if (e.Data.GetData(DataFormats.FileDrop) is string[] files && files.Length > 0)
            {
                var ignored = 0;
                // 一次拖入多个文件：按顺序依次打开（后台读取，不阻塞界面）
                foreach (var f in files)
                {
                    if (!File.Exists(f)) continue;
                    if (IsTextDocument(f)) await OpenTabAsync(f);
                    else ignored++;
                }
                if (ignored > 0)
                    StatusText.Text = $"已忽略 {ignored} 个非文本文件（支持 .md/.markdown/.mdx/.txt）";
            }
        }
    }

    /// <summary>一个已打开的 Markdown 文档标签页。</summary>
    public class TabDoc : System.ComponentModel.INotifyPropertyChanged
    {
        public Guid Id { get; } = Guid.NewGuid();
        public string FilePath { get; set; } = "";
        public string MarkdownText { get; set; } = "";

        /// <summary>跨窗口弹出/合并时携带的最新编辑文本（null 表示与磁盘内容一致）。</summary>
        public string? EditText { get; set; }

        /// <summary>文件原始编码，保存时按此编码写回。</summary>
        public MdEncoding Encoding { get; set; } = MdEncoding.Utf8NoBom;

        /// <summary>Encoding == Other 时的实际代码页。</summary>
        public int EncodingCodePage { get; set; }

        /// <summary>编码是否为自动推测（保存前需要用户确认，自动保存会跳过）。</summary>
        public bool EncodingGuessed { get; set; }

        private bool _isDirty;
        /// <summary>是否有未保存的修改（标题前显示 ●）。</summary>
        public bool IsDirty
        {
            get => _isDirty;
            set
            {
                if (_isDirty != value)
                {
                    _isDirty = value;
                    RaisePropertyChanged(nameof(IsDirty));
                    RaisePropertyChanged(nameof(Title));
                }
            }
        }

        /// <summary>未命名文档的显示名称（保存后改用文件名）。</summary>
        public string DisplayName { get; set; } = "未命名.md";

        /// <summary>不含未保存圆点的显示名（未命名文档使用 DisplayName）。</summary>
        public string BaseTitle => string.IsNullOrEmpty(FilePath)
            ? DisplayName
            : Path.GetFileName(FilePath);

        public string Title => (IsDirty ? "● " : "") + BaseTitle;

        /// <summary>文件路径变更（如另存为）后刷新标签标题。</summary>
        public void RefreshTitle() => RaisePropertyChanged(nameof(Title));

        /// <summary>跨窗口弹出/合并时保留的正文滚动位置。</summary>
        public double ScrollY { get; set; }

        /// <summary>会话恢复用：光标行/列与编辑器滚动位置。</summary>
        public int RestoreLine { get; set; } = -1;
        public int RestoreCh { get; set; }
        public double? RestoreEditorScroll { get; set; }

        public List<TocItem> TocRoots { get; } = new();

        // 标签颜色
        public int ColorIndex { get; set; }
        public Brush TabBrush { get; set; } = Brushes.Gray;
        public Brush TabBrushLight { get; set; } = Brushes.LightGray;
        public Brush TabFgBrush { get; set; } = Brushes.White;

        public event System.ComponentModel.PropertyChangedEventHandler? PropertyChanged;
        private void RaisePropertyChanged(string name)
            => PropertyChanged?.Invoke(this, new System.ComponentModel.PropertyChangedEventArgs(name));
    }

    /// <summary>主题调色板。</summary>
    public class ThemePalette
    {
        public Color MainBg { get; set; }
        public Color TocPanelBg { get; set; }
        public Color TocText { get; set; }
        public Color TocSelected { get; set; }
        public Color Splitter { get; set; }
        public Color Border { get; set; }
        public Color Status { get; set; }
        public string WebTheme { get; set; } = "light";
    }

    /// <summary>目录节点（树）。</summary>
    public class TocItem : System.ComponentModel.INotifyPropertyChanged
    {
        public string Text { get; set; } = "";
        public string Id { get; set; } = "";
        public int Level { get; set; }
        public TocItem? Parent { get; set; }
        public List<TocItem> Children { get; } = new();
        public bool HasChildren => Children.Count > 0;

        private bool _isExpanded = true;
        public bool IsExpanded
        {
            get => _isExpanded;
            set
            {
                if (_isExpanded != value)
                {
                    _isExpanded = value;
                    RaisePropertyChanged(nameof(IsExpanded));
                    RaisePropertyChanged(nameof(Glyph));
                }
            }
        }

        private Visibility _visibility = Visibility.Visible;
        public Visibility Visibility
        {
            get => _visibility;
            set { if (_visibility != value) { _visibility = value; RaisePropertyChanged(nameof(Visibility)); } }
        }

        /// <summary>折叠三角：▸ 折叠 / ▾ 展开，无子节点留空。</summary>
        public string Glyph => !HasChildren ? "" : IsExpanded ? "▾" : "▸";

        /// <summary>标题文本相对三角的层级缩进。</summary>
        public Thickness TextIndent
        {
            get
            {
                var left = Level switch
                {
                    1 => 4,
                    2 => 14,
                    3 => 26,
                    4 => 38,
                    5 => 50,
                    _ => 62
                };
                return new Thickness(left, 2, 8, 2);
            }
        }

        public event System.ComponentModel.PropertyChangedEventHandler? PropertyChanged;
        private void RaisePropertyChanged(string name)
            => PropertyChanged?.Invoke(this, new System.ComponentModel.PropertyChangedEventArgs(name));
    }
}
