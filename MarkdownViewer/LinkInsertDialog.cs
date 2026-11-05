using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace MarkdownViewer
{
    /// <summary>插入链接对话框：输入显示文字与 URL，生成 Markdown 链接。</summary>
    public class LinkInsertDialog : Window
    {
        private readonly TextBox _text;
        private readonly TextBox _url;

        public string LinkText { get; private set; } = "";
        public string LinkUrl { get; private set; } = "";

        public LinkInsertDialog(Window owner)
        {
            Owner = owner;
            Title = "插入链接";
            Width = 430;
            SizeToContent = SizeToContent.Height;
            ResizeMode = ResizeMode.NoResize;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            ShowInTaskbar = false;
            Background = owner.TryFindResource("MainBgBrush") as Brush ?? SystemColors.WindowBrush;
            Foreground = owner.TryFindResource("TocTextBrush") as Brush ?? SystemColors.WindowTextBrush;

            var hintBrush = owner.TryFindResource("StatusTextBrush") as Brush ?? SystemColors.GrayTextBrush;

            _text = new TextBox
            {
                Padding = new Thickness(6, 4, 6, 4),
                Text = "链接文字",
                Margin = new Thickness(0, 0, 0, 10)
            };
            _url = new TextBox
            {
                Padding = new Thickness(6, 4, 6, 4),
                Text = "https://"
            };

            var panel = new StackPanel { Margin = new Thickness(18, 16, 18, 14) };
            panel.Children.Add(new TextBlock
            {
                Text = "插入链接",
                FontSize = 15,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 12)
            });
            panel.Children.Add(new TextBlock { Text = "显示文字", Margin = new Thickness(0, 0, 0, 4) });
            panel.Children.Add(_text);
            panel.Children.Add(new TextBlock { Text = "链接地址（URL）", Margin = new Thickness(0, 0, 0, 4) });
            panel.Children.Add(_url);
            panel.Children.Add(new TextBlock
            {
                Text = "留空显示文字时，将直接显示 URL。",
                Foreground = hintBrush,
                FontSize = 11,
                Margin = new Thickness(0, 8, 0, 0)
            });

            var buttons = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, 16, 0, 0)
            };
            var cancel = new Button
            {
                Content = "取消",
                Padding = new Thickness(16, 4, 16, 4),
                Margin = new Thickness(0, 0, 8, 0),
                IsCancel = true
            };
            var ok = new Button
            {
                Content = "插入",
                Padding = new Thickness(16, 4, 16, 4),
                IsDefault = true
            };
            ok.Click += (_, _) =>
            {
                var url = _url.Text.Trim();
                if (string.IsNullOrWhiteSpace(url))
                {
                    MessageBox.Show(this, "请输入链接地址。", "插入链接",
                        MessageBoxButton.OK, MessageBoxImage.Information);
                    return;
                }
                LinkText = string.IsNullOrWhiteSpace(_text.Text) ? url : _text.Text.Trim();
                LinkUrl = url;
                DialogResult = true;
            };
            buttons.Children.Add(cancel);
            buttons.Children.Add(ok);
            panel.Children.Add(buttons);
            Content = panel;

            Loaded += (_, _) =>
            {
                _text.Focus();
                _text.SelectAll();
            };
        }
    }
}
