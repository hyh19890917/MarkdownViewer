using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using MarkdownViewer.Helpers;

namespace MarkdownViewer
{
    /// <summary>
    /// 文件夹内全文搜索（Markdown/文本文件），双击结果打开并跳转到对应行。
    /// </summary>
    public class SearchWindow : Window
    {
        private sealed record SearchHit(string Path, int Line, string Preview)
        {
            public override string ToString() => $"第 {Line} 行  {Preview}";
        }

        private static readonly string[] SearchExts =
            { ".md", ".markdown", ".mdx", ".mdown", ".mkd", ".txt", ".text" };

        private static readonly HashSet<string> SkipDirs = new(StringComparer.OrdinalIgnoreCase)
        {
            "bin", "obj", ".git", ".vs", "node_modules", "packages", "userdata"
        };

        private readonly MainWindow _owner;
        private readonly TextBox _query = new();
        private readonly ListBox _results = new();
        private readonly TextBlock _status = new();
        private readonly Button _searchButton = new() { Content = "搜索", Padding = new Thickness(14, 2, 14, 2) };
        private readonly Button _cancelButton = new() { Content = "停止", Padding = new Thickness(14, 2, 14, 2), IsEnabled = false };
        private readonly TextBlock _rootLabel = new();
        private const int MaxHits = 400;
        private readonly string _root;
        private int _searchVersion;

        public SearchWindow(MainWindow owner, string? startDir)
        {
            _owner = owner;
            _root = string.IsNullOrEmpty(startDir) || !Directory.Exists(startDir)
                ? Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments)
                : startDir;

            Title = "在文件夹中搜索";
            Width = 720;
            Height = 520;
            MinWidth = 520;
            MinHeight = 320;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            Background = new SolidColorBrush(Color.FromRgb(0xF3, 0xF3, 0xF3));

            var panel = new DockPanel { Margin = new Thickness(12) };

            var top = new Grid { Margin = new Thickness(0, 0, 0, 8) };
            top.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            top.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            top.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            top.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            _query.Width = double.NaN;
            _query.Padding = new Thickness(6, 3, 6, 3);
            _query.VerticalContentAlignment = VerticalAlignment.Center;
            Grid.SetColumn(_query, 1);
            Grid.SetColumn(_searchButton, 2);
            _searchButton.Margin = new Thickness(8, 0, 0, 0);
            Grid.SetColumn(_cancelButton, 3);
            _cancelButton.Margin = new Thickness(6, 0, 0, 0);

            var label = new TextBlock
            {
                Text = "关键字：",
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 6, 0)
            };
            Grid.SetColumn(label, 0);

            top.Children.Add(label);
            top.Children.Add(_query);
            top.Children.Add(_searchButton);
            top.Children.Add(_cancelButton);
            DockPanel.SetDock(top, Dock.Top);
            panel.Children.Add(top);

            _rootLabel.Text = "搜索范围：" + _root;
            _rootLabel.Foreground = new SolidColorBrush(Color.FromRgb(0x57, 0x60, 0x6A));
            _rootLabel.Margin = new Thickness(0, 0, 0, 6);
            _rootLabel.TextTrimming = TextTrimming.CharacterEllipsis;
            DockPanel.SetDock(_rootLabel, Dock.Top);
            panel.Children.Add(_rootLabel);

            _status.Text = "输入关键字后回车开始搜索（递归搜索 Markdown / 文本文件）。";
            _status.Foreground = new SolidColorBrush(Color.FromRgb(0x57, 0x60, 0x6A));
            _status.Margin = new Thickness(0, 6, 0, 0);
            DockPanel.SetDock(_status, Dock.Bottom);
            panel.Children.Add(_status);

            _results.BorderThickness = new Thickness(1);
            _results.BorderBrush = new SolidColorBrush(Color.FromRgb(0xD0, 0xD7, 0xDE));
            _results.HorizontalContentAlignment = HorizontalAlignment.Left;
            panel.Children.Add(_results);

            Content = panel;

            ApplyThemeFromOwner();

            _searchButton.Click += (_, _) => StartSearch();
            _cancelButton.Click += (_, _) => StopSearch();
            _query.KeyDown += (_, e) =>
            {
                if (e.Key == Key.Enter) StartSearch();
                else if (e.Key == Key.Escape) Close();
            };
            _results.MouseDoubleClick += (_, _) => OpenSelected();
            _results.KeyDown += (_, e) =>
            {
                if (e.Key == Key.Enter) OpenSelected();
            };

