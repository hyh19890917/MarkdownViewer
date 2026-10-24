/*
 * Markdown 阅读 + 编辑管线（markdown-it + CodeMirror）
 * 职责：
 *  1. 接收 C# 端 PostWebMessageAsJson 发来的 Markdown 原文（按标签缓存）
 *  2. 解析 token，为每个标题生成唯一 id，收集 TOC 目录回传 C#
 *  3. 渲染 HTML（GitHub 风格），重写相对路径图片到文件虚拟主机
 *  4. 三种视图：预览(preview) / 分栏(split) / 编辑(edit)
 *  5. CodeMirror 编辑，防抖实时刷新右侧预览与目录，Ctrl+S 保存
 *  6. 滚动联动：IntersectionObserver 通知 C# 当前所在标题
 */
(function () {
    "use strict";

    var previewPane = document.getElementById("preview-pane");
    var editorPane = document.getElementById("editor-pane");
    var workbench = document.getElementById("workbench");
    var mermaidEditor = document.getElementById("mermaid-editor");
    var mermaidSource = document.getElementById("mermaid-source");
    var mermaidPreview = document.getElementById("mermaid-preview");
    var mermaidEditorHint = document.getElementById("mermaid-editor-hint");

    /* ===================== 轻量语法高亮（离线，无外部依赖） ===================== */
    var codeSnippets = [];

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    /* 逐段编码相对路径：避免已转义的 %20 被再次变成 %2520 */
    function encodeRelativePath(rel) {
        return String(rel).split("/").map(function (segment) {
            var decoded = segment;
            try { decoded = decodeURIComponent(segment); } catch (e) { /* 非法转义则按原样处理 */ }
            return encodeURIComponent(decoded);
        }).join("/");
    }

    var LANG_CONF = {
        js: {
            slash: true,
            kw: "await async break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while with yield null true false undefined"
        },
        ts: {
            slash: true,
            kw: "abstract any as async await boolean break case catch class const constructor continue declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let namespace never new null number object of private protected public readonly record return set static string super switch this throw true try type typeof undefined unique unknown var void while yield"
        },
        csharp: {
            slash: true,
            kw: "abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach get goto if implicit in init int interface internal is lock long namespace new null object operator out override params partial private protected public readonly record ref return sbyte sealed set short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while yield nameof"
        },
        java: {
            slash: true,
            kw: "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new null package private protected public return short static strictfp super switch synchronized this throw throws transient true false try void volatile while var record"
        },
        python: {
            hash: true,
            kw: "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield match case self"
        },
        bash: {
            hash: true,
            kw: "if then else elif fi for while until do done case esac function in return exit export local readonly declare echo cd set unset source alias sudo"
        },
        powershell: {
            hash: true,
            kw: "function param if else elseif foreach for while do switch return try catch finally throw true false null begin process end filter in not and or"
        },
        sql: {
            dash: true,
            kw: "select from where insert into values update set delete create table alter drop index view join left right inner outer full on group by order having limit offset union all distinct as and or not null is like between in exists count sum avg min max case when then else end primary key foreign references default"
        },
        json: { slash: true, kw: "true false null" },
        yaml: { hash: true, kw: "true false null yes no on off" },
        go: {
            slash: true,
            kw: "package import func var const type struct interface map chan go defer select case switch default if else for range break continue return nil true false make new len cap append copy delete panic recover"
        },
        rust: {
            slash: true,
            kw: "fn let mut pub use mod struct enum impl trait for while loop if else match return self Self crate super as dyn ref move async await unsafe const static type where some none ok err true false"
        },
        cpp: {
            slash: true,
            kw: "auto bool break case catch char class const constexpr continue default delete do double else enum explicit extern false float for friend if inline int long namespace new nullptr operator private protected public return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while include define ifndef endif"
        },
        php: {
            slash: true,
            hash: true,
            kw: "abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global if implements include include_once instanceof insteadof interface isset list match namespace new null or print private protected public readonly require require_once return static switch throw trait true false try unset use var while xor yield"
        },
        css: { slash: true, kw: "" },
        html: { html: true, kw: "" },
        xml: { html: true, kw: "" },
        text: null
    };

    var LANG_ALIASES = {
        javascript: "js", jsx: "js", mjs: "js", cjs: "js", node: "js",
        typescript: "ts", tsx: "ts",
        "c#": "csharp", cs: "csharp", dotnet: "csharp",
        py: "python", python3: "python",
        sh: "bash", shell: "bash", zsh: "bash", console: "bash",
        ps1: "powershell", pwsh: "powershell", ps: "powershell",
        yml: "yaml",
        "c++": "cpp", cxx: "cpp", c: "cpp", h: "cpp", hpp: "cpp",
        jsonc: "json", json5: "json",
        htm: "html", xhtml: "html", svg: "xml", vue: "html",
        plaintext: "text", txt: "text", "": "text"
    };

    function normalizeLang(lang) {
        var key = (lang || "").toLowerCase().trim();
        return LANG_ALIASES[key] || key;
    }

    function buildTokenRegex(conf) {
        var comments = [];
        if (conf.slash) {
            comments.push("\\/\\*[\\s\\S]*?\\*\\/");
            comments.push("\\/\\/[^\\n]*");
        }
        if (conf.hash) comments.push("#[^\\n]*");
        if (conf.dash) comments.push("--[^\\n]*");
        if (conf.html) comments.push("<!--[\\s\\S]*?-->");
        if (!comments.length) comments.push("\\u0000never\\u0000");
        return new RegExp(
            "(" + comments.join("|") + ")" +
            "|(\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|`(?:\\\\.|[^`\\\\])*`)" +
            "|(\\b0[xX][0-9a-fA-F]+\\b|\\b\\d+(?:\\.\\d+)?\\b)" +
            "|([A-Za-z_$][\\w$]*)",
            "g");
    }

    function highlightCode(code, lang) {
        var key = normalizeLang(lang);
        // 优先使用内置 highlight.js（覆盖更全、规则更准确），失败时回退到轻量高亮
        if (window.hljs && key && key !== "text" && window.hljs.getLanguage(key)) {
            try {
                return {
                    html: window.hljs.highlight(code, {
                        language: key,
                        ignoreIllegals: true
                    }).value,
                    engine: "hljs",
                    lang: key
                };
            } catch (e) { /* 非法代码交给自研高亮兜底 */ }
        }

        var conf = LANG_CONF[key];
        if (!conf) return { html: escapeHtml(code), engine: "custom", lang: key };

        var kw = {};
        var kwList = (conf.kw || "").split(" ");
        for (var i = 0; i < kwList.length; i++) {
            if (kwList[i]) kw[kwList[i]] = true;
        }

        var re = buildTokenRegex(conf);
        var out = "";
        var last = 0;
        var m;
        while ((m = re.exec(code)) !== null) {
            out += escapeHtml(code.slice(last, m.index));
            last = re.lastIndex;

            var cls = null;
            if (m[1]) {
                cls = "tok-com";
            } else if (m[2]) {
                cls = "tok-str";
            } else if (m[3]) {
                cls = "tok-num";
            } else if (m[4]) {
                var word = m[4];
                if (kw[word]) cls = "tok-kw";
                else if (/^[A-Z]/.test(word)) cls = "tok-type";
                else if (/^\s*\(/.test(code.slice(re.lastIndex, re.lastIndex + 8))) cls = "tok-fn";
            }

            out += cls
                ? '<span class="' + cls + '">' + escapeHtml(m[0]) + "</span>"
                : escapeHtml(m[0]);
        }
        out += escapeHtml(code.slice(last));
        return { html: out, engine: "custom", lang: key };
    }

    var md = window.markdownit({
        html: false,
        linkify: true,
        // 关闭 typographer：避免 -- 变 –、引号变弯引号，导致“查找”结果与预览文本不一致
        typographer: false,
        breaks: false,
        highlight: function (code, lang) {
            var result = highlightCode(code, lang);
            var idx = codeSnippets.push(code) - 1;
            var codeClass = (result.engine === "hljs" ? "hljs " : "") +
                "language-" + escapeHtml(result.lang);
            // 必须以 <pre 开头，markdown-it 才会原样使用（不再包一层 pre/code）
            return '<pre class="code-block"><button type="button" class="copy-code" data-code="' +
                idx + '" title="复制代码">复制</button><code class="' + codeClass + '">' +
                result.html + "</code></pre>";
        }
    });

    /* KaTeX：行内 $...$ / 单行 $$...$$ 在解析阶段直接生成公式 HTML，避免下划线等被当作 Markdown 语法；
       跨行 $$ 块与 \(...\) / \[...\] 由渲染后的 auto-render 处理 */
    if (window.katex) {
        md.inline.ruler.after("escape", "math_inline", function (state, silent) {
            var src = state.src;
            var start = state.pos;
            if (src.charCodeAt(start) !== 0x24) return false;
            if (start > 0 && src.charCodeAt(start - 1) === 0x5C) return false; // \$ 转义

            var doubleDollar = src.charCodeAt(start + 1) === 0x24;
            var marker = doubleDollar ? "$$" : "$";
            var from = start + marker.length;
            var end = src.indexOf(marker, from);
            if (end < 0) return false;

            var content = src.slice(from, end);
            if (!content) return false;
            if (content.indexOf("\n") >= 0) return false; // 跨行公式交给 auto-render
            if (!doubleDollar) {
                // 形如 “$5 和 $10” 的货币写法不当作公式
                if (/^\s|\s$/.test(content)) return false;
                if (content.length > 2000) return false;
            }

            var html;
            try {
                html = window.katex.renderToString(content, {
                    displayMode: doubleDollar,
                    throwOnError: false,
                    strict: "ignore"
                });
            } catch (e) {
                return false;
            }
            if (silent) {
                state.pos = end + marker.length;
                return true;
            }
            var token = state.push("html_inline", "", 0);
            token.content = html;
            state.pos = end + marker.length;
            return true;
        });
    }

    /* GFM 任务列表：把 "- [x] xxx" 渲染成带勾选框的列表项 */
    md.core.ruler.after("inline", "task_list", function (state) {
        var tokens = state.tokens;
        for (var i = 0; i < tokens.length; i++) {
            if (tokens[i].type !== "inline") continue;
            // 列表项内联内容的兄弟 token：... list_item_open, paragraph_open, inline, paragraph_close ...
            var itemOpen = tokens[i - 2];
            var paraOpen = tokens[i - 1];
            var paraClose = tokens[i + 1];
            if (!itemOpen || itemOpen.type !== "list_item_open") continue;
            if (!paraOpen || paraOpen.type !== "paragraph_open") continue;
            if (!paraClose || paraClose.type !== "paragraph_close") continue;

            var m = /^\[([ xX])\]\s+/.exec(tokens[i].content);
            if (!m) continue;

            itemOpen.attrJoin("class", "task-list-item");
            var children = tokens[i].children;
            if (children && children.length && children[0].type === "text") {
                children[0].content = children[0].content.replace(/^\[([ xX])\]\s+/, "");
                var box = new state.Token("html_inline", "", 0);
                box.content = '<input class="task-list-item-checkbox" type="checkbox" disabled' +
                    (m[1] === " " ? "" : " checked") + ">";
                children.unshift(box);
            }
            tokens[i].content = tokens[i].content.replace(/^\[([ xX])\]\s+/, "");
        }
    });

    /* 相对路径图片 -> 指向 md 文件所在目录的虚拟主机 */
    var defaultImageRender = md.renderer.rules.image ||
        function (tokens, idx, options, env, self) {
            return self.renderToken(tokens, idx, options);
        };
    md.renderer.rules.image = function (tokens, idx, options, env, self) {
        var token = tokens[idx];
        var srcIndex = token.attrIndex("src");
        if (srcIndex >= 0) {
            var src = token.attrs[srcIndex][1] || "";
            // 绝对路径（C:\xxx、\\server\share）无法通过 mdfile.local 虚拟主机访问，保持原样
            var isAbsolute = /^[a-zA-Z]:[\\/]/.test(src) || src.indexOf("\\\\") === 0;
            if (src && !isAbsolute &&
                !/^[a-z][a-z0-9+.-]*:/i.test(src) && src.indexOf("//") !== 0) {
                var rel = src.replace(/^\.\//, "").replace(/\\/g, "/");
                // 以 / 开头的路径也视作文档目录内相对路径（虚拟主机根就是文档目录）
                if (rel.charAt(0) === "/") rel = rel.replace(/^\/+/, "");
                token.attrs[srcIndex][1] = "https://mdfile.local/" + encodeRelativePath(rel);
            }
        }
        return defaultImageRender(tokens, idx, options, env, self);
    };

    /* 外链新窗口打开 */
    var defaultLinkRender = md.renderer.rules.link_open ||
        function (tokens, idx, options, env, self) {
            return self.renderToken(tokens, idx, options);
        };
    md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
        var token = tokens[idx];
        var hrefIndex = token.attrIndex("href");
        if (hrefIndex >= 0) {
            var href = token.attrs[hrefIndex][1] || "";
            if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(href)) {
                token.attrSet("target", "_blank");
                token.attrSet("rel", "noopener");
            }
        }
        return defaultLinkRender(tokens, idx, options, env, self);
    };

    function slugify(text, used) {
        var base = text
            .toLowerCase()
            .replace(/[`~!@#$%^&*()+=<>?,./:;"'|[\]{}\\]/g, "")
            .replace(/\s+/g, "-")
            .replace(/^-+|-+$/g, "")
            .substring(0, 80) || "heading";
        // 重名标题依次使用 -1、-2… 后缀（与 GitHub 一致）
        var id = base, n = 1;
        while (used[id]) { id = base + "-" + (n++); }
        used[id] = true;
        return id;
    }

    /* ===================== 多标签编辑缓冲区 ===================== */
    var currentTabId = null;
    var buffers = {};           // tabId -> { text, dirty, savedText, editScroll, cursor, previewScroll }
    var renderedTabId = null;   // 当前 DOM 里渲染的是哪个标签（用于跳过重复渲染）
    var viewMode = "preview";
    var headingLines = {};      // 标题 id -> 源码行号（供编辑模式 TOC 跳转）
    var headingList = [];       // [{ id, line }]，按文档顺序，供编辑区滚动联动
    var activeDriver = "preview";        // 分栏时最近操作的面板：editor / preview
    var previewSpySilentUntil = 0;       // 目录点击平滑滚动期间暂停预览 observer 上报
    var scrollSyncPausedUntil = 0;       // 程序化滚动/切换标签期间暂停双向绑定
    var suppressPreviewSyncUntil = 0;    // 预览跟随动画自身的 scroll 回显
    var suppressEditorSyncUntil = 0;     // 编辑器跟随动画自身的 scroll 回显
    var previewFollowRaf = 0;
    var editorFollowRaf = 0;
    var previewFollowTarget = 0;
    var editorFollowTarget = 0;
    var suppressChange = false;
    var renderTimer = null;
    var draftTimer = null;
    var refreshTimer = null;
    var findInputTimer = null;
    var mermaidTimer = null;
    var mermaidPreviewTimer = null;
    var mermaidPreviewSeq = 0;
    var mermaidEditIndex = null;
    var pendingInserts = {};   // tabId -> [markdown]（跨标签异步插入）

    /* ===================== CodeMirror 初始化 ===================== */
    var cm = CodeMirror(document.getElementById("editor"), {
        value: "",
        mode: "gfm",
        lineNumbers: true,
        lineWrapping: true,
        indentUnit: 2,
        tabSize: 2,
        indentWithTabs: false,
        theme: "mdview",
        styleActiveLine: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        extraKeys: {
            "Ctrl-S": function () { doSave(); },
            "Cmd-S": function () { doSave(); },
            "Enter": "newlineAndIndentContinueMarkdownList"
        }
    });

    cm.on("change", function () {
        if (suppressChange || currentTabId == null) return;
        var b = buffers[currentTabId];
        if (!b) return;
        b.text = cm.getValue();
        // 与最后一次保存的内容比较：撤销回到原样时自动清除「未保存」标记
        var dirty = b.savedText === null ? true : b.text !== b.savedText;
        if (dirty !== b.dirty) {
            b.dirty = dirty;
            postMessage({ type: "dirty", tabId: currentTabId, dirty: dirty });
        }
        scheduleRender();
        scheduleDraftSync();
    });

    // 编辑/分栏模式下：滚动编辑器 / 移动光标时，目录跟随高亮当前章节
    cm.on("scroll", function () {
        if (viewMode === "split") {
            if (Date.now() < scrollSyncPausedUntil || Date.now() < suppressEditorSyncUntil) return;
            activeDriver = "editor";
            syncPreviewFromEditor();
            scheduleEditorSpy(false);
            return;
        }
        if (viewMode === "edit") {
            activeDriver = "editor";
            scheduleEditorSpy(false);
        }
    });
    cm.on("cursorActivity", function () {
        activeDriver = "editor";
        lastCursorMoveAt = Date.now();
        scheduleEditorSpy(true);
        // 打字机模式：让光标行始终居中
        if (typewriter && viewMode !== "preview") {
            var info = cm.getScrollInfo();
            var y = cm.heightAtLine(cm.getCursor().line, "local");
            followEditorTo(Math.max(0, y - info.clientHeight / 2));
        }
    });

    function postMessage(obj) {
        window.chrome.webview.postMessage(obj);
    }

    /* 编辑时防抖刷新右侧预览（保持预览滚动位置，不跳动） */
    function scheduleRender() {
        if (renderTimer) clearTimeout(renderTimer);
        renderTimer = setTimeout(function () {
            var b = buffers[currentTabId];
            if (!b) return;
            // 编辑器独占视图时预览是隐藏的（scrollTop 恒为 0），此时保留已记录的滚动位置
            var keep = viewMode === "edit" ? (b.previewScroll || 0) : previewPane.scrollTop;
            renderMarkdown(b.text, currentTabId, keep);
        }, 300);
    }

    /* 渲染后处理数学公式：行内/单行 $ 已在解析阶段处理，这里补齐跨行 $$ 与 \(...\) / \[...\] */
    function renderMathInPreview() {
        if (!window.renderMathInElement) return;
        var root = document.getElementById("md-body");
        try {
            window.renderMathInElement(root, {
                delimiters: [
                    { left: "$$", right: "$$", display: true },
                    { left: "\\[", right: "\\]", display: true },
                    { left: "\\(", right: "\\)", display: false }
                ],
                throwOnError: false,
                processEscapes: true,
                ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option"],
                ignoredClasses: ["no-math"]
            });
        } catch (e) {
            console.warn("KaTeX render failed", e);
        }
    }

    function mermaidThemeName() {
        return document.body.classList.contains("theme-dark") ? "dark" : "default";
    }

    function scheduleMermaidRender(force) {
        if (mermaidTimer) clearTimeout(mermaidTimer);
        mermaidTimer = setTimeout(function () {
            mermaidTimer = null;
            renderMermaidDiagrams(force);
        }, 80);
    }

    /* 把 ```mermaid 代码块替换成 Mermaid 图；失败时保留源码并标记错误 */
    function renderMermaidDiagrams(force) {
        if (!window.mermaid) return;
        var root = document.getElementById("md-body");

        var codeBlocks = root.querySelectorAll("pre > code.language-mermaid");
        var mermaidIndex = 0;
        for (var i = 0; i < codeBlocks.length; i++) {
            var code = codeBlocks[i];
            var pre = code.parentNode;
            if (!pre || pre.tagName !== "PRE") continue;
            var source = code.textContent || "";
            var div = document.createElement("div");
            div.className = "mermaid";
            div.setAttribute("data-mermaid-src", source);
            div.setAttribute("data-mermaid-index", String(mermaidIndex++));
            div.textContent = source;
            pre.parentNode.replaceChild(div, pre);
        }

        var nodes = Array.prototype.slice.call(root.querySelectorAll(".mermaid"));
        if (!nodes.length) return;

        try {
            window.mermaid.initialize({
                startOnLoad: false,
                securityLevel: "strict",
                theme: mermaidThemeName(),
                flowchart: { htmlLabels: false, useMaxWidth: true },
                sequence: { useMaxWidth: true },
                gantt: { useMaxWidth: true }
            });
        } catch (e) {
            console.warn("Mermaid initialize failed", e);
        }

        var todo = [];
        nodes.forEach(function (node) {
            if (!force && node.getAttribute("data-processed") === "true") return;
            if (force) {
                var src = node.getAttribute("data-mermaid-src");
                node.removeAttribute("data-processed");
                node.classList.remove("mermaid-error");
                node.textContent = src || node.textContent || "";
            }
            todo.push(node);
        });
        if (!todo.length) return;

        try {
            var result = window.mermaid.run
                ? window.mermaid.run({ nodes: todo, suppressErrors: true })
                : window.mermaid.init(undefined, todo);
            if (result && typeof result.then === "function") {
                result.then(decorateMermaidNodes, function (err) {
                    console.warn("Mermaid render failed", err);
                    todo.forEach(function (node) {
                        if (node.getAttribute("data-processed") !== "true") {
                            node.classList.add("mermaid-error");
                        }
                    });
                    decorateMermaidNodes();
                });
            } else {
                decorateMermaidNodes();
            }
        } catch (e) {
            console.warn("Mermaid render failed", e);
            todo.forEach(function (node) { node.classList.add("mermaid-error"); });
            decorateMermaidNodes();
        }
    }

    /* 在每个图表右上角加“编辑”按钮（Mermaid 渲染会替换内容，需在渲染后重建） */
    function decorateMermaidNodes() {
        var root = document.getElementById("md-body");
        var nodes = root.querySelectorAll(".mermaid");
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if (node.querySelector(".mermaid-edit-btn")) continue;
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "mermaid-edit-btn";
            btn.textContent = "编辑";
            btn.title = "编辑 Mermaid 源码";
            btn.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                var target = e.currentTarget.parentNode;
                openMermaidEditor(target.getAttribute("data-mermaid-index"),
                    target.getAttribute("data-mermaid-src"));
            });
            node.appendChild(btn);
        }
    }

    /* ===================== Mermaid 编辑弹窗 ===================== */
    var MERMAID_TEMPLATE = "flowchart TD\n  A[开始] --> B{条件}\n  B -->|是| C[结束]\n  B -->|否| A\n";

    function openMermaidEditor(index, source) {
        if (!mermaidEditor) return;
        var parsed = (index === null || index === undefined || index === "") ? null : parseInt(index, 10);
        mermaidEditIndex = isNaN(parsed) ? null : parsed;
        mermaidSource.value = (typeof source === "string" && source.trim())
            ? source
            : (mermaidEditIndex === null ? MERMAID_TEMPLATE : "");
        mermaidEditorHint.textContent = mermaidEditIndex === null
            ? "新建图表：Ctrl+Enter 应用 · Esc 取消"
            : "编辑图表 " + (mermaidEditIndex + 1) + "：Ctrl+Enter 应用 · Esc 取消";
        mermaidEditor.hidden = false;
        updateMermaidPreview();
        setTimeout(function () {
            mermaidSource.focus();
            mermaidSource.select();
        }, 30);
    }

    function closeMermaidEditor() {
        if (!mermaidEditor) return;
        mermaidEditor.hidden = true;
        mermaidPreviewSeq++;
        mermaidPreview.innerHTML = "";
        if (mermaidPreviewTimer) {
            clearTimeout(mermaidPreviewTimer);
            mermaidPreviewTimer = null;
        }
        if (viewMode !== "preview") cm.focus();
    }

    function updateMermaidPreview() {
        if (!window.mermaid || !mermaidPreview) return;
        var source = mermaidSource.value.trim();
        if (!source) {
            mermaidPreview.innerHTML = '<div class="mermaid-error">请输入 Mermaid 语法</div>';
            return;
        }
        try {
            window.mermaid.initialize({
                startOnLoad: false,
                securityLevel: "strict",
                theme: mermaidThemeName()
            });
        } catch (e) {
            console.warn("Mermaid preview initialize failed", e);
        }
        var seq = ++mermaidPreviewSeq;
        try {
            var result = window.mermaid.render("mermaid-editor-preview-" + seq, source);
            Promise.resolve(result).then(function (res) {
                if (seq !== mermaidPreviewSeq) return;
                var svg = typeof res === "string" ? res : (res && res.svg);
                mermaidPreview.innerHTML = svg || "";
            }).catch(function (err) {
                if (seq !== mermaidPreviewSeq) return;
                mermaidPreview.innerHTML =
                    '<div class="mermaid-error">' + escapeHtml(String(err && err.message || err)) + "</div>";
            });
        } catch (err) {
            mermaidPreview.innerHTML =
                '<div class="mermaid-error">' + escapeHtml(String(err && err.message || err)) + "</div>";
        }
    }

    /* 按第 N 个 mermaid 代码块替换源码（N 从 0 开始，与渲染顺序一致） */
    function replaceMermaidBlock(index, source) {
        var text = cm.getValue();
        var re = /```mermaid[^\n]*\n([\s\S]*?)```/g;
        var i = 0;
        var m;
        while ((m = re.exec(text)) !== null) {
            if (i === index) {
                var block = "```mermaid\n" + source + "\n```";
                cm.replaceRange(block,
                    cm.posFromIndex(m.index), cm.posFromIndex(re.lastIndex));
                return true;
            }
            i++;
        }
        return false;
    }

    function applyMermaidEditor() {
        var source = mermaidSource.value.trim();
        if (!source) {
            postMessage({ type: "status", text: "Mermaid 源码不能为空" });
            return;
        }
        if (mermaidEditIndex === null) {
            insertTextAtCursor("```mermaid\n" + source + "\n```\n");
        } else if (!replaceMermaidBlock(mermaidEditIndex, source)) {
            postMessage({ type: "status", text: "未找到对应的 mermaid 代码块，可能已被外部修改" });
            return;
        }
        closeMermaidEditor();
    }

    if (mermaidEditor) {
        document.getElementById("mermaid-editor-close").addEventListener("click", closeMermaidEditor);
        document.getElementById("mermaid-editor-cancel").addEventListener("click", closeMermaidEditor);
        document.getElementById("mermaid-editor-apply").addEventListener("click", applyMermaidEditor);
        mermaidSource.addEventListener("input", function () {
            if (mermaidPreviewTimer) clearTimeout(mermaidPreviewTimer);
            mermaidPreviewTimer = setTimeout(updateMermaidPreview, 250);
        });
        mermaidEditor.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closeMermaidEditor();
            } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                applyMermaidEditor();
            }
        });
        mermaidEditor.addEventListener("click", function (e) {
            if (e.target === mermaidEditor) closeMermaidEditor();
        });
    }

    /* 双击图表直接打开源码编辑器 */
    document.getElementById("md-body").addEventListener("dblclick", function (e) {
        if (e.target && e.target.closest && e.target.closest(".mermaid-edit-btn")) return;
        var node = e.target && e.target.closest ? e.target.closest(".mermaid") : null;
        if (!node) return;
        e.preventDefault();
        openMermaidEditor(node.getAttribute("data-mermaid-index"),
            node.getAttribute("data-mermaid-src"));
    });

    /* ===================== 渲染 ===================== */
    function renderMarkdown(source, tabId, restoreScroll, force) {
        // 内容与标签都没变时不重建 DOM（避免打字时整篇重排、滚动跳动）
        var existing = buffers[tabId];
        if (!force && renderedTabId === tabId && existing && existing.renderedText === source) {
            return;
        }
        // 重建前清空代码块缓存，避免长期运行后无上限增长
        codeSnippets = [];
        renderedTabId = tabId;
        if (existing) existing.renderedText = source;

        var tokens = md.parse(source, {});
        var used = Object.create(null);
        var toc = [];
        headingLines = {};
        headingList = [];

        for (var i = 0; i < tokens.length; i++) {
            var t = tokens[i];
            if (t.type === "heading_open") {
                var level = parseInt(t.tag.substring(1), 10);
                var inline = tokens[i + 1];
                var text = inline ? inline.content : "";
                var id = slugify(text, used);
                t.attrSet("id", id);
                var line = t.map ? t.map[0] : 0;
                headingLines[id] = line;
                headingList.push({ id: id, line: line });
                toc.push({ text: text, id: id, level: level });
            }
        }

        var html = md.renderer.render(tokens, md.options, {});
        document.getElementById("md-body").innerHTML = html;

        // 公式静态渲染；Mermaid 图异步渲染（避免每次输入都同步阻塞）
        renderMathInPreview();
        scheduleMermaidRender(false);

        // 重新渲染后旧的查找高亮已随 innerHTML 丢失，重新计算
        findState.previewMarks = [];
        if (findState.open && findState.term) {
            runFind(findState.term, true);
        }

        // 回传目录给 WPF 侧边栏（带上标签 id）
        postMessage({ type: "toc", tabId: tabId, items: toc });

        setupScrollSpy();

        var y = restoreScroll || 0;
        if (viewMode !== "edit") {
            // 渲染后恢复滚动不应触发双向绑定
            scrollSyncPausedUntil = Date.now() + 150;
            previewPane.scrollTop = y;
        }
        if (buffers[tabId]) buffers[tabId].previewScroll = y;

        // 编辑模式下渲染完成后同步一次目录高亮
        if (viewMode === "edit" || (viewMode === "split" && activeDriver === "editor")) {
            scheduleEditorSpy(true);
        } else {
            syncActiveFromPreview();
        }
    }

    /* 供 C# 读取当前预览滚动位置（弹出/合并前调用） */
    window.getScrollY = function () {
        if (viewMode !== "edit") return previewPane.scrollTop;
        var b = currentTabId ? buffers[currentTabId] : null;
        return b ? (b.previewScroll || 0) : previewPane.scrollTop;
    };

    /* 供 C# 读取某个标签的最新编辑文本与脏标记（关闭/另存/弹出/合并前调用） */
    window.getTabState = function (tabId) {
        var b = buffers[tabId];
        if (!b) return JSON.stringify({ text: null, dirty: false });
        if (tabId === currentTabId) b.text = cm.getValue();
        return JSON.stringify({ text: b.text, dirty: b.dirty });
    };

    /* 供 C# 保存会话：文本 + 滚动位置 + 光标 */
    window.getTabSnapshot = function (tabId) {
        var b = buffers[tabId];
        if (!b) {
            return JSON.stringify({
                text: null, dirty: false, previewScroll: 0,
                editorScroll: 0, cursorLine: 0, cursorCh: 0
            });
        }
        var isCurrent = tabId === currentTabId;
        if (isCurrent) b.text = cm.getValue();
        var cursor = isCurrent ? cm.getCursor() : (b.cursor || { line: 0, ch: 0 });
        var info = isCurrent ? cm.getScrollInfo() : null;
        // 当前标签用真实滚动位置（b.previewScroll 只在渲染/切换时更新，会偏旧）
        var previewScroll = isCurrent
            ? (viewMode === "edit" ? (b.previewScroll || 0) : previewPane.scrollTop)
            : (b.previewScroll || 0);
        if (isCurrent && viewMode !== "edit") b.previewScroll = previewScroll;
        return JSON.stringify({
            text: b.text,
            dirty: b.dirty,
            previewScroll: previewScroll,
            editorScroll: info ? info.top : (b.editScroll ? b.editScroll.top : 0),
            cursorLine: cursor.line || 0,
            cursorCh: cursor.ch || 0
        });
    };

    window.getUiState = function () {
        return JSON.stringify({ splitRatio: splitRatio, viewMode: viewMode });
    };

    /* 导出 HTML：把 KaTeX 字体转成 data URI，导出的单文件不依赖外部字体目录 */
    var katexExportCssPromise = null;

    function fetchAsDataUrl(url) {
        return fetch(url).then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.arrayBuffer();
        }).then(function (buf) {
            var bytes = new Uint8Array(buf);
            var binary = "";
            for (var i = 0; i < bytes.length; i += 0x8000) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
            }
            return "data:font/woff2;base64," + btoa(binary);
        });
    }

    function getKatexExportCss() {
        if (katexExportCssPromise) return katexExportCssPromise;
        katexExportCssPromise = fetch("vendor/katex/katex.min.css").then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.text();
        }).then(function (css) {
            var urls = [];
            css.replace(/url\((fonts\/[^)]+?\.woff2)\)/g, function (_, url) {
                if (urls.indexOf(url) < 0) urls.push(url);
                return "url(" + url + ")";
            });
            return Promise.all(urls.map(function (url) {
                return fetchAsDataUrl("vendor/katex/" + url)
                    .then(function (data) { return { url: url, data: data }; })
                    .catch(function () { return null; });
            })).then(function (items) {
                items.forEach(function (item) {
                    if (item) css = css.split("url(" + item.url + ")").join("url(" + item.data + ")");
                });
                return css;
            });
        }).catch(function (e) {
            console.warn("KaTeX CSS export failed", e);
            return "";
        });
        return katexExportCssPromise;
    }

    /* 导出当前预览为独立 HTML（内联样式，文件自带主题） */
    window.buildExportHtml = function (title) {
        return Promise.all([
            fetch("css/style.css").then(function (r) { return r.text(); }),
            fetch("css/code-and-find.css").then(function (r) { return r.text(); }),
            getKatexExportCss()
        ]).then(function (parts) {
            var body = document.getElementById("md-body").cloneNode(true);
            body.querySelectorAll(".copy-code").forEach(function (b) { b.remove(); });
            body.querySelectorAll(".mermaid-edit-btn").forEach(function (b) { b.remove(); });
            body.querySelectorAll("mark.find-hit").forEach(function (m) {
                m.parentNode.replaceChild(document.createTextNode(m.textContent), m);
            });
            var dark = document.body.classList.contains("theme-dark");
            var green = document.body.classList.contains("theme-green");
            var themeClass = dark ? "theme-dark" : green ? "theme-green" : "theme-light";
            var overrides =
                "html,body{height:auto;overflow:auto;margin:0;background:" +
                (dark ? "#1E1E1E" : green ? "#C7EDCC" : "#ffffff") + "}" +
                ".markdown-body{max-width:920px;margin:0 auto;padding:32px 40px 80px}" +
                "#workbench,#editor-pane,#edit-splitter,#preview-pane{display:none!important}" +
                ".markdown-body .mermaid{text-align:center;overflow-x:auto;margin:16px 0}" +
                ".markdown-body .mermaid svg{max-width:100%!important;height:auto}";
            return "<!DOCTYPE html>\n<html lang=\"zh-CN\"><head><meta charset=\"utf-8\"/>" +
                "<title>" + escapeHtml(title || "MarkdownViewer") + "</title><style>\n" +
                parts[0] + "\n" + parts[1] + "\n" + (parts[2] || "") + overrides +
                "\n</style></head><body class=\"" + themeClass + "\">" +
                body.outerHTML + "</body></html>";
        });
    };

    /* 滚动联动：当前可见标题高亮（root 为预览面板） */
    var observer = null;
    var lastActiveId = null;
    function setupScrollSpy() {
        if (observer) { observer.disconnect(); observer = null; }
        lastActiveId = null;
        if (!("IntersectionObserver" in window)) return;

        var headings = document.querySelectorAll("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]");
        if (!headings.length) return;

        var visible = {};
        observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                visible[en.target.id] = en.isIntersecting;
            });
            // 分栏时若最近操作的是编辑器，预览正跟随编辑器，不允许 observer 反向覆盖目录
            if (viewMode === "split" && activeDriver === "editor") return;
            if (Date.now() < previewSpySilentUntil) return;
            for (var i = 0; i < headings.length; i++) {
                if (visible[headings[i].id]) {
                    if (headings[i].id !== lastActiveId) {
                        lastActiveId = headings[i].id;
                        postMessage({ type: "active", id: lastActiveId, tabId: currentTabId });
                    }
                    break;
                }
            }
        }, { root: previewPane, rootMargin: "0px 0px -70% 0px", threshold: 0 });

        headings.forEach(function (h) { observer.observe(h); });
    }

    /* 根据预览当前滚动位置计算并上报活动标题（视图切换/重新渲染后立即生效） */
    function syncActiveFromPreview() {
        if (viewMode === "edit") return;
        if (viewMode === "split" && activeDriver === "editor") return;
        if (Date.now() < previewSpySilentUntil) return;
        var headings = previewPane.querySelectorAll(
            "h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]");
        if (!headings.length) return;

        var paneTop = previewPane.getBoundingClientRect().top + 24;
        var active = null;
        for (var i = 0; i < headings.length; i++) {
            if (headings[i].getBoundingClientRect().top <= paneTop) active = headings[i].id;
            else break;
        }
        if (!active) active = headings[0].id;
        if (active !== lastActiveId) {
            lastActiveId = active;
            postMessage({ type: "active", id: active, tabId: currentTabId });
        }
    }

    function scrollToHeading(id) {
        var line = headingLines[id];
        if (window.__mdview) {
            window.__mdview.lastScrollTo = { id: id, line: line, at: Date.now() };
        }
        if (line === undefined) return;

        // 目录点击是明确导航：先确定高亮，动画期间暂停双向绑定与 observer
        lastActiveId = id;
        activeDriver = "editor";
        previewSpySilentUntil = Date.now() + 900;
        scrollSyncPausedUntil = Date.now() + 900;

        // 编辑器：移动光标并平滑滚动到对应源码行
        if (viewMode !== "preview" && currentTabId && buffers[currentTabId]) {
            var beforeTop = cm.getScrollInfo().top;
            cm.setCursor({ line: line, ch: 0 });
            // setCursor 可能自动把光标滚入视口，先恢复，交给动画完成，避免瞬跳
            if (Math.abs(cm.getScrollInfo().top - beforeTop) > 1) {
                cm.scrollTo(null, beforeTop);
            }
            if (viewMode === "edit") cm.focus();
            followEditorTo(Math.max(0, cm.heightAtLine(line, "local") - 8));
        }
        if (viewMode === "edit") return; // 预览隐藏，无需滚动 DOM

        // 预览：平滑滚动到目标标题
        var el = document.getElementById(id);
        if (!el) return;
        var paneTop = previewPane.getBoundingClientRect().top;
        var offset = el.getBoundingClientRect().top - paneTop + previewPane.scrollTop;
        followPreviewTo(Math.max(0, offset - 16));
    }

    /* 编辑 / 分栏模式：把编辑器位置换算成当前章节，回传 C# 高亮目录（分栏时同步预览） */
    var editorSpyTimer = null;
    var editorSpyUseCursor = false;
    var lastCursorMoveAt = 0;

    function editorSyncEnabled() {
        return viewMode === "edit" || viewMode === "split";
    }

    function scheduleEditorSpy(useCursor) {
        if (!editorSyncEnabled()) return;
        editorSpyUseCursor = useCursor;
        if (editorSpyTimer) clearTimeout(editorSpyTimer);
        editorSpyTimer = setTimeout(updateActiveFromEditor, 100);
    }

    function updateActiveFromEditor() {
        editorSpyTimer = null;
        if (!editorSyncEnabled() || !headingList.length) return;

        // 光标移动优先：setCursor 往往伴随一次滚动事件，不能让它覆盖光标所在章节
        var useCursor = editorSpyUseCursor || (Date.now() - lastCursorMoveAt < 250);
        var line;
        if (useCursor) {
            line = cm.getCursor().line;
        } else {
            line = cm.lineAtHeight(cm.getScrollInfo().top, "local");
        }

        // 找到位于该行之前（含）的最后一个标题
        var active = null;
        for (var i = 0; i < headingList.length; i++) {
            if (headingList[i].line <= line) active = headingList[i];
            else break;
        }
        if (active && active.id !== lastActiveId) {
            lastActiveId = active.id;
            postMessage({ type: "active", id: active.id, tabId: currentTabId });
        }
    }

    /* ===================== 分栏双向平滑滚动绑定 ===================== */
    function maxEditorScroll() {
        var i = cm.getScrollInfo();
        return Math.max(0, i.height - i.clientHeight);
    }

    function maxPreviewScroll() {
        return Math.max(0, previewPane.scrollHeight - previewPane.clientHeight);
    }

    /* 预览平滑跟随目标位置（指数逼近，连续滚动不卡顿） */
    function followPreviewTo(target) {
        previewFollowTarget = target;
        if (previewFollowRaf) return;
        var step = function () {
            var max = maxPreviewScroll();
            var t = Math.max(0, Math.min(max, previewFollowTarget));
            var cur = previewPane.scrollTop;
            var diff = t - cur;
            suppressPreviewSyncUntil = Date.now() + 120; // 忽略自身产生的 scroll 事件
            if (Math.abs(diff) < 1) {
                previewPane.scrollTop = t;
                suppressPreviewSyncUntil = Date.now() + 80;
                previewFollowRaf = 0;
                return;
            }
            previewPane.scrollTop = cur + diff * 0.3;
            previewFollowRaf = requestAnimationFrame(step);
        };
        previewFollowRaf = requestAnimationFrame(step);
    }

    /* 编辑器平滑跟随目标位置 */
    function followEditorTo(target) {
        editorFollowTarget = target;
        if (editorFollowRaf) return;
        var step = function () {
            var max = maxEditorScroll();
            var t = Math.max(0, Math.min(max, editorFollowTarget));
            var cur = cm.getScrollInfo().top;
            var diff = t - cur;
            suppressEditorSyncUntil = Date.now() + 120;
            if (Math.abs(diff) < 1) {
                cm.scrollTo(null, t);
                suppressEditorSyncUntil = Date.now() + 80;
                editorFollowRaf = 0;
                return;
            }
            cm.scrollTo(null, cur + diff * 0.3);
            editorFollowRaf = requestAnimationFrame(step);
        };
        editorFollowRaf = requestAnimationFrame(step);
    }

    function cancelPreviewFollow() {
        if (previewFollowRaf) {
            cancelAnimationFrame(previewFollowRaf);
            previewFollowRaf = 0;
        }
        suppressPreviewSyncUntil = 0;
    }

    function cancelEditorFollow() {
        if (editorFollowRaf) {
            cancelAnimationFrame(editorFollowRaf);
            editorFollowRaf = 0;
        }
        suppressEditorSyncUntil = 0;
    }

    /* 编辑器滚动 -> 预览按比例平滑跟随 */
    function syncPreviewFromEditor() {
        var emax = maxEditorScroll();
        var pmax = maxPreviewScroll();
        if (emax <= 0 || pmax <= 0) return;
        var ratio = Math.min(1, Math.max(0, cm.getScrollInfo().top / emax));
        followPreviewTo(ratio * pmax);
    }

    /* 预览滚动 -> 编辑器按比例平滑跟随 */
    function syncEditorFromPreview() {
        var emax = maxEditorScroll();
        var pmax = maxPreviewScroll();
        if (emax <= 0 || pmax <= 0) return;
        var ratio = Math.min(1, Math.max(0, previewPane.scrollTop / pmax));
        followEditorTo(ratio * emax);
    }

    /* ===================== 预览区链接点击 ===================== */
    // 页内锚点：自行滚动，避免 WebView 把整个页面重新导航（导致状态丢失）
    // 相对路径链接：交给 C# 判断是否为本地文件（例如另一个 .md 文档）
    document.getElementById("md-body").addEventListener("click", function (e) {
        var el = e.target;
        while (el && el !== this && el.tagName !== "A") el = el.parentNode;
        if (!el || el === this || el.tagName !== "A") return;

        var href = el.getAttribute("href") || "";
        if (!href) return;

        if (href.charAt(0) === "#") {
            e.preventDefault();
            var anchor = href.substring(1);
            try { anchor = decodeURIComponent(anchor); } catch (err) { /* 保持原样 */ }
            var target = document.getElementById(anchor) ||
                document.getElementById(href.substring(1));
            if (target) {
                // 与目录点击保持一致：平滑滚动，并把目录高亮同步到目标章节
                lastActiveId = target.id;
                previewSpySilentUntil = Date.now() + 600;
                var paneTop = previewPane.getBoundingClientRect().top;
                var offset = target.getBoundingClientRect().top - paneTop + previewPane.scrollTop;
                followPreviewTo(Math.max(0, offset - 16));
                postMessage({ type: "active", id: target.id, tabId: currentTabId });
            }
            return;
        }

        // 带协议的链接（http/mailto 等）已由 target=_blank 交给 C# 用系统浏览器打开
        if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return;

        e.preventDefault();
        postMessage({ type: "openLink", tabId: currentTabId, href: href });
    });

    /* ===================== 查找 / 替换 ===================== */
    var findBar = document.getElementById("find-bar");
    var findInput = document.getElementById("find-input");
    var replaceInput = document.getElementById("replace-input");
    var findCount = document.getElementById("find-count");
    var findSep = findBar.querySelector(".find-sep");
    var replaceOneBtn = document.getElementById("replace-one");
    var replaceAllBtn = document.getElementById("replace-all");
    var MAX_FIND = 5000;
    var MAX_MARKS = 2000;

    var findState = {
        open: false,
        term: "",
        matches: [],       // [{ from, to }] 源码索引
        index: -1,
        editorMarks: [],
        previewMarks: []
    };

    function openFindBar(mode) {
        findBar.hidden = false;
        findState.open = true;
        var replaceMode = mode === "replace";
        var display = replaceMode ? "" : "none";
        replaceInput.style.display = display;
        replaceOneBtn.style.display = display;
        replaceAllBtn.style.display = display;
        findSep.style.display = display;
        findInput.focus();
        findInput.select();
        if (findInput.value) runFind(findInput.value, true);
    }

    function closeFindBar() {
        findBar.hidden = true;
        findState.open = false;
        findState.matches = [];
        findState.index = -1;
        findCount.textContent = "0/0";
        clearEditorMarks();
        clearPreviewMarks();
        if (viewMode !== "preview") cm.focus();
    }

    function clearEditorMarks() {
        findState.editorMarks.forEach(function (m) {
            try { m.clear(); } catch (e) { /* 文档已变化时忽略 */ }
        });
        findState.editorMarks = [];
    }

    function clearPreviewMarks() {
        var marks = document.querySelectorAll("#md-body mark.find-hit");
        for (var i = 0; i < marks.length; i++) {
            var mark = marks[i];
            var parent = mark.parentNode;
            if (!parent) continue;
            while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
            parent.removeChild(mark);
            parent.normalize();
        }
        findState.previewMarks = [];
    }

    function collectMatches(term, limit) {
        var result = [];
        if (!term) return result;
        var max = limit || MAX_FIND;
        var text = cm.getValue();
        var lower = text.toLowerCase();
        var needle = term.toLowerCase();
        var at = 0;
        while (result.length < max) {
            var idx = lower.indexOf(needle, at);
            if (idx < 0) break;
            result.push({ from: idx, to: idx + term.length });
            at = idx + Math.max(1, term.length);
        }
        return result;
    }

    function paintEditorMarks() {
        clearEditorMarks();
        var max = Math.min(findState.matches.length, MAX_MARKS);
        for (var i = 0; i < max; i++) {
            var m = findState.matches[i];
            var cls = i === findState.index ? "find-hit find-hit-current" : "find-hit";
            findState.editorMarks.push(cm.markText(
                cm.posFromIndex(m.from), cm.posFromIndex(m.to), { className: cls }));
        }
    }

    function paintPreviewMarks(term) {
        clearPreviewMarks();
        if (!term || viewMode === "edit") return;

        var root = document.getElementById("md-body");
        var needle = term.toLowerCase();
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                var value = node.nodeValue;
                if (!value || value.toLowerCase().indexOf(needle) < 0) return NodeFilter.FILTER_REJECT;
                var parent = node.parentNode;
                if (!parent) return NodeFilter.FILTER_REJECT;
                var tag = parent.nodeName;
                if (tag === "SCRIPT" || tag === "STYLE" || tag === "BUTTON") return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        var nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);

        nodes.forEach(function (node) {
            if (findState.previewMarks.length >= MAX_MARKS) return;
            var text = node.nodeValue;
            var lower = text.toLowerCase();
            var frag = document.createDocumentFragment();
            var pos = 0;
            var at;
            while ((at = lower.indexOf(needle, pos)) >= 0) {
                if (findState.previewMarks.length >= MAX_MARKS) break;
                if (at > pos) frag.appendChild(document.createTextNode(text.slice(pos, at)));
                var mark = document.createElement("mark");
                mark.className = "find-hit";
                mark.textContent = text.slice(at, at + term.length);
                frag.appendChild(mark);
                findState.previewMarks.push(mark);
                pos = at + term.length;
            }
            if (!frag.childNodes.length) return;
            if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
            node.parentNode.replaceChild(frag, node);
        });
    }

    function markCurrentPreview() {
        findState.previewMarks.forEach(function (m) { m.classList.remove("find-hit-current"); });
        var current = findState.previewMarks[findState.index];
        if (current) current.classList.add("find-hit-current");
    }

    function updateFindCount() {
        var total = findState.matches.length;
        var suffix = total >= MAX_FIND ? "+" : "";
        findCount.textContent = total
            ? (findState.index + 1) + "/" + total + suffix
            : "0/0";
    }

    function scrollToMatch() {
        var match = findState.matches[findState.index];
        if (!match) return;

        if (viewMode !== "preview") {
            var pos = cm.posFromIndex(match.from);
            cm.scrollIntoView({ line: pos.line, ch: pos.ch }, 120);
        }
        if (viewMode !== "edit" && findState.previewMarks.length) {
            var mark = findState.previewMarks[
                Math.min(findState.index, findState.previewMarks.length - 1)];
            if (mark) {
                var paneTop = previewPane.getBoundingClientRect().top;
                var offset = mark.getBoundingClientRect().top - paneTop + previewPane.scrollTop;
                followPreviewTo(Math.max(0, offset - previewPane.clientHeight * 0.3));
            }
        }
        markCurrentPreview();
    }

    function runFind(term, keepIndex) {
        findState.term = term || "";
        var previous = findState.index;
        findState.matches = collectMatches(findState.term);
        if (!findState.matches.length) {
            findState.index = -1;
        } else if (keepIndex) {
            findState.index = Math.min(Math.max(previous, 0), findState.matches.length - 1);
        } else {
            findState.index = 0;
        }
        paintEditorMarks();
        paintPreviewMarks(findState.term);
        updateFindCount();
        if (findState.index >= 0) scrollToMatch();
    }

    function findNext(delta) {
        if (!findState.matches.length) {
            if (findInput.value) runFind(findInput.value, false);
            return;
        }
        var n = findState.matches.length;
        findState.index = ((findState.index + delta) % n + n) % n;
        paintEditorMarks();
        updateFindCount();
        scrollToMatch();
    }

    function replaceCurrent() {
        var match = findState.matches[findState.index];
        if (!match) return;
        cm.replaceRange(replaceInput.value,
            cm.posFromIndex(match.from), cm.posFromIndex(match.to));
        runFind(findInput.value, true);
    }

    function replaceAll() {
        if (!findState.term) return;
        // 替换全部不被高亮上限截断（上限 100000 仅作防爆）
        var all = collectMatches(findState.term, 100000);
        if (!all.length) return;
        var replacement = replaceInput.value;
        cm.operation(function () {
            for (var i = all.length - 1; i >= 0; i--) {
                var m = all[i];
                cm.replaceRange(replacement,
                    cm.posFromIndex(m.from), cm.posFromIndex(m.to), "+replaceAll");
            }
        });
        postMessage({ type: "status", text: "已替换 " + all.length + " 处" });
        runFind(findInput.value, false);
    }

    findInput.addEventListener("input", function () {
        if (findInputTimer) clearTimeout(findInputTimer);
        findInputTimer = setTimeout(function () { runFind(findInput.value, false); }, 150);
    });
    findInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            e.preventDefault();
            findNext(e.shiftKey ? -1 : 1);
        } else if (e.key === "Escape") {
            e.preventDefault();
            closeFindBar();
        }
    });
    replaceInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            e.preventDefault();
            replaceCurrent();
        } else if (e.key === "Escape") {
            e.preventDefault();
            closeFindBar();
        }
    });
    document.getElementById("find-next").addEventListener("click", function () { findNext(1); });
    document.getElementById("find-prev").addEventListener("click", function () { findNext(-1); });
    replaceOneBtn.addEventListener("click", replaceCurrent);
    replaceAllBtn.addEventListener("click", replaceAll);
    document.getElementById("find-close").addEventListener("click", closeFindBar);

    /* ===================== 图片灯箱 / 代码复制 ===================== */
    var lightbox = document.getElementById("lightbox");
    var lightboxImg = document.getElementById("lightbox-img");

    function copyText(text, button) {
        function done() {
            var old = button.textContent;
            button.textContent = "已复制";
            setTimeout(function () { button.textContent = old; }, 1200);
        }
        function fallback() {
            var area = document.createElement("textarea");
            area.value = text;
            area.style.position = "fixed";
            area.style.opacity = "0";
            document.body.appendChild(area);
            area.select();
            try { document.execCommand("copy"); done(); } catch (e) { /* 忽略 */ }
            document.body.removeChild(area);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, fallback);
        } else {
            fallback();
        }
    }

    document.getElementById("md-body").addEventListener("click", function (e) {
        var target = e.target;
        if (!target) return;

        var button = target.closest ? target.closest(".copy-code") : null;
        if (button) {
            var idx = parseInt(button.getAttribute("data-code"), 10);
            copyText(codeSnippets[idx] || "", button);
            return;
        }
        if (target.tagName === "IMG" && !(target.closest && target.closest("a"))) {
            lightboxImg.src = target.src;
            lightbox.hidden = false;
        }
    });

    lightbox.addEventListener("click", function () {
        lightbox.hidden = true;
        lightboxImg.src = "";
    });

    /* ===================== 粘贴 / 拖拽图片 ===================== */
    function sendImageFile(file) {
        if (!file || !/^image\//.test(file.type || "")) return;
        if (file.size > 15 * 1024 * 1024) {
            postMessage({ type: "status", text: "图片超过 15MB，已取消插入" });
            return;
        }
        if (currentTabId == null) return;
        var reader = new FileReader();
        reader.onload = function () {
            postMessage({ type: "saveImage", tabId: currentTabId, dataUrl: reader.result });
        };
        reader.readAsDataURL(file);
    }

    cm.getWrapperElement().addEventListener("paste", function (e) {
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
            if (items[i].type && items[i].type.indexOf("image/") === 0) {
                e.preventDefault();
                e.stopPropagation();
                sendImageFile(items[i].getAsFile());
                return;
            }
        }
    }, true);

    function onImageDrop(e) {
        var files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        if (files[0].type && files[0].type.indexOf("image/") === 0) {
            e.preventDefault();
            e.stopPropagation();
            sendImageFile(files[0]);
        }
    }

    function onImageDragOver(e) {
        if (!e.dataTransfer) return;
        var types = e.dataTransfer.types;
        if (types && Array.prototype.indexOf.call(types, "Files") >= 0) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        }
    }

    [editorPane, previewPane].forEach(function (pane) {
        pane.addEventListener("dragover", onImageDragOver);
        pane.addEventListener("drop", onImageDrop);
    });

    /* ===================== Ctrl+滚轮 缩放 ===================== */
    function onZoomWheel(e) {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        postMessage({ type: "zoom", delta: e.deltaY < 0 ? 0.1 : -0.1 });
    }
    previewPane.addEventListener("wheel", onZoomWheel, { passive: false });
    cm.getWrapperElement().addEventListener("wheel", onZoomWheel, { passive: false });

    /* ===================== 保存 ===================== */
    function doSave() {
        if (currentTabId == null) return;
        var b = buffers[currentTabId];
        if (!b) return;
        b.text = cm.getValue();
        postMessage({ type: "save", tabId: currentTabId, text: b.text });
    }

    /* ===================== 视图切换 ===================== */
    var splitRatio = 0.5;   // 分栏时编辑区占比（拖动分隔条后保持）
    var typewriter = false; // 打字机模式：光标行居中

    function applySplitWidth() {
        if (viewMode !== "split") return;
        var total = workbench.getBoundingClientRect().width;
        if (total <= 0) return;
        var w = Math.round(total * splitRatio);
        editorPane.style.width = w + "px";
    }

    function setView(mode) {
        var previousActive = lastActiveId;   // 切换前所在的章节
        var wasEdit = viewMode === "edit";
        viewMode = mode || "preview";
        workbench.className = "view-" + viewMode;
        applySplitWidth();
        lastActiveId = null; // 视图切换后由新的驱动方重新上报高亮
        previewSpySilentUntil = 0;
        scrollSyncPausedUntil = Date.now() + 250;
        activeDriver = viewMode === "edit" ? "editor" : "preview";

        if (viewMode !== "edit") {
            var b = currentTabId ? buffers[currentTabId] : null;
            var target = (wasEdit && previousActive) ? document.getElementById(previousActive) : null;
            if (target) {
                // 从编辑视图返回：预览对齐到编辑器当前所在的章节
                var paneTop = previewPane.getBoundingClientRect().top;
                var offset = target.getBoundingClientRect().top - paneTop + previewPane.scrollTop;
                previewPane.scrollTop = Math.max(0, offset - 16);
                if (b) b.previewScroll = previewPane.scrollTop;
            } else if (b) {
                // 回到可见预览时恢复之前记录的滚动位置
                previewPane.scrollTop = b.previewScroll || 0;
            }
        }

        if (viewMode !== "preview") {
            // 编辑器从隐藏变为可见后需要重新测量尺寸（两帧后各刷新一次更稳妥）
            cm.refresh();
            requestAnimationFrame(function () { cm.refresh(); });
            setTimeout(function () { cm.refresh(); cm.focus(); }, 80);
        }

        if (viewMode === "edit") {
            // 从预览/分栏切到编辑时，让编辑器对齐当前目录章节
            var activeLine = (!wasEdit && previousActive) ? headingLines[previousActive] : undefined;
            if (activeLine !== undefined) {
                cm.setCursor({ line: activeLine, ch: 0 });
                cm.scrollIntoView({ line: activeLine, ch: 0 }, 60);
            }
            scheduleEditorSpy(true);
        } else {
            if (viewMode === "split" && !wasEdit) {
                // 从预览进入分栏：编辑器按预览位置对齐，保证两侧初始同步
                var emax = maxEditorScroll();
                var pmax = maxPreviewScroll();
                if (emax > 0 && pmax > 0) {
                    var ratio = Math.min(1, Math.max(0, previewPane.scrollTop / pmax));
                    suppressEditorSyncUntil = Date.now() + 200;
                    cm.scrollTo(null, ratio * emax);
                }
            }
            // 返回预览/分栏：按当前预览位置立即刷新目录高亮
            syncActiveFromPreview();
        }
    }

    /* 分栏分隔条拖动 / 双击复位 */
    (function () {
        var splitter = document.getElementById("edit-splitter");
        splitter.addEventListener("mousedown", function (e) {
            e.preventDefault();
            var startX = e.clientX;
            var startW = editorPane.getBoundingClientRect().width;
            var total = workbench.getBoundingClientRect().width;
            var min = Math.min(220, Math.round(total * 0.4));
            document.body.classList.add("splitter-dragging");
            function onMove(ev) {
                var w = Math.max(min, Math.min(total - min - 5, startW + (ev.clientX - startX)));
                editorPane.style.width = w + "px";
                if (total > 0) splitRatio = w / total;
            }
            function onUp() {
                document.body.classList.remove("splitter-dragging");
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
                setTimeout(function () { cm.refresh(); }, 0);
            }
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        });
        splitter.addEventListener("dblclick", function () {
            splitRatio = 0.5;
            applySplitWidth();
            cm.refresh();
        });
        window.addEventListener("resize", function () {
            if (viewMode === "split") applySplitWidth();
            if (viewMode !== "preview") cm.refresh();
        });
    })();

    /* ===================== 主题 ===================== */
    function applyTheme(mode) {
        var body = document.body;
        body.classList.remove("theme-light", "theme-green", "theme-dark");
        body.classList.add("theme-" + (mode || "light"));
        // 让滚动条、表单控件等原生部件也跟随深色
        document.documentElement.style.colorScheme = mode === "dark" ? "dark" : "light";
        // CodeMirror 主题：基础 mdview + 配色后缀
        var suffix = mode === "dark" ? "dark" : mode === "green" ? "green" : "";
        cm.setOption("theme", suffix ? "mdview " + suffix : "mdview");
        // Mermaid 的明暗主题在初始化时决定，主题切换后需要重绘
        scheduleMermaidRender(true);
    }

    function switchToBuffer(b) {
        suppressChange = true;
        if (!b.doc) b.doc = CodeMirror.Doc(b.text || "", "gfm");
        if (cm.getDoc() !== b.doc) cm.swapDoc(b.doc);
        suppressChange = false;
    }

    /* 定期把当前编辑内容同步给宿主，供崩溃/内核重启后恢复 */
    function scheduleDraftSync() {
        if (draftTimer) clearTimeout(draftTimer);
        draftTimer = setTimeout(function () {
            if (currentTabId == null) return;
            var b = buffers[currentTabId];
            if (b) postMessage({ type: "draft", tabId: currentTabId, text: b.text });
        }, 1500);
    }

    /* 调试 / 自动化测试接口（CDP 冒烟测试使用，不影响正常功能） */
    window.__mdview = {
        cm: cm,
        setView: setView,
        applyTheme: applyTheme,
        scrollTo: scrollToHeading,
        active: function () { return lastActiveId; },
        headings: function () { return headingList.slice(); },
        driver: function () { return activeDriver; },
        spy: function () {
            return {
                useCursor: editorSpyUseCursor,
                cursorAgo: lastCursorMoveAt ? Date.now() - lastCursorMoveAt : -1
            };
        },
        getState: function () {
            var b = currentTabId ? buffers[currentTabId] : null;
            return {
                tabId: currentTabId,
                viewMode: viewMode,
                dirty: b ? b.dirty : false,
                tabs: Object.keys(buffers),
                text: b ? b.text : null
            };
        },
        save: doSave
    };

    /* ===================== 设置 / 插入 / 跳转 ===================== */
    function applySettings(data) {
        if (typeof data.zoom === "number" && isFinite(data.zoom)) {
            var z = Math.min(2.5, Math.max(0.6, data.zoom));
            var root = document.documentElement;
            root.style.setProperty("--preview-font-size", (16 * z).toFixed(2) + "px");
            root.style.setProperty("--editor-font-size", (14.5 * z).toFixed(2) + "px");
            // 连续滚轮缩放时合并 refresh，避免每次像素变化都重排
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = setTimeout(function () {
                try { cm.refresh(); } catch (e) { /* 尚未初始化时忽略 */ }
            }, 150);
        }
        if (typeof data.splitRatio === "number") {
            splitRatio = Math.min(0.85, Math.max(0.15, data.splitRatio));
            applySplitWidth();
        }
        if (typeof data.typewriter === "boolean") {
            typewriter = data.typewriter;
        }
    }

    function insertTextAtCursor(text, tabId) {
        if (!text) return;
        if (tabId && tabId !== currentTabId) {
            if (!pendingInserts[tabId]) pendingInserts[tabId] = [];
            pendingInserts[tabId].push(text);
            return;
        }
        if (currentTabId == null) return;
        cm.replaceSelection(text, "end");
        cm.focus();
    }

    function gotoLine(line, ch) {
        if (currentTabId == null) return;
        var last = cm.lineCount() - 1;
        var target = Math.max(0, Math.min(last, line || 0));
        cm.setCursor({ line: target, ch: ch || 0 });
        if (viewMode === "preview") setView("split");
        cm.scrollIntoView({ line: target, ch: ch || 0 }, 120);
        cm.focus();
    }

    /* ===================== C# -> JS 消息 ===================== */
    window.chrome.webview.addEventListener("message", function (ev) {
        var data = ev.data;
        if (!data || typeof data !== "object") return;

        if (data.type === "load") {
            var keepPreview = 0;
            // 记录旧标签的滚动位置（编辑独占视图时预览隐藏，保留原记录）
            if (currentTabId && buffers[currentTabId]) {
                buffers[currentTabId].editScroll = cm.getScrollInfo();
                buffers[currentTabId].cursor = cm.getCursor();
                if (viewMode !== "edit") {
                    buffers[currentTabId].previewScroll = previewPane.scrollTop;
                }
                keepPreview = buffers[currentTabId].previewScroll || 0;
            }

            currentTabId = data.tabId || null;
            // 新文档加载后由预览位置决定目录高亮（分栏/预览模式）
            activeDriver = viewMode === "edit" ? "editor" : "preview";
            previewSpySilentUntil = 0;
            scrollSyncPausedUntil = Date.now() + 300;

            // reset=true：重新加载/另存为，丢弃旧缓冲区
            if (currentTabId && data.reset) delete buffers[currentTabId];

            if (currentTabId && !buffers[currentTabId]) {
                var initialText = data.text || "";
                buffers[currentTabId] = {
                    text: initialText,
                    dirty: !!data.dirty,
                    // 无脏标记时，刚加载的内容就是「已保存基线」
                    savedText: data.dirty ? null : initialText,
                    // 每个标签独立 Doc：切换标签时用 swapDoc，撤销历史不会丢
                    doc: CodeMirror.Doc(initialText, "gfm"),
                    editScroll: null,
                    cursor: null,
                    // reset（重新加载/另存为）时保留当前滚动；首次打开时用宿主传入的会话位置
                    previewScroll: data.reset
                        ? (keepPreview || data.initialScroll || 0)
                        : (data.initialScroll || 0)
                };
            } else if (currentTabId && data.editText !== undefined && data.editText !== null) {
                // 跨窗口带来的编辑内容：同步到该标签的 Doc
                var eb = buffers[currentTabId];
                eb.text = data.editText;
                eb.dirty = !!data.dirty;
                eb.savedText = data.dirty ? null : data.editText;
                suppressChange = true;
                if (eb.doc) eb.doc.setValue(data.editText);
                else eb.doc = CodeMirror.Doc(data.editText, "gfm");
                suppressChange = false;
            }

            var b = currentTabId ? buffers[currentTabId] : null;
            if (b) {
                switchToBuffer(b);
                renderMarkdown(b.text, currentTabId, b.previewScroll || 0);
                if (typeof data.cursorLine === "number" && data.cursorLine >= 0) {
                    var line = Math.min(data.cursorLine, Math.max(0, cm.lineCount() - 1));
                    var ch = typeof data.cursorCh === "number" ? data.cursorCh : 0;
                    cm.setCursor({ line: line, ch: Math.max(0, ch) });
                } else if (b.cursor) {
                    cm.setCursor(b.cursor);
                }
                if (typeof data.editorScroll === "number" && data.editorScroll > 0) {
                    cm.scrollTo(null, data.editorScroll);
                } else if (b.editScroll) {
                    cm.scrollTo(b.editScroll.left, b.editScroll.top);
                }
                // 应用在该标签加载前排队等待插入的内容（例如粘贴图片）
                if (pendingInserts[currentTabId]) {
                    var pending = pendingInserts[currentTabId];
                    delete pendingInserts[currentTabId];
                    pending.forEach(function (text) { cm.replaceSelection(text, "end"); });
                }
            }
        } else if (data.type === "settings") {
            applySettings(data);
        } else if (data.type === "find") {
            if (data.mode === "next") findNext(1);
            else openFindBar(data.mode === "replace" ? "replace" : "find");
        } else if (data.type === "insert") {
            insertTextAtCursor(data.text || "", data.tabId);
        } else if (data.type === "gotoLine") {
            gotoLine(data.line || 0, data.ch || 0);
        } else if (data.type === "scrollTo") {
            scrollToHeading(data.id);
        } else if (data.type === "theme") {
            applyTheme(data.mode);
        } else if (data.type === "view") {
            setView(data.mode);
        } else if (data.type === "mermaidEditor") {
            openMermaidEditor(null, data.source || null);
        } else if (data.type === "saved") {
            // 保存成功：以“实际写入磁盘的文本”作为新基线；保存期间新增的编辑仍保持未保存状态
            var sb = buffers[data.tabId];
            if (sb) {
                if (typeof data.text === "string") {
                    sb.savedText = data.text;
                    var stillDirty = sb.text !== data.text;
                    if (stillDirty !== sb.dirty) {
                        sb.dirty = stillDirty;
                        postMessage({ type: "dirty", tabId: data.tabId, dirty: stillDirty });
                    }
                } else {
                    sb.savedText = sb.text;
                    sb.dirty = false;
                }
            }
        } else if (data.type === "dropTab") {
            // 标签已关闭/已移交给其他窗口：释放缓冲区，避免内存泄漏
            if (data.tabId) {
                delete buffers[data.tabId];
                delete pendingInserts[data.tabId];
            }
        } else if (data.type === "reloadImages") {
            // 另存为后文件目录变了：强制重建预览，让相对图片重新请求
            var rb = currentTabId ? buffers[currentTabId] : null;
            if (rb) renderMarkdown(rb.text, currentTabId, previewPane.scrollTop, true);
        } else if (data.type === "focusEditor") {
            cm.focus();
        }
    });

    // 分栏模式双向滚动绑定：预览滚动驱动编辑器跟随
    previewPane.addEventListener("scroll", function () {
        if (viewMode !== "split") return;
        if (Date.now() < scrollSyncPausedUntil || Date.now() < suppressPreviewSyncUntil) return;
        activeDriver = "preview";
        syncEditorFromPreview();
    }, { passive: true });

    // 用户主动操作某一侧时：取消该侧的跟随动画，并由该侧驱动
    function onPreviewUserScroll() {
        activeDriver = "preview";
        cancelPreviewFollow();
    }
    previewPane.addEventListener("wheel", onPreviewUserScroll, { passive: true });
    previewPane.addEventListener("mousedown", onPreviewUserScroll);
    previewPane.addEventListener("touchstart", onPreviewUserScroll, { passive: true });

    var cmWrapper = cm.getWrapperElement();
    function onEditorUserScroll() {
        activeDriver = "editor";
        cancelEditorFollow();
    }
    cmWrapper.addEventListener("wheel", onEditorUserScroll, { passive: true });
    cmWrapper.addEventListener("mousedown", onEditorUserScroll);
    cmWrapper.addEventListener("touchstart", onEditorUserScroll, { passive: true });
    cmWrapper.addEventListener("keydown", onEditorUserScroll);

    // 焦点不在 CodeMirror 中时（如点击预览/目录）也能用 Ctrl+S 保存
    // Ctrl+W 关闭当前标签；Ctrl+Tab / Ctrl+Shift+Tab 切换标签
    window.addEventListener("keydown", function (e) {
        if (mermaidEditor && !mermaidEditor.hidden) return; // 图表弹窗自行处理 Esc/Ctrl+Enter
        if (e.key === "F5") {
            e.preventDefault();
            postMessage({ type: "reload" });
            return;
        }
        if (e.key === "F11") {
            e.preventDefault();
            postMessage({ type: "fullscreen" });
            return;
        }
        if (e.key === "F3") {
            e.preventDefault();
            findNext(e.shiftKey ? -1 : 1);
            return;
        }
        if (e.key === "Escape") {
            if (!lightbox.hidden) {
                lightbox.hidden = true;
                lightboxImg.src = "";
                return;
            }
            if (findState.open) {
                closeFindBar();
                return;
            }
        }

        if (!(e.ctrlKey || e.metaKey)) return;
        var t = e.target;
        var inEditor = !!(t && t.closest && t.closest(".CodeMirror"));

        if (e.shiftKey && (e.key === "s" || e.key === "S")) {
            e.preventDefault();
            postMessage({ type: "saveAs" });
            return;
        }
        if (e.shiftKey && (e.key === "f" || e.key === "F")) {
            e.preventDefault();
            postMessage({ type: "searchFolder" });
            return;
        }
        if (e.key === "o" || e.key === "O") {
            e.preventDefault();
            postMessage({ type: "openFile" });
            return;
        }

        if (e.key === "s" || e.key === "S") {
            if (inEditor) return; // 编辑器内已处理
            e.preventDefault();
            doSave();
            return;
        }
        if (e.key === "n" || e.key === "N") {
            e.preventDefault();
            postMessage({ type: "newTab" });
            return;
        }
        if (e.key === "w" || e.key === "W") {
            e.preventDefault();
            postMessage({ type: "closeTab", tabId: currentTabId });
            return;
        }
        if (e.key === "f" || e.key === "F") {
            e.preventDefault();
            openFindBar("find");
            return;
        }
        if (e.key === "h" || e.key === "H") {
            e.preventDefault();
            openFindBar("replace");
            return;
        }
        if (e.key === "=" || e.key === "+") {
            e.preventDefault();
            postMessage({ type: "zoom", delta: 0.1 });
            return;
        }
        if (e.key === "-") {
            e.preventDefault();
            postMessage({ type: "zoom", delta: -0.1 });
            return;
        }
        if (e.key === "0") {
            e.preventDefault();
            postMessage({ type: "zoom", absolute: 1.0 });
            return;
        }
        if (e.key === "p" || e.key === "P") {
            e.preventDefault();
            postMessage({ type: "print" });
            return;
        }
        if (e.key === "Tab") {
            e.preventDefault();
            postMessage({ type: "switchTab", delta: e.shiftKey ? -1 : 1 });
        }
    });
})();
