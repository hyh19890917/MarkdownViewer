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
    var mermaidVisualPane = document.getElementById("mermaid-visual-pane");
    var mermaidSourcePane = document.getElementById("mermaid-source-pane");
    var mermaidTabVisual = document.getElementById("mermaid-tab-visual");
    var mermaidTabSource = document.getElementById("mermaid-tab-source");
    var mermaidCanvas = document.getElementById("mermaid-canvas");
    var mermaidNodeLayer = document.getElementById("mermaid-node-layer");
    var mermaidEdgeLayer = document.getElementById("mermaid-edge-layer");
    var mermaidDirection = document.getElementById("mermaid-direction");
    var mermaidProps = document.getElementById("mermaid-props");
    var mermaidPropsTitle = document.getElementById("mermaid-props-title");
    var mermaidLabelInput = document.getElementById("mermaid-label-input");
    var mermaidShapeField = document.getElementById("mermaid-shape-field");
    var mermaidShapeSelect = document.getElementById("mermaid-shape-select");
    var mermaidDeleteSelection = document.getElementById("mermaid-delete-selection");
    var tableEditor = document.getElementById("table-editor");
    var tableEditorTitle = document.getElementById("table-editor-title");
    var tableEditorSize = document.getElementById("table-editor-size");
    var tableEditorHint = document.getElementById("table-editor-hint");
    var tableGrid = document.getElementById("table-editor-grid");
    var mermaidEditorBox = mermaidEditor ? mermaidEditor.querySelector(".mermaid-editor-box") : null;
    var tableEditorBox = tableEditor ? tableEditor.querySelector(".mermaid-editor-box") : null;
    var uiEditor = document.getElementById("ui-editor");
    var uiEditorBox = uiEditor ? uiEditor.querySelector(".mermaid-editor-box") : null;
    var uiEditorTitle = document.getElementById("ui-editor-title");
    var uiEditorSize = document.getElementById("ui-editor-size");
    var uiEditorHint = document.getElementById("ui-editor-hint");
    var uiCanvas = document.getElementById("ui-canvas");
    var uiCanvasWrap = document.getElementById("ui-canvas-wrap");
    var uiPalette = document.getElementById("ui-palette");
    var uiPropsEmpty = document.getElementById("ui-props-empty");
    var uiPropsFields = document.getElementById("ui-props-fields");
    var uiPropType = document.getElementById("ui-prop-type");
    var uiPropText = document.getElementById("ui-prop-text");
    var uiPropSrc = document.getElementById("ui-prop-src");
    var uiPropNote = document.getElementById("ui-prop-note");
    var uiPropX = document.getElementById("ui-prop-x");
    var uiPropY = document.getElementById("ui-prop-y");
    var uiPropW = document.getElementById("ui-prop-w");
    var uiPropH = document.getElementById("ui-prop-h");
    var uiCanvasWidth = document.getElementById("ui-canvas-width");
    var uiCanvasHeight = document.getElementById("ui-canvas-height");

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

    /* 给 markdown-it 渲染出的表格加标记，避免把文档里的原始 HTML <table> 当成可编辑表格 */
    var defaultTableOpenRender = md.renderer.rules.table_open ||
        function (tokens, idx, options, env, self) {
            return self.renderToken(tokens, idx, options);
        };
    md.renderer.rules.table_open = function (tokens, idx, options, env, self) {
        tokens[idx].attrJoin("class", "md-table");
        return defaultTableOpenRender(tokens, idx, options, env, self);
    };

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
    var mermaidTab = "visual";
    var mermaidApplying = false;
    var flowNodes = [];        // { id, label, shape, x, y, w, h }，x/y 为中心点
    var flowEdges = [];        // { id, from, to, label }
    var flowDirection = "TD";
    var flowSelected = null;   // { type: "node" | "edge", id }
    var flowNodeSeq = 0;
    var flowEdgeSeq = 0;
    var flowDrag = null;
    var flowConnect = null;
    var flowTempPath = null;
    var tableEditIndex = null;
    var tableEditRange = null;
    var tableData = [];
    var tableAligns = [];
    var tableFocus = { r: 1, c: 0 };
    var dialogRects = Object.create(null);
    var dialogClickSuppressUntil = 0;
    var uiEditIndex = null;
    var uiLayout = null;
    var uiSelectedId = null;
    var uiElementSeq = 0;
    var uiDrag = null;
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
                flowchart: { htmlLabels: true, useMaxWidth: true },
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
            if (!node.querySelector(".mermaid-edit-btn")) {
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
            var hasError = !!node.querySelector('.error-text, .error-icon, svg[aria-roledescription="error"]');
            var hint = node.querySelector(".mermaid-error-hint");
            if (hasError && !hint) {
                hint = document.createElement("div");
                hint.className = "mermaid-error-hint";
                hint.textContent = "Mermaid 语法错误，点击右上角「编辑」修正源码";
                node.appendChild(hint);
            } else if (!hasError && hint) {
                hint.parentNode.removeChild(hint);
            }
        }
    }

    /* 在每个表格右上角加“编辑”按钮；表格外包一层定位容器 */
    function decorateTableNodes() {
        var root = document.getElementById("md-body");
        var tables = root.querySelectorAll("table.md-table");
        var index = 0;
        for (var i = 0; i < tables.length; i++) {
            var table = tables[i];
            if (table.parentNode !== root) continue; // 只处理顶层表格
            var wrap = document.createElement("div");
            wrap.className = "table-wrap";
            wrap.setAttribute("data-table-index", String(index));
            table.parentNode.insertBefore(wrap, table);
            wrap.appendChild(table);
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "table-edit-btn";
            btn.textContent = "编辑";
            btn.title = "编辑表格内容";
            btn.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                var target = e.currentTarget.parentNode;
                openTableEditor(parseInt(target.getAttribute("data-table-index"), 10));
            });
            wrap.appendChild(btn);
            index++;
        }
    }

    /* ===================== Mermaid 编辑弹窗 ===================== */
    function openMermaidEditor(index, source) {
        if (!mermaidEditor) return;
        var parsed = (index === null || index === undefined || index === "") ? null : parseInt(index, 10);
        mermaidEditIndex = isNaN(parsed) ? null : parsed;
        var text = (typeof source === "string") ? source : "";
        var isNew = mermaidEditIndex === null;

        if (isNew && !text.trim()) {
            initDefaultFlowGraph();
            mermaidSource.value = serializeFlowGraph();
        } else {
            mermaidSource.value = text;
        }

        mermaidEditor.hidden = false;
        if (!isNew && !importFlowGraph(text)) {
            setMermaidTab("source", true);
            mermaidEditorHint.textContent =
                "当前源码包含图形编辑器暂不支持的语法（如 subgraph/样式），请继续使用源码模式";
        } else {
            setMermaidTab("visual", true);
            // 把自动布局后的位置写回源码，重新打开时保持相同布局
            syncFlowSource();
        }

        layoutFloatingDialog(mermaidEditor, mermaidEditorBox);

        setTimeout(function () {
            if (mermaidTab === "source") {
                mermaidSource.focus();
                mermaidSource.select();
            }
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
        flowDrag = null;
        flowConnect = null;
        flowTempPath = null;
        mermaidApplying = false;
        if (viewMode !== "preview") cm.focus();
    }

    var SVG_NS = "http://www.w3.org/2000/svg";

    function svgEl(name) {
        return document.createElementNS(SVG_NS, name);
    }

    function flowNodeById(id) {
        for (var i = 0; i < flowNodes.length; i++) {
            if (flowNodes[i].id === id) return flowNodes[i];
        }
        return null;
    }

    function flowEdgeById(id) {
        for (var i = 0; i < flowEdges.length; i++) {
            if (flowEdges[i].id === id) return flowEdges[i];
        }
        return null;
    }

    function flowDisplayLines(label) {
        var raw = String(label || "").split(/\r?\n/);
        var lines = [];
        raw.forEach(function (line) {
            if (!line) { lines.push(""); return; }
            // 简单按 18 个字符换行，避免长文本溢出节点
            for (var i = 0; i < line.length; i += 18) lines.push(line.slice(i, i + 18));
        });
        if (!lines.length) lines.push("");
        return lines.slice(0, 5);
    }

    function sizeFlowNode(node) {
        var lines = flowDisplayLines(node.label);
        var maxChars = 0;
        lines.forEach(function (line) { maxChars = Math.max(maxChars, line.length); });
        node.w = Math.max(90, Math.min(280, maxChars * 13 + 32));
        var base = node.shape === "diamond" ? 72 : node.shape === "circle" ? 70 : 50;
        node.h = base + Math.max(0, lines.length - 1) * 16;
        if (node.shape === "diamond") node.w = Math.max(node.w, node.h + 20);
        if (node.shape === "circle") node.w = Math.max(node.w, node.h);
    }

    function addFlowNodeRaw(label, shape, x, y) {
        var node = {
            id: "n" + (++flowNodeSeq),
            label: label || "新节点",
            shape: shape || "rect",
            x: x,
            y: y
        };
        sizeFlowNode(node);
        flowNodes.push(node);
        return node;
    }

    function addFlowEdgeRaw(from, to, label) {
        var edge = { id: "e" + (++flowEdgeSeq), from: from, to: to, label: label || "" };
        flowEdges.push(edge);
        return edge;
    }

    function initDefaultFlowGraph() {
        flowNodes = [];
        flowEdges = [];
        flowNodeSeq = 0;
        flowEdgeSeq = 0;
        flowDirection = "TD";
        flowSelected = null;
        var start = addFlowNodeRaw("开始", "stadium", 500, 100);
        var process = addFlowNodeRaw("处理", "rect", 500, 220);
        var end = addFlowNodeRaw("结束", "stadium", 500, 340);
        addFlowEdgeRaw(start.id, process.id, "");
        addFlowEdgeRaw(process.id, end.id, "");
    }

    function parseFlowNodeToken(token) {
        var text = String(token || "").trim().replace(/;+$/, "");
        if (!text) return null;
        var m = /^([A-Za-z_][\w-]*)([\s\S]*)$/.exec(text);
        if (!m) return null;
        var id = m[1];
        var rest = m[2].trim();
        var shape = "rect";
        var label = id;
        if (rest) {
            if (rest.indexOf("([") === 0 && rest.slice(-2) === "])") {
                shape = "stadium"; label = rest.slice(2, -2);
            } else if (rest.indexOf("((") === 0 && rest.slice(-2) === "))") {
                shape = "circle"; label = rest.slice(2, -2);
            } else if (rest.indexOf("[/") === 0 && rest.slice(-2) === "/]") {
                shape = "parallelogram"; label = rest.slice(2, -2);
            } else if (rest.charAt(0) === "{" && rest.slice(-1) === "}") {
                shape = "diamond"; label = rest.slice(1, -1);
            } else if (rest.charAt(0) === "[" && rest.slice(-1) === "]") {
                shape = "rect"; label = rest.slice(1, -1);
            } else if (rest.charAt(0) === "(" && rest.slice(-1) === ")") {
                shape = "stadium"; label = rest.slice(1, -1);
            } else {
                return null;
            }
            label = label.trim();
            if ((label.charAt(0) === "\"" && label.slice(-1) === "\"") ||
                (label.charAt(0) === "'" && label.slice(-1) === "'")) {
                label = label.slice(1, -1);
            }
            label = unescapeFlowLabel(label).trim();
        }
        return { id: id, label: label || id, shape: shape };
    }

    /* 从 Mermaid 源码恢复图形（支持常见 flowchart/graph 节点与箭头；复杂语法返回 false） */
    function importFlowGraph(source) {
        var lines = String(source || "").split(/\r?\n/);
        var nodes = [];
        var edges = [];
        var nodeMap = {};
        var positions = {};
        var direction = "TD";
        var sawDirective = false;

        function ensureNode(parsed) {
            if (!nodeMap[parsed.id]) {
                var node = {
                    id: parsed.id, label: parsed.label, shape: parsed.shape,
                    x: 0, y: 0
                };
                sizeFlowNode(node);
                nodeMap[parsed.id] = node;
                nodes.push(node);
            } else if (parsed.label !== parsed.id) {
                nodeMap[parsed.id].label = parsed.label;
                nodeMap[parsed.id].shape = parsed.shape;
            }
            return nodeMap[parsed.id];
        }

        for (var i = 0; i < lines.length; i++) {
            var t = lines[i].trim();
            if (!t) continue;
            var posMatch = /^%%\s*mdviewer:pos\s+(\S+)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i.exec(t);
            if (posMatch) {
                positions[posMatch[1]] = { x: parseFloat(posMatch[2]), y: parseFloat(posMatch[3]) };
                continue;
            }
            if (t.indexOf("%%") === 0) continue;

            var dirMatch = /^(?:flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/i.exec(t);
            if (dirMatch) {
                direction = dirMatch[1].toUpperCase();
                if (direction === "TB") direction = "TD";
                sawDirective = true;
                continue;
            }
            if (/^(subgraph|end|style|classDef|class|linkStyle|click|direction|accTitle|accDescr)\b/i.test(t)) {
                return false;
            }

            var parts = t.split("-->");
            if (parts.length === 1) {
                var only = parseFlowNodeToken(t);
                if (!only) return false;
                ensureNode(only);
                continue;
            }

            var first = parts[0].trim();
            var firstLabel = "";
            var dashLabel = /^(.*?)\s+--\s+(.+)$/.exec(first);
            if (dashLabel) {
                first = dashLabel[1].trim();
                firstLabel = unescapeFlowLabel(dashLabel[2].trim());
            }
            var current = parseFlowNodeToken(first);
            if (!current) return false;
            current = ensureNode(current);

            for (var k = 1; k < parts.length; k++) {
                var part = parts[k].trim();
                var label = "";
                if (part.charAt(0) === "|") {
                    var end = part.indexOf("|", 1);
                    if (end < 0) return false;
                    label = unescapeFlowLabel(part.slice(1, end).trim());
                    part = part.slice(end + 1).trim();
                }
                var next = parseFlowNodeToken(part);
                if (!next) return false;
                next = ensureNode(next);
                if (current.id !== next.id) {
                    addFlowEdgeRawTo(edges, current.id, next.id,
                        (k === 1 ? firstLabel : "") || label);
                }
                current = next;
            }
            sawDirective = true;
        }

        if (!nodes.length || !sawDirective) return false;

        flowNodes = nodes;
        flowEdges = edges;
        flowDirection = direction;
        flowNodeSeq = 0;
        nodes.forEach(function (node) {
            var m = /^n(\d+)$/.exec(node.id);
            if (m) flowNodeSeq = Math.max(flowNodeSeq, parseInt(m[1], 10));
        });
        flowEdgeSeq = edges.length;
        flowSelected = null;
        nodes.forEach(function (node, index) {
            var p = positions[node.id];
            if (p) {
                node.x = p.x;
                node.y = p.y;
            } else {
                node.x = null;
            }
            sizeFlowNode(node);
        });
        layoutFlowNodes(true);
        return true;
    }

    function addFlowEdgeRawTo(list, from, to, label) {
        list.push({ id: "e" + (list.length + 1), from: from, to: to, label: label || "" });
    }

    function layoutFlowNodes(onlyMissing) {
        var count = flowNodes.length;
        flowNodes.forEach(function (node, index) {
            if (onlyMissing && node.x !== null && isFinite(node.x)) return;
            var x = 500;
            var y = 90 + index * 120;
            if (flowDirection === "LR") { x = 120 + index * 180; y = 320; }
            else if (flowDirection === "RL") { x = 1080 - index * 180; y = 320; }
            else if (flowDirection === "BT") { x = 500; y = 690 - index * 120; }
            node.x = Math.max(70, Math.min(1130, x));
            node.y = Math.max(50, Math.min(750, y));
        });
        // 保持数量为 0 时也不报错
        if (!count) return;
    }

    function escapeFlowLabel(label) {
        return String(label || "")
            .replace(/#/g, "#35;")
            .replace(/&/g, "#38;")
            .replace(/</g, "#60;")
            .replace(/>/g, "#62;")
            .replace(/\\/g, "#92;")
            .replace(/"/g, "#quot;")
            .replace(/`/g, "#96;")
            .replace(/\r?\n/g, "<br/>");
    }

    function unescapeFlowLabel(label) {
        var map = { "35": "#", "38": "&", "60": "<", "62": ">", "92": "\\", "96": "`", "quot": "\"" };
        return String(label || "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/#(35|38|60|62|92|96|quot);/gi, function (_, code) {
                return map[code.toLowerCase()];
            });
    }

    function flowShapeText(node) {
        var label = escapeFlowLabel(node.label);
        switch (node.shape) {
            case "stadium": return "([\"" + label + "\"])";
            case "circle": return "((\"" + label + "\"))";
            case "diamond": return "{\"" + label + "\"}";
            case "parallelogram": return "[/\"" + label + "\"/]";
            default: return "[\"" + label + "\"]";
        }
    }

    function serializeFlowGraph() {
        var out = ["flowchart " + (flowDirection || "TD")];
        flowNodes.forEach(function (node) {
            out.push("  %% mdviewer:pos " + node.id + " " +
                Math.round(node.x === null ? 500 : node.x) + " " +
                Math.round(node.y === null ? 100 : node.y));
        });
        flowNodes.forEach(function (node) {
            out.push("  " + node.id + flowShapeText(node));
        });
        flowEdges.forEach(function (edge) {
            var label = edge.label ? "|" + escapeFlowLabel(edge.label) + "|" : "";
            out.push("  " + edge.from + " -->" + label + " " + edge.to);
        });
        return out.join("\n") + "\n";
    }

    function syncFlowSource() {
        if (!mermaidSource) return;
        mermaidSource.value = serializeFlowGraph();
        if (mermaidTab === "source") updateMermaidPreview();
    }

    function flowBorderPoint(node, dx, dy) {
        var scale = Math.min(
            dx !== 0 ? (node.w / 2) / Math.abs(dx) : Infinity,
            dy !== 0 ? (node.h / 2) / Math.abs(dy) : Infinity);
        if (!isFinite(scale)) scale = 0;
        return { x: node.x + dx * scale, y: node.y + dy * scale };
    }

    function renderFlowEdges() {
        mermaidEdgeLayer.innerHTML = "";
        flowEdges.forEach(function (edge) {
            var a = flowNodeById(edge.from);
            var b = flowNodeById(edge.to);
            if (!a || !b) return;
            var dx = b.x - a.x;
            var dy = b.y - a.y;
            var p1 = flowBorderPoint(a, dx, dy);
            var p2 = flowBorderPoint(b, -dx, -dy);
            var path = svgEl("path");
            path.setAttribute("class", "fc-edge" +
                (flowSelected && flowSelected.type === "edge" && flowSelected.id === edge.id
                    ? " selected" : ""));
            path.setAttribute("data-edge-id", edge.id);
            path.setAttribute("d", "M " + p1.x + " " + p1.y + " L " + p2.x + " " + p2.y);
            path.addEventListener("click", function (e) {
                e.stopPropagation();
                selectFlowEdge(edge.id);
            });
            mermaidEdgeLayer.appendChild(path);

            if (edge.label) {
                var text = svgEl("text");
                text.setAttribute("class", "fc-edge-label");
                text.setAttribute("x", (p1.x + p2.x) / 2);
                text.setAttribute("y", (p1.y + p2.y) / 2 - 6);
                text.textContent = edge.label;
                mermaidEdgeLayer.appendChild(text);
            }
        });
        if (flowTempPath) mermaidEdgeLayer.appendChild(flowTempPath);
    }

    function renderFlowNode(node) {
        var g = svgEl("g");
        g.setAttribute("class", "fc-node" +
            (flowSelected && flowSelected.type === "node" && flowSelected.id === node.id
                ? " selected" : ""));
        g.setAttribute("data-node-id", node.id);
        g.setAttribute("transform", "translate(" + node.x + " " + node.y + ")");

        var shape;
        if (node.shape === "diamond") {
            shape = svgEl("polygon");
            shape.setAttribute("points",
                "0," + (-node.h / 2) + " " + (node.w / 2) + ",0 0," + (node.h / 2) +
                " " + (-node.w / 2) + ",0");
        } else if (node.shape === "circle") {
            shape = svgEl("ellipse");
            shape.setAttribute("rx", node.w / 2);
            shape.setAttribute("ry", node.h / 2);
        } else if (node.shape === "parallelogram") {
            shape = svgEl("polygon");
            var skew = 12;
            shape.setAttribute("points",
                (-node.w / 2 + skew) + "," + (-node.h / 2) + " " +
                (node.w / 2) + "," + (-node.h / 2) + " " +
                (node.w / 2 - skew) + "," + (node.h / 2) + " " +
                (-node.w / 2) + "," + (node.h / 2));
        } else {
            shape = svgEl("rect");
            shape.setAttribute("x", -node.w / 2);
            shape.setAttribute("y", -node.h / 2);
            shape.setAttribute("width", node.w);
            shape.setAttribute("height", node.h);
            if (node.shape === "stadium") {
                shape.setAttribute("rx", node.h / 2);
                shape.setAttribute("ry", node.h / 2);
            } else {
                shape.setAttribute("rx", 4);
                shape.setAttribute("ry", 4);
            }
        }
        shape.setAttribute("class", "fc-shape");
        g.appendChild(shape);

        var text = svgEl("text");
        text.setAttribute("x", 0);
        text.setAttribute("y", 0);
        text.setAttribute("dominant-baseline", "middle");
        var lines = flowDisplayLines(node.label);
        var start = -((lines.length - 1) * 16) / 2;
        lines.forEach(function (line, i) {
            var tspan = svgEl("tspan");
            tspan.setAttribute("x", 0);
            tspan.setAttribute("y", start + i * 16);
            tspan.textContent = line;
            text.appendChild(tspan);
        });
        g.appendChild(text);

        // 四个连接端口
        [[0, -node.h / 2], [node.w / 2, 0], [0, node.h / 2], [-node.w / 2, 0]]
            .forEach(function (pos) {
                var port = svgEl("circle");
                port.setAttribute("class", "fc-port");
                port.setAttribute("cx", pos[0]);
                port.setAttribute("cy", pos[1]);
                port.setAttribute("r", 5);
                port.setAttribute("data-port", "1");
                g.appendChild(port);
            });

        g.addEventListener("pointerdown", function (e) { onFlowNodePointerDown(e, node, g); });
        g.addEventListener("dblclick", function (e) {
            e.preventDefault();
            e.stopPropagation();
            selectFlowNode(node.id);
            mermaidLabelInput.focus();
            mermaidLabelInput.select();
        });
        mermaidNodeLayer.appendChild(g);
        return g;
    }

    function renderFlowGraph() {
        renderFlowEdges();
        mermaidNodeLayer.innerHTML = "";
        flowNodes.forEach(renderFlowNode);
        refreshFlowSelection();
    }

    function refreshFlowSelection() {
        if (!mermaidNodeLayer) return;
        var nodes = mermaidNodeLayer.querySelectorAll(".fc-node");
        for (var i = 0; i < nodes.length; i++) {
            var id = nodes[i].getAttribute("data-node-id");
            nodes[i].classList.toggle("selected",
                !!(flowSelected && flowSelected.type === "node" && flowSelected.id === id));
        }
        var edges = mermaidEdgeLayer.querySelectorAll(".fc-edge");
        for (var j = 0; j < edges.length; j++) {
            var eid = edges[j].getAttribute("data-edge-id");
            edges[j].classList.toggle("selected",
                !!(flowSelected && flowSelected.type === "edge" && flowSelected.id === eid));
        }
    }

    function showFlowProps() {
        if (!mermaidProps || !flowSelected) {
            if (mermaidProps) mermaidProps.hidden = true;
            return;
        }
        if (flowSelected.type === "node") {
            var node = flowNodeById(flowSelected.id);
            if (!node) { mermaidProps.hidden = true; return; }
            mermaidPropsTitle.textContent = "节点属性";
            mermaidShapeField.hidden = false;
            mermaidLabelInput.value = node.label;
            mermaidShapeSelect.value = node.shape;
        } else {
            var edge = flowEdgeById(flowSelected.id);
            if (!edge) { mermaidProps.hidden = true; return; }
            mermaidPropsTitle.textContent = "连线属性";
            mermaidShapeField.hidden = true;
            mermaidLabelInput.value = edge.label || "";
        }
        mermaidProps.hidden = false;
    }

    function selectFlowNode(id) {
        flowSelected = { type: "node", id: id };
        refreshFlowSelection();
        showFlowProps();
    }

    function selectFlowEdge(id) {
        flowSelected = { type: "edge", id: id };
        refreshFlowSelection();
        showFlowProps();
    }

    function clearFlowSelection() {
        flowSelected = null;
        refreshFlowSelection();
        showFlowProps();
    }

    function flowCanvasPoint(e) {
        var point = mermaidCanvas.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        return point.matrixTransform(mermaidCanvas.getScreenCTM().inverse());
    }

    function flowNodeElement(id) {
        var nodes = mermaidNodeLayer.querySelectorAll(".fc-node");
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute("data-node-id") === id) return nodes[i];
        }
        return null;
    }

    function onFlowNodePointerDown(e, node, group) {
        if (e.button !== undefined && e.button !== 0) return;
        var port = e.target && e.target.closest ? e.target.closest(".fc-port") : null;
        if (port) {
            e.preventDefault();
            e.stopPropagation();
            startFlowConnect(node, e);
            return;
        }
        e.preventDefault();
        selectFlowNode(node.id);
        var pt = flowCanvasPoint(e);
        flowDrag = {
            node: node,
            group: group,
            offsetX: node.x - pt.x,
            offsetY: node.y - pt.y,
            moved: false
        };

        function onMove(ev) {
            if (!flowDrag) return;
            var p = flowCanvasPoint(ev);
            var halfW = node.w / 2 + 6;
            var halfH = node.h / 2 + 6;
            node.x = Math.max(halfW, Math.min(1200 - halfW, p.x + flowDrag.offsetX));
            node.y = Math.max(halfH, Math.min(800 - halfH, p.y + flowDrag.offsetY));
            group.setAttribute("transform", "translate(" + node.x + " " + node.y + ")");
            renderFlowEdges();
            flowDrag.moved = true;
        }

        function onUp() {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            if (flowDrag && flowDrag.moved) syncFlowSource();
            flowDrag = null;
        }

        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
    }

    function startFlowConnect(node, e) {
        var pt = flowCanvasPoint(e);
        flowConnect = { from: node.id, x: pt.x, y: pt.y };
        flowTempPath = svgEl("path");
        flowTempPath.setAttribute("class", "fc-temp-edge");
        flowTempPath.setAttribute("d", "M " + node.x + " " + node.y + " L " + pt.x + " " + pt.y);
        mermaidEdgeLayer.appendChild(flowTempPath);

        function onMove(ev) {
            if (!flowConnect || !flowTempPath) return;
            var p = flowCanvasPoint(ev);
            flowTempPath.setAttribute("d",
                "M " + node.x + " " + node.y + " L " + p.x + " " + p.y);
        }

        function onUp(ev) {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            var target = document.elementFromPoint(ev.clientX, ev.clientY);
            var targetGroup = target && target.closest ? target.closest(".fc-node") : null;
            if (flowConnect && targetGroup) {
                var to = targetGroup.getAttribute("data-node-id");
                if (to && to !== flowConnect.from) {
                    addFlowEdgeRaw(flowConnect.from, to, "");
                    syncFlowSource();
                }
            }
            if (flowTempPath && flowTempPath.parentNode) flowTempPath.parentNode.removeChild(flowTempPath);
            flowTempPath = null;
            flowConnect = null;
            renderFlowGraph();
        }

        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
    }

    function deleteFlowSelection() {
        if (!flowSelected) return;
        if (flowSelected.type === "node") {
            flowNodes = flowNodes.filter(function (n) { return n.id !== flowSelected.id; });
            flowEdges = flowEdges.filter(function (e) {
                return e.from !== flowSelected.id && e.to !== flowSelected.id;
            });
        } else {
            flowEdges = flowEdges.filter(function (e) { return e.id !== flowSelected.id; });
        }
        flowSelected = null;
        mermaidProps.hidden = true;
        renderFlowGraph();
        syncFlowSource();
    }

    function addFlowNodeFromToolbar(shape) {
        var label = shape === "diamond" ? "判断" : shape === "stadium" ? "开始" : "新节点";
        var index = flowNodes.length;
        var x = 500;
        var y = 90 + (index % 6) * 110;
        if (index >= 6) x = 720;
        var node = addFlowNodeRaw(label, shape, x, y);
        flowSelected = { type: "node", id: node.id };
        renderFlowGraph();
        showFlowProps();
        syncFlowSource();
    }

    function autoLayoutFlow() {
        layoutFlowNodes(false);
        renderFlowGraph();
        syncFlowSource();
    }

    function setMermaidTab(mode, skipParse) {
        if (mode === "visual" && !skipParse) {
            if (!importFlowGraph(mermaidSource.value)) {
                mermaidEditorHint.textContent =
                    "当前源码包含图形编辑器暂不支持的语法（如 subgraph/样式），请继续使用源码模式";
                mode = "source";
            }
        }
        if (mode === "source" && mermaidTab === "visual" && !skipParse) {
            syncFlowSource();
        }
        mermaidTab = mode;
        mermaidVisualPane.hidden = mode !== "visual";
        mermaidSourcePane.hidden = mode !== "source";
        mermaidTabVisual.classList.toggle("active", mode === "visual");
        mermaidTabSource.classList.toggle("active", mode === "source");
        if (mode === "visual") {
            if (flowDirection) mermaidDirection.value = flowDirection;
            renderFlowGraph();
            showFlowProps();
            mermaidEditorHint.textContent = "拖动节点移动；从节点边缘圆点拖到另一个节点连线；Ctrl+Enter 应用 · Esc 取消";
        } else {
            updateMermaidPreview();
            mermaidEditorHint.textContent = "源码模式：Ctrl+Enter 应用 · Esc 取消";
        }
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

    function commitMermaidEditor(source) {
        if (mermaidEditIndex === null) {
            insertTextAtCursor("```mermaid\n" + source + "\n```\n");
            closeMermaidEditor();
            return;
        }
        if (!replaceMermaidBlock(mermaidEditIndex, source)) {
            mermaidApplying = false;
            postMessage({ type: "status", text: "未找到对应的 mermaid 代码块，可能已被外部修改" });
            return;
        }
        closeMermaidEditor();
    }

    function applyMermaidEditor() {
        if (mermaidApplying) return;
        if (mermaidTab === "visual") syncFlowSource();
        var source = mermaidSource.value.trim();
        if (!source) {
            postMessage({ type: "status", text: "Mermaid 源码不能为空" });
            return;
        }
        if (source.indexOf("```") >= 0) {
            if (mermaidTab !== "source") setMermaidTab("source", true);
            mermaidEditorHint.textContent = "Mermaid 源码中不能包含 ``` 代码围栏，请删除围栏后再应用";
            return;
        }
        mermaidApplying = true;
        var fail = function (err) {
            mermaidApplying = false;
            if (mermaidEditor.hidden) return;
            if (mermaidTab !== "source") setMermaidTab("source", true);
            mermaidEditorHint.textContent = "Mermaid 语法错误：" +
                String(err && err.message || err).split("\n")[0];
            updateMermaidPreview();
        };
        var check;
        try {
            if (window.mermaid && window.mermaid.parse) {
                try {
                    window.mermaid.initialize({
                        startOnLoad: false,
                        securityLevel: "strict",
                        theme: mermaidThemeName(),
                        flowchart: { htmlLabels: true, useMaxWidth: true }
                    });
                } catch (e) { /* 初始化失败时仍尝试解析 */ }
                check = window.mermaid.parse(source);
            } else {
                check = true;
            }
        } catch (err) {
            fail(err);
            return;
        }
        if (check && typeof check.then === "function") {
            check.then(function () {
                if (!mermaidApplying || mermaidEditor.hidden) return;
                mermaidApplying = false;
                commitMermaidEditor(source);
            }, fail);
        } else {
            mermaidApplying = false;
            commitMermaidEditor(source);
        }
    }

    if (mermaidEditor) {
        document.getElementById("mermaid-editor-close").addEventListener("click", closeMermaidEditor);
        document.getElementById("mermaid-editor-cancel").addEventListener("click", closeMermaidEditor);
        document.getElementById("mermaid-editor-apply").addEventListener("click", applyMermaidEditor);
        mermaidTabVisual.addEventListener("click", function () { setMermaidTab("visual"); });
        mermaidTabSource.addEventListener("click", function () { setMermaidTab("source"); });

        mermaidSource.addEventListener("input", function () {
            if (mermaidTab !== "source") return;
            if (mermaidPreviewTimer) clearTimeout(mermaidPreviewTimer);
            mermaidPreviewTimer = setTimeout(updateMermaidPreview, 250);
        });

        mermaidDirection.addEventListener("change", function () {
            flowDirection = mermaidDirection.value || "TD";
            syncFlowSource();
        });

        mermaidCanvas.addEventListener("pointerdown", function (e) {
            if (e.target === mermaidCanvas || e.target === mermaidNodeLayer ||
                e.target === mermaidEdgeLayer) {
                clearFlowSelection();
            }
        });

        document.querySelectorAll(".mermaid-shape-grid button").forEach(function (btn) {
            btn.addEventListener("click", function () {
                addFlowNodeFromToolbar(btn.getAttribute("data-shape") || "rect");
            });
        });
        document.getElementById("mermaid-autolayout").addEventListener("click", autoLayoutFlow);

        mermaidLabelInput.addEventListener("input", function () {
            if (!flowSelected) return;
            if (flowSelected.type === "node") {
                var node = flowNodeById(flowSelected.id);
                if (!node) return;
                node.label = mermaidLabelInput.value || "节点";
                sizeFlowNode(node);
                renderFlowGraph();
            } else {
                var edge = flowEdgeById(flowSelected.id);
                if (!edge) return;
                edge.label = mermaidLabelInput.value;
                renderFlowEdges();
            }
            syncFlowSource();
        });

        mermaidShapeSelect.addEventListener("change", function () {
            if (!flowSelected || flowSelected.type !== "node") return;
            var node = flowNodeById(flowSelected.id);
            if (!node) return;
            node.shape = mermaidShapeSelect.value || "rect";
            sizeFlowNode(node);
            renderFlowGraph();
            syncFlowSource();
        });

        mermaidDeleteSelection.addEventListener("click", deleteFlowSelection);

        mermaidEditor.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closeMermaidEditor();
            } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                applyMermaidEditor();
            } else if ((e.key === "Delete" || e.key === "Backspace") &&
                mermaidTab === "visual" && flowSelected) {
                var tag = e.target && e.target.tagName;
                if (tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteFlowSelection();
                }
            }
        });
        mermaidEditor.addEventListener("click", function (e) {
            if (Date.now() < dialogClickSuppressUntil) return;
            if (e.target === mermaidEditor) closeMermaidEditor();
        });
    }

    /* ===================== 表格可视化编辑 ===================== */
    var TABLE_ALIGN_LABELS = { none: "默认", left: "左对齐", center: "居中", right: "右对齐" };

    function tableClampInt(value, min, max, fallback) {
        var n = parseInt(value, 10);
        if (!isFinite(n)) n = fallback;
        return Math.max(min, Math.min(max, n));
    }

    /* 按未转义的 | 拆分表格行；单元格内的 \| 还原为 | */
    function tableSplitRow(line) {
        var text = String(line == null ? "" : line).trim();
        if (!text) return [];
        if (text.charAt(0) === "|") text = text.slice(1);
        if (text.slice(-1) === "|") {
            var slashes = 0;
            for (var i = text.length - 2; i >= 0 && text.charAt(i) === "\\"; i--) slashes++;
            if (slashes % 2 === 0) text = text.slice(0, -1);
        }
        var cells = [];
        var current = "";
        var escaped = false;
        for (var k = 0; k < text.length; k++) {
            var ch = text.charAt(k);
            if (escaped) {
                if (ch !== "|") current += "\\";
                current += ch;
                escaped = false;
            } else if (ch === "\\") {
                escaped = true;
            } else if (ch === "|") {
                cells.push(current.trim());
                current = "";
            } else {
                current += ch;
            }
        }
        if (escaped) current += "\\";
        cells.push(current.trim());
        return cells;
    }

    function tableDelimiterAligns(line) {
        if (String(line == null ? "" : line).indexOf("|") < 0) return null;
        var cells = tableSplitRow(line);
        if (!cells.length) return null;
        var aligns = [];
        for (var i = 0; i < cells.length; i++) {
            var cell = cells[i].trim();
            if (!/^:?-+:?$/.test(cell)) return null;
            var left = cell.charAt(0) === ":";
            var right = cell.slice(-1) === ":";
            aligns.push(left && right ? "center" : right ? "right" : left ? "left" : "none");
        }
        return aligns;
    }

    /* 用 markdown-it 的 table token 行号定位顶层表格，避免把 blockquote/list 内的表格算进来 */
    function findTopLevelTableBlocks(text) {
        var src = String(text || "");
        var lines = src.split(/\r?\n/);
        var tokens;
        try {
            tokens = md.parse(src, {});
        } catch (e) {
            return [];
        }
        var depth = 0;
        var blocks = [];
        for (var i = 0; i < tokens.length; i++) {
            var tok = tokens[i];
            if (tok.type === "table_open") {
                if (depth === 0 && tok.map && tok.map.length >= 2) {
                    var start = tok.map[0];
                    var end = tok.map[1] - 1;
                    while (end > start + 1 && lines[end] && !lines[end].trim()) end--;
                    if (start >= 0 && end >= start && end < lines.length) {
                        var aligns = tableDelimiterAligns(lines[start + 1]);
                        if (aligns) {
                            var header = tableSplitRow(lines[start]);
                            var body = [];
                            for (var r = start + 2; r <= end; r++) {
                                if (lines[r] && lines[r].trim()) body.push(tableSplitRow(lines[r]));
                            }
                            blocks.push({ start: start, end: end, header: header, aligns: aligns, body: body });
                        }
                    }
                }
            } else if (tok.type === "blockquote_open" || tok.type === "list_item_open") {
                depth++;
            } else if (tok.type === "blockquote_close" || tok.type === "list_item_close") {
                if (depth > 0) depth--;
            }
        }
        return blocks;
    }

    function tableColumnCount() {
        return tableData.length ? tableData[0].length : 0;
    }

    function tablePadRow(row, count) {
        var out = [];
        for (var c = 0; c < count; c++) {
            out.push(row && row[c] != null ? String(row[c]) : "");
        }
        return out;
    }

    function tableEmptyRow(count) {
        var row = [];
        for (var c = 0; c < count; c++) row.push("");
        return row;
    }

    function tableAlignStyle(align) {
        if (align === "left") return ' style="text-align:left"';
        if (align === "center") return ' style="text-align:center"';
        if (align === "right") return ' style="text-align:right"';
        return "";
    }

    function tableAlignOptions(current) {
        var values = ["none", "left", "center", "right"];
        return values.map(function (value) {
            return '<option value="' + value + '"' +
                (value === current ? " selected" : "") + ">" +
                TABLE_ALIGN_LABELS[value] + "</option>";
        }).join("");
    }

    function tableAlignDelimiter(align) {
        if (align === "left") return ":---";
        if (align === "center") return ":---:";
        if (align === "right") return "---:";
        return "---";
    }

    function formatTableRow(cells) {
        var out = [];
        for (var i = 0; i < cells.length; i++) {
            var cell = String(cells[i] == null ? "" : cells[i])
                .replace(/\r?\n/g, " ")
                .replace(/\|/g, "\\|")
                .trim();
            out.push(cell);
        }
        return "| " + out.join(" | ") + " |";
    }

    function serializeTableEditor() {
        var cols = tableColumnCount();
        var lines = [formatTableRow(tablePadRow(tableData[0], cols))];
        var delimiters = [];
        for (var c = 0; c < cols; c++) delimiters.push(tableAlignDelimiter(tableAligns[c] || "none"));
        lines.push("| " + delimiters.join(" | ") + " |");
        for (var r = 1; r < tableData.length; r++) {
            lines.push(formatTableRow(tablePadRow(tableData[r], cols)));
        }
        return lines.join("\n");
    }

    function focusTableCell(row, col) {
        var input = tableGrid.querySelector(
            'input.tbl-cell[data-r="' + row + '"][data-c="' + col + '"]');
        if (!input) input = tableGrid.querySelector("input.tbl-cell");
        if (input) {
            input.focus();
            input.select();
        }
    }

    function renderTableEditorGrid(focus) {
        if (!tableGrid) return;
        var cols = tableColumnCount();
        if (!cols) return;
        var html = "<thead><tr><th class=\"tbl-corner\"></th>";
        for (var c = 0; c < cols; c++) {
            var align = tableAligns[c] || "none";
            html += "<th class=\"tbl-col-head\" data-col=\"" + c + "\">" +
                "<input class=\"tbl-cell tbl-header-input\" data-r=\"0\" data-c=\"" + c +
                "\" type=\"text\" spellcheck=\"false\" autocomplete=\"off\" value=\"" +
                escapeHtml(tableData[0][c] || "") + "\" placeholder=\"列 " + (c + 1) + "\"" +
                tableAlignStyle(align) + ">" +
                "<div class=\"tbl-col-tools\">" +
                "<select class=\"tbl-align-select\" data-col=\"" + c + "\" title=\"列对齐\">" +
                tableAlignOptions(align) + "</select>" +
                (cols > 1
                    ? "<button type=\"button\" class=\"tbl-col-del\" data-col=\"" + c +
                      "\" title=\"删除此列\">×</button>"
                    : "") +
                "</div></th>";
        }
        html += "</tr></thead><tbody>";
        for (var r = 1; r < tableData.length; r++) {
            html += "<tr><th class=\"tbl-row-head\"><span>" + r + "</span>" +
                "<button type=\"button\" class=\"tbl-row-del\" data-row=\"" + r +
                "\" title=\"删除此行\">×</button></th>";
            for (var c2 = 0; c2 < cols; c2++) {
                html += "<td><input class=\"tbl-cell\" data-r=\"" + r + "\" data-c=\"" + c2 +
                    "\" type=\"text\" spellcheck=\"false\" autocomplete=\"off\" value=\"" +
                    escapeHtml(tableData[r][c2] || "") + "\"" +
                    tableAlignStyle(tableAligns[c2] || "none") + "></td>";
            }
            html += "</tr>";
        }
        html += "</tbody>";
        tableGrid.innerHTML = html;
        tableEditorSize.textContent = tableData.length + " 行 × " + cols + " 列（含表头）";
        if (focus) focusTableCell(focus.r, focus.c);
    }

    function syncTableStateFromGrid() {
        var inputs = tableGrid.querySelectorAll("input.tbl-cell");
        for (var i = 0; i < inputs.length; i++) {
            var input = inputs[i];
            var r = parseInt(input.getAttribute("data-r"), 10);
            var c = parseInt(input.getAttribute("data-c"), 10);
            if (tableData[r] && c >= 0) tableData[r][c] = input.value;
        }
    }

    function tableCellInputs() {
        return Array.prototype.slice.call(tableGrid.querySelectorAll("input.tbl-cell"));
    }

    function addTableRow(focusColumn) {
        var cols = tableColumnCount();
        if (!cols) return;
        tableData.push(tableEmptyRow(cols));
        var row = tableData.length - 1;
        var col = typeof focusColumn === "number"
            ? Math.max(0, Math.min(cols - 1, focusColumn))
            : 0;
        tableFocus = { r: row, c: col };
        renderTableEditorGrid(tableFocus);
    }

    function addTableColumn() {
        var cols = tableColumnCount();
        if (!cols) return;
        tableData[0].push("列 " + (cols + 1));
        for (var r = 1; r < tableData.length; r++) tableData[r].push("");
        tableAligns.push("none");
        tableFocus = { r: tableData.length > 1 ? 1 : 0, c: cols };
        renderTableEditorGrid(tableFocus);
    }

    function deleteTableRow(row) {
        if (row < 1 || row >= tableData.length) return;
        tableData.splice(row, 1);
        var next = Math.min(row, tableData.length - 1);
        tableFocus = { r: next, c: Math.min(tableFocus.c, tableColumnCount() - 1) };
        renderTableEditorGrid(tableFocus);
    }

    function deleteTableColumn(col) {
        if (tableColumnCount() <= 1) return;
        for (var r = 0; r < tableData.length; r++) tableData[r].splice(col, 1);
        tableAligns.splice(col, 1);
        tableFocus = { r: Math.min(tableFocus.r, tableData.length - 1), c: Math.min(col, tableColumnCount() - 1) };
        renderTableEditorGrid(tableFocus);
    }

    function openTableEditor(index, rows, cols) {
        if (!tableEditor) return;
        var parsed = (index === null || index === undefined || index === "") ? null : parseInt(index, 10);
        if (parsed !== null && isNaN(parsed)) parsed = null;
        tableEditIndex = parsed;
        tableEditRange = null;

        if (tableEditIndex === null) {
            var rowCount = tableClampInt(rows, 2, 100, 3);
            var colCount = tableClampInt(cols, 1, 20, 3);
            tableData = [];
            var header = [];
            for (var c = 0; c < colCount; c++) header.push("列 " + (c + 1));
            tableData.push(header);
            for (var r = 1; r < rowCount; r++) tableData.push(tableEmptyRow(colCount));
            tableAligns = [];
            for (var a = 0; a < colCount; a++) tableAligns.push("none");
            tableEditorTitle.textContent = "插入表格";
            tableEditorHint.textContent = "单击单元格编辑；Tab 切换，Enter 下一行；Ctrl+Enter 应用 · Esc 取消";
        } else {
            var blocks = findTopLevelTableBlocks(cm.getValue());
            var block = blocks[tableEditIndex];
            if (!block) {
                postMessage({ type: "status", text: "未找到对应的表格，可能已被外部修改" });
                return;
            }
            tableEditRange = { start: block.start, end: block.end };
            var count = Math.max(1, block.header.length, block.aligns.length);
            block.body.forEach(function (row) {
                if (row.length > count) count = row.length;
            });
            tableData = [tablePadRow(block.header, count)];
            block.body.forEach(function (row) { tableData.push(tablePadRow(row, count)); });
            tableAligns = [];
            for (var c2 = 0; c2 < count; c2++) tableAligns.push(block.aligns[c2] || "none");
            tableEditorTitle.textContent = "编辑表格";
            tableEditorHint.textContent = "单击单元格编辑；首行为表头；Ctrl+Enter 应用 · Esc 取消";
        }

        tableEditor.hidden = false;
        tableFocus = { r: tableData.length > 1 ? 1 : 0, c: 0 };
        renderTableEditorGrid(tableFocus);
        layoutFloatingDialog(tableEditor, tableEditorBox);
        setTimeout(function () {
            focusTableCell(tableFocus.r, tableFocus.c);
        }, 30);
    }

    function closeTableEditor() {
        if (!tableEditor) return;
        tableEditor.hidden = true;
        tableEditIndex = null;
        tableEditRange = null;
        tableData = [];
        tableAligns = [];
        tableFocus = null;
        if (viewMode !== "preview") cm.focus();
    }

    function replaceTableEditorBlock(range, index, markdown) {
        var text = cm.getValue();
        var lines = text.split(/\r?\n/);
        var use = null;
        if (range && range.start >= 0 && range.end >= range.start &&
            range.end < lines.length && tableDelimiterAligns(lines[range.start + 1])) {
            use = range;
        }
        if (!use) {
            var blocks = findTopLevelTableBlocks(text);
            if (index !== null && blocks[index]) use = blocks[index];
        }
        if (!use) return false;
        cm.replaceRange(markdown,
            { line: use.start, ch: 0 },
            { line: use.end, ch: lines[use.end].length });
        return true;
    }

    function applyTableEditor() {
        if (!tableEditor || tableEditor.hidden) return;
        syncTableStateFromGrid();
        if (!tableColumnCount()) {
            tableEditorHint.textContent = "表格至少需要一列";
            return;
        }
        var markdown = serializeTableEditor();
        if (tableEditIndex === null) {
            insertMarkdownBlockAtCursor(markdown);
        } else if (!replaceTableEditorBlock(tableEditRange, tableEditIndex, markdown)) {
            tableEditorHint.textContent = "未找到对应表格，可能已被外部修改";
            postMessage({ type: "status", text: "未找到对应表格，可能已被外部修改" });
            return;
        }
        closeTableEditor();
    }

    /* 在光标处插入块级 Markdown，并保证前后有空行，避免和段落粘在一起 */
    function insertMarkdownBlockAtCursor(markdown) {
        if (currentTabId == null) return;
        var cur = cm.getCursor();
        var before = "";
        if (cur.ch > 0) {
            before = "\n\n";
        } else if (cur.line > 0 && cm.getLine(cur.line - 1).trim()) {
            before = "\n";
        }
        insertTextAtCursor(before + markdown + "\n\n");
    }

    if (tableEditor) {
        document.getElementById("table-editor-close").addEventListener("click", closeTableEditor);
        document.getElementById("table-editor-cancel").addEventListener("click", closeTableEditor);
        document.getElementById("table-editor-apply").addEventListener("click", applyTableEditor);
        document.getElementById("table-add-row").addEventListener("click", function () { addTableRow(0); });
        document.getElementById("table-add-col").addEventListener("click", addTableColumn);

        tableGrid.addEventListener("input", function (e) {
            var input = e.target;
            if (!input || !input.classList || !input.classList.contains("tbl-cell")) return;
            var r = parseInt(input.getAttribute("data-r"), 10);
            var c = parseInt(input.getAttribute("data-c"), 10);
            if (tableData[r] && c >= 0) tableData[r][c] = input.value;
        });

        tableGrid.addEventListener("focusin", function (e) {
            var input = e.target;
            if (!input || !input.classList || !input.classList.contains("tbl-cell")) return;
            tableFocus = {
                r: parseInt(input.getAttribute("data-r"), 10),
                c: parseInt(input.getAttribute("data-c"), 10)
            };
        });

        tableGrid.addEventListener("change", function (e) {
            var select = e.target && e.target.closest ? e.target.closest(".tbl-align-select") : null;
            if (!select) return;
            var c = parseInt(select.getAttribute("data-col"), 10);
            tableAligns[c] = select.value || "none";
            renderTableEditorGrid(tableFocus);
        });

        tableGrid.addEventListener("click", function (e) {
            var rowDel = e.target && e.target.closest ? e.target.closest(".tbl-row-del") : null;
            if (rowDel) {
                e.preventDefault();
                deleteTableRow(parseInt(rowDel.getAttribute("data-row"), 10));
                return;
            }
            var colDel = e.target && e.target.closest ? e.target.closest(".tbl-col-del") : null;
            if (colDel) {
                e.preventDefault();
                deleteTableColumn(parseInt(colDel.getAttribute("data-col"), 10));
            }
        });

        tableGrid.addEventListener("keydown", function (e) {
            var input = e.target;
            if (!input || !input.classList || !input.classList.contains("tbl-cell")) return;
            if (e.key === "Tab") {
                e.preventDefault();
                var inputs = tableCellInputs();
                var pos = inputs.indexOf(input);
                var next = inputs[pos + (e.shiftKey ? -1 : 1)];
                if (next) {
                    next.focus();
                    next.select();
                } else if (!e.shiftKey) {
                    addTableRow(0);
                }
            } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                var r = parseInt(input.getAttribute("data-r"), 10);
                var c = parseInt(input.getAttribute("data-c"), 10);
                var below = tableGrid.querySelector(
                    'input.tbl-cell[data-r="' + (r + 1) + '"][data-c="' + c + '"]');
                if (below) {
                    below.focus();
                    below.select();
                } else if (r === tableData.length - 1) {
                    addTableRow(c);
                }
            }
        });

        tableEditor.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closeTableEditor();
            } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                applyTableEditor();
            }
        });

        tableEditor.addEventListener("click", function (e) {
            if (Date.now() < dialogClickSuppressUntil) return;
            if (e.target === tableEditor) closeTableEditor();
        });
    }

    /* ===================== UI 布局设计器 ===================== */
    var UI_TYPE_LABELS = {
        page: "页面", navbar: "导航栏", sidebar: "侧边栏", content: "内容区",
        card: "卡片", button: "按钮", input: "输入框", form: "表单",
        heading: "标题", text: "文本", image: "图片", avatar: "头像",
        table: "表格", list: "列表", model3d: "3D 模型", scene3d: "3D 空间",
        filebrowser: "文件浏览器", database: "数据库", animation: "动画",
        canvas: "Canvas", gif: "GIF"
    };

    var UI_DEFAULT_SIZE = {
        page: [960, 600], navbar: [960, 56], sidebar: [220, 544],
        content: [740, 544], card: [260, 160], button: [120, 40],
        input: [220, 40], form: [280, 190], heading: [260, 40],
        text: [260, 60], image: [240, 160], avatar: [72, 72],
        table: [360, 180], list: [240, 140], model3d: [240, 180],
        scene3d: [320, 200], filebrowser: [300, 200], database: [240, 160],
        animation: [260, 160], canvas: [280, 180], gif: [240, 160]
    };

    function uiClamp(value, min, max, fallback) {
        var n = Number(value);
        if (!isFinite(n)) n = fallback;
        return Math.max(min, Math.min(max, n));
    }

    function uiMaxElementSeq(elements) {
        var max = 0;
        (elements || []).forEach(function (el) {
            var m = /^e(\d+)$/.exec(String(el.id || ""));
            if (m) max = Math.max(max, parseInt(m[1], 10));
        });
        return max;
    }

    function normalizeUiLayout(raw) {
        if (!raw || typeof raw !== "object") return null;
        var width = Math.round(uiClamp(raw.width, 320, 1920, 960));
        var height = Math.round(uiClamp(raw.height, 240, 1200, 600));
        var elements = [];
        var usedIds = Object.create(null);
        var sourceElements = Array.isArray(raw.elements) ? raw.elements : [];
        sourceElements.forEach(function (item, index) {
            if (!item || typeof item !== "object" || !UI_TYPE_LABELS[item.type]) return;
            var w = Math.round(uiClamp(item.w, 24, width, 200));
            var h = Math.round(uiClamp(item.h, 18, height, 80));
            var x = Math.round(uiClamp(item.x, 0, Math.max(0, width - w), 24));
            var y = Math.round(uiClamp(item.y, 0, Math.max(0, height - h), 24));
            w = Math.min(w, width);
            h = Math.min(h, height);
            x = Math.min(x, width - w);
            y = Math.min(y, height - h);
            var id = String(item.id || "").trim();
            if (!id || usedIds[id]) id = "e" + (index + 1);
            while (usedIds[id]) id = "e" + (++index + 1);
            usedIds[id] = true;
            var props = item.props && typeof item.props === "object" ? item.props : {};
            var el = {
                id: id,
                type: item.type,
                x: x, y: y, w: w, h: h,
                text: String(item.text == null ? "" : item.text),
                props: {
                    src: String(props.src == null ? "" : props.src),
                    note: String(props.note == null ? "" : props.note)
                }
            };
            elements.push(el);
        });
        return { width: width, height: height, elements: elements };
    }

    function parseUiLayout(source) {
        try {
            return normalizeUiLayout(JSON.parse(String(source || "")));
        } catch (e) {
            return null;
        }
    }

    /* 扫描 cm 中指定语言的围栏代码块（支持 ``` 与 ~~~） */
    function findFencedBlocks(language) {
        var lines = cm.getValue().split(/\r?\n/);
        var blocks = [];
        var open = null;
        for (var i = 0; i < lines.length; i++) {
            var m = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)/.exec(lines[i]);
            if (!open) {
                if (m && m[2].toLowerCase() === language) {
                    open = { start: i, char: m[1].charAt(0), len: m[1].length };
                }
                continue;
            }
            if (m && m[1].charAt(0) === open.char && m[1].length >= open.len) {
                blocks.push({ start: open.start, end: i });
                open = null;
            }
        }
        return blocks;
    }

    function replaceFencedBlock(language, index, body) {
        var blocks = findFencedBlocks(language);
        if (!blocks[index]) return false;
        var lines = cm.getValue().split(/\r?\n/);
        var block = blocks[index];
        var text = "```" + language + "\n" + body + "\n```";
        cm.replaceRange(text,
            { line: block.start, ch: 0 },
            { line: block.end, ch: lines[block.end].length });
        return true;
    }

    function uiResolveAsset(src) {
        var text = String(src || "").trim();
        if (!text) return "";
        var absolute = /^[a-zA-Z]:[\\/]/.test(text) || text.indexOf("\\\\") === 0;
        if (!absolute && !/^[a-z][a-z0-9+.-]*:/i.test(text) && text.indexOf("//") !== 0) {
            var rel = text.replace(/^\.\//, "").replace(/\\/g, "/");
            if (rel.charAt(0) === "/") rel = rel.replace(/^\/+/, "");
            return "https://mdfile.local/" + encodeRelativePath(rel);
        }
        return text;
    }

    function uiPreviewHtml(el) {
        var label = escapeHtml(el.text || UI_TYPE_LABELS[el.type] || el.type);
        var note = el.props && el.props.note
            ? '<div class="ui-el-note">' + escapeHtml(el.props.note) + "</div>" : "";
        var src = uiResolveAsset(el.props && el.props.src);
        switch (el.type) {
            case "page":
                return '<div class="ui-preview-title">' + label +
                    '</div><div class="ui-preview-lines"><i></i><i></i><i></i></div>';
            case "navbar":
                return "<span>" + label + '</span><span class="ui-nav-links">首页 · 产品 · 文档</span>';
            case "sidebar":
                return '<div class="ui-side-title">' + label +
                    '</div><div class="ui-side-lines"><i></i><i></i><i></i><i></i></div>' + note;
            case "content":
                return '<div class="ui-preview-title">' + label +
                    '</div><div class="ui-preview-lines"><i></i><i></i><i></i></div>' + note;
            case "card":
                return '<div class="ui-preview-title">' + label +
                    '</div><div class="ui-preview-lines"><i></i><i></i></div>' + note;
            case "button":
                return label;
            case "input":
                return "<span>" + label + "</span>";
            case "form":
                return '<div class="ui-preview-title">' + label +
                    '</div><div class="ui-form-line"></div><div class="ui-form-line"></div>' +
                    '<div class="ui-form-line short"></div><div class="ui-form-button">提交</div>';
            case "heading":
                return label;
            case "text":
                return "<div>" + label + '</div><div class="ui-preview-lines"><i></i><i></i></div>' + note;
            case "image":
                return src
                    ? '<img class="ui-el-img" src="' + escapeHtml(src) + '" alt="">'
                    : '<div class="ui-image-ph">' + label + "</div>" + note;
            case "gif":
                return (src
                    ? '<img class="ui-el-img" src="' + escapeHtml(src) + '" alt="">'
                    : '<div class="ui-gif-ph">GIF</div>') +
                    '<span class="ui-gif-badge">GIF</span>' + note;
            case "avatar":
                return '<div class="ui-el-centered">' + label + "</div>";
            case "table":
                return '<div class="ui-preview-title">' + label +
                    '</div><div class="ui-table-preview">' +
                    "<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>";
            case "list":
                return '<div class="ui-preview-title">' + label +
                    '</div><div class="ui-list-preview"><i></i><i></i><i></i></div>';
            case "model3d":
                return '<div class="ui-cube"></div><div class="ui-el-centered">' + label + "</div>" + note;
            case "scene3d":
                return '<div class="ui-scene-grid"></div><div class="ui-cube"></div>' +
                    '<div class="ui-el-centered">' + label + "</div>" + note;
            case "filebrowser":
                return '<div class="ui-filebar"></div><div class="ui-filelist">' +
                    "<i></i><i></i><i></i><i></i></div>" +
                    '<div class="ui-el-note">' + label + "</div>" + note;
            case "database":
                return '<div class="ui-preview-title">' + label + '</div><div class="ui-db"></div>' + note;
            case "animation":
                return '<div class="ui-play"></div><div class="ui-timeline"></div>' +
                    '<div class="ui-el-note">' + label + "</div>" + note;
            case "canvas":
                return '<div class="ui-checker"></div><div class="ui-el-centered">' + label + "</div>" + note;
            default:
                return label;
        }
    }

    function uiElementPercentStyle(el, width, height) {
        return "left:" + (el.x / width * 100).toFixed(4) + "%;" +
            "top:" + (el.y / height * 100).toFixed(4) + "%;" +
            "width:" + (el.w / width * 100).toFixed(4) + "%;" +
            "height:" + (el.h / height * 100).toFixed(4) + "%;";
    }

    function buildUiWireframe(layout) {
        var box = document.createElement("div");
        box.className = "ui-wireframe";
        box.style.aspectRatio = layout.width + " / " + layout.height;
        layout.elements.forEach(function (el) {
            var node = document.createElement("div");
            node.className = "ui-el ui-el-" + el.type;
            node.setAttribute("style", uiElementPercentStyle(el, layout.width, layout.height));
            node.innerHTML = uiPreviewHtml(el);
            box.appendChild(node);
        });
        return box;
    }

    function renderUiBlocks() {
        var root = document.getElementById("md-body");
        var codes = root.querySelectorAll("pre > code.language-ui");
        var index = 0;
        for (var i = 0; i < codes.length; i++) {
            var code = codes[i];
            var pre = code.parentNode;
            if (!pre || pre.tagName !== "PRE") continue;
            var source = code.textContent || "";
            var layout = parseUiLayout(source);
            var block = document.createElement("div");
            block.className = "ui-block";
            block.setAttribute("data-ui-index", String(index));
            var head = document.createElement("div");
            head.className = "ui-block-head";
            var title = document.createElement("span");
            title.textContent = layout
                ? "UI 布局 · " + layout.width + " × " + layout.height
                : "UI 布局 · JSON 错误";
            head.appendChild(title);
            if (layout) {
                block.setAttribute("data-ui-src", source);
                var btn = document.createElement("button");
                btn.type = "button";
                btn.className = "ui-edit-btn";
                btn.textContent = "编辑";
                btn.title = "打开 UI 布局设计器";
                btn.addEventListener("click", (function (idx, src) {
                    return function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        openUiEditor(idx, src);
                    };
                })(index, source));
                head.appendChild(btn);
                block.appendChild(head);
                block.appendChild(buildUiWireframe(layout));
            } else {
                block.appendChild(head);
                var err = document.createElement("div");
                err.className = "ui-error";
                err.textContent = "UI 布局 JSON 解析失败，请在编辑器中修正该代码块。";
                block.appendChild(err);
            }
            pre.parentNode.replaceChild(block, pre);
            index++;
        }
    }

    function uiLayoutJson() {
        var out = {
            width: uiLayout.width,
            height: uiLayout.height,
            elements: uiLayout.elements.map(function (el) {
                var item = {
                    id: el.id, type: el.type,
                    x: Math.round(el.x), y: Math.round(el.y),
                    w: Math.round(el.w), h: Math.round(el.h),
                    text: el.text || ""
                };
                if ((el.props && el.props.src) || (el.props && el.props.note)) {
                    item.props = {};
                    if (el.props.src) item.props.src = el.props.src;
                    if (el.props.note) item.props.note = el.props.note;
                }
                return item;
            })
        };
        return JSON.stringify(out, null, 2);
    }

    /* ===================== 弹窗拖动 / 缩放 ===================== */
    function dialogMinSize(box) {
        return {
            width: parseInt(box.getAttribute("data-min-width"), 10) || 520,
            height: parseInt(box.getAttribute("data-min-height"), 10) || 320
        };
    }

    function getDialogRect(modal, box) {
        var mr = modal.getBoundingClientRect();
        var br = box.getBoundingClientRect();
        return {
            left: br.left - mr.left,
            top: br.top - mr.top,
            width: br.width,
            height: br.height
        };
    }

    function clampDialogRect(modal, rect, minW, minH) {
        var vw = modal.clientWidth || window.innerWidth;
        var vh = modal.clientHeight || window.innerHeight;
        var margin = 8;
        var maxW = Math.max(240, vw - margin * 2);
        var maxH = Math.max(180, vh - margin * 2);
        var w = Math.min(maxW, Math.max(Math.min(minW, maxW), rect.width || 0));
        var h = Math.min(maxH, Math.max(Math.min(minH, maxH), rect.height || 0));
        var left = Math.max(margin, Math.min(rect.left || 0, vw - w - margin));
        var top = Math.max(margin, Math.min(rect.top || 0, vh - h - margin));
        return { left: left, top: top, width: w, height: h };
    }

    function applyDialogRect(box, rect) {
        var key = box.getAttribute("data-dialog-key") || "dialog";
        box.style.position = "absolute";
        box.style.boxSizing = "border-box";
        box.style.left = Math.round(rect.left) + "px";
        box.style.top = Math.round(rect.top) + "px";
        box.style.width = Math.round(rect.width) + "px";
        box.style.height = Math.round(rect.height) + "px";
        box.style.maxWidth = "none";
        box.style.maxHeight = "none";
        box.style.margin = "0";
        box.style.transform = "none";
        dialogRects[key] = {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        };
    }

    function measureDialogRect(modal, box, minW, minH) {
        box.style.position = "absolute";
        box.style.left = "0px";
        box.style.top = "0px";
        box.style.width = "";
        box.style.height = "";
        box.style.maxWidth = "none";
        box.style.maxHeight = "none";
        box.style.transform = "none";
        var br = box.getBoundingClientRect();
        var vw = modal.clientWidth || window.innerWidth;
        var vh = modal.clientHeight || window.innerHeight;
        var maxW = Math.max(240, vw - 16);
        var maxH = Math.max(180, vh - 16);
        var w = Math.min(maxW, Math.max(minW, br.width || minW));
        var h = Math.min(maxH, Math.max(minH, br.height || minH));
        return { left: (vw - w) / 2, top: (vh - h) / 2, width: w, height: h };
    }

    function layoutFloatingDialog(modal, box) {
        if (!modal || !box || modal.hidden) return;
        var min = dialogMinSize(box);
        var key = box.getAttribute("data-dialog-key") || "dialog";
        var rect = dialogRects[key];
        if (!rect) rect = measureDialogRect(modal, box, min.width, min.height);
        rect = clampDialogRect(modal, rect, min.width, min.height);
        applyDialogRect(box, rect);
    }

    function dialogResizeCursor(dir) {
        var map = {
            n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
            ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize"
        };
        return map[dir] || "default";
    }

    function startDialogPointer(modal, box, e, dir) {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        var min = dialogMinSize(box);
        var vw = modal.clientWidth || window.innerWidth;
        var vh = modal.clientHeight || window.innerHeight;
        var minW = Math.min(min.width, Math.max(240, vw - 16));
        var minH = Math.min(min.height, Math.max(180, vh - 16));
        var start = getDialogRect(modal, box);
        var startX = e.clientX;
        var startY = e.clientY;
        var margin = 8;
        var oldCursor = document.body.style.cursor;
        document.body.classList.add("dialog-dragging");
        document.body.style.cursor = dir ? dialogResizeCursor(dir) : "grabbing";

        function onMove(ev) {
            var dx = ev.clientX - startX;
            var dy = ev.clientY - startY;
            var left = start.left;
            var top = start.top;
            var right = start.left + start.width;
            var bottom = start.top + start.height;
            if (dir) {
                if (dir.indexOf("e") >= 0)
                    right = Math.min(vw - margin, Math.max(left + minW, right + dx));
                if (dir.indexOf("w") >= 0)
                    left = Math.min(right - minW, Math.max(margin, left + dx));
                if (dir.indexOf("s") >= 0)
                    bottom = Math.min(vh - margin, Math.max(top + minH, bottom + dy));
                if (dir.indexOf("n") >= 0)
                    top = Math.min(bottom - minH, Math.max(margin, top + dy));
            } else {
                left += dx;
                top += dy;
            }
            var next = dir
                ? { left: left, top: top, width: right - left, height: bottom - top }
                : { left: left, top: top, width: start.width, height: start.height };
            applyDialogRect(box, clampDialogRect(modal, next, minW, minH));
        }

        function onUp() {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointercancel", onUp);
            document.body.classList.remove("dialog-dragging");
            document.body.style.cursor = oldCursor;
            dialogClickSuppressUntil = Date.now() + 250;
        }

        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
    }

    function addDialogResizeHandles(modal, box) {
        if (!box || box.querySelector(".dialog-resize-handle")) return;
        ["n", "s", "e", "w", "ne", "nw", "se", "sw"].forEach(function (dir) {
            var handle = document.createElement("div");
            handle.className = "dialog-resize-handle dialog-resize-" + dir +
                (dir === "se" ? " dialog-resize-grip" : "");
            handle.setAttribute("data-dir", dir);
            handle.setAttribute("aria-hidden", "true");
            handle.addEventListener("pointerdown", function (e) {
                startDialogPointer(modal, box, e, dir);
            });
            box.appendChild(handle);
        });
    }

    function setupFloatingDialog(modal, box, key, minW, minH) {
        if (!modal || !box) return;
        box.setAttribute("data-dialog-key", key);
        box.setAttribute("data-min-width", String(minW));
        box.setAttribute("data-min-height", String(minH));
        addDialogResizeHandles(modal, box);

        var head = box.querySelector(".mermaid-editor-head");
        if (head) {
            head.title = "拖动标题栏移动；拖动边缘缩放；双击标题重置大小";
            head.addEventListener("pointerdown", function (e) {
                if (e.button !== undefined && e.button !== 0) return;
                var target = e.target;
                if (target && target.closest &&
                    target.closest("button, input, select, textarea, .mermaid-editor-tabs")) return;
                startDialogPointer(modal, box, e, null);
            });
            head.addEventListener("dblclick", function (e) {
                var target = e.target;
                if (target && target.closest &&
                    target.closest("button, input, select, textarea, .mermaid-editor-tabs")) return;
                delete dialogRects[key];
                layoutFloatingDialog(modal, box);
            });
        }

        window.addEventListener("resize", function () {
            if (modal.hidden) return;
            var min = dialogMinSize(box);
            var rect = dialogRects[key];
            if (!rect) return;
            applyDialogRect(box, clampDialogRect(modal, rect, min.width, min.height));
        });
    }

    setupFloatingDialog(mermaidEditor, mermaidEditorBox, "mermaid", 640, 420);
    setupFloatingDialog(tableEditor, tableEditorBox, "table", 520, 320);
    setupFloatingDialog(uiEditor, uiEditorBox, "ui", 900, 560);

    /* ===================== UI 布局编辑器逻辑 ===================== */
    function uiSelectedElement() {
        if (!uiLayout || !uiSelectedId) return null;
        for (var i = 0; i < uiLayout.elements.length; i++) {
            if (uiLayout.elements[i].id === uiSelectedId) return uiLayout.elements[i];
        }
        return null;
    }

    function uiCanvasNode(id) {
        return id ? uiCanvas.querySelector('.ui-canvas-el[data-id="' + id + '"]') : null;
    }

    function uiDefaultPosition(type, w, h) {
        var W = uiLayout.width;
        var H = uiLayout.height;
        if (type === "page") return [0, 0];
        if (type === "navbar") return [0, 0];
        if (type === "sidebar") return [0, Math.min(56, H - h)];
        if (type === "content") return [Math.min(220, W - w), Math.min(56, H - h)];
        var n = uiLayout.elements.length % 8;
        return [
            Math.max(0, Math.min(W - w, 24 + n * 20)),
            Math.max(0, Math.min(H - h, 24 + n * 20))
        ];
    }

    function buildUiCanvasElement(el) {
        var node = document.createElement("div");
        node.className = "ui-canvas-el" + (el.id === uiSelectedId ? " selected" : "");
        node.setAttribute("data-id", el.id);
        node.setAttribute("data-type", el.type);
        node.style.left = el.x + "px";
        node.style.top = el.y + "px";
        node.style.width = el.w + "px";
        node.style.height = el.h + "px";
        node.title = UI_TYPE_LABELS[el.type] + "：" + (el.text || "（未填写文字）");
        var label = document.createElement("div");
        label.className = "ui-canvas-label";
        label.textContent = el.text || UI_TYPE_LABELS[el.type];
        node.appendChild(label);
        if (el.props && el.props.note) {
            var note = document.createElement("div");
            note.className = "ui-canvas-note";
            note.textContent = el.props.note;
            node.appendChild(note);
        }
        ["nw", "ne", "sw", "se"].forEach(function (dir) {
            var handle = document.createElement("span");
            handle.className = "ui-canvas-resize ui-resize-" + dir;
            handle.setAttribute("data-dir", dir);
            node.appendChild(handle);
        });
        return node;
    }

    function uiSyncPropInputs() {
        var el = uiSelectedElement();
        if (!el) return;
        uiPropText.value = el.text || "";
        uiPropSrc.value = (el.props && el.props.src) || "";
        uiPropNote.value = (el.props && el.props.note) || "";
        uiPropX.value = Math.round(el.x);
        uiPropY.value = Math.round(el.y);
        uiPropW.value = Math.round(el.w);
        uiPropH.value = Math.round(el.h);
    }

    function uiRenderProps() {
        var el = uiSelectedElement();
        if (!el) {
            uiPropsEmpty.hidden = false;
            uiPropsFields.hidden = true;
            uiPropType.textContent = "";
            return;
        }
        uiPropsEmpty.hidden = true;
        uiPropsFields.hidden = false;
        uiPropType.textContent = UI_TYPE_LABELS[el.type];
        uiSyncPropInputs();
    }

    function uiSelectElement(id) {
        uiSelectedId = id || null;
        var nodes = uiCanvas.querySelectorAll(".ui-canvas-el");
        for (var i = 0; i < nodes.length; i++) {
            nodes[i].classList.toggle("selected", nodes[i].getAttribute("data-id") === uiSelectedId);
        }
        uiRenderProps();
    }

    function uiUpdateCanvasLabel(el) {
        var node = uiCanvasNode(el.id);
        if (!node) return;
        var label = node.querySelector(".ui-canvas-label");
        if (label) label.textContent = el.text || UI_TYPE_LABELS[el.type];
        var note = node.querySelector(".ui-canvas-note");
        if (el.props && el.props.note) {
            if (!note) {
                note = document.createElement("div");
                note.className = "ui-canvas-note";
                node.appendChild(note);
            }
            note.textContent = el.props.note;
        } else if (note) {
            note.parentNode.removeChild(note);
        }
        node.title = UI_TYPE_LABELS[el.type] + "：" + (el.text || "（未填写文字）");
    }

    function uiApplyElementGeometry(el, x, y, w, h) {
        w = Math.max(24, Math.min(uiLayout.width, Math.round(w)));
        h = Math.max(18, Math.min(uiLayout.height, Math.round(h)));
        x = Math.max(0, Math.min(uiLayout.width - w, Math.round(x)));
        y = Math.max(0, Math.min(uiLayout.height - h, Math.round(y)));
        el.x = x;
        el.y = y;
        el.w = w;
        el.h = h;
        var node = uiCanvasNode(el.id);
        if (node) {
            node.style.left = x + "px";
            node.style.top = y + "px";
            node.style.width = w + "px";
            node.style.height = h + "px";
        }
        if (el.id === uiSelectedId) uiSyncPropInputs();
    }

    function uiStartElementPointer(el, e, dir) {
        if (!el || !uiLayout) return;
        e.preventDefault();
        e.stopPropagation();
        var start = { x: el.x, y: el.y, w: el.w, h: el.h };
        var startX = e.clientX;
        var startY = e.clientY;
        var oldCursor = document.body.style.cursor;
        document.body.classList.add("dialog-dragging");
        document.body.style.cursor = dir ? ({
            nw: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", se: "nwse-resize"
        }[dir] || "move") : "move";

        function onMove(ev) {
            var dx = Math.round((ev.clientX - startX) / 5) * 5;
            var dy = Math.round((ev.clientY - startY) / 5) * 5;
            if (!dir) {
                uiApplyElementGeometry(el, start.x + dx, start.y + dy, start.w, start.h);
                return;
            }
            var x = start.x;
            var y = start.y;
            var w = start.w;
            var h = start.h;
            if (dir.indexOf("e") >= 0) w = start.w + dx;
            if (dir.indexOf("s") >= 0) h = start.h + dy;
            if (dir.indexOf("w") >= 0) {
                x = start.x + dx;
                w = start.w - dx;
                if (w < 24) {
                    x = start.x + start.w - 24;
                    w = 24;
                }
            }
            if (dir.indexOf("n") >= 0) {
                y = start.y + dy;
                h = start.h - dy;
                if (h < 18) {
                    y = start.y + start.h - 18;
                    h = 18;
                }
            }
            if (w < 24) w = 24;
            if (h < 18) h = 18;
            uiApplyElementGeometry(el, x, y, w, h);
        }

        function onUp() {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointercancel", onUp);
            document.body.classList.remove("dialog-dragging");
            document.body.style.cursor = oldCursor;
            uiSyncPropInputs();
        }

        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
    }

    function uiRenderEditor() {
        if (!uiCanvas || !uiLayout) return;
        uiCanvas.style.width = uiLayout.width + "px";
        uiCanvas.style.height = uiLayout.height + "px";
        uiCanvas.innerHTML = "";
        uiLayout.elements.forEach(function (el) {
            uiCanvas.appendChild(buildUiCanvasElement(el));
        });
        uiEditorSize.textContent = uiLayout.width + " × " + uiLayout.height;
        uiCanvasWidth.value = uiLayout.width;
        uiCanvasHeight.value = uiLayout.height;
        if (uiSelectedId && !uiSelectedElement()) uiSelectedId = null;
        uiRenderProps();
    }

    function addUiElement(type) {
        if (!uiLayout || !UI_TYPE_LABELS[type]) return;
        var size = UI_DEFAULT_SIZE[type] || [200, 100];
        var w = Math.min(size[0], uiLayout.width);
        var h = Math.min(size[1], uiLayout.height);
        var pos = uiDefaultPosition(type, w, h);
        var el = {
            id: "e" + (++uiElementSeq),
            type: type,
            x: pos[0], y: pos[1], w: w, h: h,
            text: "",
            props: { src: "", note: "" }
        };
        if (type === "page") {
            uiLayout.elements.unshift(el);
        } else {
            uiLayout.elements.push(el);
        }
        uiSelectedId = el.id;
        uiRenderEditor();
        uiEditorHint.textContent = "已添加 " + UI_TYPE_LABELS[type] + "；可在右侧修改文字、资源与尺寸";
        var node = uiCanvasNode(el.id);
        if (node && node.scrollIntoView) node.scrollIntoView({ block: "nearest", inline: "nearest" });
    }

    function deleteUiSelected() {
        if (!uiLayout || !uiSelectedId) return;
        uiLayout.elements = uiLayout.elements.filter(function (el) { return el.id !== uiSelectedId; });
        uiSelectedId = null;
        uiRenderEditor();
    }

    function applyUiCanvasSize() {
        if (!uiLayout) return;
        var w = Math.round(uiClamp(uiCanvasWidth.value, 320, 1920, uiLayout.width));
        var h = Math.round(uiClamp(uiCanvasHeight.value, 240, 1200, uiLayout.height));
        uiLayout.width = w;
        uiLayout.height = h;
        uiLayout.elements.forEach(function (el) {
            el.w = Math.min(el.w, w);
            el.h = Math.min(el.h, h);
            el.x = Math.min(el.x, w - el.w);
            el.y = Math.min(el.y, h - el.h);
        });
        uiRenderEditor();
        uiEditorHint.textContent = "画布尺寸已调整为 " + w + " × " + h;
    }

    function uiSyncPropsFromFields() {
        var el = uiSelectedElement();
        if (!el) return;
        el.text = uiPropText.value;
        el.props.src = uiPropSrc.value;
        el.props.note = uiPropNote.value;
        var x = parseFloat(uiPropX.value);
        var y = parseFloat(uiPropY.value);
        var w = parseFloat(uiPropW.value);
        var h = parseFloat(uiPropH.value);
        if (isFinite(x) && isFinite(y) && isFinite(w) && isFinite(h)) {
            uiApplyElementGeometry(el, x, y, w, h);
        }
        uiUpdateCanvasLabel(el);
    }

    function openUiEditor(index, source) {
        if (!uiEditor) return;
        var parsed = (index === null || index === undefined || index === "") ? null : parseInt(index, 10);
        if (parsed !== null && isNaN(parsed)) parsed = null;
        uiEditIndex = parsed;
        uiSelectedId = null;

        if (uiEditIndex === null) {
            uiLayout = { width: 960, height: 600, elements: [] };
            uiElementSeq = 0;
            uiEditorTitle.textContent = "插入 UI 布局";
            uiEditorHint.textContent = "从左侧添加组件；Ctrl+Enter 应用 · Esc 取消";
        } else {
            var layout = parseUiLayout(source || "");
            if (!layout) {
                postMessage({ type: "status", text: "UI 布局 JSON 解析失败，请先修正代码块" });
                return;
            }
            uiLayout = layout;
            uiElementSeq = uiMaxElementSeq(layout.elements);
            uiEditorTitle.textContent = "编辑 UI 布局";
            uiEditorHint.textContent = "拖动组件移动，拖动角点缩放；Ctrl+Enter 应用 · Esc 取消";
        }

        uiEditor.hidden = false;
        uiRenderEditor();
        layoutFloatingDialog(uiEditor, uiEditorBox);
        uiCanvasWrap.scrollLeft = 0;
        uiCanvasWrap.scrollTop = 0;
        setTimeout(function () { uiCanvas.focus(); }, 30);
    }

    function closeUiEditor() {
        if (!uiEditor) return;
        uiEditor.hidden = true;
        uiLayout = null;
        uiSelectedId = null;
        uiEditIndex = null;
        if (viewMode !== "preview") cm.focus();
    }

    function applyUiEditor() {
        if (!uiEditor || uiEditor.hidden || !uiLayout) return;
        uiSyncPropsFromFields();
        var json = uiLayoutJson();
        if (uiEditIndex === null) {
            insertMarkdownBlockAtCursor("```ui\n" + json + "\n```");
        } else if (!replaceFencedBlock("ui", uiEditIndex, json)) {
            uiEditorHint.textContent = "未找到对应的 UI 代码块，可能已被外部修改";
            postMessage({ type: "status", text: "未找到对应的 UI 代码块，可能已被外部修改" });
            return;
        }
        closeUiEditor();
    }

    if (uiEditor) {
        document.getElementById("ui-editor-close").addEventListener("click", closeUiEditor);
        document.getElementById("ui-editor-cancel").addEventListener("click", closeUiEditor);
        document.getElementById("ui-editor-apply").addEventListener("click", applyUiEditor);
        document.getElementById("ui-canvas-size-apply").addEventListener("click", applyUiCanvasSize);
        document.getElementById("ui-delete-el").addEventListener("click", deleteUiSelected);

        uiPalette.addEventListener("click", function (e) {
            var btn = e.target && e.target.closest ? e.target.closest("button[data-type]") : null;
            if (btn) addUiElement(btn.getAttribute("data-type"));
        });

        uiCanvas.addEventListener("pointerdown", function (e) {
            var node = e.target && e.target.closest ? e.target.closest(".ui-canvas-el") : null;
            if (!node) {
                uiSelectElement(null);
                return;
            }
            var el = null;
            for (var i = 0; i < uiLayout.elements.length; i++) {
                if (uiLayout.elements[i].id === node.getAttribute("data-id")) {
                    el = uiLayout.elements[i];
                    break;
                }
            }
            if (!el) return;
            uiSelectElement(el.id);
            uiCanvas.focus();
            var handle = e.target.closest ? e.target.closest(".ui-canvas-resize") : null;
            uiStartElementPointer(el, e, handle ? handle.getAttribute("data-dir") : null);
        });

        uiPropText.addEventListener("input", function () {
            var el = uiSelectedElement();
            if (!el) return;
            el.text = uiPropText.value;
            uiUpdateCanvasLabel(el);
        });
        uiPropSrc.addEventListener("input", function () {
            var el = uiSelectedElement();
            if (el) el.props.src = uiPropSrc.value;
        });
        uiPropNote.addEventListener("input", function () {
            var el = uiSelectedElement();
            if (!el) return;
            el.props.note = uiPropNote.value;
            uiUpdateCanvasLabel(el);
        });
        [uiPropX, uiPropY, uiPropW, uiPropH].forEach(function (input) {
            input.addEventListener("change", uiSyncPropsFromFields);
        });

        uiCanvasWidth.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); applyUiCanvasSize(); }
        });
        uiCanvasHeight.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); applyUiCanvasSize(); }
        });

        uiEditor.addEventListener("keydown", function (e) {
            var editable = e.target && (e.target.tagName === "INPUT" ||
                e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" ||
                e.target.isContentEditable);
            var onControl = e.target && e.target.closest &&
                e.target.closest("button, a, select");
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closeUiEditor();
            } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                applyUiEditor();
            } else if (!editable && !onControl && (e.key === "Delete" || e.key === "Backspace")) {
                if (uiSelectedId) {
                    e.preventDefault();
                    deleteUiSelected();
                }
            } else if (!editable && !onControl && /^Arrow(Left|Right|Up|Down)$/.test(e.key) && uiSelectedId) {
                e.preventDefault();
                var el = uiSelectedElement();
                if (!el) return;
                var step = e.shiftKey ? 10 : 1;
                if (e.key === "ArrowLeft") el.x -= step;
                if (e.key === "ArrowRight") el.x += step;
                if (e.key === "ArrowUp") el.y -= step;
                if (e.key === "ArrowDown") el.y += step;
                uiApplyElementGeometry(el, el.x, el.y, el.w, el.h);
            }
        });

        uiEditor.addEventListener("click", function (e) {
            if (Date.now() < dialogClickSuppressUntil) return;
            if (e.target === uiEditor) closeUiEditor();
        });
    }

    /* 双击图表直接打开源码编辑器 */
    document.getElementById("md-body").addEventListener("dblclick", function (e) {
        if (e.target && e.target.closest && e.target.closest(".mermaid-edit-btn")) return;
        var uiBlock = e.target && e.target.closest ? e.target.closest(".ui-block") : null;
        if (uiBlock && !(e.target.closest && e.target.closest(".ui-edit-btn"))) {
            var uiSource = uiBlock.getAttribute("data-ui-src");
            if (uiSource != null) {
                e.preventDefault();
                openUiEditor(parseInt(uiBlock.getAttribute("data-ui-index"), 10), uiSource);
                return;
            }
        }
        var tableWrap = e.target && e.target.closest ? e.target.closest(".table-wrap") : null;
        if (tableWrap && !(e.target.closest && e.target.closest(".table-edit-btn"))) {
            e.preventDefault();
            openTableEditor(parseInt(tableWrap.getAttribute("data-table-index"), 10));
            return;
        }
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
        renderUiBlocks();
        decorateTableNodes();

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
            body.querySelectorAll(".mermaid-edit-btn, .table-edit-btn, .ui-edit-btn").forEach(function (b) { b.remove(); });
            body.querySelectorAll(".ui-block-head").forEach(function (h) { h.remove(); });
            body.querySelectorAll(".table-wrap").forEach(function (wrap) {
                while (wrap.firstChild) wrap.parentNode.insertBefore(wrap.firstChild, wrap);
                wrap.parentNode.removeChild(wrap);
            });
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
        } else if (data.type === "tableEditor") {
            openTableEditor(null, data.rows, data.cols);
        } else if (data.type === "uiEditor") {
            openUiEditor(null, null);
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
        if (tableEditor && !tableEditor.hidden) return;     // 表格弹窗自行处理 Esc/Ctrl+Enter
        if (uiEditor && !uiEditor.hidden) return;           // UI 布局弹窗自行处理 Esc/Ctrl+Enter
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
