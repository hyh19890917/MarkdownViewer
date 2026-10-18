using System.Diagnostics;
using System.IO.Compression;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace MarkdownViewerInstaller;

internal static class Program
{
    public const string AppName = "MarkdownViewer";
    public const string AppVersion = "1.0.0";
    public const string Publisher = "tobegmup";
    public static readonly string ExeName = $"{AppName}.exe";
    public const string UninstallExeName = "Uninstall.exe";

    /// <summary>默认安装目录（当前用户，无需管理员权限）。</summary>
    public static string DefaultInstallDir =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Programs", AppName);

    private const string UninstallKey =
        @"Software\Microsoft\Windows\CurrentVersion\Uninstall\MarkdownViewer";
    private const string ProgId = "MarkdownViewer.MD";
    private static readonly string[] MarkdownExts = { ".md", ".markdown", ".mdx" };

    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        bool uninstall = args.Contains("/uninstall", StringComparer.OrdinalIgnoreCase);
        bool silent = args.Contains("/silent", StringComparer.OrdinalIgnoreCase);
        bool fromTemp = args.Contains("/fromtemp", StringComparer.OrdinalIgnoreCase);

        // 兼容 Inno Setup 风格：/DIR="D:\xxx"
        string? dirArg = null;
        var dirArgRaw = args.FirstOrDefault(a =>
            a.StartsWith("/DIR=", StringComparison.OrdinalIgnoreCase));
        if (dirArgRaw != null)
        {
            dirArg = dirArgRaw.Substring(5).Trim('"').Trim();
            if (string.IsNullOrWhiteSpace(dirArg)) dirArg = null;
        }

