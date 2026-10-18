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
        private string _themeMode = "light";  // light / green / dark
        private string _viewMode = "preview"; // preview / split / edit
        private bool _reallyClosing;          // 关闭检查通过后真正关闭窗口

        private readonly ObservableCollection<TabDoc> _tabs = new();
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
                _ = ConfirmCloseAndCloseAsync();
                return;
            }
            AllWindows.Remove(this);
            _dragTimer?.Stop();
        }

        /// <summary>关闭整个窗口前，对所有未保存标签逐一确认。</summary>
        private async Task ConfirmCloseAndCloseAsync()
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
                }
            }
            _reallyClosing = true;
            Close();
        }

        private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            // 主题（独立窗口继承源窗口主题）
            ThemeBox.SelectedIndex = _themeMode switch
            {
                "green" => 1,
                "dark" => 2,
                _ => 0
            };
            ApplyWpfTheme();
            SyncViewButtons();

            try
            {
                var env = await CoreWebView2Environment.CreateAsync(null);
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
                ApplyWebTheme();
                ApplyWebView();
                if (CurrentTab != null) PushMarkdown(CurrentTab);
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
                // 命令行参数：MarkdownViewer.exe  a.md b.md
                var args = Environment.GetCommandLineArgs();
                for (int i = 1; i < args.Length; i++)
                {
                    if (File.Exists(args[i])) OpenTab(args[i]);
                }
            }
        }

        /// <summary>按色板创建带颜色的标签文档。</summary>
        private static TabDoc CreateTabDoc(string filePath, string text, MdEncoding encoding)
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

        /// <summary>打开一个 Markdown 文件为标签页；已打开则切换到现有标签。</summary>
        public void OpenTab(string filePath)
        {
            try
            {
                var full = Path.GetFullPath(filePath);
                var existing = _tabs.FirstOrDefault(t =>
                    string.Equals(t.FilePath, full, StringComparison.OrdinalIgnoreCase));
                if (existing != null)
                {
                    Tabs.SelectedItem = existing;
                    return;
                }

                var read = FileReaderHelper.ReadMarkdownFileEx(full);
                var tab = CreateTabDoc(full, read.Text, read.Encoding);
                _tabs.Add(tab);
                Tabs.SelectedItem = tab;
            }
            catch (Exception ex)
            {
                MessageBox.Show($"打开文件失败：{ex.Message}", "错误",
                    MessageBoxButton.OK, MessageBoxImage.Error);
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
            StatusText.Text = string.IsNullOrEmpty(tab.FilePath)
                ? tab.BaseTitle + "（尚未保存）"
                : tab.FilePath;

            // 立即显示该标签缓存的目录（首次打开时为空，待前端渲染后回传）
            if (_tocOwnerId != tab.Id) ShowCachedToc(tab);

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
            }
            catch { /* 前端尚未就绪时忽略 */ }
        }

        /// <summary>保存标签到磁盘（按原编码写回）。未命名文档会先弹出另存为。返回是否成功。</summary>
        private async Task<bool> SaveTabAsync(TabDoc tab)
        {
            if (string.IsNullOrEmpty(tab.FilePath))
                return await SaveTabAsAsync(tab);

            await SyncTabFromEditorAsync(tab);
            try
            {
                var text = tab.EditText ?? tab.MarkdownText;
                FileReaderHelper.WriteMarkdownFile(tab.FilePath, text, tab.Encoding);
                tab.MarkdownText = text;
                tab.EditText = null;
                tab.IsDirty = false;
                WebView.CoreWebView2?.PostWebMessageAsJson(
                    JsonSerializer.Serialize(new { type = "saved", tabId = tab.Id.ToString() }));
                StatusText.Text = "已保存：" + tab.FilePath;
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

            await SyncTabFromEditorAsync(tab);
            try
            {
                var newPath = Path.GetFullPath(dlg.FileName);
                var text = tab.EditText ?? tab.MarkdownText;
                FileReaderHelper.WriteMarkdownFile(newPath, text, tab.Encoding);
                tab.FilePath = newPath;
                tab.MarkdownText = text;
                tab.EditText = null;
                tab.IsDirty = false;
                tab.RefreshTitle();

                // 新文件所在目录映射为图片虚拟主机，保证相对路径图片继续可用
                var newDir = Path.GetDirectoryName(newPath);
                if (WebView.CoreWebView2 != null && !string.IsNullOrEmpty(newDir))
                {
                    WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                        "mdfile.local", newDir, CoreWebView2HostResourceAccessKind.Allow);
                }

                RefreshWindowTitle();
                WebView.CoreWebView2?.PostWebMessageAsJson(
                    JsonSerializer.Serialize(new { type = "saved", tabId = tab.Id.ToString() }));
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
            var ctrl = (Keyboard.Modifiers & ModifierKeys.Control) == ModifierKeys.Control;
            if (!ctrl) return;

            if (e.Key == Key.Tab)
            {
                SwitchTab((Keyboard.Modifiers & ModifierKeys.Shift) == ModifierKeys.Shift ? -1 : 1);
                e.Handled = true;
            }
            else if (e.Key == Key.W)
            {
                if (CurrentTab != null) _ = CloseTabAsync(CurrentTab);
                e.Handled = true;
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
                editText = tab.EditText,
                title = tab.Title,
                dirty = tab.IsDirty,
                reset = reset,
                initialScroll = tab.ScrollY
            });
            WebView.CoreWebView2.PostWebMessageAsJson(payload);
        }

        /// <summary>接收前端 JS 消息：目录数据 / 当前滚动位置对应的标题。</summary>
        private void CoreWebView2_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                ReceiveWebMessage(e.WebMessageAsJson);
            }
            catch
            {
                // 非法/不完整的消息直接忽略，避免前端异常拖垮宿主
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
        private void ThemeBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (!IsLoaded) return;
            _themeMode = ThemeBox.SelectedIndex switch
            {
                1 => "green",
                2 => "dark",
                _ => "light"
            };
            ApplyWpfTheme();
            ApplyWebTheme();
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

            // 主题下拉框弹出层使用系统键绘制，需要逐主题覆盖（否则暗黑模式下黑底黑字）
            ThemeBox.Resources[SystemColors.WindowBrushKey] = new SolidColorBrush(p.TocPanelBg);
            ThemeBox.Resources[SystemColors.WindowTextBrushKey] = new SolidColorBrush(p.TocText);
            ThemeBox.Resources[SystemColors.ControlTextBrushKey] = new SolidColorBrush(p.TocText);
            ThemeBox.Resources[SystemColors.HighlightBrushKey] = new SolidColorBrush(p.TocSelected);
            ThemeBox.Resources[SystemColors.HighlightTextBrushKey] = new SolidColorBrush(p.TocText);

            // 菜单弹出层同样依赖系统颜色，暗黑模式下需要覆盖
            if (MainMenu != null)
            {
                MainMenu.Resources[SystemColors.MenuBrushKey] = new SolidColorBrush(p.TocPanelBg);
                MainMenu.Resources[SystemColors.MenuTextBrushKey] = new SolidColorBrush(p.TocText);
                MainMenu.Resources[SystemColors.WindowBrushKey] = new SolidColorBrush(p.TocPanelBg);
                MainMenu.Resources[SystemColors.WindowTextBrushKey] = new SolidColorBrush(p.TocText);
                MainMenu.Resources[SystemColors.ControlTextBrushKey] = new SolidColorBrush(p.TocText);
                MainMenu.Resources[SystemColors.HighlightBrushKey] = new SolidColorBrush(p.TocSelected);
                MainMenu.Resources[SystemColors.HighlightTextBrushKey] = new SolidColorBrush(p.TocText);
            }
        }

        private void ApplyWebTheme()
        {
            if (!_webReady) return;
            var webTheme = Themes[_themeMode].WebTheme;
            WebView.CoreWebView2.PostWebMessageAsJson(
                JsonSerializer.Serialize(new { type = "theme", mode = webTheme }));
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
                tab.EditText = null;
                tab.IsDirty = false;
                if (_webReady) PushMarkdown(tab, reset: true);
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

        private void Window_Drop(object sender, DragEventArgs e)
        {
            if (e.Data.GetData(DataFormats.FileDrop) is string[] files && files.Length > 0)
            {
                // 一次拖入多个文件：全部作为标签打开
                foreach (var f in files)
                {
                    if (File.Exists(f)) OpenTab(f);
                }
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
