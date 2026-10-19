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
        private readonly TextBlock _rootLabel = new();
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

            _query.Width = double.NaN;
            _query.Padding = new Thickness(6, 3, 6, 3);
            _query.VerticalContentAlignment = VerticalAlignment.Center;
            Grid.SetColumn(_query, 1);
            Grid.SetColumn(_searchButton, 2);
            _searchButton.Margin = new Thickness(8, 0, 0, 0);

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

            _searchButton.Click += (_, _) => StartSearch();
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

            List<SearchHit> hits;
            try
            {
                hits = await Task.Run(() => Search(term, version));
            }
            catch (Exception ex)
            {
                Logger.Error("文件夹搜索失败", ex);
                _status.Text = "搜索失败：" + ex.Message;
                return;
            }

            if (version != _searchVersion) return; // 已有更新的搜索

            foreach (var hit in hits)
            {
                _results.Items.Add(hit);
            }
            _status.Text = hits.Count == 0
                ? "未找到匹配内容。"
                : $"找到 {hits.Count} 处匹配，双击结果可跳转到对应行。";
        }

        private List<SearchHit> Search(string term, int version)
        {
            var hits = new List<SearchHit>();
            const int maxHits = 400;

            foreach (var file in EnumerateFiles(_root))
            {
                if (version != _searchVersion || hits.Count >= maxHits) break;
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
                        var idx = lines[i].IndexOf(term, StringComparison.OrdinalIgnoreCase);
                        if (idx < 0) continue;
                        var preview = lines[i].Trim();
                        if (preview.Length > 120) preview = preview.Substring(0, 120) + "…";
                        hits.Add(new SearchHit(file, i + 1, preview));
                        if (hits.Count >= maxHits) break;
                    }
                }
                catch
                {
                    // 单个文件读取失败（编码/权限）直接跳过
                }
            }
            return hits;
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
                    stack.Push(sub);
                }
            }
        }
    }
}