        if (uninstall)
        {
            // 卸载器位于安装目录，删除自身前需要先复制到临时目录运行
            if (!fromTemp)
            {
                var tmp = Path.Combine(Path.GetTempPath(), $"MVUninstall_{Guid.NewGuid():N}.exe");
                File.Copy(Application.ExecutablePath, tmp, true);
                Process.Start(new ProcessStartInfo(tmp, "/uninstall /fromtemp /silent")
                {
                    UseShellExecute = false
                });
                return;
            }

            if (silent)
            {
                UninstallCore(null);
                ScheduleSelfDelete();
                return;
            }
            Application.Run(new ProgressForm(false));
            ScheduleSelfDelete();
        }
        else
        {
            if (silent)
            {
                InstallCore(new InstallOptions
                {
                    StartMenu = true,
                    Desktop = true,
                    Associate = true
                }, null, dirArg ?? DefaultInstallDir);
                return;
            }
            Application.Run(new InstallForm(dirArg ?? DefaultInstallDir));
        }
    }

    /* ============================ 安装 ============================ */

    public class InstallOptions
    {
        public bool StartMenu;
        public bool Desktop;
        public bool Associate;
    }

    public static void InstallCore(InstallOptions opt, Action<string>? log, string installDir)
    {
        installDir = Path.GetFullPath(installDir);
        var exePath = Path.Combine(installDir, ExeName);
        var uninstallPath = Path.Combine(installDir, UninstallExeName);

        log?.Invoke("正在关闭正在运行的 MarkdownViewer...");
        KillApp();

        // 覆盖安装时，如果旧版本装在别的目录，先清理旧目录
        var oldDir = GetRegisteredInstallDir();
        if (!string.IsNullOrEmpty(oldDir) &&
            !string.Equals(Path.GetFullPath(oldDir), installDir, StringComparison.OrdinalIgnoreCase))
        {
            log?.Invoke("检测到旧版本，正在清理旧目录...");
            TryDelete(oldDir);
        }

        log?.Invoke("正在解压程序文件...");
        if (Directory.Exists(installDir))
        {
            TryDelete(installDir);
        }
        try
        {
            Directory.CreateDirectory(installDir);
            // 探测写权限（例如选了 Program Files 但未提权时给出明确提示）
            var probe = Path.Combine(installDir, ".write-test");
            File.WriteAllText(probe, "1");
            File.Delete(probe);
        }
        catch (UnauthorizedAccessException ex)
        {
            throw new UnauthorizedAccessException(
                $"没有权限写入目录「{installDir}」。\n请更换目录（如用户目录），或以管理员身份运行安装包。", ex);
        }

        // payload.zip 位于安装器同目录（不再内嵌，避免安装包单文件超过 100MB）
        var payloadZip = Path.Combine(AppContext.BaseDirectory, "payload.zip");
        var payloadDir = Path.Combine(AppContext.BaseDirectory, "payload");
        if (File.Exists(payloadZip))
        {
            using var stream = File.OpenRead(payloadZip);
            using var zip = new ZipArchive(stream, ZipArchiveMode.Read);
            zip.ExtractToDirectory(installDir, true);
        }
        else if (Directory.Exists(payloadDir))
        {
            log?.Invoke("正在复制程序文件...");
            CopyDirectory(payloadDir, installDir);
        }
        else
        {
            throw new FileNotFoundException(
                "未找到安装载荷 payload.zip。\n" +
                "请将 payload.zip 与安装程序放在同一目录后重试。\n\n" +
                "期望路径：" + payloadZip);
        }

        // 复制自身作为卸载器
        TryFileCopy(Application.ExecutablePath, uninstallPath);

        File.WriteAllText(Path.Combine(installDir, "version.txt"),
            $"MarkdownViewer {AppVersion}\r\n安装时间: {DateTime.Now:yyyy-MM-dd HH:mm:ss}\r\n");

        if (!File.Exists(exePath))
            throw new FileNotFoundException("解压后未找到主程序：" + exePath);

        log?.Invoke("正在创建快捷方式...");
        if (opt.StartMenu)
        {
            var smDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Programs), AppName);
            Directory.CreateDirectory(smDir);
            CreateShortcut(Path.Combine(smDir, $"{AppName}.lnk"),
                exePath, installDir, "Markdown 阅读器");
            CreateShortcut(Path.Combine(smDir, $"卸载 {AppName}.lnk"),
                uninstallPath, installDir, "卸载 MarkdownViewer");
        }
        if (opt.Desktop)
        {
            var desktop = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                $"{AppName}.lnk");
            CreateShortcut(desktop, exePath, installDir, "Markdown 阅读器");
        }

        if (opt.Associate)
        {
            log?.Invoke("正在关联 .md 文件...");
            RegisterAssociation(exePath);
        }

        log?.Invoke("正在注册卸载信息...");
        RegisterUninstall(installDir, exePath, uninstallPath);

        NotifyAssocChanged();
        log?.Invoke("安装完成。");
    }

    /* ============================ 卸载 ============================ */

    public static void UninstallCore(Action<string>? log)
    {
        log?.Invoke("正在关闭正在运行的 MarkdownViewer...");
        KillApp();
        Thread.Sleep(800);

        var installDir = GetRegisteredInstallDir() ?? DefaultInstallDir;

        log?.Invoke("正在删除程序文件...");
        TryDelete(installDir);

        log?.Invoke("正在删除快捷方式...");
        TryDelete(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Programs), AppName));
        TryDeleteFile(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            $"{AppName}.lnk"));

        log?.Invoke("正在移除文件关联...");
        UnregisterAssociation();

        using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true))
        {
            key?.DeleteSubKeyTree("MarkdownViewer", false);
        }

        NotifyAssocChanged();
        log?.Invoke("卸载完成。");
    }

    private static void ScheduleSelfDelete()
    {
        var self = Application.ExecutablePath;
        // 延迟 2 秒后删除临时卸载器自身
        Process.Start(new ProcessStartInfo("cmd.exe",
            $"/c timeout /t 2 /nobreak >nul & del \"{self}\"")
        {
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
            UseShellExecute = false
        });
    }

    /* ============================ 注册表 ============================ */

    /// <summary>读取已安装版本记录的实际安装目录。</summary>
    public static string? GetRegisteredInstallDir()
    {
        using var key = Registry.CurrentUser.OpenSubKey(UninstallKey);
        var s = key?.GetValue("InstallLocation") as string;
        return string.IsNullOrWhiteSpace(s) ? null : s;
    }

    private static void RegisterUninstall(string installDir, string exePath, string uninstallPath)
    {
        using var key = Registry.CurrentUser.CreateSubKey(UninstallKey);
        key.SetValue("DisplayName", "MarkdownViewer");
        key.SetValue("DisplayVersion", AppVersion);
        key.SetValue("Publisher", Publisher);
        key.SetValue("InstallLocation", installDir);
        key.SetValue("DisplayIcon", exePath);
        key.SetValue("UninstallString", $"\"{uninstallPath}\" /uninstall");
        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
    }

    private static void RegisterAssociation(string exePath)
    {
        foreach (var ext in MarkdownExts)
        {
            using (var k = Registry.CurrentUser.CreateSubKey($@"Software\Classes\{ext}"))
                k.SetValue("", ProgId);
            using (var per = Registry.CurrentUser.CreateSubKey(
                       $@"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\{ext}\OpenWithProgids"))
            {
                // 追加一个 ProgId 到“打开方式”
                per.SetValue(ProgId, new byte[] { 0 }, RegistryValueKind.Binary);
            }
        }

        using (var prog = Registry.CurrentUser.CreateSubKey($@"Software\Classes\{ProgId}"))
            prog.SetValue("", "Markdown 文档");
        using (var icon = Registry.CurrentUser.CreateSubKey($@"Software\Classes\{ProgId}\DefaultIcon"))
            icon.SetValue("", $"\"{exePath}\",0");
        using (var cmd = Registry.CurrentUser.CreateSubKey(
                   $@"Software\Classes\{ProgId}\shell\open\command"))
            cmd.SetValue("", $"\"{exePath}\" \"%1\"");
    }

    private static void UnregisterAssociation()
    {
        foreach (var ext in MarkdownExts)
        {
            using var extKey = Registry.CurrentUser.OpenSubKey($@"Software\Classes\{ext}", true);
            if (extKey != null && string.Equals(extKey.GetValue("") as string, ProgId,
                    StringComparison.OrdinalIgnoreCase))
            {
                extKey.SetValue("", string.Empty);
            }
            using var per = Registry.CurrentUser.OpenSubKey(
                $@"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\{ext}\OpenWithProgids", true);
            per?.DeleteValue(ProgId, false);
        }
        using var classes = Registry.CurrentUser.OpenSubKey("Software\\Classes", true);
        classes?.DeleteSubKeyTree(ProgId, false);
    }

    /* ============================ 辅助方法 ============================ */

    private static void CreateShortcut(string lnkPath, string target, string workDir, string desc)
    {
        var t = Type.GetTypeFromProgID("WScript.Shell");
        if (t == null) return;
        dynamic shell = Activator.CreateInstance(t)!;
        dynamic sc = shell.CreateShortcut(lnkPath);
        sc.TargetPath = target;
        sc.WorkingDirectory = workDir;
        sc.Description = desc;
        sc.IconLocation = target;
        sc.Save();
    }

    private static void KillApp()
    {
        foreach (var p in Process.GetProcessesByName(AppName))
        {
            try { p.Kill(); p.WaitForExit(3000); }
            catch { /* 忽略 */ }
        }
    }

    private static void TryDelete(string dir)
    {
        for (int i = 0; i < 3; i++)
        {
            try
            {
                if (Directory.Exists(dir)) Directory.Delete(dir, true);
                return;
            }
            catch (UnauthorizedAccessException) { Thread.Sleep(400); }
            catch (IOException) { Thread.Sleep(400); }
        }
    }

    private static void TryDeleteFile(string file)
    {
        try { if (File.Exists(file)) File.Delete(file); }
        catch { /* 忽略 */ }
    }

    private static void TryFileCopy(string src, string dst)
    {
        for (int i = 0; i < 3; i++)
        {
            try { File.Copy(src, dst, true); return; }
            catch (IOException) { Thread.Sleep(400); }
        }
    }

    /// <summary>递归复制目录（payload 以文件夹形式随安装器分发时使用）。</summary>
    private static void CopyDirectory(string sourceDir, string targetDir)
    {
        Directory.CreateDirectory(targetDir);
        foreach (var dir in Directory.GetDirectories(sourceDir, "*", SearchOption.AllDirectories))
        {
            var rel = Path.GetRelativePath(sourceDir, dir);
            Directory.CreateDirectory(Path.Combine(targetDir, rel));
        }
        foreach (var file in Directory.GetFiles(sourceDir, "*", SearchOption.AllDirectories))
        {
            var rel = Path.GetRelativePath(sourceDir, file);
            var dest = Path.Combine(targetDir, rel);
            Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
            File.Copy(file, dest, true);
        }
    }

    [DllImport("shell32.dll", CharSet = CharSet.Auto)]
    private static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);

    private static void NotifyAssocChanged()
    {
        const uint SHCNE_ASSOCCHANGED = 0x08000000;
        const uint SHCNF_IDLIST = 0x0000;
        SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, IntPtr.Zero, IntPtr.Zero);
    }
}

