using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows;
using System.Windows.Media;

namespace MarkdownViewer
{
    /// <summary>「关于 MarkdownViewer」对话框：版本、发布时间、作者与开源协议。</summary>
    public partial class AboutWindow : Window
    {
        public const string ReleaseDate = "2026-10-24";
        public const string Author = "tobegmup";
        public const string LicenseName = "GNU General Public License v3.0";

        public AboutWindow(Window owner)
        {
            InitializeComponent();
            Owner = owner;

            // 跟随主窗口当前主题
            if (owner.Resources["MainBgBrush"] is Brush bg) Background = bg;
            if (owner.Resources["TocTextBrush"] is Brush fg) Foreground = fg;
            if (owner.Resources["BorderBrush2"] is Brush border) SeparatorLine.Background = border;

            var version = Assembly.GetExecutingAssembly().GetName().Version;
            VersionText.Text = version != null
                ? $"{version.Major}.{version.Minor}.{version.Build}"
                : "1.2.1";
            ReleaseText.Text = ReleaseDate;
            AuthorText.Text = Author;
            LicenseText.Text = LicenseName;
        }

        private void License_Click(object sender, RoutedEventArgs e)
        {
            var path = Path.Combine(AppContext.BaseDirectory, "LICENSE");
            try
            {
                if (File.Exists(path))
                {
                    Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
                }
                else
                {
                    MessageBox.Show(this,
                        "本项目基于 GNU General Public License v3.0 发布。\n\n" +
                        "完整协议文本请参见项目仓库中的 LICENSE 文件。",
                        "开源协议", MessageBoxButton.OK, MessageBoxImage.Information);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "无法打开 LICENSE 文件：" + ex.Message,
                    "错误", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void Close_Click(object sender, RoutedEventArgs e) => Close();
    }
}