            Loaded += (_, _) => _query.Focus();
        }

        /// <summary>跟随主窗口当前主题，暗色下不再出现浅底输入框/列表。</summary>
        private void ApplyThemeFromOwner()
        {
            if (_owner.TryFindResource("MainBgBrush") is Brush main) Background = main;

            var panelBg = _owner.TryFindResource("TocPanelBgBrush") as Brush;
            var fg = _owner.TryFindResource("TocTextBrush") as Brush;
            var muted = _owner.TryFindResource("StatusTextBrush") as Brush ?? fg;
            var border = _owner.TryFindResource("BorderBrush2") as Brush;

            if (fg != null) Foreground = fg;
            if (panelBg != null)
            {
                _query.Background = panelBg;
                _query.Foreground = fg;
                _query.CaretBrush = fg;
                _results.Background = panelBg;
                _searchButton.Background = panelBg;
                _cancelButton.Background = panelBg;
            }
            if (fg != null)
            {
                _results.Foreground = fg;
                _searchButton.Foreground = fg;
                _cancelButton.Foreground = fg;
            }
            if (muted != null)
            {
                _rootLabel.Foreground = muted;
                _status.Foreground = muted;
            }
            if (border != null) _results.BorderBrush = border;
        }

        private void StopSearch()
        {
            _searchVersion++;
            _status.Text = "搜索已停止。";
            _searchButton.IsEnabled = true;
            _cancelButton.IsEnabled = false;
        }

        private void OpenSelected()
        {
            if (_results.SelectedItem is not SearchHit hit) return;
            _owner.OpenTabAtLine(hit.Path, hit.Line);
        }

        private async void StartSearch()
        {
            var term = _query.Text?.Trim();
            if (string.IsNullOrEmpty(term)) return;

            var version = ++_searchVersion;
            _results.Items.Clear();
            _status.Text = "正在搜索…";
            _searchButton.IsEnabled = false;
            _cancelButton.IsEnabled = true;

            List<SearchHit> hits;
            bool truncated;
            try
            {
                (hits, truncated) = await Task.Run(() => Search(term, version));
            }
            catch (Exception ex)
            {
                Logger.Error("文件夹搜索失败", ex);
                if (version == _searchVersion)
                {
                    _status.Text = "搜索失败：" + ex.Message;
                    _searchButton.IsEnabled = true;
                    _cancelButton.IsEnabled = false;
                }
                return;
            }

            if (version != _searchVersion) return; // 已有更新的搜索/已停止

            foreach (var hit in hits)
            {
                _results.Items.Add(hit);
            }
            _status.Text = hits.Count == 0
                ? "未找到匹配内容。"
                : truncated
                    ? $"匹配结果超过 {MaxHits} 条，已截断显示（请使用更精确的关键字）。"
                    : $"找到 {hits.Count} 处匹配，双击结果可跳转到对应行。";
            _searchButton.IsEnabled = true;
            _cancelButton.IsEnabled = false;
        }

        private (List<SearchHit> Hits, bool Truncated) Search(string term, int version)
        {
            var hits = new List<SearchHit>();
            var truncated = false;

            foreach (var file in EnumerateFiles(_root))
            {
                if (version != _searchVersion) return (hits, false);
                if (hits.Count >= MaxHits)
                {
                    truncated = true;
                    break;
                }
                try
                {
                    var info = new FileInfo(file);
                    if (info.Length > 8 * 1024 * 1024) continue; // 跳过超大文件

                    // 复用编码探测（UTF-8 / UTF-16 / GB18030）
                    var text = FileReaderHelper.ReadMarkdownFileEx(file).Text
                        .Replace("\r\n", "\n").Replace('\r', '\n');
                    var lines = text.Split('\n');
                    for (var i = 0; i < lines.Length; i++)
                    {
                        if ((i & 2047) == 0 && version != _searchVersion) return (hits, false);
                        var idx = lines[i].IndexOf(term, StringComparison.OrdinalIgnoreCase);
                        if (idx < 0) continue;
                        var preview = lines[i].Trim();
                        if (preview.Length > 120) preview = preview.Substring(0, 120) + "…";
                        hits.Add(new SearchHit(file, i + 1, preview));
                        if (hits.Count >= MaxHits)
                        {
                            truncated = true;
                            break;
                        }
                    }
                }
                catch
                {
                    // 单个文件读取失败（编码/权限）直接跳过
                }
            }
            return (hits, truncated);
        }

        private IEnumerable<string> EnumerateFiles(string dir)
        {
            var stack = new Stack<string>();
            stack.Push(dir);
            while (stack.Count > 0)
            {
                var current = stack.Pop();
                string[] subDirs;
                string[] files;
                try
                {
                    subDirs = Directory.GetDirectories(current);
                    files = Directory.GetFiles(current);
                }
                catch
                {
                    continue;
                }

                foreach (var file in files)
                {
                    if (SearchExts.Contains(Path.GetExtension(file).ToLowerInvariant()))
                        yield return file;
                }
                foreach (var sub in subDirs)
                {
                    if (SkipDirs.Contains(Path.GetFileName(sub))) continue;
                    // 跳过符号链接/联接点，避免递归绕圈或跨盘扫描
                    try
                    {
                        var di = new DirectoryInfo(sub);
                        if ((di.Attributes & FileAttributes.ReparsePoint) != 0) continue;
                    }
                    catch
                    {
                        continue;
                    }
                    stack.Push(sub);
                }
            }
        }
    }
}
