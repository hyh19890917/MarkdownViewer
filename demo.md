# MarkdownViewer 演示文档

> 用于验证渲染、目录与滚动联动功能。

## 一、功能特性

本阅读器的主要功能：

- WebView2 内核渲染
- 左侧 H1~H6 自动目录
- 点击目录跳转，滚动自动高亮
- 命令行参数与拖拽打开

## 二、代码示例

```csharp
public void Hello()
{
    Console.WriteLine("Hello, MarkdownViewer!");
}
```

## 三、表格

| 模块 | 技术 | 说明 |
|------|------|------|
| 宿主 | WPF / .NET 8 | 原生窗口 |
| 渲染 | WebView2 | Chromium 内核 |
| 解析 | markdown-it | GFM 方言 |

### 3.1 任务列表

- [x] 工程创建
- [x] 编译发布
- [ ] 后续扩展 Mermaid

### 3.2 链接

[markdown-it 文档](https://markdown-it.github.io/)

[CodeMirror](https://codemirror.net/5/)

## 四、结语

点击目录或滚动即可体验，`Ctrl+S` 保存。

### 更深入的小节

用于测试 H3 层级缩进。

#### 四级标题

H4 层级。
