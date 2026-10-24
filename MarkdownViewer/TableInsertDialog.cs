using System.Linq;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace MarkdownViewer
{
    /// <summary>插入表格对话框：输入行数（含表头）与列数，生成 Markdown 表格。</summary>
    public class TableInsertDialog : Window
    {
        private readonly TextBox _rows;
        private readonly TextBox _cols;

        public int Rows { get; private set; } = 3;
        public int Columns { get; private set; } = 3;

        public TableInsertDialog(Window owner)
        {
            Owner = owner;
            Title = "插入表格";
            Width = 340;
            SizeToContent = SizeToContent.Height;
            ResizeMode = ResizeMode.NoResize;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            ShowInTaskbar = false;
            Background = owner.TryFindResource("MainBgBrush") as Brush ?? SystemColors.WindowBrush;
            Foreground = owner.TryFindResource("TocTextBrush") as Brush ?? SystemColors.WindowTextBrush;

            _rows = CreateNumberBox("3");
            _cols = CreateNumberBox("3");

            var panel = new StackPanel { Margin = new Thickness(18, 16, 18, 14) };
            panel.Children.Add(new TextBlock
            {
                Text = "设置表格尺寸",
                FontSize = 15,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 12)
            });

            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            grid.RowDefinitions.Add(new RowDefinition());
            grid.RowDefinitions.Add(new RowDefinition());

            AddField(grid, 0, "行数（含表头）", _rows);
            AddField(grid, 1, "列数", _cols);
            panel.Children.Add(grid);

            panel.Children.Add(new TextBlock
            {
                Text = "范围：行数 2–100，列数 1–20；第一行作为表头。",
                Foreground = owner.TryFindResource("StatusTextBrush") as Brush ?? SystemColors.GrayTextBrush,
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
            ok.Click += (_, _) => Commit();
            buttons.Children.Add(cancel);
            buttons.Children.Add(ok);
            panel.Children.Add(buttons);

            Content = panel;
            Loaded += (_, _) => { _rows.Focus(); _rows.SelectAll(); };
        }

        private TextBox CreateNumberBox(string text)
        {
            var box = new TextBox
            {
                Text = text,
                Width = 76,
                MaxLength = 3,
                VerticalContentAlignment = VerticalAlignment.Center,
                Padding = new Thickness(4, 2, 4, 2),
                Margin = new Thickness(0, 3, 0, 3),
                HorizontalAlignment = HorizontalAlignment.Right,
                Background = Owner?.TryFindResource("TocPanelBgBrush") as Brush ?? SystemColors.WindowBrush,
                Foreground = Foreground,
                BorderBrush = Owner?.TryFindResource("BorderBrush2") as Brush ?? SystemColors.ControlDarkBrush
            };
            box.PreviewTextInput += (_, e) => e.Handled = !e.Text.All(char.IsDigit);
            DataObject.AddPastingHandler(box, (_, e) =>
            {
                if (e.DataObject.GetData(DataFormats.Text) is string text && text.Any(c => !char.IsDigit(c)))
                    e.CancelCommand();
            });
            return box;
        }

        private static void AddField(Grid grid, int row, string label, TextBox box)
        {
            var text = new TextBlock
            {
                Text = label,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 12, 0)
            };
            Grid.SetRow(text, row);
            Grid.SetColumn(text, 0);
            Grid.SetRow(box, row);
            Grid.SetColumn(box, 1);
            grid.Children.Add(text);
            grid.Children.Add(box);
        }

        private void Commit()
        {
            if (!int.TryParse(_rows.Text, out var rows) || rows < 2 || rows > 100)
            {
                MessageBox.Show(this, "行数请输入 2–100 之间的整数（第一行为表头）。",
                    "表格尺寸", MessageBoxButton.OK, MessageBoxImage.Warning);
                _rows.Focus();
                _rows.SelectAll();
                return;
            }
            if (!int.TryParse(_cols.Text, out var cols) || cols < 1 || cols > 20)
            {
                MessageBox.Show(this, "列数请输入 1–20 之间的整数。",
                    "表格尺寸", MessageBoxButton.OK, MessageBoxImage.Warning);
                _cols.Focus();
                _cols.SelectAll();
                return;
            }
            Rows = rows;
            Columns = cols;
            DialogResult = true;
        }

        /// <summary>生成可插入编辑器的 Markdown 表格。</summary>
        public string BuildMarkdown()
        {
            var sb = new StringBuilder();
            sb.Append('|');
            for (var c = 1; c <= Columns; c++) sb.Append(" 列 ").Append(c).Append(" |");
            sb.AppendLine();
            sb.Append('|');
            for (var c = 0; c < Columns; c++) sb.Append(" --- |");

            for (var r = 1; r < Rows; r++)
            {
                sb.AppendLine();
                sb.Append('|');
                for (var c = 0; c < Columns; c++) sb.Append("  |");
            }
            sb.AppendLine();
            return sb.ToString();
        }
    }
}