/* ============================ 安装界面 ============================ */

public class InstallForm : Form
{
    private readonly TextBox _txtDir = new();
    private readonly CheckBox _cbStartMenu = new() { Text = "创建「开始菜单」快捷方式", Checked = true };
    private readonly CheckBox _cbDesktop = new() { Text = "创建桌面快捷方式", Checked = true };
    private readonly CheckBox _cbAssoc = new() { Text = "关联 .md / .markdown / .mdx 文件", Checked = true };
    private readonly Button _btnBrowse = new() { Text = "浏览..." };
    private readonly Button _btnInstall = new() { Text = "安装", Height = 32 };
    private readonly Button _btnCancel = new() { Text = "取消", Height = 32 };
    private readonly Label _lblWait = new() { Text = "" };

    public InstallForm(string initialDir)
    {
        Text = "MarkdownViewer 安装向导";
        Width = 540;
        Height = 380;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Microsoft YaHei UI", 9.5f);

        var title = new Label
        {
            Text = "MarkdownViewer 1.0.0",
            Left = 24, Top = 18, Width = 480, Height = 34,
            Font = new Font("Microsoft YaHei UI", 16, FontStyle.Bold)
        };
        var sub = new Label
        {
            Text = "轻量 Markdown 阅读与编辑器（WebView2 + 目录 + 护眼/暗黑主题）",
            Left = 24, Top = 54, Width = 480, Height = 22
        };

        var lblDir = new Label { Text = "安装位置：", Left = 24, Top = 92, Width = 80, Height = 24 };
        _txtDir.Left = 92; _txtDir.Top = 88; _txtDir.Width = 320; _txtDir.Text = initialDir;
        _btnBrowse.Left = 420; _btnBrowse.Top = 86; _btnBrowse.Width = 80; _btnBrowse.Height = 28;

        _cbStartMenu.Left = 24; _cbStartMenu.Top = 130; _cbStartMenu.Width = 300;
        _cbDesktop.Left = 24; _cbDesktop.Top = 160; _cbDesktop.Width = 300;
        _cbAssoc.Left = 24; _cbAssoc.Top = 190; _cbAssoc.Width = 360;

        _btnInstall.Left = 310; _btnInstall.Top = 235; _btnInstall.Width = 90;
        _btnCancel.Left = 410; _btnCancel.Top = 235; _btnCancel.Width = 90;
        _lblWait.Left = 24; _lblWait.Top = 285; _lblWait.Width = 480; _lblWait.Height = 24;

        var tip = new Label
        {
            Text = "提示：安装程序需与 payload.zip 放在同一目录；默认装在当前用户目录，无需管理员权限。",
            Left = 24, Top = 305, Width = 490, Height = 40,
            ForeColor = Color.Gray,
            Font = new Font("Microsoft YaHei UI", 8.5f)
        };

        Controls.AddRange(new Control[]
        {
            title, sub, lblDir, _txtDir, _btnBrowse,
            _cbStartMenu, _cbDesktop, _cbAssoc,
            _btnInstall, _btnCancel, _lblWait, tip
        });

        _btnBrowse.Click += BtnBrowse_Click;
        _btnInstall.Click += BtnInstall_Click;
        _btnCancel.Click += (s, e) => Close();
    }

