# MarkdownViewer

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

一个独立、轻量的 Markdown 阅读与编辑器，带目录（TOC）、分栏实时预览，以及浅色 / 护眼绿 / 暗黑三套主题。

> **当前版本**：1.0.0 ｜ **发布日期**：2026-10-18 ｜ **作者**：tobegmup
>
> **开源协议**：本项目以 [GNU GPL v3](LICENSE) 发布。第三方组件（markdown-it、CodeMirror、WebView2 等）版权声明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

## 获取与运行

| 方式 | 做法 | 说明 |
|------|------|------|
| **绿色版**（免安装） | 下载仓库中的 `publish/` 文件夹，**整个文件夹**拷贝到任意目录，双击 `MarkdownViewer.exe` | 不写注册表、不建快捷方式、不关联文件类型；删文件夹即卸载。需 .NET 8 Desktop Runtime |
| **安装包** | `Setup/MarkdownViewer-Setup-1.0.0.exe` 与 `Setup/payload.zip` **放在同一目录**后运行 | 自包含 .NET 运行时，可选快捷方式、`.md` 关联与卸载项 |

详见下文「[绿色版](#绿色版免安装直接拷贝使用)」与「[安装包](#安装包安装器--payloadzip)」。

## 技术架构

| 层次 | 实现 |
|------|------|
| 宿主程序 | C# / WPF（.NET 8, net8.0-windows） |
| 渲染内核 | Microsoft.Web.WebView2（Chromium） |
| 资源加载 | `SetVirtualHostNameToFolderMapping` 虚拟主机，**不生成临时文件** |
| Markdown 解析 | markdown-it 14.1.0（GFM，前端 JS 渲染） |
| 双向通信 | `WebMessageReceived` / `PostWebMessageAsJson` |
| 文件编码 | BOM 探测 → 严格 UTF-8 → GB18030 兜底 |

## 功能

- **多标签页**：一次打开多个 `.md` 文档（顶部标签栏），点击不同标签时**左侧目录同步切换**为该文档的目录，且每个标签独立记忆正文滚动位置；关闭标签自动切换到相邻标签
- **彩色圆角标签**：每个标签自动分配不同的主题色（蓝、绿、橙、紫、粉、红、青、靛循环），标签为圆角矩形，选中标签实色高亮、未选中浅色显示，便于区分多个文档
- **标签弹出为独立窗口**：在窗口内有多个标签时，**双击某个标签**即可把它弹出为独立窗口单独显示（继承当前主题与滚动位置）
- **独立窗口拖回合并**：把独立窗口的标题栏**拖到主窗口标签栏区域**（出现蓝色停靠提示）后松开，该文档即合并回标签页；拖到非标签区则保持独立窗口
- 左侧自动生成 H1~H6 层级目录，点击跳转，正文滚动时自动高亮当前章节
- **目录折叠**：父级标题显示 ▾/▸ 箭头，点击按层级折叠/展开子目录（滚动联动时自动展开祖先节点）
- **三种显示模式**（工具栏下拉切换，WPF 面板与正文同步）：
  - 浅色（GitHub 风格白底）
  - 护眼绿（经典豆沙绿 `#C7EDCC`）
  - 暗黑（黑底白字，VS Code 风格）
- 目录与正文之间为**可拖动分割线**，可自由调整目录宽度（隐藏目录时自动收起）
- **目录 / 编辑器 / 预览联动**：点击目录时编辑器与预览**平滑滚动**到对应章节；**分栏模式下编辑器与预览双向平滑滚动绑定**（按比例同步，带缓动动画），滚动任意一侧都会平滑带动另一侧，目录同时高亮当前章节
- **编辑体验**：编辑器铺满窗口高度，分栏分隔条可拖动调整宽度（**双击恢复 50%**）
- **快捷键**：`Ctrl+N` 新建、`Ctrl+S` 保存、`Ctrl+O` 打开、`Ctrl+W` 关闭当前标签、`Ctrl+Tab` / `Ctrl+Shift+Tab` 切换标签、`F5` 重新加载
- 菜单「文件 → 新建」或 `Ctrl+N` 创建未命名文档（如 `未命名-1.md`），首次保存时再选择文件路径
- **菜单栏**：文件（打开 / 保存 / 另存为 / 重新加载 / 退出）与帮助 →「关于 MarkdownViewer」；「关于」对话框展示版本、发布时间、作者 **tobegmup** 与开源协议 GPL-3.0，可直接查看许可证
- 工具栏打开文件、重新加载、显示/隐藏目录
- 拖拽 `.md` 文件到窗口打开（支持一次拖入多个文件，各自成为标签）
- 命令行参数打开：`MarkdownViewer.exe 文档1.md 文档2.md`
- GFM 表格、任务列表（带勾选框）、代码块、链接自动识别
- md 中相对路径图片可正常显示（文件所在目录映射为 `https://mdfile.local/`）
- 预览中点击页内锚点平滑跳转；点击相对路径的 `.md` 链接会作为新标签打开，其它文件交给系统默认程序
- 外链交给系统浏览器打开（WebView 不会离开应用页面）

## 目录结构

```
markdownviewer/
├── MarkdownViewer.sln
├── MarkdownViewer/                  # 主程序（WPF）
│   ├── MarkdownViewer.csproj
│   ├── App.xaml / App.xaml.cs
│   ├── MainWindow.xaml / MainWindow.xaml.cs      # 主窗口：顶部多标签 + 左侧 TOC + 右侧 WebView2
│   ├── AboutWindow.xaml / AboutWindow.xaml.cs    # 关于对话框（版本/发布时间/作者/协议）
│   ├── Helpers/
│   │   └── FileReaderHelper.cs                   # 编码检测
│   └── WebAssets/                                # 虚拟主机根目录（前端资源）
│       ├── index.html
│       ├── css/style.css
│       └── js/
│           ├── markdown-it.min.js
│           └── render.js                          # 渲染 + TOC 提取 + 滚动联动
├── Installer/                       # 安装器（WinForms，单文件自包含）
│   ├── Installer.csproj
│   ├── Program.cs                   # 安装/卸载/快捷方式/.md 关联
│   └── payload.zip                  # 构建时生成的载荷包（不内嵌，随安装器同目录分发）
├── publish/                         # 绿色版（框架依赖，免安装，拷贝即用）
│   ├── MarkdownViewer.exe           # 双击直接运行
│   └── WebAssets/ runtimes/ ...     # 需与 exe 保持同级目录结构
├── Setup/
│   ├── MarkdownViewer-Setup-1.0.0.exe   # 安装器（自包含 .NET 运行时，<100MB）
│   └── payload.zip                      # 主程序载荷，安装时复制到安装目录
├── LICENSE                          # GNU GPL v3 许可证
├── THIRD-PARTY-NOTICES.md           # 第三方组件版权声明
└── README.md
```

## 绿色版（免安装，直接拷贝使用）

仓库中的 **`publish/` 目录就是绿色版**：不需要运行安装程序，把整个文件夹拷贝到任意位置（如 `D:\Apps\MarkdownViewer`、U 盘、网盘同步目录）即可双击 `MarkdownViewer.exe` 使用。

- **拷贝整个文件夹**，保持目录结构完整（`WebAssets\`、`runtimes\` 与 exe 同级），不要只复制单个 exe
- 不写注册表、不建快捷方式、不关联文件类型；删除该文件夹即完成「卸载」，无残留
- 运行期缓存写在 exe 同级的 `MarkdownViewer.exe.WebView2\`，随文件夹一起移动/删除
- 依赖：**.NET 8 Desktop Runtime**（`publish/` 为框架依赖版）+ **WebView2 Runtime**（Win10/11 一般已内置）
- 需要**完全不依赖 .NET 运行时**时，发布自包含单文件版（体积约 150MB，单 exe 直接跑）：

```powershell
dotnet publish MarkdownViewer\MarkdownViewer.csproj -c Release -r win-x64 `
  --self-contained true -p:PublishSingleFile=true `
  -p:IncludeNativeLibrariesForSelfExtract=true -o publish-standalone
```

## 安装包（安装器 + payload.zip）

安装包由**两个文件**组成，必须放在同一目录：

- `Setup\MarkdownViewer-Setup-1.0.0.exe`：安装器（自包含 .NET 运行时，约 70MB）
- `Setup\payload.zip`：主程序载荷（约 66MB）

> 安装器不再把载荷内嵌到自身，避免单文件超过 GitHub 100MB 限制。安装时从安装器所在目录读取 `payload.zip` 并解压到用户选择的安装目录；如果缺少该文件，安装器会提示两者需放在同一目录。

- **免管理员权限**（默认安装到当前用户目录；选择 `Program Files` 时需管理员身份运行）
- **向导中可自行选择安装目录**（「浏览...」按钮），默认 `%LOCALAPPDATA%\Programs\MarkdownViewer`（当前用户，无 UAC）
- 选择 `Program Files` 等系统目录时需以管理员身份运行安装包（无写权限会给出明确提示）
- 可选：开始菜单快捷方式、桌面快捷方式、关联 `.md/.markdown/.mdx`
- 写入「设置 → 应用 → 已安装的应用」卸载条目，支持完整卸载（含文件、快捷方式、关联清理）；卸载路径从注册表读取，自定义目录也能正确清理
- 覆盖安装时若旧版本位于其他目录，会自动清理旧目录
- 静默安装/卸载：`MarkdownViewer-Setup-1.0.0.exe /silent`、`Uninstall.exe /uninstall /silent`
- 指定目录静默安装：`MarkdownViewer-Setup-1.0.0.exe /silent /DIR="D:\Apps\MarkdownViewer"`

### 重新构建安装包

```powershell
# 1. 发布主程序（自包含单文件）
dotnet publish MarkdownViewer\MarkdownViewer.csproj -c Release -r win-x64 `
  --self-contained true -p:PublishSingleFile=true `
  -p:IncludeNativeLibrariesForSelfExtract=true -o build-payload
Compress-Archive -Path build-payload\* -DestinationPath Installer\payload.zip -Force

# 2. 发布安装器（不再内嵌 payload.zip）
dotnet publish Installer\Installer.csproj -c Release -r win-x64 `
  --self-contained true -p:PublishSingleFile=true `
  -p:IncludeNativeLibrariesForSelfExtract=true -o build-setup
Copy-Item build-setup\MarkdownViewer-Setup.exe Setup\MarkdownViewer-Setup-1.0.0.exe -Force
Copy-Item Installer\payload.zip Setup\payload.zip -Force
```

## 编译

```powershell
cd markdownviewer
dotnet restore
dotnet build -c Debug
```

## 发布

```powershell
# 框架依赖版（需要 .NET 8 Desktop Runtime，体积小）——仓库中 publish/ 即此产物，可直接作为绿色版分发
dotnet publish MarkdownViewer\MarkdownViewer.csproj -c Release -r win-x64 --self-contained false -o publish

# 独立部署版（无需安装运行时，体积约 150MB）
dotnet publish MarkdownViewer\MarkdownViewer.csproj -c Release -r win-x64 --self-contained true ^
  -p:PublishSingleFile=true
```

> 运行机器需安装 **WebView2 Runtime**（Windows 10/11 一般已内置）。

## 可扩展方向

- 引入 highlight.js / mermaid / KaTeX 支持代码高亮、流程图、数学公式
- 接入 CharsetDetector 完善编码探测
- 字体缩放、全文搜索
