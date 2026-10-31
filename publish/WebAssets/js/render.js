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
    var uiPropParent = document.getElementById("ui-prop-parent");
    var uiPropExtra = document.getElementById("ui-prop-extra");
    var uiPropText = document.getElementById("ui-prop-text");
    var uiPropSrc = document.getElementById("ui-prop-src");
    var uiPropSrcBrowse = document.getElementById("ui-prop-src-browse");
    var uiPropNote = document.getElementById("ui-prop-note");
    var uiPropX = document.getElementById("ui-prop-x");
    var uiPropY = document.getElementById("ui-prop-y");
    var uiPropW = document.getElementById("ui-prop-w");
    var uiPropH = document.getElementById("ui-prop-h");
    var uiCanvasWidth = document.getElementById("ui-canvas-width");
    var uiCanvasHeight = document.getElementById("ui-canvas-height");
    var uiPageTabs = document.getElementById("ui-page-tabs");
    var uiPageAdd = document.getElementById("ui-page-add");
    var uiPageProps = document.getElementById("ui-page-props");
    var uiPageName = document.getElementById("ui-page-name");
    var uiPageKind = document.getElementById("ui-page-kind");
    var uiPageParent = document.getElementById("ui-page-parent");
    var uiPageX = document.getElementById("ui-page-x");
    var uiPageY = document.getElementById("ui-page-y");
    var uiPageOpen = document.getElementById("ui-page-open");
    var uiPageStart = document.getElementById("ui-page-start");
    var uiPageDelete = document.getElementById("ui-page-delete");
    var uiStructure = document.getElementById("ui-structure");
    var uiLogicToggle = document.getElementById("ui-logic-toggle");
    var uiConnectToggle = document.getElementById("ui-connect-toggle");
    var uiInteractions = document.getElementById("ui-interactions");
    var uiAddInteractionBtn = document.getElementById("ui-add-interaction");

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
                idx + '" title="复制代码" aria-label="复制代码">复制</button><code class="' + codeClass + '">' +
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
        token.attrSet("loading", "lazy");
        token.attrSet("decoding", "async");
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
    var uiDoc = null;
    var uiLayout = null;
    var uiSelectedId = null;
    var uiElementSeq = 0;
    var uiPageSeq = 0;
    var uiConnSeq = 0;
    var uiCurrentPageId = null;
    var uiLogicOn = false;
    var uiConnectMode = false;
    var uiConnectFrom = null;
    var uiPickingResource = false;
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

    var UI_TYPE_ICONS = {
        page: "▭", navbar: "☰", sidebar: "▤", content: "▦", card: "▢",
        button: "◉", input: "▭", form: "▤", heading: "H", text: "¶",
        image: "▧", avatar: "○", table: "▦", list: "☷",
        model3d: "◈", scene3d: "⬡", filebrowser: "▣", database: "▤",
        animation: "▶", canvas: "▨", gif: "GIF"
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

    var UI_PAGE_KINDS = { window: "窗口", dialog: "对话框" };
    var UI_EVENTS = ["click", "change", "submit", "select"];
    var UI_ACTIONS = ["open", "close", "navigate", "toggle", "show", "hide", "focus", "setText", "alert", "back"];
    var UI_ACTION_LABELS = {
        open: "打开窗口", close: "关闭窗口", navigate: "切换页面", toggle: "显示/隐藏",
        show: "显示", hide: "隐藏", focus: "聚焦", setText: "设置文字",
        alert: "提示消息", back: "返回上级"
    };
    var UI_EVENT_LABELS = { click: "点击", change: "内容改变", submit: "提交", select: "选择" };

    var UI_ALL_CHILD_TYPES = Object.keys(UI_TYPE_LABELS).filter(function (t) { return t !== "page"; });
    var UI_CONTAINER_RULES = {
        page: UI_ALL_CHILD_TYPES,
        navbar: ["button", "input", "heading", "text", "avatar", "image", "list"],
        sidebar: ["button", "input", "heading", "text", "avatar", "image", "list", "filebrowser"],
        content: UI_ALL_CHILD_TYPES,
        card: ["button", "input", "form", "heading", "text", "image", "avatar", "table", "list",
            "model3d", "scene3d", "filebrowser", "database", "animation", "canvas", "gif"],
        form: ["input", "button", "heading", "text", "avatar"]
    };

    function uiIsContainerType(type) {
        return Object.prototype.hasOwnProperty.call(UI_CONTAINER_RULES, type);
    }

    function uiCanContain(parentType, childType) {
        if (!parentType) return childType !== "page";
        var allowed = UI_CONTAINER_RULES[parentType];
        return !!allowed && allowed.indexOf(childType) >= 0;
    }

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

    function uiMaxElementSeqForDoc(doc) {
        var max = 0;
        (doc && doc.pages || []).forEach(function (page) {
            max = Math.max(max, uiMaxElementSeq(page.elements));
        });
        return max;
    }

    function uiMaxPageSeq(doc) {
        var max = 0;
        (doc && doc.pages || []).forEach(function (page) {
            var m = /^p(\d+)$/.exec(String(page.id || ""));
            if (m) max = Math.max(max, parseInt(m[1], 10));
        });
        return max;
    }

    function uiCloneProps(source) {
        var out = {};
        if (!source || typeof source !== "object") return out;
        Object.keys(source).forEach(function (key) {
            var value = source[key];
            if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                out[key] = value;
            } else if (Array.isArray(value)) {
                out[key] = value.map(function (item) {
                    return typeof item === "string" || typeof item === "number" ? item : String(item);
                });
            }
        });
        return out;
    }

    function uiFindPage(doc, pageId) {
        if (!doc || !pageId) return null;
        for (var i = 0; i < doc.pages.length; i++) {
            if (doc.pages[i].id === pageId) return doc.pages[i];
        }
        return null;
    }

    function uiFindElement(page, elementId) {
        if (!page || !elementId) return null;
        for (var i = 0; i < page.elements.length; i++) {
            if (page.elements[i].id === elementId) return page.elements[i];
        }
        return null;
    }

    function uiFindElementAnywhere(doc, elementId) {
        if (!doc || !elementId) return null;
        for (var i = 0; i < doc.pages.length; i++) {
            var el = uiFindElement(doc.pages[i], elementId);
            if (el) return { page: doc.pages[i], element: el };
        }
        return null;
    }

    function uiPageDescendants(doc, pageId) {
        var result = [];
        var frontier = [pageId];
        while (frontier.length) {
            var current = frontier.shift();
            doc.pages.forEach(function (page) {
                if (page.parentId === current && result.indexOf(page) < 0) {
                    result.push(page);
                    frontier.push(page.id);
                }
            });
        }
        return result;
    }

    function uiElementDescendants(page, elementId) {
        var result = [];
        var frontier = [elementId];
        while (frontier.length) {
            var current = frontier.shift();
            page.elements.forEach(function (el) {
                if (el.parentId === current && result.indexOf(el) < 0) {
                    result.push(el);
                    frontier.push(el.id);
                }
            });
        }
        return result;
    }

    function uiElementDepth(page, el, guard) {
        if (!el.parentId) return 0;
        guard = guard || 0;
        if (guard > 32) return 0;
        var parent = uiFindElement(page, el.parentId);
        return parent ? uiElementDepth(page, parent, guard + 1) + 1 : 0;
    }

    function uiSortedElements(page) {
        return page.elements.map(function (el, index) {
            return { el: el, index: index, depth: uiElementDepth(page, el) };
        }).sort(function (a, b) {
            return a.depth - b.depth || a.index - b.index;
        }).map(function (item) { return item.el; });
    }

    function uiNormalizePage(raw) {
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
            var props = uiCloneProps(item.props);
            elements.push({
                id: id,
                type: item.type,
                parentId: String(item.parentId || "").trim(),
                x: x, y: y, w: w, h: h,
                text: String(item.text == null ? "" : item.text),
                props: props
            });
        });

        elements.forEach(function (el) {
            if (!el.parentId) return;
            var parent = uiFindElement({ elements: elements }, el.parentId);
            if (!parent || parent === el || !uiIsContainerType(parent.type) ||
                !uiCanContain(parent.type, el.type)) {
                el.parentId = "";
                return;
            }
            var chain = [el];
            var cursor = parent;
            var guard = 0;
            while (cursor && guard++ < 64) {
                if (chain.indexOf(cursor) >= 0) {
                    el.parentId = "";
                    break;
                }
                chain.push(cursor);
                cursor = cursor.parentId ? uiFindElement({ elements: elements }, cursor.parentId) : null;
            }
        });

        return {
            id: String(raw.id || "").trim(),
            name: String(raw.name || "").trim(),
            kind: raw.kind === "dialog" ? "dialog" : "window",
            parentId: String(raw.parentId || "").trim(),
            open: raw.open !== false,
            x: Math.round(Number(raw.x) || 0),
            y: Math.round(Number(raw.y) || 0),
            width: width,
            height: height,
            elements: elements
        };
    }

    function uiNormalizeDocument(raw) {
        if (!raw || typeof raw !== "object") return null;
        var sourcePages = Array.isArray(raw.pages) && raw.pages.length
            ? raw.pages
            : (Array.isArray(raw.elements) ? [raw] : []);
        var legacySinglePage = !Array.isArray(raw.pages) && Array.isArray(raw.elements);
        var pages = [];
        var usedPageIds = Object.create(null);
        sourcePages.forEach(function (item, index) {
            var page = uiNormalizePage(item);
            if (!page) return;
            if (!page.id || usedPageIds[page.id]) page.id = "p" + (index + 1);
            while (usedPageIds[page.id]) page.id = "p" + (++index + 1);
            usedPageIds[page.id] = true;
            if (!page.name) page.name = legacySinglePage ? "主窗口" : ("页面 " + (index + 1));
            if (!isFinite(Number(item.x))) page.x = 0;
            if (!isFinite(Number(item.y))) page.y = 0;
            if (isFinite(Number(item.x))) page.x = Math.round(Number(item.x));
            if (isFinite(Number(item.y))) page.y = Math.round(Number(item.y));
            pages.push(page);
        });
        if (!pages.length) return null;

        pages.forEach(function (page) {
            if (!page.parentId) return;
            if (page.parentId === page.id || !uiFindPage({ pages: pages }, page.parentId)) {
                page.parentId = "";
                return;
            }
            var chain = [page];
            var cursor = uiFindPage({ pages: pages }, page.parentId);
            var guard = 0;
            while (cursor && guard++ < 64) {
                if (chain.indexOf(cursor) >= 0) {
                    page.parentId = "";
                    break;
                }
                chain.push(cursor);
                cursor = cursor.parentId ? uiFindPage({ pages: pages }, cursor.parentId) : null;
            }
        });

        var connections = [];
        var usedConnIds = Object.create(null);
        var sourceConnections = Array.isArray(raw.connections) ? raw.connections : [];
        sourceConnections.forEach(function (item, index) {
            if (!item || typeof item !== "object") return;
            var from = String(item.from || "").trim();
            var target = String(item.target || "").trim();
            var action = UI_ACTIONS.indexOf(item.action) >= 0 ? item.action : "open";
            if (!from || !uiFindElementAnywhere({ pages: pages }, from)) return;
            if (["open", "navigate", "toggle", "show", "hide", "focus", "setText"].indexOf(action) >= 0 &&
                !target) return;
            if (target && !uiFindPage({ pages: pages }, target) &&
                !uiFindElementAnywhere({ pages: pages }, target)) return;
            var id = String(item.id || "").trim();
            if (!id || usedConnIds[id]) id = "c" + (index + 1);
            while (usedConnIds[id]) id = "c" + (++index + 1);
            usedConnIds[id] = true;
            connections.push({
                id: id,
                from: from,
                event: UI_EVENTS.indexOf(item.event) >= 0 ? item.event : "click",
                action: action,
                target: target,
                value: String(item.value == null ? "" : item.value)
            });
        });

        var start = String(raw.start || "").trim();
        if (!uiFindPage({ pages: pages }, start)) {
            var firstOpen = pages.filter(function (page) { return page.open; })[0];
            start = (firstOpen || pages[0]).id;
        }

        return { version: 2, start: start, pages: pages, connections: connections };
    }

    function parseUiLayout(source) {
        try {
            return uiNormalizeDocument(JSON.parse(String(source || "")));
        } catch (e) {
            return null;
        }
    }

    function uiDocumentJson(doc) {
        var out = {
            version: 2,
            start: doc.start,
            pages: doc.pages.map(function (page) {
                return {
                    id: page.id,
                    name: page.name,
                    kind: page.kind,
                    parentId: page.parentId || "",
                    open: !!page.open,
                    x: Math.round(page.x || 0),
                    y: Math.round(page.y || 0),
                    width: Math.round(page.width),
                    height: Math.round(page.height),
                    elements: uiSortedElements(page).map(function (el) {
                        var item = {
                            id: el.id,
                            type: el.type,
                            parentId: el.parentId || "",
                            x: Math.round(el.x), y: Math.round(el.y),
                            w: Math.round(el.w), h: Math.round(el.h),
                            text: el.text || ""
                        };
                        var props = {};
                        Object.keys(el.props || {}).forEach(function (key) {
                            var value = el.props[key];
                            if (value === "" || value === null || value === undefined) return;
                            if (typeof value === "boolean" && !value) return;
                            props[key] = value;
                        });
                        if (Object.keys(props).length) item.props = props;
                        return item;
                    })
                };
            }),
            connections: doc.connections.map(function (conn) {
                return {
                    id: conn.id,
                    from: conn.from,
                    event: conn.event,
                    action: conn.action,
                    target: conn.target || "",
                    value: conn.value || ""
                };
            })
        };
        return JSON.stringify(out, null, 2);
    }

    /* ===================== UI 原型运行时（预览区真实交互） ===================== */
    function uiSplitItems(text, fallback) {
        if (Array.isArray(text)) {
            return text.map(function (v) { return String(v).trim(); }).filter(Boolean);
        }
        var source = String(text == null ? "" : text).trim();
        if (!source) return (fallback || []).slice();
        var parts = source.indexOf("\n") >= 0 ? source.split(/\r?\n/) : source.split(/[,，;；|]/);
        var items = parts.map(function (v) { return String(v).trim(); }).filter(Boolean);
        return items.length ? items : (fallback || []).slice();
    }

    function uiSplitRows(text, fallback) {
        if (Array.isArray(text)) {
            if (!text.length) return (fallback || []).map(function (row) { return row.slice(); });
            return text.map(function (row) {
                return Array.isArray(row) ? row.map(String) : [String(row)];
            });
        }
        var source = String(text == null ? "" : text).trim();
        if (!source) return (fallback || []).map(function (row) { return row.slice(); });
        return source.split(/\r?\n/).map(function (line) {
            var separator = line.indexOf("|") >= 0 ? "|" : (line.indexOf("\t") >= 0 ? "\t" : ",");
            return line.split(separator).map(function (cell) { return cell.trim(); });
        }).filter(function (row) { return row.length > 0; });
    }

    function uiDefaultTableRows() {
        return [
            ["名称", "状态", "负责人"],
            ["需求评审", "进行中", "张三"],
            ["接口联调", "待开始", "李四"],
            ["发布上线", "未开始", "王五"]
        ];
    }

    function uiRuntimeElementHidden(page, el, ctx) {
        if (ctx.hidden[el.id]) return true;
        var guard = 0;
        var parentId = el.parentId;
        while (parentId && guard++ < 64) {
            if (ctx.hidden[parentId]) return true;
            var parent = uiFindElement(page, parentId);
            parentId = parent ? parent.parentId : "";
        }
        return false;
    }

    function uiRuntimePagePosition(page, index, ctx) {
        if (ctx.positions[page.id]) return ctx.positions[page.id];
        var left = Number(page.x) || 0;
        var top = Number(page.y) || 0;
        var explicit = left !== 0 || top !== 0;
        var parent = page.parentId ? uiFindPage(ctx.doc, page.parentId) : null;
        if (!explicit) {
            if (parent) {
                var parentPos = ctx.positions[parent.id] || { left: Math.max(24, Number(parent.x) || 0), top: Math.max(24, Number(parent.y) || 0) };
                left = parentPos.left + 56;
                top = parentPos.top + 64;
            } else {
                left = 24 + (index % 4) * 32;
                top = 24 + (index % 4) * 32;
            }
        }
        var pos = { left: Math.max(0, left), top: Math.max(0, top), z: 10 + index };
        ctx.positions[page.id] = pos;
        return pos;
    }

    function uiRuntimeOpenPage(ctx, pageId) {
        var page = uiFindPage(ctx.doc, pageId);
        if (!page) return false;
        var parentId = page.parentId;
        var guard = 0;
        while (parentId && guard++ < 64) {
            var parent = uiFindPage(ctx.doc, parentId);
            if (!parent) break;
            ctx.open[parent.id] = true;
            parentId = parent.parentId;
        }
        ctx.open[page.id] = true;
        if (ctx.positions[page.id]) ctx.positions[page.id].z = ++ctx.z;
        return true;
    }

    function uiRuntimeClosePage(ctx, pageId) {
        if (!uiFindPage(ctx.doc, pageId)) return false;
        delete ctx.open[pageId];
        uiPageDescendants(ctx.doc, pageId).forEach(function (page) {
            delete ctx.open[page.id];
        });
        return true;
    }

    function uiRuntimeToast(ctx, message) {
        var old = ctx.runtime.querySelector(".ui-rt-toast");
        if (old) old.parentNode.removeChild(old);
        var toast = document.createElement("div");
        toast.className = "ui-rt-toast";
        toast.textContent = message || "操作完成";
        ctx.runtime.appendChild(toast);
        setTimeout(function () {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 2400);
    }

    function uiRuntimeConnectionLabel(conn) {
        return (UI_EVENT_LABELS[conn.event] || conn.event) + " → " + (UI_ACTION_LABELS[conn.action] || conn.action);
    }

    function uiRuntimeSubmitForm(ctx, page, form) {
        if (!form || !page) return;
        var fields = page.elements.filter(function (child) {
            return child.parentId === form.id && (child.type === "input" || child.type === "text");
        });
        for (var i = 0; i < fields.length; i++) {
            var field = fields[i];
            if (field.props.required && !String(ctx.values[field.id] || field.props.value || "").trim()) {
                uiRuntimeToast(ctx, "请填写「" + (field.text || UI_TYPE_LABELS[field.type]) + "」");
                return;
            }
        }
        var submitSources = [form].concat(page.elements.filter(function (child) {
            return child.parentId === form.id && child.type === "button";
        }));
        var matched = submitSources.filter(function (source) {
            return ctx.doc.connections.some(function (conn) {
                return conn.from === source.id && conn.event === "submit";
            });
        });
        if (matched.length) {
            matched.forEach(function (source) { uiRuntimeRunEvent(ctx, page, source, "submit"); });
        } else {
            uiRuntimeToast(ctx, "表单已提交");
        }
    }

    function uiRuntimeRunEvent(ctx, page, el, event) {
        var connections = ctx.doc.connections.filter(function (conn) {
            return conn.from === el.id && conn.event === event;
        });
        if (!connections.length) {
            if (event === "click" && (el.type === "button" || el.type === "navbar" ||
                el.type === "sidebar" || el.type === "image" || el.type === "gif")) {
                uiRuntimeToast(ctx, "已点击「" + (el.text || UI_TYPE_LABELS[el.type]) + "」，可在设计器中为它添加交互");
            }
            return;
        }
        var needRender = false;
        var focusId = null;
        connections.forEach(function (conn) {
            var targetPage = uiFindPage(ctx.doc, conn.target);
            var targetInfo = targetPage ? null : uiFindElementAnywhere(ctx.doc, conn.target);
            if (conn.action === "open" || conn.action === "navigate") {
                if (!targetPage) {
                    uiRuntimeToast(ctx, "交互目标页面不存在");
                    return;
                }
                if (conn.action === "navigate") {
                    uiRuntimeClosePage(ctx, page.id);
                    uiRuntimeOpenPage(ctx, targetPage.id);
                } else {
                    uiRuntimeOpenPage(ctx, targetPage.id);
                }
                needRender = true;
            } else if (conn.action === "close") {
                var closeId = targetPage ? targetPage.id : (targetInfo ? targetInfo.page.id : page.id);
                uiRuntimeClosePage(ctx, closeId);
                needRender = true;
            } else if (conn.action === "back") {
                uiRuntimeClosePage(ctx, page.id);
                if (page.parentId) uiRuntimeOpenPage(ctx, page.parentId);
                needRender = true;
            } else if (conn.action === "toggle" || conn.action === "show" || conn.action === "hide") {
                if (!targetInfo) {
                    uiRuntimeToast(ctx, "交互目标组件不存在");
                    return;
                }
                if (conn.action === "toggle") ctx.hidden[targetInfo.element.id] = !ctx.hidden[targetInfo.element.id];
                else ctx.hidden[targetInfo.element.id] = conn.action === "hide";
                needRender = true;
            } else if (conn.action === "focus") {
                if (!targetInfo) return;
                ctx.hidden[targetInfo.element.id] = false;
                if (!ctx.open[targetInfo.page.id]) uiRuntimeOpenPage(ctx, targetInfo.page.id);
                focusId = targetInfo.element.id;
                needRender = true;
            } else if (conn.action === "setText") {
                if (!targetInfo) return;
                ctx.texts[targetInfo.element.id] = conn.value || "已更新";
                needRender = true;
            } else if (conn.action === "alert") {
                uiRuntimeToast(ctx, conn.value || "操作完成");
            }
        });
        if (needRender) {
            ctx.render();
            if (focusId) {
                setTimeout(function () {
                    var target = ctx.runtime.querySelector('[data-ui-el="' + focusId + '"] input, [data-ui-el="' + focusId + '"] textarea');
                    if (target) target.focus();
                }, 30);
            }
        }
    }

    function uiRuntimeButton(text, className, handler) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = className || "";
        button.textContent = text;
        if (handler) button.addEventListener("click", handler);
        return button;
    }

    function uiRuntimeFillTable(container, rows, onSelect) {
        container.innerHTML = "";
        if (!rows || !rows.length) {
            container.textContent = "暂无数据";
            return;
        }
        var table = document.createElement("table");
        var thead = document.createElement("thead");
        var headRow = document.createElement("tr");
        var sortState = container._uiSort || { index: -1, dir: 1 };
        rows[0].forEach(function (cell, index) {
            var th = document.createElement("th");
            th.textContent = cell || ("列 " + (index + 1));
            th.addEventListener("click", function () {
                var bodyRows = rows.slice(1);
                if (sortState.index === index) sortState.dir = -sortState.dir;
                else { sortState.index = index; sortState.dir = 1; }
                container._uiSort = sortState;
                bodyRows.sort(function (a, b) {
                    return String(a[index] || "").localeCompare(String(b[index] || ""), "zh-CN") * sortState.dir;
                });
                uiRuntimeFillTable(container, [rows[0]].concat(bodyRows), onSelect);
            });
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);
        var tbody = document.createElement("tbody");
        rows.slice(1).forEach(function (row) {
            var tr = document.createElement("tr");
            row.forEach(function (cell) {
                var td = document.createElement("td");
                td.textContent = cell;
                tr.appendChild(td);
            });
            tr.addEventListener("click", function () {
                Array.prototype.forEach.call(tbody.children, function (item) { item.classList.remove("selected"); });
                tr.classList.add("selected");
                if (onSelect) onSelect(row);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        container.appendChild(table);
    }

    function uiRuntimeParseObj(text) {
        var vertices = [];
        var faces = [];
        String(text || "").split(/\r?\n/).forEach(function (line) {
            var trimmed = line.trim();
            if (!trimmed || trimmed.charAt(0) === "#") return;
            var parts = trimmed.split(/\s+/);
            if (parts[0] === "v" && parts.length >= 4) {
                vertices.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
            } else if (parts[0] === "f" && parts.length >= 4) {
                var indices = [];
                for (var i = 1; i < parts.length; i++) {
                    var raw = parseInt(parts[i].split("/")[0], 10);
                    if (!isFinite(raw)) continue;
                    indices.push(raw > 0 ? raw - 1 : vertices.length + raw);
                }
                for (var j = 1; j + 1 < indices.length; j++) {
                    faces.push([indices[0], indices[j], indices[j + 1]]);
                }
            }
        });
        return vertices.length && faces.length ? { vertices: vertices, faces: faces } : null;
    }

    function uiRuntimeParseStlAscii(text) {
        var vertices = [];
        var matches = String(text || "").match(/vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g) || [];
        matches.forEach(function (line) {
            var parts = line.split(/\s+/);
            vertices.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
        });
        var faces = [];
        for (var i = 0; i + 2 < vertices.length; i += 3) {
            faces.push([i, i + 1, i + 2]);
        }
        return vertices.length && faces.length ? { vertices: vertices, faces: faces } : null;
    }

    function uiRuntimeParseStlBinary(buffer) {
        if (!buffer || buffer.byteLength < 84) return null;
        var view = new DataView(buffer);
        var count = view.getUint32(80, true);
        if (84 + count * 50 !== buffer.byteLength || count <= 0 || count > 200000) return null;
        var vertices = [];
        var faces = [];
        var offset = 84;
        for (var i = 0; i < count; i++) {
            offset += 12; // normal
            var base = vertices.length;
            for (var j = 0; j < 3; j++) {
                vertices.push([
                    view.getFloat32(offset, true),
                    view.getFloat32(offset + 4, true),
                    view.getFloat32(offset + 8, true)
                ]);
                offset += 12;
            }
            offset += 2;
            faces.push([base, base + 1, base + 2]);
        }
        return { vertices: vertices, faces: faces };
    }

    /* ---- PLY（ASCII 与 binary little/big endian） ---- */
    function uiRuntimeParsePly(buffer, text) {
        var textContent = text != null ? text : new TextDecoder("utf-8").decode(buffer);
        var headerEnd = textContent.search(/\nend_header\b/);
        if (headerEnd < 0) return null;
        var header = textContent.slice(0, headerEnd);
        var bodyText = textContent.slice(headerEnd + "\nend_header".length + 1);
        var vertexCount = 0;
        var faceCount = 0;
        var binary = null;
        var littleEndian = true;
        var vertexProps = [];
        var faceProps = [];
        header.split(/\r?\n/).forEach(function (line) {
            var trimmed = line.trim();
            if (!trimmed) return;
            var parts = trimmed.split(/\s+/);
            if (parts[0] === "format") {
                binary = parts[1] !== "ascii";
                littleEndian = parts[1] !== "binary_big_endian";
            } else if (parts[0] === "element" && parts[1] === "vertex") {
                vertexCount = parseInt(parts[2], 10) || 0;
            } else if (parts[0] === "element" && parts[1] === "face") {
                faceCount = parseInt(parts[2], 10) || 0;
            } else if (parts[0] === "property" && /^element/.test("x") === false && vertexCount && faceCount === 0 && !vertexProps) {
                // placeholder, never hit
            }
        });
        // 重新解析 header，按当前 element 累积 property 列表
        var currentElement = "";
        header.split(/\r?\n/).forEach(function (line) {
            var trimmed = line.trim();
            var parts = trimmed.split(/\s+/);
            if (parts[0] === "element") currentElement = parts[1];
            else if (parts[0] === "property" && currentElement === "vertex") {
                vertexProps.push({ name: parts[2], type: parts[1] });
            } else if (parts[0] === "property" && currentElement === "face") {
                if (parts[1] === "list") {
                    faceProps.push({ name: "indices", type: parts[3], countType: parts[2] });
                } else {
                    faceProps.push({ name: parts[2], type: parts[1] });
                }
            } else if (parts[0] === "end_header") {
                return;
            }
        });

        var vertices = [];
        var faces = [];
        if (!binary) {
            var lines = bodyText.split(/\r?\n/).filter(function (line) { return line.trim(); });
            for (var i = 0; i < vertexCount && i < lines.length; i++) {
                var values = lines[i].trim().split(/\s+/).map(Number);
                vertices.push([values[0], values[1], values[2]]);
            }
            for (var j = 0; j < faceCount && (vertexCount + j) < lines.length; j++) {
                var f = lines[vertexCount + j].trim().split(/\s+/).map(Number);
                var n = f[0];
                var idx = [];
                for (var k = 0; k < n; k++) idx.push(f[1 + k]);
                for (var m = 1; m + 1 < idx.length; m++) faces.push([idx[0], idx[m], idx[m + 1]]);
            }
        } else {
            var view = new DataView(buffer);
            // 找二进制数据起点：header 结束之后紧接着 \r\n 或 \n
            var headerBytesLen = 0;
            var bytes = new Uint8Array(buffer);
            var marker = "end_header";
            for (var p = 0; p + marker.length <= bytes.length; p++) {
                var match = true;
                for (var q = 0; q < marker.length; q++) {
                    if (bytes[p + q] !== marker.charCodeAt(q)) { match = false; break; }
                }
                if (match) {
                    headerBytesLen = p + marker.length;
                    while (headerBytesLen < bytes.length && (bytes[headerBytesLen] === 10 || bytes[headerBytesLen] === 13)) headerBytesLen++;
                    break;
                }
            }
            var offset = headerBytesLen;
            var readNumber = function (type) {
                var value;
                if (type === "float" || type === "float32") {
                    value = view.getFloat32(offset, littleEndian); offset += 4;
                } else if (type === "double" || type === "float64") {
                    value = view.getFloat64(offset, littleEndian); offset += 8;
                } else if (type === "char" || type === "int8") {
                    value = view.getInt8(offset); offset += 1;
                } else if (type === "uchar" || type === "uint8") {
                    value = view.getUint8(offset); offset += 1;
                } else if (type === "short" || type === "int16") {
                    value = view.getInt16(offset, littleEndian); offset += 2;
                } else if (type === "ushort" || type === "uint16") {
                    value = view.getUint16(offset, littleEndian); offset += 2;
                } else if (type === "int" || type === "int32") {
                    value = view.getInt32(offset, littleEndian); offset += 4;
                } else {
                    value = view.getUint32(offset, littleEndian); offset += 4;
                }
                return value;
            };
            for (var i2 = 0; i2 < vertexCount; i2++) {
                var v = [0, 0, 0];
                for (var pv = 0; pv < vertexProps.length; pv++) {
                    var num = readNumber(vertexProps[pv].type);
                    var name = vertexProps[pv].name;
                    if (name === "x") v[0] = num;
                    else if (name === "y") v[1] = num;
                    else if (name === "z") v[2] = num;
                }
                vertices.push(v);
            }
            for (var i3 = 0; i3 < faceCount; i3++) {
                var count = 0;
                var indices = [];
                for (var pf = 0; pf < faceProps.length; pf++) {
                    var prop = faceProps[pf];
                    if (prop.name === "indices") {
                        count = readNumber(prop.countType || "uchar");
                        for (var k2 = 0; k2 < count; k2++) indices.push(readNumber(prop.type));
                    } else {
                        readNumber(prop.type);
                    }
                }
                for (var m2 = 1; m2 + 1 < indices.length; m2++) faces.push([indices[0], indices[m2], indices[m2 + 1]]);
            }
        }
        return vertices.length && faces.length ? { vertices: vertices, faces: faces } : null;
    }

    /* ---- glTF 二进制（GLB 2.0） ---- */
    function uiRuntimeParseGlb(buffer) {
        if (!buffer || buffer.byteLength < 20) return null;
        var view = new DataView(buffer);
        if (view.getUint32(0, true) !== 0x46546C67) return null; // 'glTF'
        if (view.getUint32(4, true) !== 2) return null;
        var jsonLength = view.getUint32(12, true);
        var jsonType = view.getUint32(16, true);
        if (jsonType !== 0x4E4F534A) return null; // 'JSON'
        var jsonText = new TextDecoder("utf-8").decode(new Uint8Array(buffer, 20, jsonLength));
        var gltf;
        try { gltf = JSON.parse(jsonText); } catch (e) { return null; }
        var binStart = 20 + jsonLength;
        while (binStart % 4 !== 0) binStart++;
        var accessors = gltf.accessors || [];
        var bufferViews = gltf.bufferViews || [];
        var meshes = gltf.meshes || [];
        var vertices = [];
        var faces = [];
        for (var mi = 0; mi < meshes.length && !vertices.length; mi++) {
            var prims = meshes[mi].primitives || [];
            for (var pi = 0; pi < prims.length && !vertices.length; pi++) {
                var prim = prims[pi];
                var posAccessorIndex = prim.attributes && prim.attributes.POSITION;
                if (posAccessorIndex == null) continue;
                var posAccessor = accessors[posAccessorIndex];
                if (!posAccessor || posAccessor.componentType !== 5126) continue;
                var posView = bufferViews[posAccessor.bufferView];
                if (!posView || posView.buffer !== 0 && posView.buffer !== undefined) {
                    if (posView && posView.buffer === undefined) posView.buffer = 0;
                    else if (posView && posView.buffer !== 0) continue;
                }
                var posOffset = (posView.byteOffset || 0) + (posAccessor.byteOffset || 0);
                var posStride = posView.byteStride || 12;
                var count = posAccessor.count || 0;
                for (var i = 0; i < count; i++) {
                    var off = binStart + posOffset + i * posStride;
                    vertices.push([
                        view.getFloat32(off, true),
                        view.getFloat32(off + 4, true),
                        view.getFloat32(off + 8, true)
                    ]);
                }
                if (prim.indices != null) {
                    var idxAccessor = accessors[prim.indices];
                    if (idxAccessor) {
                        var idxView = bufferViews[idxAccessor.bufferView];
                        var idxOffset = (idxView.byteOffset || 0) + (idxAccessor.byteOffset || 0);
                        var idxCount = idxAccessor.count || 0;
                        var is32 = idxAccessor.componentType === 5125;
                        for (var f = 0; f + 2 < idxCount; f += 3) {
                            var a, b, c;
                            if (is32) {
                                a = view.getUint32(binStart + idxOffset + f * 4, true);
                                b = view.getUint32(binStart + idxOffset + (f + 1) * 4, true);
                                c = view.getUint32(binStart + idxOffset + (f + 2) * 4, true);
                            } else {
                                a = view.getUint16(binStart + idxOffset + f * 2, true);
                                b = view.getUint16(binStart + idxOffset + (f + 1) * 2, true);
                                c = view.getUint16(binStart + idxOffset + (f + 2) * 2, true);
                            }
                            faces.push([a, b, c]);
                        }
                    }
                } else {
                    for (var s = 0; s + 2 < count; s += 3) faces.push([s, s + 1, s + 2]);
                }
            }
        }
        return vertices.length && faces.length ? { vertices: vertices, faces: faces } : null;
    }

    /* ---- STEP（ISO 10303-21）：解析可细分（POLY_LOOP）表示 ---- */
    function uiRuntimeParseStep(text) {
        var source = String(text || "");
        if (source.indexOf("ISO-10303-21") < 0 && !/^\s*STEP\b/i.test(source)) return null;
        var points = {};
        var pointOrder = [];
        var pointRe = /#(\d+)\s*=\s*CARTESIAN_POINT\s*\(\s*'[^']*'\s*,\s*\(\s*([-+\d.eE]+)\s*,\s*([-+\d.eE]+)\s*,\s*([-+\d.eE]+)\s*\)\s*\)/g;
        var m;
        while ((m = pointRe.exec(source))) {
            if (!points[m[1]]) {
                points[m[1]] = pointOrder.length;
                pointOrder.push([Number(m[2]), Number(m[3]), Number(m[4])]);
            }
        }
        if (!pointOrder.length) return null;
        var faces = [];
        var loopRe = /#(\d+)\s*=\s*POLY_LOOP\s*\(\s*'[^']*'\s*,\s*\(([^)]*)\)\s*\)/g;
        while ((m = loopRe.exec(source))) {
            var ids = m[2].match(/#\d+/g) || [];
            var indices = [];
            for (var i = 0; i < ids.length; i++) {
                var pid = ids[i].substring(1);
                if (points[pid] != null) indices.push(points[pid]);
            }
            if (indices.length >= 3) {
                if (indices[0] === indices[indices.length - 1]) indices.pop();
                for (var j = 1; j + 1 < indices.length; j++) {
                    faces.push([indices[0], indices[j], indices[j + 1]]);
                }
            }
        }
        if (!faces.length) return null; // 大概率是 NURBS/B-rep，无法用线框表达
        return { vertices: pointOrder, faces: faces };
    }

    /* ---- STEP/IGES（NURBS/B-rep）：OpenCascade.js WASM 几何内核 ----
       懒加载 full 构建，读取后做增量网格化，提取三角形线框。 */
    var uiOccReadyPromise = null;

    function uiOccReady() {
        if (!uiOccReadyPromise) {
            uiOccReadyPromise = import("../vendor/opencascade/oc-wrapper.js").then(function (mod) {
                var base = (typeof location !== "undefined" && location.origin && location.origin.indexOf("mdviewer.local") >= 0)
                    ? location.origin
                    : "https://mdviewer.local";
                return mod.initOpenCascade(base + "/vendor/opencascade/opencascade.full.wasm.gz");
            });
        }
        return uiOccReadyPromise;
    }

    function uiOccTessellate(oc, shape) {
        var vertices = [];
        var faces = [];
        var vOff = 0;
        try {
            new oc.BRepMesh_IncrementalMesh_2(shape, 0.1, false, 0.5, false);
            var expFace = new oc.TopExp_Explorer_1();
            for (expFace.Init(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); expFace.More(); expFace.Next()) {
                var myFace = oc.TopoDS.Face_1(expFace.Current());
                var aLocation = new oc.TopLoc_Location_1();
                var myT = oc.BRep_Tool.Triangulation(myFace, aLocation, 0);
                if (myT.IsNull()) continue;
                var tri = myT.get();
                var n = tri.NbNodes();
                for (var i = 1; i <= n; i++) {
                    var p = tri.Node(i).Transformed(aLocation.Transformation());
                    vertices.push([p.X(), p.Y(), p.Z()]);
                }
                var tris = tri.Triangles();
                var m = tri.NbTriangles();
                for (var j = 1; j <= m; j++) {
                    var t = tris.Value(j);
                    faces.push([t.Value(1) + vOff - 1, t.Value(2) + vOff - 1, t.Value(3) + vOff - 1]);
                }
                vOff += n;
            }
        } catch (e) {
            return vertices.length && faces.length ? { vertices: vertices, faces: faces } : null;
        }
        return vertices.length && faces.length ? { vertices: vertices, faces: faces } : null;
    }

    function uiRuntimeLoadCad(textContent, kind) {
        return uiOccReady().then(function (oc) {
            var fname = "/mv_cad_" + Date.now() + "_" + Math.random().toString(36).slice(2) + "." + kind;
            var model = null;
            try {
                oc.FS.createDataFile("/", fname, textContent, true, true);
                var reader = kind === "iges"
                    ? new oc.IGESControl_Reader_1()
                    : new oc.STEPControl_Reader_1();
                var readResult = reader.ReadFile(fname);
                if (readResult === oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
                    reader.TransferRoots(new oc.Message_ProgressRange_1());
                    model = uiOccTessellate(oc, reader.OneShape());
                }
            } finally {
                try { oc.FS.unlink(fname); } catch (e) { /* ignore */ }
            }
            return model;
        });
    }

    function uiRuntimeNormalizeModel(model) {
        if (!model || !model.vertices.length) return null;
        var minX = Infinity, minY = Infinity, minZ = Infinity;
        var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        model.vertices.forEach(function (v) {
            minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]);
            minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]);
            minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2]);
        });
        var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
        var radius = 0;
        var centered = model.vertices.map(function (v) {
            var p = [v[0] - cx, v[1] - cy, v[2] - cz];
            radius = Math.max(radius, Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]));
            return p;
        });
        return {
            vertices: centered,
            faces: model.faces.slice(0, 12000),
            radius: radius || 1
        };
    }

    function uiRuntimeModelViewer(el, props, text, sceneMode, ctx) {
        var wrap = document.createElement("div");
        wrap.className = "ui-rt-model-viewer" + (sceneMode ? " scene" : "");
        var canvas = document.createElement("canvas");
        wrap.appendChild(canvas);
        var status = document.createElement("div");
        status.className = "ui-rt-model-status";
        status.textContent = "加载模型…";
        wrap.appendChild(status);
        var hint = document.createElement("div");
        hint.className = "ui-rt-3d-hint";
        hint.textContent = "拖动旋转 · 滚轮缩放";
        wrap.appendChild(hint);
        var state = {
            rx: -20, ry: 32, zoom: 1, model: null, drag: null, dpr: window.devicePixelRatio || 1
        };
        var color = props.color || "#0969da";

        function drawGrid(context, width, height) {
            if (!sceneMode) return;
            context.save();
            context.strokeStyle = "rgba(9, 105, 218, 0.16)";
            context.lineWidth = 1;
            var horizon = height * 0.58;
            for (var i = -8; i <= 8; i++) {
                context.beginPath();
                context.moveTo(width / 2 + i * 18, height);
                context.lineTo(width / 2 + i * 8, horizon);
                context.stroke();
            }
            for (var j = 0; j < 8; j++) {
                var y = horizon + (height - horizon) * (j / 8);
                context.beginPath();
                context.moveTo(0, y);
                context.lineTo(width, y);
                context.stroke();
            }
            context.restore();
        }

        function render() {
            var width = canvas.clientWidth;
            var height = canvas.clientHeight;
            if (!width || !height) return;
            var dpr = state.dpr;
            if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
                canvas.width = Math.round(width * dpr);
                canvas.height = Math.round(height * dpr);
            }
            var context = canvas.getContext("2d");
            context.setTransform(dpr, 0, 0, dpr, 0, 0);
            context.clearRect(0, 0, width, height);
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, width, height);
            drawGrid(context, width, height);
            if (!state.model) return;
            var model = state.model;
            var rx = state.rx * Math.PI / 180;
            var ry = state.ry * Math.PI / 180;
            var cosX = Math.cos(rx), sinX = Math.sin(rx);
            var cosY = Math.cos(ry), sinY = Math.sin(ry);
            var base = Math.min(width, height) * 0.34 / model.radius * state.zoom;
            var projected = model.vertices.map(function (v) {
                var x = v[0] * cosY + v[2] * sinY;
                var z = -v[0] * sinY + v[2] * cosY;
                var y = v[1] * cosX - z * sinX;
                var z2 = v[1] * sinX + z * cosX;
                var persp = 2.6 / (2.6 + z2 * 0.5);
                return { x: width / 2 + x * base * persp, y: height / 2 + y * base * persp, z: z2 };
            });
            var faces = model.faces.map(function (face, index) {
                var depth = (projected[face[0]].z + projected[face[1]].z + projected[face[2]].z) / 3;
                return { face: face, depth: depth, index: index };
            }).sort(function (a, b) { return a.depth - b.depth; });
            faces.forEach(function (item) {
                var face = item.face;
                var a = projected[face[0]], b = projected[face[1]], c = projected[face[2]];
                if (!a || !b || !c) return;
                context.beginPath();
                context.moveTo(a.x, a.y);
                context.lineTo(b.x, b.y);
                context.lineTo(c.x, c.y);
                context.closePath();
                context.fillStyle = "rgba(9, 105, 218, 0.06)";
                context.fill();
                context.strokeStyle = color;
                context.lineWidth = 0.8;
                context.stroke();
            });
            status.textContent = (text ? text + " · " : "") + model.faces.length + " 面";
        }

        function load() {
            var source = uiResolveAsset(props.src);
            if (!source) {
                status.textContent = "未配置模型文件（支持 .obj / .stl / .ply / .glb / .step / .stp / .iges / .igs）";
                return;
            }
            var lower = source.replace(/[?#].*$/, "").toLowerCase();

            fetch(source).then(function (response) {
                if (!response.ok) throw new Error("HTTP " + response.status);
                return response.arrayBuffer();
            }).then(function (buffer) {
                var textContent = null;
                var model = null;
                var pending = null;
                var text = function () {
                    if (textContent == null) textContent = new TextDecoder("utf-8").decode(buffer);
                    return textContent;
                };
                var finish = function (m) {
                    state.model = uiRuntimeNormalizeModel(m);
                    if (!state.model) {
                        status.textContent = "模型解析失败或为不支持的几何格式，仅显示占位立方体";
                        return;
                    }
                    render();
                };

                if (/\.ply$/.test(lower)) {
                    model = uiRuntimeParsePly(buffer, text());
                } else if (/\.glb$/.test(lower)) {
                    model = uiRuntimeParseGlb(buffer);
                } else if (/\.gltf$/.test(lower)) {
                    model = uiRuntimeParseGlb(buffer);
                    if (!model) {
                        status.textContent = "该 .gltf 暂不支持，请使用 .glb（或内嵌缓冲的 GLB）";
                        return;
                    }
                } else if (/\.(step|stp)$/.test(lower)) {
                    status.textContent = "正在初始化几何内核…";
                    pending = uiRuntimeLoadCad(text(), "step");
                } else if (/\.(iges|igs)$/.test(lower)) {
                    status.textContent = "正在初始化几何内核…";
                    pending = uiRuntimeLoadCad(text(), "iges");
                } else if (/\.obj$/.test(lower)) {
                    model = uiRuntimeParseObj(text());
                } else if (/\.stl$/.test(lower)) {
                    model = uiRuntimeParseStlBinary(buffer) || uiRuntimeParseStlAscii(text());
                } else if (/\.(prt|ptr|x_t|x_b|3mf)$/.test(lower)) {
                    status.textContent = "不支持该格式，请先转换为 .step / .stp / .obj / .stl / .glb";
                    return;
                } else {
                    model = uiRuntimeParseStlBinary(buffer);
                    if (!model) {
                        var t = text();
                        if (/^\s*ply\b/i.test(t)) model = uiRuntimeParsePly(buffer, t);
                        else if (t.indexOf("ISO-10303-21") >= 0) pending = uiRuntimeLoadCad(t, "step");
                        else if (/^\s*v\s+/m.test(t)) model = uiRuntimeParseObj(t);
                        if (!model) model = uiRuntimeParseStlAscii(t);
                    }
                }

                if (pending) {
                    pending.then(function (m) {
                        if (m) { finish(m); return; }
                        finish(uiRuntimeParseStep(text()));
                    }, function () {
                        finish(uiRuntimeParseStep(text()));
                    });
                } else {
                    finish(model);
                }
            }).catch(function () {
                status.textContent = "模型加载失败，仅显示占位立方体";
            });
        }

        var resizeObserver = null;
        if (window.ResizeObserver) {
            resizeObserver = new ResizeObserver(function () { render(); });
            resizeObserver.observe(canvas);
        }
        setTimeout(function () {
            if (!canvas.isConnected) {
                if (resizeObserver) resizeObserver.disconnect();
                return;
            }
            render();
            load();
        }, 40);
        canvas.addEventListener("pointerdown", function (e) {
            e.preventDefault();
            try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            state.drag = { x: e.clientX, y: e.clientY, rx: state.rx, ry: state.ry };
        });
        canvas.addEventListener("pointermove", function (e) {
            if (!state.drag) return;
            state.ry = state.drag.ry + (e.clientX - state.drag.x) * 0.6;
            state.rx = state.drag.rx - (e.clientY - state.drag.y) * 0.6;
            render();
        });
        canvas.addEventListener("pointerup", function () { state.drag = null; });
        canvas.addEventListener("pointercancel", function () { state.drag = null; });
        canvas.addEventListener("wheel", function (e) {
            e.preventDefault();
            state.zoom = Math.max(0.5, Math.min(2.4, state.zoom - e.deltaY * 0.001));
            render();
        }, { passive: false });
        return wrap;
    }

    function uiRuntimeElement(page, el, ctx) {
        var node = document.createElement("div");
        var depth = uiElementDepth(page, el);
        var typeClass = (el.type === "button" || el.type === "avatar" || el.type === "animation")
            ? "ui-rt-type-" + el.type
            : "ui-rt-" + el.type;
        node.className = "ui-rt-el " + typeClass + (depth ? " ui-rt-nested" : "");
        node.setAttribute("data-ui-el", el.id);
        node.style.left = el.x + "px";
        node.style.top = el.y + "px";
        node.style.width = el.w + "px";
        node.style.height = el.h + "px";
        node.style.zIndex = String(10 + depth * 10 + page.elements.indexOf(el));
        var text = ctx.texts[el.id] != null ? ctx.texts[el.id] : (el.text || "");
        var props = el.props || {};
        var run = function (eventName) { uiRuntimeRunEvent(ctx, page, el, eventName || "click"); };

        if (["page", "navbar", "sidebar", "content", "card", "form"].indexOf(el.type) >= 0) {
            node.style.pointerEvents = "auto";
            node.addEventListener("click", function (e) {
                if (e.target === node) run("click");
            });
        } else if (["heading", "text", "avatar"].indexOf(el.type) >= 0) {
            node.addEventListener("click", function () { run("click"); });
        }

        if (el.type === "page") {
            node.classList.add("ui-rt-structural");
            node.innerHTML = '<div class="ui-rt-page-label">' + escapeHtml(text) + "</div>";
            return node;
        }

        if (el.type === "navbar" || el.type === "sidebar") {
            node.classList.add("ui-rt-structural");
            var title = document.createElement("div");
            title.className = "ui-rt-struct-title";
            title.textContent = text;
            node.appendChild(title);
            var items = uiSplitItems(props.items, el.type === "navbar"
                ? ["首页", "产品", "文档"]
                : ["概览", "文件", "设置"]);
            var list = document.createElement("div");
            list.className = "ui-rt-nav-list";
            items.forEach(function (item, index) {
                var itemNode = document.createElement("span");
                itemNode.className = "ui-rt-nav-item" + (index === 0 ? " active" : "");
                itemNode.textContent = item;
                itemNode.addEventListener("click", function () {
                    Array.prototype.forEach.call(list.children, function (child) { child.classList.remove("active"); });
                    itemNode.classList.add("active");
                    run("click");
                });
                list.appendChild(itemNode);
            });
            node.appendChild(list);
            return node;
        }

        if (el.type === "content" || el.type === "card") {
            node.classList.add("ui-rt-structural");
            node.innerHTML = '<div class="ui-rt-struct-title">' + escapeHtml(text) + "</div>" +
                (props.note ? '<div class="ui-rt-note">' + escapeHtml(props.note) + "</div>" : "");
            return node;
        }

        if (el.type === "form") {
            node.classList.add("ui-rt-structural");
            node.innerHTML = '<div class="ui-rt-struct-title">' + escapeHtml(text) + "</div>" +
                (props.note ? '<div class="ui-rt-note">' + escapeHtml(props.note) + "</div>" : "");
            var submit = uiRuntimeButton(props.submitText || "提交", "ui-rt-button primary", function () {
                uiRuntimeSubmitForm(ctx, page, el);
            });
            submit.style.position = "absolute";
            submit.style.right = "10px";
            submit.style.bottom = "8px";
            node.appendChild(submit);
            return node;
        }

        if (el.type === "heading") {
            var level = Math.max(1, Math.min(6, parseInt(props.level, 10) || 2));
            var heading = document.createElement("h" + level);
            heading.textContent = text;
            node.appendChild(heading);
            return node;
        }

        if (el.type === "text") {
            node.innerHTML = '<div class="ui-rt-text">' + escapeHtml(text) + "</div>" +
                (props.note ? '<div class="ui-rt-note">' + escapeHtml(props.note) + "</div>" : "");
            return node;
        }

        if (el.type === "button") {
            var button = uiRuntimeButton(text, "ui-rt-button " + (props.variant || "primary"), function () {
                var hasClick = ctx.doc.connections.some(function (conn) {
                    return conn.from === el.id && conn.event === "click";
                });
                if (!hasClick && el.parentId) {
                    var form = uiFindElement(page, el.parentId);
                    if (form && form.type === "form") {
                        uiRuntimeSubmitForm(ctx, page, form);
                        return;
                    }
                }
                run("click");
            });
            if (props.disabled === true || props.disabled === "true") button.disabled = true;
            node.appendChild(button);
            return node;
        }

        if (el.type === "input") {
            if (text) {
                var label = document.createElement("div");
                label.className = "ui-rt-input-label";
                label.textContent = text;
                node.appendChild(label);
            }
            var input = document.createElement("input");
            input.type = props.inputType || "text";
            input.placeholder = props.placeholder || "请输入";
            input.value = ctx.values[el.id] != null ? ctx.values[el.id] : (props.value || "");
            input.disabled = props.disabled === true || props.disabled === "true";
            input.addEventListener("input", function () { ctx.values[el.id] = input.value; });
            input.addEventListener("change", function () {
                ctx.values[el.id] = input.value;
                run("change");
            });
            node.appendChild(input);
            return node;
        }

        if (el.type === "image" || el.type === "gif") {
            var src = uiResolveAsset(props.src);
            if (src) {
                var img = document.createElement("img");
                img.src = src;
                img.alt = text;
                img.style.objectFit = props.fit || "cover";
                img.addEventListener("click", function () {
                    if (lightbox && lightboxImg) {
                        lightboxImg.src = img.src;
                        lightbox.hidden = false;
                    }
                    run("click");
                });
                node.appendChild(img);
            } else if (el.type === "gif") {
                node.innerHTML = '<div class="ui-rt-gif-demo"><span>GIF</span></div>';
            } else {
                node.innerHTML = '<div class="ui-rt-image-placeholder">' + escapeHtml(text) + "</div>";
            }
            if (props.note) {
                var imageNote = document.createElement("div");
                imageNote.className = "ui-rt-note";
                imageNote.textContent = props.note;
                node.appendChild(imageNote);
            }
            return node;
        }

        if (el.type === "avatar") {
            if (uiResolveAsset(props.src)) {
                var avatarImg = document.createElement("img");
                avatarImg.src = uiResolveAsset(props.src);
                avatarImg.alt = text;
                node.appendChild(avatarImg);
            } else {
                var initials = document.createElement("div");
                initials.className = "ui-rt-avatar";
                initials.textContent = (text || "?").slice(0, 2);
                node.appendChild(initials);
            }
            return node;
        }

        if (el.type === "table") {
            var tableTitle = document.createElement("div");
            tableTitle.className = "ui-rt-struct-title";
            tableTitle.textContent = text;
            node.appendChild(tableTitle);
            var tableBox = document.createElement("div");
            tableBox.className = "ui-rt-table-box";
            node.appendChild(tableBox);
            var rows = uiSplitRows(props.items, uiDefaultTableRows());
            uiRuntimeFillTable(tableBox, rows, function (row) {
                ctx.selected[el.id] = row.join(" | ");
                run("select");
            });
            return node;
        }

        if (el.type === "list") {
            var listTitle = document.createElement("div");
            listTitle.className = "ui-rt-struct-title";
            listTitle.textContent = text;
            node.appendChild(listTitle);
            var listBox = document.createElement("div");
            listBox.className = "ui-rt-list";
            uiSplitItems(props.items, ["列表项一", "列表项二", "列表项三"]).forEach(function (item, index) {
                var row = document.createElement("div");
                row.className = "ui-rt-list-item" + (index === 0 ? " active" : "");
                row.textContent = item;
                row.addEventListener("click", function () {
                    Array.prototype.forEach.call(listBox.children, function (child) { child.classList.remove("active"); });
                    row.classList.add("active");
                    ctx.selected[el.id] = item;
                    run("select");
                });
                listBox.appendChild(row);
            });
            node.appendChild(listBox);
            return node;
        }

        if (el.type === "filebrowser") {
            var fileTitle = document.createElement("div");
            fileTitle.className = "ui-rt-filebar";
            fileTitle.textContent = text || "文件浏览器";
            node.appendChild(fileTitle);
            var fileBody = document.createElement("div");
            fileBody.className = "ui-rt-filelist";
            var path = document.createElement("div");
            path.className = "ui-rt-filepath";
            path.textContent = "当前：/";
            var fileItems = uiSplitItems(props.items, ["src/", "assets/", "README.md", "docs/guide.md"]);
            fileItems.forEach(function (item) {
                var file = document.createElement("div");
                var isFolder = /\/$/.test(item) || item.indexOf(".") < 0;
                file.className = "ui-rt-fileitem" + (isFolder ? " folder" : "");
                file.textContent = (isFolder ? "▸ " : "▢ ") + item;
                file.addEventListener("click", function () {
                    Array.prototype.forEach.call(fileBody.querySelectorAll(".ui-rt-fileitem"), function (child) { child.classList.remove("active"); });
                    file.classList.add("active");
                    path.textContent = "当前：/" + item.replace(/\/$/, "");
                    ctx.selected[el.id] = item;
                    run("select");
                });
                fileBody.appendChild(file);
            });
            node.appendChild(path);
            node.appendChild(fileBody);
            return node;
        }

        if (el.type === "database") {
            var dbTitle = document.createElement("div");
            dbTitle.className = "ui-rt-struct-title";
            dbTitle.textContent = text || "数据库";
            node.appendChild(dbTitle);
            var dbToolbar = document.createElement("div");
            dbToolbar.className = "ui-rt-db-toolbar";
            var query = document.createElement("input");
            query.placeholder = props.placeholder || "输入查询关键字";
            query.value = ctx.values[el.id] || "";
            var dbButton = uiRuntimeButton("查询", "ui-rt-button primary");
            var dbStatus = document.createElement("span");
            dbStatus.className = "ui-rt-db-status";
            dbToolbar.appendChild(query);
            dbToolbar.appendChild(dbButton);
            dbToolbar.appendChild(dbStatus);
            node.appendChild(dbToolbar);
            var dbBox = document.createElement("div");
            dbBox.className = "ui-rt-table-box";
            node.appendChild(dbBox);
            var dbRows = uiSplitRows(props.items, uiDefaultTableRows());
            var dbSource = uiResolveAsset(props.dataUrl || props.src);
            var runQuery = function () {
                var keyword = query.value.trim().toLowerCase();
                ctx.values[el.id] = query.value;
                var rows = dbRows;
                if (keyword) {
                    rows = [dbRows[0]].concat(dbRows.slice(1).filter(function (row) {
                        return row.join(" ").toLowerCase().indexOf(keyword) >= 0;
                    }));
                }
                uiRuntimeFillTable(dbBox, rows, function (row) { ctx.selected[el.id] = row.join(" | "); });
                dbStatus.textContent = rows.length > 1 ? (rows.length - 1) + " 行" : "暂无记录";
                run("click");
            };
            dbButton.addEventListener("click", function () {
                if (!dbSource) { runQuery(); return; }
                dbStatus.textContent = "加载中…";
                fetch(dbSource).then(function (response) { return response.json(); }).then(function (data) {
                    var rows = [];
                    if (Array.isArray(data)) {
                        var keys = data.length && typeof data[0] === "object" ? Object.keys(data[0]) : [];
                        if (keys.length) {
                            rows.push(keys);
                            data.forEach(function (item) { rows.push(keys.map(function (key) { return String(item[key] == null ? "" : item[key]); })); });
                        } else {
                            rows = data.map(function (item) { return [String(item)]; });
                        }
                    }
                    dbRows = rows.length ? rows : dbRows;
                    runQuery();
                }).catch(function () {
                    dbStatus.textContent = "加载失败";
                    uiRuntimeToast(ctx, "数据源加载失败，已使用本地示例数据");
                    runQuery();
                });
            });
            query.addEventListener("keydown", function (e) { if (e.key === "Enter") dbButton.click(); });
            uiRuntimeFillTable(dbBox, dbRows);
            return node;
        }

        if (el.type === "model3d" || el.type === "scene3d") {
            node.style.setProperty("--ui-3d-color", props.color || "#4daafc");
            if (props.src) {
                node.appendChild(uiRuntimeModelViewer(el, props, text, el.type === "scene3d", ctx));
                return node;
            }
            var scene = document.createElement("div");
            scene.className = "ui-rt-3d-scene" + (el.type === "scene3d" ? " scene" : "");
            var cube = document.createElement("div");
            cube.className = "ui-rt-cube";
            ["front", "back", "left", "right", "top", "bottom"].forEach(function (face) {
                var faceNode = document.createElement("div");
                faceNode.className = "ui-rt-cube-face " + face;
                faceNode.textContent = face === "front" ? text.slice(0, 8) : "";
                cube.appendChild(faceNode);
            });
            scene.appendChild(cube);
            var label = document.createElement("div");
            label.className = "ui-rt-3d-label";
            label.textContent = text;
            scene.appendChild(label);
            var hint = document.createElement("div");
            hint.className = "ui-rt-3d-hint";
            hint.textContent = "拖动旋转 · 滚轮缩放";
            scene.appendChild(hint);
            var rx = -18, ry = 32, scale = 1;
            var updateCube = function () {
                cube.style.transform = "scale(" + scale + ") rotateX(" + rx + "deg) rotateY(" + ry + "deg)";
            };
            var drag = null;
            scene.addEventListener("pointerdown", function (e) {
                e.preventDefault();
                try { scene.setPointerCapture(e.pointerId); } catch (err) { /* 合成指针或已释放 */ }
                drag = { x: e.clientX, y: e.clientY, rx: rx, ry: ry };
            });
            scene.addEventListener("pointermove", function (e) {
                if (!drag) return;
                ry = drag.ry + (e.clientX - drag.x) * 0.6;
                rx = drag.rx - (e.clientY - drag.y) * 0.6;
                updateCube();
            });
            scene.addEventListener("pointerup", function () { drag = null; });
            scene.addEventListener("pointercancel", function () { drag = null; });
            scene.addEventListener("wheel", function (e) {
                e.preventDefault();
                scale = Math.max(0.5, Math.min(2.2, scale - e.deltaY * 0.001));
                updateCube();
            }, { passive: false });
            updateCube();
            node.appendChild(scene);
            return node;
        }

        if (el.type === "animation") {
            var stage = document.createElement("div");
            stage.className = "ui-rt-animation";
            var ball = document.createElement("div");
            ball.className = "ui-rt-animation-ball";
            stage.appendChild(ball);
            var controls = document.createElement("div");
            controls.className = "ui-rt-animation-controls";
            var play = uiRuntimeButton("暂停", "ui-rt-button");
            var speed = document.createElement("input");
            speed.type = "range";
            speed.min = "0.3";
            speed.max = "3";
            speed.step = "0.1";
            speed.value = String(props.speed || 1);
            var speedLabel = document.createElement("span");
            speedLabel.textContent = "速度 " + speed.value + "x";
            var running = true;
            var applySpeed = function () {
                ball.style.animationDuration = (2.2 / Number(speed.value || 1)) + "s";
                speedLabel.textContent = "速度 " + Number(speed.value).toFixed(1) + "x";
            };
            play.addEventListener("click", function () {
                running = !running;
                ball.style.animationPlayState = running ? "running" : "paused";
                play.textContent = running ? "暂停" : "播放";
            });
            speed.addEventListener("input", applySpeed);
            controls.appendChild(play);
            controls.appendChild(speed);
            controls.appendChild(speedLabel);
            node.appendChild(stage);
            node.appendChild(controls);
            applySpeed();
            return node;
        }

        if (el.type === "canvas") {
            var canvasWrap = document.createElement("div");
            canvasWrap.className = "ui-rt-canvas-wrap";
            var toolbar = document.createElement("div");
            toolbar.className = "ui-rt-canvas-toolbar";
            var color = document.createElement("input");
            color.type = "color";
            color.value = props.color || "#0969da";
            var size = document.createElement("input");
            size.type = "range";
            size.min = "1";
            size.max = "16";
            size.value = String(props.brush || 3);
            var clear = uiRuntimeButton("清空", "ui-rt-button");
            toolbar.appendChild(color);
            toolbar.appendChild(size);
            toolbar.appendChild(clear);
            canvasWrap.appendChild(toolbar);
            var canvasEl = document.createElement("canvas");
            canvasWrap.appendChild(canvasEl);
            node.appendChild(canvasWrap);
            var dpr = window.devicePixelRatio || 1;
            var drawWidth = Math.max(80, el.w);
            var drawHeight = Math.max(40, el.h - 30);
            canvasEl.width = Math.round(drawWidth * dpr);
            canvasEl.height = Math.round(drawHeight * dpr);
            canvasEl.style.width = "100%";
            canvasEl.style.height = "calc(100% - 30px)";
            var context2d = canvasEl.getContext("2d");
            context2d.scale(dpr, dpr);
            context2d.lineCap = "round";
            context2d.lineJoin = "round";
            var drawing = false;
            var draw = function (e) {
                var rect = canvasEl.getBoundingClientRect();
                var x = (e.clientX - rect.left) * drawWidth / rect.width;
                var y = (e.clientY - rect.top) * drawHeight / rect.height;
                if (drawing) {
                    context2d.strokeStyle = color.value;
                    context2d.lineWidth = Number(size.value);
                    context2d.lineTo(x, y);
                    context2d.stroke();
                }
            };
            canvasEl.addEventListener("pointerdown", function (e) {
                e.preventDefault();
                try { canvasEl.setPointerCapture(e.pointerId); } catch (err) { /* 合成指针或已释放 */ }
                drawing = true;
                var rect = canvasEl.getBoundingClientRect();
                context2d.beginPath();
                context2d.moveTo((e.clientX - rect.left) * drawWidth / rect.width,
                    (e.clientY - rect.top) * drawHeight / rect.height);
            });
            canvasEl.addEventListener("pointermove", draw);
            canvasEl.addEventListener("pointerup", function () { drawing = false; });
            canvasEl.addEventListener("pointercancel", function () { drawing = false; });
            clear.addEventListener("click", function () { context2d.clearRect(0, 0, drawWidth, drawHeight); });
            return node;
        }

        node.textContent = text;
        return node;
    }

    function buildUiRuntime(doc) {
        var runtime = document.createElement("div");
        runtime.className = "ui-runtime";
        var stage = document.createElement("div");
        stage.className = "ui-rt-stage";
        runtime.appendChild(stage);
        var ctx = {
            doc: doc,
            runtime: runtime,
            stage: stage,
            open: {},
            positions: {},
            values: {},
            hidden: {},
            texts: {},
            selected: {},
            z: 20
        };
        doc.pages.forEach(function (page) {
            if (page.open) ctx.open[page.id] = true;
        });
        Object.keys(ctx.open).forEach(function (pageId) {
            uiRuntimeOpenPage(ctx, pageId);
        });
        uiRuntimeOpenPage(ctx, doc.start);

        ctx.render = function () {
            stage.innerHTML = "";
            var openPages = doc.pages.filter(function (page) { return ctx.open[page.id]; });
            if (!openPages.length) {
                var empty = document.createElement("div");
                empty.className = "ui-rt-empty";
                empty.textContent = "所有窗口都已关闭";
                var reset = uiRuntimeButton("重新打开启动页", "ui-rt-button primary", function () {
                    uiRuntimeOpenPage(ctx, doc.start);
                    ctx.render();
                });
                empty.appendChild(reset);
                stage.appendChild(empty);
                return;
            }
            var maxRight = 0;
            var maxBottom = 0;
            openPages.forEach(function (page, index) {
                var pos = uiRuntimePagePosition(page, index, ctx);
                var win = document.createElement("div");
                win.className = "ui-rt-window" + (page.kind === "dialog" ? " dialog" : "");
                win.setAttribute("data-ui-page", page.id);
                win.style.left = pos.left + "px";
                win.style.top = pos.top + "px";
                win.style.width = page.width + "px";
                win.style.zIndex = String(pos.z || 20);
                var head = document.createElement("div");
                head.className = "ui-rt-window-head";
                var title = document.createElement("span");
                title.className = "ui-rt-window-title";
                title.textContent = page.name || "页面";
                var badge = document.createElement("span");
                badge.className = "ui-rt-window-badge";
                badge.textContent = UI_PAGE_KINDS[page.kind] || "窗口";
                head.appendChild(title);
                head.appendChild(badge);
                if (page.parentId) {
                    var owner = uiFindPage(doc, page.parentId);
                    if (owner) {
                        var ownerBadge = document.createElement("span");
                        ownerBadge.className = "ui-rt-window-owner";
                        ownerBadge.textContent = "属于 " + owner.name;
                        head.appendChild(ownerBadge);
                    }
                }
                var close = uiRuntimeButton("✕", "ui-rt-window-close", function (e) {
                    e.stopPropagation();
                    uiRuntimeClosePage(ctx, page.id);
                    ctx.render();
                });
                close.title = "关闭窗口";
                head.appendChild(close);
                win.appendChild(head);
                var body = document.createElement("div");
                body.className = "ui-rt-window-body";
                body.style.width = page.width + "px";
                body.style.height = page.height + "px";
                uiSortedElements(page).forEach(function (el) {
                    if (uiRuntimeElementHidden(page, el, ctx)) return;
                    body.appendChild(uiRuntimeElement(page, el, ctx));
                });
                win.appendChild(body);
                win.addEventListener("pointerdown", function () {
                    pos.z = ++ctx.z;
                    win.style.zIndex = String(pos.z);
                });
                head.addEventListener("pointerdown", function (e) {
                    if (e.button !== undefined && e.button !== 0) return;
                    if (e.target && e.target.closest && e.target.closest("button")) return;
                    e.preventDefault();
                    var startX = e.clientX;
                    var startY = e.clientY;
                    var baseLeft = pos.left;
                    var baseTop = pos.top;
                    var scale = ctx.fitScale || 1;
                    pos.z = ++ctx.z;
                    win.style.zIndex = String(pos.z);
                    var move = function (ev) {
                        pos.left = Math.max(0, baseLeft + (ev.clientX - startX) / scale);
                        pos.top = Math.max(0, baseTop + (ev.clientY - startY) / scale);
                        win.style.left = pos.left + "px";
                        win.style.top = pos.top + "px";
                    };
                    var up = function () {
                        document.removeEventListener("pointermove", move);
                        document.removeEventListener("pointerup", up);
                    };
                    document.addEventListener("pointermove", move);
                    document.addEventListener("pointerup", up);
                });
                stage.appendChild(win);
                maxRight = Math.max(maxRight, pos.left + page.width);
                maxBottom = Math.max(maxBottom, pos.top + page.height + 36);
            });
            var designWidth = Math.max(320, maxRight + 28);
            var designHeight = Math.max(240, maxBottom + 28);
            ctx.designWidth = designWidth;
            ctx.designHeight = designHeight;
            stage.style.width = designWidth + "px";
            stage.style.height = designHeight + "px";
            stage.style.minWidth = designWidth + "px";
            stage.style.minHeight = designHeight + "px";
            ctx.fit();
        };
        ctx.fit = function () {
            if (!runtime.clientWidth || !ctx.designWidth) return;
            var available = Math.max(240, runtime.clientWidth - 36);
            var scale = Math.max(0.65, Math.min(1, available / ctx.designWidth));
            ctx.fitScale = scale;
            stage.style.zoom = scale < 0.999 ? String(scale) : "";
        };
        ctx.render();
        runtime._uiFit = ctx.fit;
        runtime._uiReset = function () {
            ctx.open = {};
            ctx.positions = {};
            ctx.values = {};
            ctx.hidden = {};
            ctx.texts = {};
            doc.pages.forEach(function (page) { if (page.open) ctx.open[page.id] = true; });
            Object.keys(ctx.open).forEach(function (pageId) {
                uiRuntimeOpenPage(ctx, pageId);
            });
            uiRuntimeOpenPage(ctx, doc.start);
            ctx.render();
        };
        return runtime;
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
                ? "UI 原型 · " + layout.pages.length + " 个页面 · 点击控件即可交互"
                : "UI 原型 · JSON 错误";
            head.appendChild(title);
            if (layout) {
                block.setAttribute("data-ui-src", source);
                var btn = document.createElement("button");
                btn.type = "button";
                btn.className = "ui-edit-btn";
                btn.textContent = "编辑";
                btn.title = "打开 UI 原型设计器";
                btn.addEventListener("click", (function (idx, src) {
                    return function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        openUiEditor(idx, src);
                    };
                })(index, source));
                head.appendChild(btn);
                var reset = document.createElement("button");
                reset.type = "button";
                reset.className = "ui-reset-btn";
                reset.textContent = "重置";
                reset.title = "恢复初始打开的窗口";
                head.appendChild(reset);
                block.appendChild(head);
                var runtime = buildUiRuntime(layout);
                reset.addEventListener("click", function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (runtime._uiReset) runtime._uiReset();
                });
                block.appendChild(runtime);
                if (runtime._uiFit) setTimeout(runtime._uiFit, 0);
            } else {
                block.appendChild(head);
                var err = document.createElement("div");
                err.className = "ui-error";
                err.textContent = "UI 原型 JSON 解析失败，请在编辑器中修正该代码块。";
                block.appendChild(err);
            }
            pre.parentNode.replaceChild(block, pre);
            index++;
        }
    }

    function uiLayoutJson() {
        if (uiDoc && uiLayout) return uiDocumentJson(uiDoc);
        var fallback = { version: 2, start: "p1", pages: [uiLayout], connections: [] };
        return uiDocumentJson(fallback);
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

    function uiCurrentPage() {
        return uiLayout || (uiDoc ? uiDoc.pages[0] : null);
    }

    function uiPageIndexById(pageId) {
        if (!uiDoc) return -1;
        for (var i = 0; i < uiDoc.pages.length; i++) {
            if (uiDoc.pages[i].id === pageId) return i;
        }
        return -1;
    }

    function uiPageOptionsHtml(selectedId, emptyLabel) {
        var html = '<option value="">' + escapeHtml(emptyLabel || "无（页面根级）") + "</option>";
        if (!uiDoc) return html;
        uiDoc.pages.forEach(function (page) {
            html += '<option value="' + escapeHtml(page.id) + '"' +
                (page.id === selectedId ? " selected" : "") + ">" +
                escapeHtml(page.name || page.id) + "</option>";
        });
        return html;
    }

    function uiElementOptionsHtml(page, selectedId, includePages) {
        var html = '<option value="">无</option>';
        if (includePages && uiDoc) {
            html += '<optgroup label="窗口 / 页面">';
            uiDoc.pages.forEach(function (p) {
                html += '<option value="' + escapeHtml(p.id) + '"' +
                    (p.id === selectedId ? " selected" : "") + ">窗口：" +
                    escapeHtml(p.name || p.id) + "</option>";
            });
            html += "</optgroup>";
            uiDoc.pages.forEach(function (p) {
                html += '<optgroup label="组件：' + escapeHtml(p.name || p.id) + '">';
                p.elements.forEach(function (el) {
                    html += '<option value="' + escapeHtml(el.id) + '"' +
                        (el.id === selectedId ? " selected" : "") + ">" +
                        escapeHtml((UI_TYPE_LABELS[el.type] || el.type) + "：" + (el.text || el.id)) + "</option>";
                });
                html += "</optgroup>";
            });
            return html;
        }
        if (!page) return html;
        page.elements.forEach(function (el) {
            html += '<option value="' + escapeHtml(el.id) + '"' +
                (el.id === selectedId ? " selected" : "") + ">" +
                escapeHtml((UI_TYPE_LABELS[el.type] || el.type) + "：" + (el.text || el.id)) + "</option>";
        });
        return html;
    }

    function uiRenderPageTabs() {
        if (!uiPageTabs || !uiDoc) return;
        uiPageTabs.innerHTML = "";
        uiDoc.pages.forEach(function (page) {
            var tab = document.createElement("button");
            tab.type = "button";
            tab.className = "ui-page-tab" + (uiLayout && page.id === uiLayout.id ? " active" : "");
            tab.setAttribute("data-page-id", page.id);
            var icon = document.createElement("span");
            icon.className = "ui-page-tab-icon";
            icon.textContent = page.kind === "dialog" ? "◈" : "▣";
            tab.appendChild(icon);
            var name = document.createElement("span");
            name.textContent = page.name || page.id;
            tab.appendChild(name);
            if (page.parentId) {
                var owner = uiFindPage(uiDoc, page.parentId);
                if (owner) {
                    var ownerBadge = document.createElement("span");
                    ownerBadge.className = "ui-page-tab-owner";
                    ownerBadge.textContent = "↳ " + owner.name;
                    tab.appendChild(ownerBadge);
                }
            }
            if (page.id === uiDoc.start) {
                var startBadge = document.createElement("span");
                startBadge.className = "ui-page-tab-start";
                startBadge.textContent = "启动";
                tab.appendChild(startBadge);
            }
            tab.title = (UI_PAGE_KINDS[page.kind] || "窗口") + "：" + page.name +
                (page.open ? " · 初始打开" : " · 初始关闭");
            tab.addEventListener("click", function () {
                if (uiConnectFrom) {
                    uiCreateConnectionTo(page.id);
                    return;
                }
                uiSwitchPage(page.id);
            });
            uiPageTabs.appendChild(tab);
        });
    }

    function uiSwitchPage(pageId) {
        if (!uiDoc) return;
        var page = uiFindPage(uiDoc, pageId);
        if (!page) return;
        uiLayout = page;
        uiSelectedId = null;
        uiConnectFrom = null;
        uiRenderEditor();
        uiEditorHint.textContent = "当前页面：" + page.name + "（" + (UI_PAGE_KINDS[page.kind] || "窗口") + "）";
    }

    function uiRenderStructure() {
        if (!uiStructure || !uiLayout) return;
        uiStructure.innerHTML = "";
        var root = document.createElement("div");
        root.className = "ui-structure-root";
        root.textContent = "▣ " + (uiLayout.name || "页面");
        root.addEventListener("click", function () { uiSelectElement(null); });
        uiStructure.appendChild(root);
        var renderLevel = function (parentId, depth) {
            uiLayout.elements.filter(function (el) { return (el.parentId || "") === parentId; })
                .forEach(function (el) {
                    var row = document.createElement("div");
                    row.className = "ui-structure-item" + (el.id === uiSelectedId ? " active" : "") +
                        (uiIsContainerType(el.type) ? " container" : "");
                    row.style.paddingLeft = (8 + depth * 12) + "px";
                    row.innerHTML = '<span class="ui-structure-icon">' + escapeHtml(UI_TYPE_ICONS[el.type] || "•") +
                        '</span><span class="ui-structure-label">' +
                        escapeHtml(el.text || UI_TYPE_LABELS[el.type]) + "</span>";
                    row.title = UI_TYPE_LABELS[el.type] + " · " + el.id;
                    row.tabIndex = 0;
                    row.setAttribute("role", "button");
                    row.addEventListener("keydown", function (e) {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            uiSelectElement(el.id);
                            uiRenderStructure();
                        }
                    });
                    row.addEventListener("click", function () {
                        uiSelectElement(el.id);
                        uiRenderStructure();
                    });
                    uiStructure.appendChild(row);
                    renderLevel(el.id, depth + 1);
                });
        };
        renderLevel("", 0);
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
        var depth = uiLayout ? uiElementDepth(uiLayout, el) : 0;
        var childCount = uiLayout ? uiLayout.elements.filter(function (child) {
            return child.parentId === el.id;
        }).length : 0;
        node.className = "ui-canvas-el" + (el.id === uiSelectedId ? " selected" : "") +
            (depth ? " nested" : "") + (uiIsContainerType(el.type) ? " container-type" : "") +
            (el.id === uiConnectFrom ? " connect-source" : "");
        node.setAttribute("data-id", el.id);
        node.setAttribute("data-type", el.type);
        node.setAttribute("data-parent-id", el.parentId || "");
        node.tabIndex = 0;
        node.setAttribute("role", "button");
        node.setAttribute("aria-label", UI_TYPE_LABELS[el.type] + "：" + (el.text || "未命名"));
        node.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                uiSelectElement(el.id);
                uiCanvas.focus();
            }
        });
        node.style.left = el.x + "px";
        node.style.top = el.y + "px";
        node.style.width = el.w + "px";
        node.style.height = el.h + "px";
        node.style.zIndex = String(10 + depth * 10 + uiLayout.elements.indexOf(el));
        var icon = document.createElement("span");
        icon.className = "ui-canvas-icon";
        icon.textContent = UI_TYPE_ICONS[el.type] || "•";
        node.appendChild(icon);
        var label = document.createElement("div");
        label.className = "ui-canvas-label";
        label.textContent = el.text || "";
        label.style.display = el.text ? "" : "none";
        node.appendChild(label);
        if (childCount) {
            var childBadge = document.createElement("span");
            childBadge.className = "ui-canvas-children";
            childBadge.textContent = childCount + " 子组件";
            node.appendChild(childBadge);
        }
        if (el.props && el.props.note) {
            var note = document.createElement("div");
            note.className = "ui-canvas-note";
            note.textContent = el.props.note;
            node.appendChild(note);
        }
        node.title = UI_TYPE_LABELS[el.type] + "：" + (el.text || "（未填写文字）") +
            (el.parentId ? " · 属于 " + el.parentId : "");
        ["nw", "ne", "sw", "se"].forEach(function (dir) {
            var handle = document.createElement("span");
            handle.className = "ui-canvas-resize ui-resize-" + dir;
            handle.setAttribute("data-dir", dir);
            node.appendChild(handle);
        });
        return node;
    }

    function uiParentOptions(el) {
        var html = '<option value="">页面根级</option>';
        if (!uiLayout) return html;
        uiLayout.elements.forEach(function (candidate) {
            if (!uiIsContainerType(candidate.type) || candidate.id === el.id) return;
            if (!uiCanContain(candidate.type, el.type)) return;
            if (uiElementDescendants(uiLayout, el.id).indexOf(candidate) >= 0) return;
            html += '<option value="' + escapeHtml(candidate.id) + '"' +
                (candidate.id === el.parentId ? " selected" : "") + ">" +
                escapeHtml(UI_TYPE_LABELS[candidate.type] + "：" + (candidate.text || candidate.id)) +
                "</option>";
        });
        return html;
    }

    function uiPropDefsFor(type) {
        var defs = [];
        if (type === "input") {
            defs.push({ key: "placeholder", label: "占位提示", type: "text" });
            defs.push({ key: "value", label: "默认值", type: "text" });
            defs.push({ key: "inputType", label: "输入类型", type: "select", options: ["text", "password", "number", "email", "search"] });
            defs.push({ key: "required", label: "必填", type: "checkbox" });
            defs.push({ key: "disabled", label: "禁用", type: "checkbox" });
        } else if (type === "button") {
            defs.push({ key: "variant", label: "按钮样式", type: "select", options: ["primary", "secondary", "danger", "ghost"] });
            defs.push({ key: "disabled", label: "禁用", type: "checkbox" });
        } else if (type === "form") {
            defs.push({ key: "submitText", label: "提交按钮文字", type: "text" });
        } else if (type === "heading") {
            defs.push({ key: "level", label: "标题级别", type: "select", options: ["1", "2", "3", "4", "5", "6"] });
        } else if (type === "navbar" || type === "sidebar" || type === "list") {
            defs.push({ key: "items", label: "项目（每行一个）", type: "textarea" });
        } else if (type === "table" || type === "database") {
            defs.push({ key: "columns", label: "列名（逗号分隔）", type: "text" });
            defs.push({ key: "items", label: "数据（每行一条，| 或逗号分隔）", type: "textarea" });
            if (type === "database") {
                defs.push({ key: "placeholder", label: "查询提示", type: "text" });
                defs.push({ key: "dataUrl", label: "数据源 URL（可选，返回 JSON）", type: "text" });
            }
        } else if (type === "filebrowser") {
            defs.push({ key: "items", label: "文件/文件夹（每行一个）", type: "textarea" });
        } else if (type === "model3d" || type === "scene3d") {
            defs.push({ key: "color", label: "模型颜色（CSS）", type: "text" });
        } else if (type === "animation") {
            defs.push({ key: "speed", label: "动画速度", type: "text" });
        } else if (type === "canvas") {
            defs.push({ key: "color", label: "画笔颜色", type: "text" });
            defs.push({ key: "brush", label: "画笔大小", type: "text" });
        } else if (type === "image" || type === "gif") {
            defs.push({ key: "fit", label: "填充方式", type: "select", options: ["cover", "contain", "fill"] });
        } else if (type === "content" || type === "card" || type === "text" || type === "page") {
            defs.push({ key: "note", label: "备注 / 说明", type: "text" });
        }
        return defs;
    }

    function uiRenderExtraProps(el) {
        if (!uiPropExtra) return;
        uiPropExtra.innerHTML = "";
        var defs = uiPropDefsFor(el.type);
        defs.forEach(function (def) {
            var label = document.createElement("label");
            label.className = "ui-field";
            if (def.type === "checkbox") {
                label.className = "ui-check-field";
            }
            var text = document.createElement("span");
            text.textContent = def.label;
            label.appendChild(text);
            var input;
            if (def.type === "textarea") {
                input = document.createElement("textarea");
                input.rows = 3;
                var value = el.props[def.key];
                input.value = Array.isArray(value) ? value.join("\n") : String(value == null ? "" : value);
            } else if (def.type === "select") {
                input = document.createElement("select");
                (def.options || []).forEach(function (option) {
                    var opt = document.createElement("option");
                    opt.value = option;
                    opt.textContent = option;
                    input.appendChild(opt);
                });
                input.value = String(el.props[def.key] == null ? (def.options || [""])[0] : el.props[def.key]);
            } else if (def.type === "checkbox") {
                input = document.createElement("input");
                input.type = "checkbox";
                input.checked = el.props[def.key] === true || el.props[def.key] === "true";
            } else {
                input = document.createElement("input");
                input.type = "text";
                input.value = String(el.props[def.key] == null ? "" : el.props[def.key]);
            }
            input.setAttribute("data-prop-key", def.key);
            var update = function () {
                if (def.type === "checkbox") el.props[def.key] = input.checked;
                else el.props[def.key] = input.value;
                uiUpdateCanvasLabel(el);
            };
            input.addEventListener("input", update);
            input.addEventListener("change", update);
            label.appendChild(input);
            uiPropExtra.appendChild(label);
        });
    }

    function uiRenderInteractions(el) {
        if (!uiInteractions) return;
        uiInteractions.innerHTML = "";
        if (!uiDoc) return;
        var list = uiDoc.connections.filter(function (conn) { return conn.from === el.id; });
        if (!list.length) {
            var empty = document.createElement("div");
            empty.className = "ui-props-empty";
            empty.textContent = "还没有交互，点击下方按钮或开启连线模式";
            uiInteractions.appendChild(empty);
            return;
        }
        list.forEach(function (conn) {
            var row = document.createElement("div");
            row.className = "ui-interaction-row";

            var eventSelect = document.createElement("select");
            UI_EVENTS.forEach(function (event) {
                var option = document.createElement("option");
                option.value = event;
                option.textContent = UI_EVENT_LABELS[event] || event;
                eventSelect.appendChild(option);
            });
            eventSelect.value = conn.event;
            eventSelect.title = "触发事件";
            eventSelect.addEventListener("change", function () {
                conn.event = eventSelect.value;
                uiRenderLogic();
            });

            var actionSelect = document.createElement("select");
            UI_ACTIONS.forEach(function (action) {
                var option = document.createElement("option");
                option.value = action;
                option.textContent = UI_ACTION_LABELS[action] || action;
                actionSelect.appendChild(option);
            });
            actionSelect.value = conn.action;
            actionSelect.title = "执行动作";
            actionSelect.addEventListener("change", function () {
                conn.action = actionSelect.value;
                uiRenderInteractions(el);
                uiRenderLogic();
            });

            var targetSelect = document.createElement("select");
            targetSelect.innerHTML = uiElementOptionsHtml(null, conn.target, true);
            targetSelect.value = conn.target || "";
            targetSelect.title = "目标窗口或组件";
            targetSelect.addEventListener("change", function () {
                conn.target = targetSelect.value;
                var isPageTarget = !!uiFindPage(uiDoc, conn.target);
                if (isPageTarget && ["toggle", "show", "hide", "focus", "setText"].indexOf(conn.action) >= 0) {
                    conn.action = "open";
                } else if (!isPageTarget && ["open", "navigate"].indexOf(conn.action) >= 0) {
                    conn.action = "toggle";
                }
                uiRenderInteractions(el);
                uiRenderLogic();
            });

            var valueInput = document.createElement("input");
            valueInput.type = "text";
            valueInput.placeholder = "消息 / 设置文字";
            valueInput.value = conn.value || "";
            valueInput.addEventListener("input", function () { conn.value = valueInput.value; });

            var remove = document.createElement("button");
            remove.type = "button";
            remove.className = "ui-interaction-remove";
            remove.textContent = "✕";
            remove.title = "删除该交互";
            remove.addEventListener("click", function () {
                uiDoc.connections = uiDoc.connections.filter(function (item) { return item !== conn; });
                uiRenderInteractions(el);
                uiRenderLogic();
            });

            row.appendChild(eventSelect);
            row.appendChild(actionSelect);
            row.appendChild(targetSelect);
            row.appendChild(valueInput);
            row.appendChild(remove);
            uiInteractions.appendChild(row);
        });
    }

    function uiSyncPropInputs() {
        var el = uiSelectedElement();
        if (!el) return;
        uiPropParent.innerHTML = uiParentOptions(el);
        uiPropParent.value = el.parentId || "";
        uiPropText.value = el.text || "";
        uiPropSrc.value = (el.props && el.props.src) || "";
        uiPropNote.value = (el.props && el.props.note) || "";
        uiPropX.value = Math.round(el.x);
        uiPropY.value = Math.round(el.y);
        uiPropW.value = Math.round(el.w);
        uiPropH.value = Math.round(el.h);
        uiRenderExtraProps(el);
        uiRenderInteractions(el);
    }

    function uiRenderPageProps() {
        if (!uiPageProps || !uiLayout || !uiDoc) return;
        uiPageName.value = uiLayout.name || "";
        uiPageKind.value = uiLayout.kind || "window";
        var parentOptions = '<option value="">无（顶级窗口）</option>';
        var descendants = uiPageDescendants(uiDoc, uiLayout.id);
        uiDoc.pages.forEach(function (page) {
            if (page.id === uiLayout.id || descendants.indexOf(page) >= 0) return;
            parentOptions += '<option value="' + escapeHtml(page.id) + '"' +
                (page.id === uiLayout.parentId ? " selected" : "") + ">" +
                escapeHtml(page.name || page.id) + "</option>";
        });
        uiPageParent.innerHTML = parentOptions;
        uiPageParent.value = uiLayout.parentId || "";
        if (uiPageX) uiPageX.value = Math.round(uiLayout.x || 0);
        if (uiPageY) uiPageY.value = Math.round(uiLayout.y || 0);
        uiPageOpen.checked = !!uiLayout.open;
        uiPageStart.checked = uiDoc.start === uiLayout.id;
    }

    function uiRenderProps() {
        var el = uiSelectedElement();
        if (!el) {
            if (uiPageProps) uiPageProps.hidden = false;
            if (uiPropsEmpty) uiPropsEmpty.hidden = true;
            if (uiPropsFields) uiPropsFields.hidden = true;
            uiPropType.textContent = "页面";
            uiRenderPageProps();
            return;
        }
        if (uiPageProps) uiPageProps.hidden = true;
        if (uiPropsEmpty) uiPropsEmpty.hidden = true;
        if (uiPropsFields) uiPropsFields.hidden = false;
        uiPropType.textContent = UI_TYPE_LABELS[el.type];
        uiSyncPropInputs();
    }

    function uiSelectElement(id) {
        uiSelectedId = id || null;
        var nodes = uiCanvas.querySelectorAll(".ui-canvas-el");
        for (var i = 0; i < nodes.length; i++) {
            var nodeId = nodes[i].getAttribute("data-id");
            nodes[i].classList.toggle("selected", nodeId === uiSelectedId);
            nodes[i].classList.toggle("connect-source", nodeId === uiConnectFrom);
        }
        uiRenderProps();
        uiRenderStructure();
        uiRenderLogic();
    }

    function uiUpdateCanvasLabel(el) {
        var node = uiCanvasNode(el.id);
        if (!node) return;
        var label = node.querySelector(".ui-canvas-label");
        if (label) {
            label.textContent = el.text || "";
            label.style.display = el.text ? "" : "none";
        }
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
        if (!uiLayout) return;
        var bounds = { x: 0, y: 0, width: uiLayout.width, height: uiLayout.height };
        if (el.parentId) {
            var parent = uiFindElement(uiLayout, el.parentId);
            if (parent) {
                bounds = { x: parent.x, y: parent.y, width: parent.w, height: parent.h };
            }
        }
        w = Math.max(24, Math.min(bounds.width, Math.round(w)));
        h = Math.max(18, Math.min(bounds.height, Math.round(h)));
        x = Math.max(bounds.x, Math.min(bounds.x + bounds.width - w, Math.round(x)));
        y = Math.max(bounds.y, Math.min(bounds.y + bounds.height - h, Math.round(y)));
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
        var children = uiElementDescendants(uiLayout, el.id).map(function (child) {
            return { el: child, x: child.x, y: child.y };
        });
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
                var actualX = el.x - start.x;
                var actualY = el.y - start.y;
                children.forEach(function (child) {
                    child.el.x = child.x + actualX;
                    child.el.y = child.y + actualY;
                    var childNode = uiCanvasNode(child.el.id);
                    if (childNode) {
                        childNode.style.left = child.el.x + "px";
                        childNode.style.top = child.el.y + "px";
                    }
                });
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
            if (dir) uiClampChildrenToParent(el);
            uiSyncPropInputs();
            uiRenderStructure();
            uiRenderLogic();
        }

        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
    }

    function uiClampChildrenToParent(parent) {
        if (!uiLayout || !uiIsContainerType(parent.type)) return;
        uiElementDescendants(uiLayout, parent.id).forEach(function (child) {
            var direct = child.parentId === parent.id;
            var node = uiCanvasNode(child.id);
            if (direct) {
                child.w = Math.min(child.w, parent.w);
                child.h = Math.min(child.h, parent.h);
                child.x = Math.max(parent.x, Math.min(parent.x + parent.w - child.w, child.x));
                child.y = Math.max(parent.y, Math.min(parent.y + parent.h - child.h, child.y));
            }
            if (node) {
                node.style.left = child.x + "px";
                node.style.top = child.y + "px";
                node.style.width = child.w + "px";
                node.style.height = child.h + "px";
            }
        });
    }

    function uiNudgeElement(el, dx, dy) {
        if (!uiLayout || !el) return;
        var children = uiElementDescendants(uiLayout, el.id).map(function (child) {
            return { el: child, x: child.x, y: child.y };
        });
        var startX = el.x;
        var startY = el.y;
        uiApplyElementGeometry(el, startX + dx, startY + dy, el.w, el.h);
        var actualX = el.x - startX;
        var actualY = el.y - startY;
        children.forEach(function (child) {
            child.el.x = child.x + actualX;
            child.el.y = child.y + actualY;
            var childNode = uiCanvasNode(child.el.id);
            if (childNode) {
                childNode.style.left = child.el.x + "px";
                childNode.style.top = child.el.y + "px";
            }
        });
        uiRenderLogic();
        uiRenderStructure();
    }

    function uiRenderEditor() {
        if (!uiCanvas || !uiLayout) return;
        uiCanvas.style.width = uiLayout.width + "px";
        uiCanvas.style.height = uiLayout.height + "px";
        uiCanvas.innerHTML = "";
        uiSortedElements(uiLayout).forEach(function (el) {
            uiCanvas.appendChild(buildUiCanvasElement(el));
        });
        uiEditorSize.textContent = uiLayout.width + " × " + uiLayout.height;
        uiCanvasWidth.value = uiLayout.width;
        uiCanvasHeight.value = uiLayout.height;
        if (uiSelectedId && !uiSelectedElement()) uiSelectedId = null;
        uiRenderPageTabs();
        uiRenderStructure();
        uiRenderProps();
        uiRenderLogic();
    }

    function addUiElement(type) {
        if (!uiLayout || !UI_TYPE_LABELS[type]) return;
        var size = UI_DEFAULT_SIZE[type] || [200, 100];
        var w = Math.min(size[0], uiLayout.width);
        var h = Math.min(size[1], uiLayout.height);
        var selected = uiSelectedElement();
        var parent = null;
        if (selected && uiIsContainerType(selected.type) && uiCanContain(selected.type, type)) {
            parent = selected;
        } else if (selected && selected.parentId) {
            var siblingParent = uiFindElement(uiLayout, selected.parentId);
            if (siblingParent && uiCanContain(siblingParent.type, type)) parent = siblingParent;
        }
        var pos;
        if (parent) {
            w = Math.min(w, parent.w);
            h = Math.min(h, parent.h);
            pos = [parent.x + Math.min(20, parent.w - w), parent.y + Math.min(32, parent.h - h)];
        } else {
            pos = uiDefaultPosition(type, w, h);
        }
        var el = {
            id: "e" + (++uiElementSeq),
            type: type,
            parentId: parent ? parent.id : "",
            x: pos[0], y: pos[1], w: w, h: h,
            text: "",
            props: {}
        };
        if (type === "page" && !parent) {
            uiLayout.elements.unshift(el);
        } else {
            uiLayout.elements.push(el);
        }
        uiSelectedId = el.id;
        uiRenderEditor();
        uiEditorHint.textContent = parent
            ? "已添加 " + UI_TYPE_LABELS[type] + " 到「" + (parent.text || UI_TYPE_LABELS[parent.type]) + "」"
            : "已添加 " + UI_TYPE_LABELS[type] + "；可在右侧修改属性与交互";
        var node = uiCanvasNode(el.id);
        if (node && node.scrollIntoView) node.scrollIntoView({ block: "nearest", inline: "nearest" });
    }

    function deleteUiSelected() {
        if (!uiLayout || !uiSelectedId) return;
        var victims = [uiSelectedId].concat(uiElementDescendants(uiLayout, uiSelectedId).map(function (el) {
            return el.id;
        }));
        uiLayout.elements = uiLayout.elements.filter(function (el) {
            return victims.indexOf(el.id) < 0;
        });
        if (uiDoc) {
            uiDoc.connections = uiDoc.connections.filter(function (conn) {
                return victims.indexOf(conn.from) < 0 && victims.indexOf(conn.target) < 0;
            });
        }
        uiSelectedId = null;
        uiRenderEditor();
        uiEditorHint.textContent = "已删除选中组件及其子组件";
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
        uiLayout.elements.forEach(function (el) {
            if (uiIsContainerType(el.type)) uiClampChildrenToParent(el);
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
        uiRenderStructure();
    }

    function uiAddPage() {
        if (!uiDoc) return;
        var index = uiDoc.pages.length + 1;
        var page = {
            id: "p" + (++uiPageSeq),
            name: "页面 " + index,
            kind: "window",
            parentId: "",
            open: false,
            x: 0,
            y: 0,
            width: 960,
            height: 600,
            elements: []
        };
        while (uiFindPage(uiDoc, page.id)) page.id = "p" + (++uiPageSeq);
        uiDoc.pages.push(page);
        uiSwitchPage(page.id);
        uiEditorHint.textContent = "已创建「" + page.name + "」；可在右侧设置窗口归属和启动页";
    }

    function uiDeletePage() {
        if (!uiDoc || !uiLayout) return;
        if (uiDoc.pages.length <= 1) {
            uiEditorHint.textContent = "至少保留一个页面";
            return;
        }
        var children = uiDoc.pages.filter(function (page) { return page.parentId === uiLayout.id; });
        if (children.length) {
            uiEditorHint.textContent = "该页面还有 " + children.length + " 个子窗口，请先调整它们的所属窗口";
            return;
        }
        var removed = uiLayout;
        var index = uiPageIndexById(removed.id);
        uiDoc.pages = uiDoc.pages.filter(function (page) { return page.id !== removed.id; });
        uiDoc.connections = uiDoc.connections.filter(function (conn) {
            var targetOk = uiFindPage(uiDoc, conn.target) || uiFindElementAnywhere(uiDoc, conn.target);
            var fromOk = uiFindElementAnywhere(uiDoc, conn.from);
            return !!targetOk && !!fromOk;
        });
        if (uiDoc.start === removed.id) uiDoc.start = uiDoc.pages[0].id;
        uiSwitchPage(uiDoc.pages[Math.max(0, index - 1)].id);
        uiEditorHint.textContent = "已删除页面「" + removed.name + "」";
    }

    function uiReparentElement() {
        var el = uiSelectedElement();
        if (!el || !uiLayout) return;
        var parentId = uiPropParent.value;
        if (parentId) {
            var parent = uiFindElement(uiLayout, parentId);
            if (!parent || !uiIsContainerType(parent.type) || !uiCanContain(parent.type, el.type) ||
                uiElementDescendants(uiLayout, el.id).indexOf(parent) >= 0) {
                uiEditorHint.textContent = "「" + UI_TYPE_LABELS[parent ? parent.type : "?"] +
                    "」不能包含「" + UI_TYPE_LABELS[el.type] + "」";
                uiPropParent.value = el.parentId || "";
                return;
            }
            el.parentId = parent.id;
            uiApplyElementGeometry(el, parent.x + Math.min(16, parent.w - el.w),
                parent.y + Math.min(28, parent.h - el.h), el.w, el.h);
        } else {
            el.parentId = "";
            uiApplyElementGeometry(el, el.x, el.y, el.w, el.h);
        }
        uiRenderEditor();
        uiEditorHint.textContent = "已调整所属容器";
    }

    function uiAddInteraction() {
        var el = uiSelectedElement();
        if (!el || !uiDoc) return;
        var targetPage = uiDoc.pages.filter(function (page) { return page.id !== uiLayout.id; })[0];
        var targetEl = uiLayout.elements.filter(function (item) { return item.id !== el.id; })[0];
        var target = targetPage ? targetPage.id : (targetEl ? targetEl.id : "");
        if (!target) {
            uiEditorHint.textContent = "请先创建另一个页面或组件作为交互目标";
            return;
        }
        uiCreateConnection(el.id, target, targetPage ? "open" : "toggle", "click");
    }

    function uiPickResource() {
        if (!uiSelectedElement()) {
            uiEditorHint.textContent = "请先选择一个组件，再浏览资源文件";
            return;
        }
        uiPickingResource = true;
        uiEditorHint.textContent = "正在打开文件选择器…";
        postMessage({ type: "pickResource" });
    }

    function uiCreateConnection(fromId, targetId, action, eventName) {
        if (!uiDoc || !fromId || !targetId) return;
        var targetPage = uiFindPage(uiDoc, targetId);
        var targetInfo = targetPage ? null : uiFindElementAnywhere(uiDoc, targetId);
        if (!targetPage && !targetInfo) return;
        var conn = {
            id: "c" + (++uiConnSeq),
            from: String(fromId),
            event: UI_EVENTS.indexOf(eventName) >= 0 ? eventName : "click",
            action: UI_ACTIONS.indexOf(action) >= 0 ? action : (targetPage ? "open" : "toggle"),
            target: String(targetId),
            value: ""
        };
        uiDoc.connections.push(conn);
        uiRenderLogic();
        uiRenderProps();
        uiEditorHint.textContent = "已创建交互：" + (UI_EVENT_LABELS[conn.event] || conn.event) +
            " → " + (UI_ACTION_LABELS[conn.action] || conn.action) +
            " · " + (targetPage ? targetPage.name : (targetInfo.element.text || targetInfo.element.id));
    }

    function uiCreateConnectionTo(targetId) {
        if (!uiConnectFrom) return;
        var from = uiConnectFrom;
        var targetPage = uiFindPage(uiDoc, targetId);
        uiCreateConnection(from, targetId, targetPage ? "open" : "toggle", "click");
        uiConnectFrom = null;
        uiRenderEditor();
        uiUpdateConnectButton();
    }

    function uiUpdateConnectButton() {
        if (!uiConnectToggle) return;
        uiConnectToggle.classList.toggle("active", uiConnectMode);
        uiConnectToggle.textContent = uiConnectMode
            ? (uiConnectFrom ? "选择目标…（取消）" : "连线中…（取消）")
            : "开始连线";
    }

    function uiToggleConnect() {
        uiConnectMode = !uiConnectMode;
        uiConnectFrom = null;
        if (uiConnectMode && !uiLogicOn) {
            uiLogicOn = true;
            if (uiLogicToggle) uiLogicToggle.classList.add("active");
        }
        uiRenderLogic();
        uiUpdateConnectButton();
        uiEditorHint.textContent = uiConnectMode
            ? "连线模式：先点击源控件，再点击目标控件或页面标签"
            : "已退出连线模式";
    }

    function uiToggleLogic() {
        uiLogicOn = !uiLogicOn;
        if (uiLogicToggle) uiLogicToggle.classList.toggle("active", uiLogicOn);
        if (!uiLogicOn) {
            uiConnectMode = false;
            uiConnectFrom = null;
            uiUpdateConnectButton();
        }
        uiRenderLogic();
        uiEditorHint.textContent = uiLogicOn ? "逻辑连线已显示；可开启连线模式创建交互" : "逻辑连线已隐藏";
    }

    function uiLogicChipPoint(pageId) {
        var index = uiPageIndexById(pageId);
        if (index < 0) index = 0;
        return {
            x: uiLayout.width - 18,
            y: 28 + index * 34
        };
    }

    function uiRenderLogic() {
        if (!uiCanvas || !uiLayout) return;
        var oldSvg = uiCanvas.querySelector(".ui-logic-svg");
        if (oldSvg) oldSvg.parentNode.removeChild(oldSvg);
        var oldChips = uiCanvas.querySelector(".ui-logic-targets");
        if (oldChips) oldChips.parentNode.removeChild(oldChips);
        if (!uiLogicOn || !uiDoc) return;

        var chips = document.createElement("div");
        chips.className = "ui-logic-targets";
        var chipRects = {};
        uiDoc.pages.forEach(function (page, index) {
            var chip = document.createElement("button");
            chip.type = "button";
            chip.className = "ui-logic-chip" + (page.id === uiLayout.id ? " current" : "");
            chip.setAttribute("data-page-id", page.id);
            chip.textContent = (page.kind === "dialog" ? "◈ " : "▣ ") + (page.name || page.id);
            chip.style.top = (12 + index * 34) + "px";
            chip.title = "点击连接到页面 / 窗口：" + (page.name || page.id);
            chip.addEventListener("click", function (e) {
                e.stopPropagation();
                if (uiConnectFrom) uiCreateConnectionTo(page.id);
                else if (page.id !== uiLayout.id) uiSwitchPage(page.id);
            });
            chips.appendChild(chip);
            chipRects[page.id] = {
                x: uiLayout.width - 18,
                y: 26 + index * 34
            };
        });
        uiCanvas.appendChild(chips);

        var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "ui-logic-svg");
        svg.setAttribute("viewBox", "0 0 " + uiLayout.width + " " + uiLayout.height);
        svg.setAttribute("width", uiLayout.width);
        svg.setAttribute("height", uiLayout.height);
        var defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        defs.innerHTML = '<marker id="ui-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">' +
            '<path d="M0,0 L8,4 L0,8 z" fill="#0969da"></path></marker>';
        svg.appendChild(defs);

        uiDoc.connections.forEach(function (conn) {
            var from = uiFindElement(uiLayout, conn.from);
            if (!from) return;
            var targetPage = uiFindPage(uiDoc, conn.target);
            var targetInfo = targetPage ? null : uiFindElementAnywhere(uiDoc, conn.target);
            var target;
            if (targetPage) {
                target = chipRects[targetPage.id];
            } else if (targetInfo && targetInfo.page === uiLayout) {
                target = {
                    x: targetInfo.element.x + targetInfo.element.w / 2,
                    y: targetInfo.element.y + targetInfo.element.h / 2
                };
            } else if (targetInfo) {
                target = chipRects[targetInfo.page.id];
            } else if (conn.action === "alert") {
                target = {
                    x: Math.min(uiLayout.width - 18, from.x + from.w + 44),
                    y: from.y + from.h / 2
                };
            } else if (conn.action === "back") {
                target = chipRects[uiLayout.parentId || uiLayout.id] || chipRects[uiLayout.id];
            } else if (conn.action === "close") {
                target = chipRects[uiLayout.id];
            }
            if (!target) return;
            var sx = from.x + from.w;
            var sy = from.y + from.h / 2;
            var tx = target.x;
            var ty = target.y;
            var midX = (sx + tx) / 2;
            var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", "M" + sx + "," + sy + " C" + (sx + 50) + "," + sy +
                " " + (tx - 50) + "," + ty + " " + tx + "," + ty);
            path.setAttribute("class", "ui-logic-line action-" + conn.action +
                (targetPage || (targetInfo && targetInfo.page !== uiLayout) ? " page-link" : ""));
            path.setAttribute("marker-end", "url(#ui-arrow)");
            path.addEventListener("click", function (e) {
                e.stopPropagation();
                uiSelectElement(conn.from);
                uiEditorHint.textContent = "连线：" + (UI_EVENT_LABELS[conn.event] || conn.event) +
                    " → " + (UI_ACTION_LABELS[conn.action] || conn.action) +
                    " · 可在右侧修改或删除";
            });
            svg.appendChild(path);
            var label = document.createElementNS("http://www.w3.org/2000/svg", "text");
            label.setAttribute("x", midX);
            label.setAttribute("y", (sy + ty) / 2 - 5);
            label.setAttribute("class", "ui-logic-label");
            label.textContent = (UI_EVENT_LABELS[conn.event] || conn.event) + "→" +
                (UI_ACTION_LABELS[conn.action] || conn.action);
            svg.appendChild(label);
        });

        uiDoc.pages.forEach(function (page) {
            if (!page.parentId || !chipRects[page.parentId] || !chipRects[page.id]) return;
            var parentPoint = chipRects[page.parentId];
            var childPoint = chipRects[page.id];
            var line = document.createElementNS("http://www.w3.org/2000/svg", "path");
            line.setAttribute("d", "M" + parentPoint.x + "," + parentPoint.y +
                " C" + (parentPoint.x + 18) + "," + parentPoint.y +
                " " + (childPoint.x + 18) + "," + childPoint.y +
                " " + childPoint.x + "," + childPoint.y);
            line.setAttribute("class", "ui-logic-ownership");
            svg.appendChild(line);
            var ownerLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
            ownerLabel.setAttribute("x", childPoint.x - 6);
            ownerLabel.setAttribute("y", (parentPoint.y + childPoint.y) / 2);
            ownerLabel.setAttribute("text-anchor", "end");
            ownerLabel.setAttribute("class", "ui-logic-label ownership-label");
            ownerLabel.textContent = "窗口归属";
            svg.appendChild(ownerLabel);
        });

        uiCanvas.insertBefore(svg, uiCanvas.firstChild);
    }

    function openUiEditor(index, source) {
        if (!uiEditor) return;
        var parsed = (index === null || index === undefined || index === "") ? null : parseInt(index, 10);
        if (parsed !== null && isNaN(parsed)) parsed = null;
        uiEditIndex = parsed;
        uiSelectedId = null;
        uiLogicOn = false;
        uiConnectMode = false;
        uiConnectFrom = null;

        if (uiEditIndex === null) {
            uiDoc = {
                version: 2,
                start: "p1",
                pages: [{
                    id: "p1", name: "主窗口", kind: "window", parentId: "",
                    open: true, x: 24, y: 24, width: 960, height: 600, elements: []
                }],
                connections: []
            };
            uiLayout = uiDoc.pages[0];
            uiElementSeq = 0;
            uiPageSeq = 1;
            uiConnSeq = 0;
            uiEditorTitle.textContent = "插入 UI 原型";
            uiEditorHint.textContent = "从左侧添加组件；先选择容器可把组件放入容器；Ctrl+Enter 应用 · Esc 取消";
        } else {
            var doc = parseUiLayout(source || "");
            if (!doc) {
                postMessage({ type: "status", text: "UI 原型 JSON 解析失败，请先修正代码块" });
                return;
            }
            uiDoc = doc;
            uiLayout = uiFindPage(doc, doc.start) || doc.pages[0];
            uiElementSeq = uiMaxElementSeqForDoc(doc);
            uiPageSeq = uiMaxPageSeq(doc);
            uiConnSeq = 0;
            doc.connections.forEach(function (conn) {
                var m = /^c(\d+)$/.exec(String(conn.id || ""));
                if (m) uiConnSeq = Math.max(uiConnSeq, parseInt(m[1], 10));
            });
            uiEditorTitle.textContent = "编辑 UI 原型";
            uiEditorHint.textContent = "多页面 / 窗口归属 / 交互连线；Ctrl+Enter 应用 · Esc 取消";
            uiLogicOn = doc.connections.length > 0 || doc.pages.length > 1;
        }

        if (uiLogicToggle) uiLogicToggle.classList.toggle("active", uiLogicOn);
        uiUpdateConnectButton();
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
        uiDoc = null;
        uiLayout = null;
        uiSelectedId = null;
        uiEditIndex = null;
        uiLogicOn = false;
        uiConnectMode = false;
        uiConnectFrom = null;
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
        if (uiPageAdd) uiPageAdd.addEventListener("click", uiAddPage);
        if (uiPageDelete) uiPageDelete.addEventListener("click", uiDeletePage);
        if (uiLogicToggle) uiLogicToggle.addEventListener("click", uiToggleLogic);
        if (uiConnectToggle) uiConnectToggle.addEventListener("click", uiToggleConnect);
        if (uiAddInteractionBtn) uiAddInteractionBtn.addEventListener("click", uiAddInteraction);

        uiPalette.addEventListener("click", function (e) {
            var btn = e.target && e.target.closest ? e.target.closest("button[data-type]") : null;
            if (btn) addUiElement(btn.getAttribute("data-type"));
        });

        uiCanvas.addEventListener("pointerdown", function (e) {
            var chip = e.target && e.target.closest ? e.target.closest(".ui-logic-chip") : null;
            if (chip) return;
            var node = e.target && e.target.closest ? e.target.closest(".ui-canvas-el") : null;
            if (!node) {
                if (uiConnectMode && uiConnectFrom) {
                    uiConnectFrom = null;
                    uiUpdateConnectButton();
                    uiSelectElement(null);
                    uiEditorHint.textContent = "已取消连线源，请重新选择源控件";
                } else {
                    uiSelectElement(null);
                }
                return;
            }
            var el = uiFindElement(uiLayout, node.getAttribute("data-id"));
            if (!el) return;
            if (uiConnectMode) {
                if (!uiConnectFrom) {
                    uiConnectFrom = el.id;
                    uiSelectedId = el.id;
                    uiUpdateConnectButton();
                    uiSelectElement(el.id);
                    uiEditorHint.textContent = "已选择源控件「" + (el.text || UI_TYPE_LABELS[el.type]) +
                        "」，现在点击目标控件或页面标签";
                } else if (uiConnectFrom === el.id) {
                    uiConnectFrom = null;
                    uiUpdateConnectButton();
                    uiSelectElement(el.id);
                    uiEditorHint.textContent = "已取消连线源";
                } else {
                    uiCreateConnectionTo(el.id);
                }
                return;
            }
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
            uiRenderStructure();
            uiRenderLogic();
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
        if (uiPropParent) uiPropParent.addEventListener("change", uiReparentElement);
        if (uiPropSrcBrowse) uiPropSrcBrowse.addEventListener("click", uiPickResource);
        [uiPropX, uiPropY, uiPropW, uiPropH].forEach(function (input) {
            input.addEventListener("change", uiSyncPropsFromFields);
        });

        if (uiPageName) uiPageName.addEventListener("input", function () {
            if (!uiLayout) return;
            uiLayout.name = uiPageName.value;
            uiRenderPageTabs();
            uiRenderStructure();
        });
        if (uiPageKind) uiPageKind.addEventListener("change", function () {
            if (!uiLayout) return;
            uiLayout.kind = uiPageKind.value === "dialog" ? "dialog" : "window";
            uiRenderPageTabs();
        });
        if (uiPageParent) uiPageParent.addEventListener("change", function () {
            if (!uiLayout || !uiDoc) return;
            var parentId = uiPageParent.value;
            if (parentId) {
                var descendants = uiPageDescendants(uiDoc, uiLayout.id);
                if (parentId === uiLayout.id || descendants.some(function (page) { return page.id === parentId; })) {
                    uiEditorHint.textContent = "窗口归属不能形成循环";
                    uiPageParent.value = uiLayout.parentId || "";
                    return;
                }
            }
            uiLayout.parentId = parentId;
            uiRenderPageTabs();
            uiRenderLogic();
        });
        if (uiPageOpen) uiPageOpen.addEventListener("change", function () {
            if (!uiLayout) return;
            uiLayout.open = uiPageOpen.checked;
            uiRenderPageTabs();
        });
        [uiPageX, uiPageY].forEach(function (input) {
            if (!input) return;
            input.addEventListener("change", function () {
                if (!uiLayout) return;
                uiLayout.x = Math.max(0, parseInt(uiPageX.value, 10) || 0);
                uiLayout.y = Math.max(0, parseInt(uiPageY.value, 10) || 0);
                uiPageX.value = uiLayout.x;
                uiPageY.value = uiLayout.y;
            });
        });
        if (uiPageStart) uiPageStart.addEventListener("change", function () {
            if (!uiLayout || !uiDoc) return;
            if (uiPageStart.checked) {
                uiDoc.start = uiLayout.id;
                uiLayout.open = true;
                if (uiPageOpen) uiPageOpen.checked = true;
            } else if (uiDoc.start === uiLayout.id) {
                var other = uiDoc.pages.filter(function (page) { return page.id !== uiLayout.id; })[0];
                if (other) uiDoc.start = other.id;
                else uiPageStart.checked = true;
            }
            uiRenderPageTabs();
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
                if (uiConnectMode) {
                    uiToggleConnect();
                } else {
                    closeUiEditor();
                }
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
                var dx = e.key === "ArrowLeft" ? -step : (e.key === "ArrowRight" ? step : 0);
                var dy = e.key === "ArrowUp" ? -step : (e.key === "ArrowDown" ? step : 0);
                uiNudgeElement(el, dx, dy);
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
        document.getElementById("find-next").disabled = false;
        document.getElementById("find-prev").disabled = false;
        replaceOneBtn.disabled = false;
        replaceAllBtn.disabled = false;
        findCount.classList.remove("no-match");
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
        findCount.classList.remove("no-match");
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
        var has = total > 0;
        document.getElementById("find-next").disabled = !has;
        document.getElementById("find-prev").disabled = !has;
        replaceOneBtn.disabled = !has;
        replaceAllBtn.disabled = !has;
        if (findState.term && !total) {
            findCount.textContent = "无结果";
            findCount.classList.add("no-match");
            return;
        }
        findCount.classList.remove("no-match");
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
        } else if (data.type === "resourcePicked") {
            var pickedPath = typeof data.path === "string" ? data.path : "";
            uiPickingResource = false;
            var pickedEl = uiSelectedElement();
            if (pickedEl && pickedPath) {
                pickedEl.props.src = pickedPath;
                if (uiPropSrc) uiPropSrc.value = pickedPath;
                uiUpdateCanvasLabel(pickedEl);
                uiEditorHint.textContent = "已设置资源路径：" + pickedPath;
            } else {
                uiEditorHint.textContent = "已取消选择资源";
            }
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