    private void BtnBrowse_Click(object? sender, EventArgs e)
    {
        using var dlg = new FolderBrowserDialog
        {
            Description = "选择 MarkdownViewer 的安装文件夹",
            UseDescriptionForTitle = true,
            SelectedPath = Directory.Exists(_txtDir.Text) ? _txtDir.Text : Program.DefaultInstallDir
        };
        if (dlg.ShowDialog(this) == DialogResult.OK)
        {
            _txtDir.Text = Path.Combine(dlg.SelectedPath, Program.AppName);
        }
    }

    private void BtnInstall_Click(object? sender, EventArgs e)
    {
        var dir = (_txtDir.Text ?? "").Trim();
        if (string.IsNullOrWhiteSpace(dir))
        {
            MessageBox.Show("请选择安装位置。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        // 路径中的非法字符检查
        var invalid = Path.GetInvalidPathChars();
        if (dir.IndexOfAny(invalid) >= 0)
        {
            MessageBox.Show("安装路径包含非法字符。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var opt = new Program.InstallOptions
        {
            StartMenu = _cbStartMenu.Checked,
            Desktop = _cbDesktop.Checked,
            Associate = _cbAssoc.Checked
        };
        _btnInstall.Enabled = false;
        _btnBrowse.Enabled = false;
        _txtDir.Enabled = false;
        _lblWait.Text = "正在安装，请稍候...";
        Refresh();

        try
        {
            Program.InstallCore(opt, msg =>
            {
                _lblWait.Text = msg;
                _lblWait.Refresh();
            }, dir);
        }
        catch (Exception ex)
        {
            MessageBox.Show("安装失败：" + ex.Message, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            _btnInstall.Enabled = true;
            _btnBrowse.Enabled = true;
            _txtDir.Enabled = true;
            return;
        }

        var exePath = Path.Combine(Path.GetFullPath(dir), Program.ExeName);
        if (MessageBox.Show("安装完成！是否立即启动 MarkdownViewer？", "安装完成",
                MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
        {
            Process.Start(new ProcessStartInfo(exePath) { UseShellExecute = true });
        }
        Close();
    }
}

/* ============================ 卸载进度界面 ============================ */

public class ProgressForm : Form
{
    private readonly Label _lbl;
    private readonly bool _isInstall;

    public ProgressForm(bool isInstall)
    {
        _isInstall = isInstall;
        Text = isInstall ? "正在安装 MarkdownViewer" : "正在卸载 MarkdownViewer";
        Width = 420;
        Height = 180;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Microsoft YaHei UI", 9.5f);

        _lbl = new Label
        {
            Left = 24, Top = 40, Width = 360, Height = 40,
            Text = "请稍候..."
        };
        Controls.Add(_lbl);
        Load += ProgressForm_Load;
    }

    private void ProgressForm_Load(object? sender, EventArgs e)
    {
        Refresh();
        try
        {
            if (_isInstall)
                Program.InstallCore(new Program.InstallOptions(),
                    msg => { _lbl.Text = msg; _lbl.Refresh(); }, Program.DefaultInstallDir);
            else
                Program.UninstallCore(msg => { _lbl.Text = msg; _lbl.Refresh(); });
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        Close();
    }
}
