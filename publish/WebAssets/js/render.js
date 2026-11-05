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
    var mermaidGroupLayer = document.getElementById("mermaid-group-layer");
    var mermaidSeqPane = document.getElementById("mermaid-seq-pane");
    var mermaidSeqAddParticipant = document.getElementById("mermaid-seq-add-participant");
    var mermaidSeqDeleteBtn = document.getElementById("mermaid-seq-delete");
    var mermaidSeqPreview = document.getElementById("mermaid-seq-preview");
    var mermaidGroupField = document.getElementById("mermaid-group-field");
    var mermaidGroupSelect = document.getElementById("mermaid-group-select");
    var mermaidGroupMake = document.getElementById("mermaid-group-make");
    var mermaidGroupName = document.getElementById("mermaid-group-name");
    var mermaidGroupAdd = document.getElementById("mermaid-group-add");
    var mermaidGroupActions = document.getElementById("mermaid-group-actions");
    var mermaidGroupRemove = document.getElementById("mermaid-group-remove");
    var mermaidGroupDelete = document.getElementById("mermaid-group-delete");
    var mermaidGroupRenameField = document.getElementById("mermaid-group-rename-field");
    var mermaidGroupRename = document.getElementById("mermaid-group-rename");
    var mermaidCanvasWrap = document.getElementById("mermaid-canvas-wrap");
    var mermaidZoomIn = document.getElementById("mermaid-zoom-in");
    var mermaidZoomOut = document.getElementById("mermaid-zoom-out");
    var mermaidZoomReset = document.getElementById("mermaid-zoom-reset");
    var mermaidZoomLabel = document.getElementById("mermaid-zoom-label");
    var mermaidSeqCanvasWrap = document.getElementById("mermaid-seq-canvas-wrap");
    var seqZoomIn = document.getElementById("seq-zoom-in");
    var seqZoomOut = document.getElementById("seq-zoom-out");
    var seqZoomReset = document.getElementById("seq-zoom-reset");
    var seqZoomLabel = document.getElementById("seq-zoom-label");
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
    var uiPreviewHost = document.getElementById("ui-preview-host");
    var uiModeCanvasBtn = document.getElementById("ui-mode-canvas");
    var uiModePreviewBtn = document.getElementById("ui-mode-preview");
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
    var uiZoomIn = document.getElementById("ui-zoom-in");
    var uiZoomOut = document.getElementById("ui-zoom-out");
    var uiZoomReset = document.getElementById("ui-zoom-reset");
    var uiZoomLabel = document.getElementById("ui-zoom-label");
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
    var mermaidMode = "flow";   // flow | sequence
    var mermaidApplying = false;
    var flowNodes = [];        // { id, label, shape, x, y, w, h }，x/y 为中心点
    var flowEdges = [];        // { id, from, to, label }
    var flowGroups = [];       // { id, label, members: [nodeId] }（对应 subgraph）
    var flowExtras = [];       // 原样保留的 style / classDef / linkStyle 等语句
    var flowDirection = "TD";
    var flowSelected = null;   // { type: "node" | "edge", id }
    var flowNodeSeq = 0;
    var flowEdgeSeq = 0;
    var FLOW_LINE_H = 18;      // 节点内文字行高（与 15px 字号匹配）
    var flowDrag = null;
    var flowConnect = null;
    var flowTempPath = null;
    var seqParticipants = [];  // { id, alias }
    var seqMessages = [];      // { from, to, text, dashed }
    var seqExtras = [];        // 原样保留的 Note / activate 等语句
    var seqParticipantSeq = 0;
    var seqZoom = 1;           // 时序图预览缩放
    var uiZoom = 1;            // UI 原型画布缩放
    var flowZoom = 1;          // 流程图画布缩放（由 viewBox 驱动）
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
    var uiMode = "canvas";        // canvas（一画布编辑所有窗口） | preview（窗口内直接预览）
    var uiSelectedPageId = "";
    var uiFrameDrag = null;
    var uiPageLinkDrag = null;
    var uiPreviewRuntime = null;
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
            /* 时序图用自带渲染器，保证预览配色与编辑器完全一致 */
            var source = node.getAttribute("data-mermaid-src") || "";
            if (/^\s*sequenceDiagram\b/i.test(source)) {
                var parsedSeq = parseSequence(source);
                if (parsedSeq && !(parsedSeq.extras && parsedSeq.extras.length)) {
                    var seqSvg = buildSequencePreviewSvg(parsedSeq);
                    if (seqSvg) {
                        node.innerHTML = "";
                        node.appendChild(seqSvg);
                        node.setAttribute("data-processed", "true");
                        return;
                    }
                }
            }
            todo.push(node);
        });
        if (!todo.length) { decorateMermaidNodes(); return; }

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

    /* 预览区流程图：给 Mermaid 输出的节点 / 连线套上与编辑画布一致的配色 */
    var FLOW_PREVIEW_TONES = [
        ["#4f6bed", "#e8ebff"], ["#0e9f6e", "#e0f7ee"], ["#e8590c", "#fdeade"], ["#9c36b5", "#f6e8fb"],
        ["#0b7285", "#ddf1f5"], ["#c2255c", "#fbe2eb"], ["#6b8e23", "#eef5dc"], ["#1c7ed6", "#e0f0fd"]
    ];
    var FLOW_PREVIEW_TONES_DARK = [
        ["#8b9bff", "#23264a"], ["#3ddc97", "#17362b"], ["#ff9f43", "#3d2617"], ["#d17ce8", "#33203b"],
        ["#3bc9db", "#143036"], ["#f06595", "#3a1a26"], ["#a9c94a", "#2b3315"], ["#4dabf7", "#10283d"]
    ];

    function decorateFlowColors(container) {
        if (!container) return;
        var svg = container.querySelector("svg");
        if (!svg) return;
        var nodes = svg.querySelectorAll("g.node");
        if (!nodes.length) return;
        var dark = document.body.classList.contains("theme-dark");
        var palette = dark ? FLOW_PREVIEW_TONES_DARK : FLOW_PREVIEW_TONES;
        var colorOf = function (id) {
            var tone = palette[flowToneIndex(id)] || palette[0];
            return { line: tone[0], fill: tone[1] };
        };
        nodes.forEach(function (group) {
            var raw = group.getAttribute("id") || "";
            var nodeId = raw.replace(/^.*?flowchart-/, "").replace(/-\d+$/, "") || raw;
            var color = colorOf(nodeId);
            group.querySelectorAll("rect, polygon, circle, ellipse, path").forEach(function (shape) {
                if (shape.closest && shape.closest("g.label")) return;
                shape.style.fill = color.fill;
                shape.style.stroke = color.line;
                shape.style.strokeWidth = "1.6px";
            });
        });
        svg.querySelectorAll(".edgePaths path").forEach(function (path) {
            var cls = path.getAttribute("class") || "";
            var fromMatch = /(?:^|\s)LS-(\S+)/.exec(cls);
            var fromId = fromMatch ? fromMatch[1] : "";
            if (!fromId) {
                var idMatch = /^L[-_](.+?)[-_][^-_]+?[-_]\d+$/.exec(path.getAttribute("id") || "");
                fromId = idMatch ? idMatch[1] : "";
            }
            var color = colorOf(fromId);
            path.style.stroke = color.line;
            path.style.strokeWidth = "2px";
            var ref = /url\(#(.+?)\)/.exec(path.getAttribute("marker-end") || "");
            if (!ref) return;
            var baseMarker = document.getElementById(ref[1]);
            if (!baseMarker || !baseMarker.parentNode) return;
            /* Mermaid 的所有连线共用一个箭头 marker，需要按色调克隆后再单独上色 */
            var cloneId = ref[1] + "-tone-" + flowToneIndex(fromId);
            var clone = document.getElementById(cloneId);
            if (!clone) {
                clone = baseMarker.cloneNode(true);
                clone.setAttribute("id", cloneId);
                baseMarker.parentNode.appendChild(clone);
            }
            clone.querySelectorAll("path").forEach(function (head) {
                head.style.fill = color.line;
                head.style.stroke = color.line;
            });
            path.setAttribute("marker-end", "url(#" + cloneId + ")");
        });
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
            /* 流程图预览套用与编辑画布一致的配色 */
            if (!hasError) decorateFlowColors(node);
            /* 单图缩放控件（悬停显示） */
            addDiagramZoomUi(node);
        }
        // 重新渲染后的图表需要重新套用当前缩放比例
        applyDiagramZoom();
    }

    /* 图表（流程图 / 时序图预览）随「缩放」一起放大缩小
       Mermaid 输出的 svg 带 inline max-width（图上为自然宽度），按比例重设即可，
       原始宽度记录在 data-zoom-w，重复缩放不会漂移。
       额外支持单图局部缩放（Ctrl / Alt + 滚轮，或左上角悬停控件的 −／+/ 100%）。 */
    var diagramZoom = 1;
    var diagramScales = Object.create(null);

    function diagramKeyOf(node) {
        if (!node || !node.getAttribute) return "";
        var cached = node.getAttribute("data-diagram-key");
        if (cached) return cached;
        var src = node.getAttribute("data-mermaid-src") || "";
        var h = 0;
        for (var i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) | 0;
        var key = (h >>> 0).toString(36) + "-" + src.length;
        node.setAttribute("data-diagram-key", key);
        return key;
    }

    function diagramNodeScale(node) {
        var key = diagramKeyOf(node);
        var v = key ? diagramScales[key] : undefined;
        return (typeof v === "number" && isFinite(v) && v > 0) ? v : 1;
    }

    function diagramHostOf(svg) {
        var host = svg ? svg.parentNode : null;
        while (host && host !== document && !(host.classList && host.classList.contains("mermaid"))) {
            host = host.parentNode;
        }
        return (host && host.classList && host.classList.contains("mermaid")) ? host : null;
    }

    function applyDiagramZoom() {
        var z = diagramZoom > 0 ? diagramZoom : 1;
        var svgs = document.querySelectorAll("#md-body .mermaid svg");
        for (var i = 0; i < svgs.length; i++) {
            var svg = svgs[i];
            var host = diagramHostOf(svg);
            var nodeScale = diagramNodeScale(host);
            var base = parseFloat(svg.getAttribute("data-zoom-w") || "");
            if (!(base > 0)) {
                var inline = svg.getAttribute("style") || "";
                var mw = /max-width:\s*([\d.]+)px/.exec(inline);
                base = mw ? parseFloat(mw[1]) : (parseFloat(svg.getAttribute("width")) || 0);
                if (!(base > 0)) continue;
                svg.setAttribute("data-zoom-w", base.toFixed(2));
            }
            var w = Math.max(60, Math.round(base * z * nodeScale));
            /* max-width 管目标宽度，width:100% 让超宽的图表自动缩到容器宽度，不会被裁切 */
            svg.style.maxWidth = w + "px";
            svg.style.width = "100%";
            svg.style.height = "auto";
            if (host) {
                var label = host.querySelector(".mermaid-zoom-label");
                if (label) label.textContent = Math.round(z * nodeScale * 100) + "%";
            }
        }
    }

    /* factor 为 0 表示复位该图表（回 100%） */
    function stepDiagramScale(node, factor) {
        if (!node) return;
        var key = diagramKeyOf(node);
        if (!key) return;
        if (!factor) {
            delete diagramScales[key];
        } else {
            var next = diagramNodeScale(node) * factor;
            diagramScales[key] = Math.min(4, Math.max(0.2, Math.round(next * 100) / 100));
        }
        applyDiagramZoom();
    }

    /* 图表左上角的缩放控件 + Ctrl / Alt + 滚轮单独缩放该图 */
    function addDiagramZoomUi(node) {
        if (!node || node.querySelector(".mermaid-zoom-ui")) return;
        var bar = document.createElement("div");
        bar.className = "mermaid-zoom-ui";
        function mkBtn(text, title, handler, extraClass) {
            var b = document.createElement("button");
            b.type = "button";
            b.className = "mermaid-zoom-btn" + (extraClass ? " " + extraClass : "");
            b.textContent = text;
            b.title = title;
            b.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                handler();
            });
            return b;
        }
        bar.appendChild(mkBtn("－", "缩小该图表（Ctrl / Alt + 滚轮）", function () {
            stepDiagramScale(node, 1 / 1.15);
        }));
        bar.appendChild(mkBtn("100%", "点击恢复该图表原始大小", function () {
            stepDiagramScale(node, 0);
        }, "mermaid-zoom-label"));
        bar.appendChild(mkBtn("＋", "放大该图表（Ctrl / Alt + 滚轮）", function () {
            stepDiagramScale(node, 1.15);
        }));
        node.appendChild(bar);
        node.addEventListener("wheel", function (e) {
            if (!(e.ctrlKey || e.metaKey || e.altKey)) return;
            e.preventDefault();
            e.stopPropagation();
            stepDiagramScale(node, e.deltaY < 0 ? 1.12 : 1 / 1.12);
        }, { passive: false });
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
    function openMermaidEditor(index, source, mode) {
        if (!mermaidEditor) return;
        var parsed = (index === null || index === undefined || index === "") ? null : parseInt(index, 10);
        mermaidEditIndex = isNaN(parsed) ? null : parsed;
        var text = (typeof source === "string") ? source : "";
        var isNew = mermaidEditIndex === null;
        mermaidMode = (mode === "sequence") ? "sequence" : "flow";

        if (isNew && !text.trim()) {
            if (mermaidMode === "sequence") {
                initDefaultSequence();
                mermaidSource.value = serializeSequence();
            } else {
                initDefaultFlowGraph();
                mermaidSource.value = serializeFlowGraph();
            }
        } else {
            mermaidSource.value = text;
            if (/^\s*sequenceDiagram\b/i.test(text)) mermaidMode = "sequence";
        }

        mermaidEditor.hidden = false;
        if (mermaidMode === "sequence") {
            var parsedSeq = parseSequence(mermaidSource.value);
            if (parsedSeq) {
                seqParticipants = parsedSeq.participants;
                seqMessages = parsedSeq.messages;
                seqExtras = parsedSeq.extras;
                seqParticipantSeq = seqParticipants.length;
                seqSelected = null;
                seqDrag = null;
                seqLink = null;
                setMermaidTab("visual", true);
                renderSequenceEditor();
                updateSequencePreview();
                mermaidEditorHint.textContent =
                    "拖动参与者左右移动；在竖线上按住拖动创建消息；双击消息文字编辑 · Ctrl+Enter 应用";
            } else {
                setMermaidTab("source", true);
                mermaidEditorHint.textContent =
                    "该时序图包含 loop / alt / 激活等复杂结构，请在源码模式编辑";
            }
        } else if (!importFlowGraph(mermaidSource.value)) {
            setMermaidTab("source", true);
            mermaidEditorHint.textContent =
                "当前源码包含图形编辑器暂不支持的语法，请继续使用源码模式";
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
            } else if (mermaidMode === "flow" && mermaidVisualPane && !mermaidVisualPane.hidden) {
                fitFlowViewToContent();
            }
        }, 30);
    }

    function closeMermaidEditor() {
        if (!mermaidEditor) return;
        cancelSeqEdit();
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
            // 简单按 16 个字符换行，避免长文本溢出节点
            for (var i = 0; i < line.length; i += 16) lines.push(line.slice(i, i + 16));
        });
        if (!lines.length) lines.push("");
        return lines.slice(0, 5);
    }

    function sizeFlowNode(node) {
        var lines = flowDisplayLines(node.label);
        var maxChars = 0;
        lines.forEach(function (line) { maxChars = Math.max(maxChars, line.length); });
        node.w = Math.max(96, Math.min(320, maxChars * 15 + 36));
        var base = node.shape === "diamond" ? 78 : node.shape === "circle" ? 74 : 54;
        node.h = base + Math.max(0, lines.length - 1) * FLOW_LINE_H;
        if (node.shape === "diamond") node.w = Math.max(node.w, node.h + 24);
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
        flowGroups = [];
        flowExtras = [];
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

    /* 从 Mermaid 源码恢复图形（支持 flowchart/graph、subgraph 分组与常见节点/箭头） */
    function importFlowGraph(source) {
        var lines = String(source || "").split(/\r?\n/);
        var nodes = [];
        var edges = [];
        var nodeMap = {};
        var positions = {};
        var groupBoxes = Object.create(null);
        var groups = [];
        var groupStack = [];
        var extras = [];
        var direction = "TD";
        var sawDirective = false;

        function currentGroup() {
            return groupStack.length ? groupStack[groupStack.length - 1] : null;
        }

        function ensureNode(parsed) {
            var grp = currentGroup();
            if (!nodeMap[parsed.id]) {
                var node = {
                    id: parsed.id, label: parsed.label, shape: parsed.shape,
                    x: 0, y: 0, group: grp ? grp.id : ""
                };
                sizeFlowNode(node);
                nodeMap[parsed.id] = node;
                nodes.push(node);
                if (grp && grp.members.indexOf(parsed.id) < 0) grp.members.push(parsed.id);
            } else {
                if (parsed.label !== parsed.id) {
                    nodeMap[parsed.id].label = parsed.label;
                    nodeMap[parsed.id].shape = parsed.shape;
                }
                if (grp && !nodeMap[parsed.id].group) {
                    nodeMap[parsed.id].group = grp.id;
                    if (grp.members.indexOf(parsed.id) < 0) grp.members.push(parsed.id);
                }
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
            var groupBoxMatch = /^%%\s*mdviewer:group\s+(\S+)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i.exec(t);
            if (groupBoxMatch) {
                groupBoxes[groupBoxMatch[1]] = {
                    x: parseFloat(groupBoxMatch[2]),
                    y: parseFloat(groupBoxMatch[3]),
                    w: parseFloat(groupBoxMatch[4]),
                    h: parseFloat(groupBoxMatch[5])
                };
                continue;
            }
            if (t.indexOf("%%") === 0) continue;

            if (/^end\b/i.test(t)) {
                groupStack.pop();
                continue;
            }
            var subMatch = /^subgraph\b\s*([\s\S]*)$/i.exec(t);
            if (subMatch) {
                var rest = subMatch[1].trim();
                var gid = rest;
                var glabel = rest;
                var gm = /^([^\s\[\]]+)\s*(?:\[\s*"?([\s\S]*?)"?\s*\])?$/.exec(rest);
                if (gm) {
                    gid = gm[1] || rest;
                    glabel = (gm[2] != null && gm[2] !== "") ? gm[2] : gid;
                }
                if (!gid) { gid = "g" + (groups.length + 1); glabel = gid; }
                var existing = null;
                for (var gi = 0; gi < groups.length; gi++) {
                    if (groups[gi].id === gid) { existing = groups[gi]; break; }
                }
                if (!existing) {
                    existing = { id: gid, label: glabel || gid, members: [] };
                    groups.push(existing);
                }
                groupStack.push(existing);
                sawDirective = true;
                continue;
            }

            var dirMatch = /^(?:flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/i.exec(t);
            if (dirMatch) {
                direction = dirMatch[1].toUpperCase();
                if (direction === "TB") direction = "TD";
                sawDirective = true;
                continue;
            }
            if (/^(style|classDef|class|linkStyle|click|accTitle|accDescr|direction)\b/i.test(t)) {
                extras.push(t);
                sawDirective = true;
                continue;
            }

            // 解析箭头：支持 --> 与 <-->（双向）
            var arrowRe = /\s*(<-->|-->)\s*/g;
            var segs = [];
            var arrowKinds = [];
            var lastIdx = 0;
            var am;
            while ((am = arrowRe.exec(t)) !== null) {
                segs.push(t.slice(lastIdx, am.index));
                arrowKinds.push(am[1]);
                lastIdx = am.index + am[0].length;
            }
            if (!segs.length) {
                var only = parseFlowNodeToken(t);
                if (!only) return false;
                ensureNode(only);
                continue;
            }
            segs.push(t.slice(lastIdx));

            var first = segs[0].trim();
            var firstLabel = "";
            var dashLabel = /^(.*?)\s+--\s+(.+)$/.exec(first);
            if (dashLabel) {
                first = dashLabel[1].trim();
                firstLabel = unescapeFlowLabel(dashLabel[2].trim());
            }
            var current = parseFlowNodeToken(first);
            if (!current) return false;
            current = ensureNode(current);

            for (var k = 1; k < segs.length; k++) {
                var part = segs[k].trim();
                var label = "";
                if (part.charAt(0) === "|") {
                    var end = part.indexOf("|", 1);
                    if (end < 0) return false;
                    label = unescapeFlowLabel(part.slice(1, end).trim());
                    if ((label.charAt(0) === "\"" && label.slice(-1) === "\"") ||
                        (label.charAt(0) === "'" && label.slice(-1) === "'")) {
                        label = label.slice(1, -1);
                    }
                    part = part.slice(end + 1).trim();
                }
                var next = parseFlowNodeToken(part);
                if (!next) return false;
                next = ensureNode(next);
                if (current.id !== next.id) {
                    var edge = addFlowEdgeRawTo(edges, current.id, next.id,
                        (k === 1 ? firstLabel : "") || label);
                    edge.bidir = arrowKinds[k - 1] === "<-->";
                }
                current = next;
            }
            sawDirective = true;
        }

        if (!nodes.length || !sawDirective) return false;

        flowNodes = nodes;
        flowEdges = edges;
        flowGroups = groups.map(function (group) {
            return {
                id: group.id,
                label: group.label,
                members: group.members.slice(),
                box: groupBoxes[group.id] || null
            };
        });
        flowExtras = extras.slice();
        flowDirection = direction;
        flowNodeSeq = 0;
        nodes.forEach(function (node) {
            var m = /^n(\d+)$/.exec(node.id);
            if (m) flowNodeSeq = Math.max(flowNodeSeq, parseInt(m[1], 10));
        });
        flowEdgeSeq = edges.length;
        flowSelected = null;
        var withPos = [];
        nodes.forEach(function (node) {
            var p = positions[node.id];
            if (p) {
                node.x = p.x;
                node.y = p.y;
                withPos.push(node);
            } else {
                node.x = null;
            }
            sizeFlowNode(node);
        });
        // 旧版“单列自动布局”留下的坐标视为过期，重新做分层排列
        if (withPos.length >= 3) {
            var first = withPos[0];
            var sameX = true, sameY = true;
            for (var wi = 1; wi < withPos.length; wi++) {
                if (Math.abs(withPos[wi].x - first.x) >= 2) sameX = false;
                if (Math.abs(withPos[wi].y - first.y) >= 2) sameY = false;
            }
            if (sameX || sameY) {
                nodes.forEach(function (node) { node.x = null; });
            }
        }
        layoutFlowNodes(true);
        return true;
    }

    function addFlowEdgeRawTo(list, from, to, label) {
        var edge = {
            id: "e" + (list.length + 1), from: from, to: to,
            label: label || "", bidir: false
        };
        list.push(edge);
        return edge;
    }

    /* 分层布局：按边的走向分层 + 同层重心排序 + 分组聚类，效果接近 Mermaid 预览 */
    function layoutFlowNodes(onlyMissing) {
        if (!flowNodes.length) return;
        var CANVAS_W = 1200, CANVAS_H = 800;
        var NODE_GAP = 56;      // 同层节点间距
        var LEVEL_GAP = 86;     // 层与层之间的额外间距
        // 重新布局后节点位置变化，分组框按新位置重新生成包围盒
        if (!onlyMissing) {
            flowGroups.forEach(function (group) { group.box = null; });
        }
        // 1) Kahn 拓扑分层；环内节点按已定层邻居回退
        var indeg = Object.create(null);
        flowNodes.forEach(function (n) { indeg[n.id] = 0; });
        flowEdges.forEach(function (e) {
            if (e.from !== e.to && indeg[e.to] !== undefined) indeg[e.to]++;
        });
        var level = Object.create(null);
        var queue = flowNodes
            .filter(function (n) { return indeg[n.id] === 0; })
            .map(function (n) { return n.id; });
        if (!queue.length) queue = [flowNodes[0].id];
        queue.forEach(function (id) { level[id] = 0; });
        var remaining = Object.create(null);
        flowNodes.forEach(function (n) { remaining[n.id] = indeg[n.id]; });
        var settled = Object.create(null);
        for (var qi = 0; qi < queue.length; qi++) {
            var cur = queue[qi];
            if (settled[cur]) continue;
            settled[cur] = true;
            flowEdges.forEach(function (e) {
                if (e.from !== cur) return;
                /* 已定层的节点不再抬高，避免回边（环）把入口节点推到最底层 */
                if (!settled[e.to] && (level[e.to] === undefined || level[e.to] < level[cur] + 1)) {
                    level[e.to] = level[cur] + 1;
                }
                remaining[e.to]--;
                if (remaining[e.to] === 0 && level[e.to] !== undefined && !settled[e.to]) {
                    queue.push(e.to);
                }
            });
        }
        flowNodes.forEach(function (n) {
            if (level[n.id] !== undefined) return;
            var best = -1;
            flowEdges.forEach(function (e) {
                if (e.to === n.id && level[e.from] !== undefined) {
                    best = Math.max(best, level[e.from]);
                }
            });
            level[n.id] = best >= 0 ? best + 1 : 0;
        });

        var maxLevel = 0;
        flowNodes.forEach(function (n) { maxLevel = Math.max(maxLevel, level[n.id]); });
        var rows = [];
        for (var li = 0; li <= maxLevel; li++) rows.push([]);
        flowNodes.forEach(function (n) { rows[level[n.id]].push(n); });

        // 2) 重心排序（上下各扫几遍）减少连线交叉
        var pos = Object.create(null);
        rows.forEach(function (row) {
            row.forEach(function (n, idx) { pos[n.id] = idx; });
        });
        function neighborPos(node, dir) {
            var sum = 0, count = 0;
            flowEdges.forEach(function (e) {
                var other = null;
                if (dir === "in" && e.to === node.id) other = e.from;
                else if (dir === "out" && e.from === node.id) other = e.to;
                if (other != null && pos[other] !== undefined) {
                    sum += pos[other];
                    count++;
                }
            });
            return count ? sum / count : pos[node.id];
        }
        for (var sweep = 0; sweep < 4; sweep++) {
            for (var r = 1; r < rows.length; r++) {
                rows[r].forEach(function (n) { n._bary = neighborPos(n, "in"); });
                rows[r].sort(function (a, b) { return a._bary - b._bary; });
                rows[r].forEach(function (n, idx) { pos[n.id] = idx; });
            }
            for (var r2 = rows.length - 2; r2 >= 0; r2--) {
                rows[r2].forEach(function (n) { n._bary = neighborPos(n, "out"); });
                rows[r2].sort(function (a, b) { return a._bary - b._bary; });
                rows[r2].forEach(function (n, idx) { pos[n.id] = idx; });
            }
        }

        // 3) 同层内分组聚类：同组节点尽量排在一起
        var groupIdx = Object.create(null);
        flowGroups.forEach(function (g, idx) { groupIdx[g.id] = idx; });
        rows.forEach(function (row) {
            row.sort(function (a, b) {
                var ga = a.group && groupIdx[a.group] !== undefined ? groupIdx[a.group] : 9999;
                var gb = b.group && groupIdx[b.group] !== undefined ? groupIdx[b.group] : 9999;
                if (ga !== gb) return ga - gb;
                return (a._bary || 0) - (b._bary || 0);
            });
        });

        var vertical = flowDirection === "TD" || flowDirection === "BT";
        var reverse = flowDirection === "BT" || flowDirection === "RL";
        var count = rows.length;

        // 4) 计算层中心（跨层方向的坐标）
        var centers = [];
        var cursorCross = 0;
        rows.forEach(function (row) {
            var maxSize = 50;
            row.forEach(function (n) {
                maxSize = Math.max(maxSize, vertical ? n.h : n.w);
            });
            centers.push(cursorCross + maxSize / 2);
            cursorCross += maxSize + LEVEL_GAP;
        });
        var span = cursorCross - LEVEL_GAP;
        var limit = (vertical ? CANVAS_H : CANVAS_W) - 120;
        var scale = span > limit ? limit / span : 1;
        if (scale < 1) {
            centers = centers.map(function (c) { return c * scale; });
            span = span * scale;
        }
        var crossOffset = ((vertical ? CANVAS_H : CANVAS_W) - span) / 2;

        // 5) 写入坐标
        rows.forEach(function (row, rowIndex) {
            if (!row.length) return;
            var center = crossOffset + centers[reverse ? count - 1 - rowIndex : rowIndex];
            var mainTotal = 0;
            row.forEach(function (n) {
                mainTotal += (vertical ? n.w : n.h) + NODE_GAP;
            });
            mainTotal -= NODE_GAP;
            var mainLimit = vertical ? CANVAS_W : CANVAS_H;
            var cursorMain = Math.max(30, (mainLimit - mainTotal) / 2);
            row.forEach(function (n) {
                var main = cursorMain + (vertical ? n.w : n.h) / 2;
                if (!(onlyMissing && n.x !== null && isFinite(n.x))) {
                    if (vertical) {
                        n.x = main;
                        n.y = center;
                    } else {
                        n.x = center;
                        n.y = main;
                    }
                }
                cursorMain += (vertical ? n.w : n.h) + NODE_GAP;
                n._bary = null;
            });
        });

        // 6) 兜底：限制在画布内
        flowNodes.forEach(function (n) {
            if (onlyMissing && n.x !== null && isFinite(n.x)) return;
            var halfW = (n.w || 100) / 2 + 8;
            var halfH = (n.h || 40) / 2 + 8;
            n.x = Math.max(halfW, Math.min(CANVAS_W - halfW, n.x));
            n.y = Math.max(halfH, Math.min(CANVAS_H - halfH, n.y));
        });
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
        flowGroups.forEach(function (group) {
            var box = group.box || (typeof ensureGroupBox === "function" ? ensureGroupBox(group) : null);
            if (!box) return;
            out.push("  %% mdviewer:group " + group.id + " " +
                Math.round(box.x) + " " + Math.round(box.y) + " " +
                Math.round(box.w) + " " + Math.round(box.h));
        });
        var emitted = Object.create(null);
        // 顶层节点（不属于任何 subgraph）
        flowNodes.forEach(function (node) {
            if (node.group) return;
            out.push("  " + node.id + flowShapeText(node));
            emitted[node.id] = true;
        });
        // 子图分组
        flowGroups.forEach(function (group) {
            var members = flowNodes.filter(function (node) { return node.group === group.id; });
            if (!members.length) return;
            out.push("  subgraph " + group.id + "[\"" + escapeFlowLabel(group.label || group.id) + "\"]");
            members.forEach(function (node) {
                out.push("    " + node.id + flowShapeText(node));
                emitted[node.id] = true;
            });
            out.push("  end");
        });
        flowNodes.forEach(function (node) {
            if (!emitted[node.id]) out.push("  " + node.id + flowShapeText(node));
        });
        flowEdges.forEach(function (edge) {
            var label = edge.label ? "|" + escapeFlowLabel(edge.label) + "|" : "";
            out.push("  " + edge.from + (edge.bidir ? " <-->" : " -->") + label + " " + edge.to);
        });
        flowExtras.forEach(function (line) { out.push("  " + line); });
        return out.join("\n") + "\n";
    }

    /* 分组框几何：首次按成员节点包围盒生成，之后可拖动/拉伸并持久化 */
    function ensureGroupBox(group) {
        if (group.box) return group.box;
        var members = flowNodes.filter(function (node) { return node.group === group.id; });
        if (members.length) {
            var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            members.forEach(function (node) {
                minX = Math.min(minX, node.x - node.w / 2);
                maxX = Math.max(maxX, node.x + node.w / 2);
                minY = Math.min(minY, node.y - node.h / 2);
                maxY = Math.max(maxY, node.y + node.h / 2);
            });
            var pad = 24;
            group.box = {
                x: minX - pad,
                y: minY - pad - 18,
                w: (maxX - minX) + pad * 2,
                h: (maxY - minY) + pad * 2 + 18
            };
        } else {
            group.box = { x: 420, y: 120, w: 260, h: 160 };
        }
        return group.box;
    }

    function expandGroupBoxToNode(group, node) {
        if (!group.box) {
            group.box = {
                x: node.x - node.w / 2 - 24,
                y: node.y - node.h / 2 - 40,
                w: node.w + 48,
                h: node.h + 64
            };
            return;
        }
        var box = group.box;
        var left = node.x - node.w / 2 - 22;
        var top = node.y - node.h / 2 - 22 - 16;
        var right = node.x + node.w / 2 + 22;
        var bottom = node.y + node.h / 2 + 22;
        var nx = Math.min(box.x, left);
        var ny = Math.min(box.y, top);
        var nr = Math.max(box.x + box.w, right);
        var nb = Math.max(box.y + box.h, bottom);
        group.box = { x: nx, y: ny, w: nr - nx, h: nb - ny };
    }

    function groupBoxContains(box, x, y) {
        return !!box && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
    }

    function startFlowGroupDrag(e, group, mode) {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        var box = ensureGroupBox(group);
        var start = { x: box.x, y: box.y, w: box.w, h: box.h };
        var members = flowNodes
            .filter(function (node) { return node.group === group.id; })
            .map(function (node) { return { node: node, x: node.x, y: node.y }; });
        var p1 = flowCanvasPoint(e);
        document.body.classList.add("dialog-dragging");
        document.body.style.cursor = mode === "resize" ? "nwse-resize" : "move";

        function onMove(ev) {
            var p2 = flowCanvasPoint(ev);
            var dx = p2.x - p1.x;
            var dy = p2.y - p1.y;
            if (mode === "resize") {
                box.w = Math.max(150, Math.round(start.w + dx));
                box.h = Math.max(100, Math.round(start.h + dy));
            } else {
                box.x = Math.round(start.x + dx);
                box.y = Math.round(start.y + dy);
                members.forEach(function (item) {
                    item.node.x = item.x + Math.round(dx);
                    item.node.y = item.y + Math.round(dy);
                });
            }
            renderFlowGraph();
        }

        function onUp() {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointercancel", onUp);
            document.body.classList.remove("dialog-dragging");
            document.body.style.cursor = "";
            renderFlowGroups();
            syncFlowSource();
        }

        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
    }

    /* 在画布上绘制 subgraph 分组外框（可拖动、可拉伸） */
    function renderFlowGroups() {
        if (!mermaidGroupLayer) return;
        mermaidGroupLayer.innerHTML = "";
        flowGroups.forEach(function (group) {
            var box = ensureGroupBox(group);
            var rect = svgEl("rect");
            rect.setAttribute("class", "fc-group-box" + flowToneClass(group.id));
            rect.setAttribute("x", box.x);
            rect.setAttribute("y", box.y);
            rect.setAttribute("width", box.w);
            rect.setAttribute("height", box.h);
            rect.setAttribute("rx", 10);
            rect.setAttribute("data-group-id", group.id);
            rect.addEventListener("pointerdown", function (e) {
                startFlowGroupDrag(e, group, "move");
            });
            mermaidGroupLayer.appendChild(rect);

            var label = svgEl("text");
            label.setAttribute("class", "fc-group-label" + flowToneClass(group.id));
            label.setAttribute("x", box.x + 10);
            label.setAttribute("y", box.y + 18);
            label.textContent = group.label || group.id;
            mermaidGroupLayer.appendChild(label);

            var handle = svgEl("rect");
            handle.setAttribute("class", "fc-group-resize" + flowToneClass(group.id));
            handle.setAttribute("x", box.x + box.w - 15);
            handle.setAttribute("y", box.y + box.h - 15);
            handle.setAttribute("width", 12);
            handle.setAttribute("height", 12);
            handle.setAttribute("rx", 2);
            handle.addEventListener("pointerdown", function (e) {
                startFlowGroupDrag(e, group, "resize");
            });
            mermaidGroupLayer.appendChild(handle);
        });
    }

    /* ===================== 时序图可视化编辑 ===================== */
    var SEQ_STRUCTURAL = /^(loop|alt|else|opt|par|and|critical|option|break|rect|activate|deactivate|autonumber|box|end)\b/i;

    function initDefaultSequence() {
        seqParticipants = [{ id: "A", alias: "用户" }, { id: "B", alias: "系统" }];
        seqMessages = [
            { from: "A", to: "B", text: "请求", dashed: false },
            { from: "B", to: "A", text: "响应", dashed: true }
        ];
        seqExtras = [];
        seqParticipantSeq = 2;
        seqSelected = null;
        seqDrag = null;
        seqLink = null;
    }

    function parseSequence(source) {
        var lines = String(source || "").split(/\r?\n/);
        var participants = [];
        var seen = Object.create(null);
        var messages = [];
        var extras = [];
        var sawDirective = false;

        function ensureP(id, alias) {
            if (!id) return;
            if (!seen[id]) {
                seen[id] = { id: id, alias: alias || id };
                participants.push(seen[id]);
            } else if (alias && seen[id].alias === id) {
                seen[id].alias = alias;
            }
        }

        for (var i = 0; i < lines.length; i++) {
            var t = lines[i].trim();
            if (!t) continue;
            if (t.indexOf("%%") === 0) continue;
            if (/^sequenceDiagram\b/i.test(t)) { sawDirective = true; continue; }
            var p = /^(?:participant|actor)\s+([^\s]+)(?:\s+as\s+([\s\S]+))?$/i.exec(t);
            if (p) { ensureP(p[1], p[2] ? p[2].trim() : p[1]); continue; }
            var m = /^([^\s\-]+)\s*(-->>|->>|-->|->|--x|-x|--\)|-\))\s*([^:]+):\s*([\s\S]*)$/.exec(t);
            if (m) {
                var from = m[1].trim();
                var arrow = m[2];
                var to = m[3].trim();
                ensureP(from);
                ensureP(to);
                messages.push({
                    from: from, to: to, text: m[4].trim(),
                    dashed: arrow.indexOf("--") === 0
                });
                continue;
            }
            if (/^note\b/i.test(t)) { extras.push(t); continue; }
            if (SEQ_STRUCTURAL.test(t)) return null;   // 复杂结构，退回源码模式
            extras.push(t);
        }

        if (!sawDirective) return null;
        if (!participants.length) {
            participants = [{ id: "A", alias: "A" }, { id: "B", alias: "B" }];
        }
        return { participants: participants, messages: messages, extras: extras };
    }

    function serializeSequence() {
        var out = ["sequenceDiagram"];
        seqParticipants.forEach(function (p) {
            if (p.alias && p.alias !== p.id) out.push("  participant " + p.id + " as " + p.alias);
            else out.push("  participant " + p.id);
        });
        seqMessages.forEach(function (m) {
            out.push("  " + m.from + (m.dashed ? "-->>" : "->>") + m.to + ": " + (m.text || ""));
        });
        seqExtras.forEach(function (line) { out.push("  " + line); });
        return out.join("\n") + "\n";
    }

    function seqParticipantById(id) {
        for (var i = 0; i < seqParticipants.length; i++) {
            if (seqParticipants[i].id === id) return seqParticipants[i];
        }
        return null;
    }

    /* ---------- 时序图画布：拖拽参与者 / 从竖线拖出消息 / 双击改文字 ---------- */
    var SEQ_PART_H = 34;
    var SEQ_TOP = 14;
    var SEQ_ROW_TOP = 30;      // 第一条消息相对参与者底部的偏移
    var SEQ_ROW_H = 52;
    var SEQ_MIN_SLOT = 150;
    var SEQ_PAD = 40;
    var SEQ_SNAP = 34;
    var seqSelected = null;    // { type: "participant" | "message", index }
    var seqDrag = null;        // { index, liveX }
    var seqLink = null;        // { from, curX, row, target, dashed }
    var seqEdit = null;        // { input, commit }
    var seqRepoint = null;     // { index, which, x }  拖动端点改指向时的实时位置
    var seqGeo = null;
    var SEQ_TONES = 8;         // 参与者配色数量（见 CSS .seq-tone-0..7）

    /* 按参与者 id 稳定取色：重排后颜色不跳变 */
    function seqToneOf(id) {
        var text = String(id || "");
        var hash = 0;
        for (var i = 0; i < text.length; i++) {
            hash = (hash * 31 + text.charCodeAt(i)) % 100003;
        }
        return hash % SEQ_TONES;
    }

    function seqToneClass(id) {
        return " seq-tone-" + seqToneOf(id);
    }

    function seqTextWidth(text, fontPx) {
        var width = 0;
        String(text || "").split("").forEach(function (ch) {
            width += /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 1 : 0.56;
        });
        return Math.max(fontPx, width * fontPx);
    }

    function seqMeasure() {
        var partW = 96;
        seqParticipants.forEach(function (p) {
            partW = Math.max(partW, Math.min(220, seqTextWidth(p.alias || p.id, 14) + 30));
        });
        var slot = SEQ_MIN_SLOT;
        seqMessages.forEach(function (m) {
            slot = Math.max(slot, seqTextWidth(m.text || "", 13) + 64);
        });
        var count = Math.max(1, seqParticipants.length);
        var width = Math.max(420, SEQ_PAD * 2 + partW + slot * (count - 1));
        var rows = Math.max(2, seqMessages.length);
        var lastRowY = SEQ_TOP + SEQ_PART_H + SEQ_ROW_TOP + (rows - 1) * SEQ_ROW_H;
        /* 底部再画一行参与者（与 Mermaid 预览的 mirrorActors 一致） */
        var bottomY = lastRowY + 46;
        var height = bottomY + SEQ_PART_H + 24;
        return { partW: partW, slot: slot, width: width, height: height, bottomY: bottomY };
    }

    function seqSlotX(index, geo) {
        var g = geo || seqGeo || seqMeasure();
        return SEQ_PAD + g.partW / 2 + index * g.slot;
    }

    function seqLiveX(index) {
        if (seqDrag && seqDrag.index === index) return seqDrag.liveX;
        return seqSlotX(index);
    }

    function seqRowY(index) {
        return SEQ_TOP + SEQ_PART_H + SEQ_ROW_TOP + index * SEQ_ROW_H;
    }

    function seqRowFromY(y) {
        var base = SEQ_TOP + SEQ_PART_H + SEQ_ROW_TOP;
        var row = Math.round((y - base) / SEQ_ROW_H);
        return Math.max(0, Math.min(seqMessages.length, row));
    }

    function seqSvgNode(tag) {
        return document.createElementNS("http://www.w3.org/2000/svg", tag);
    }

    function seqCanvasPoint(e) {
        var svg = mermaidSeqPreview ? mermaidSeqPreview.querySelector("svg") : null;
        if (!svg || !svg.getScreenCTM) return { x: 0, y: 0 };
        var ctm = svg.getScreenCTM();
        if (!ctm) return { x: 0, y: 0 };
        var pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        var out = pt.matrixTransform(ctm.inverse());
        return { x: out.x, y: out.y };
    }

    function updateSeqDeleteButton() {
        if (!mermaidSeqDeleteBtn) return;
        mermaidSeqDeleteBtn.disabled = !seqSelected;
    }

    function applySeqSelectionClasses() {
        var svg = mermaidSeqPreview ? mermaidSeqPreview.querySelector("svg") : null;
        if (!svg) return;
        var sel = seqSelected;
        svg.querySelectorAll("[data-seq-role]").forEach(function (node) {
            var role = node.getAttribute("data-seq-role");
            var index = parseInt(node.getAttribute("data-index"), 10);
            var isHit = node.classList.contains("seq-message-hit");
            var isVisibleMessage = role === "message" && !isHit;
            var match = !!sel && index === sel.index &&
                ((sel.type === "participant" && (role === "participant" || role === "lifeline")) ||
                 (sel.type === "message" && (isVisibleMessage || role === "message-label")));
            if (!isHit) node.classList.toggle("selected", match);
            /* 只有可见的箭头本体才挂 marker；命中用的粗透明线绝不能挂，否则箭头会被线宽放大 */
            if (isVisibleMessage) {
                var sourceId = seqMessages[index] ? seqMessages[index].from : "";
                node.setAttribute("marker-end",
                    "url(#" + (match ? "seq-arrow-sel" : "seq-arrow-t" + seqToneOf(sourceId)) + ")");
            } else if (role === "message") {
                node.removeAttribute("marker-end");
            }
        });
        /* 端点手柄随选中状态即时出现 / 消失（不整体重渲染，保证双击仍可用） */
        svg.querySelectorAll(".seq-endpoint").forEach(function (handle) {
            if (handle.parentNode) handle.parentNode.removeChild(handle);
        });
        if (sel && sel.type === "message" && seqMessages[sel.index]) {
            var msg = seqMessages[sel.index];
            var fromIndex = seqParticipantIndex(msg.from);
            var toIndex = seqParticipantIndex(msg.to);
            if (fromIndex >= 0 && toIndex >= 0) {
                var hx1 = seqLiveX(fromIndex);
                var hx2 = seqLiveX(toIndex);
                appendSeqEndpoints(svg, sel.index, hx1, hx2, seqRowY(sel.index),
                    Math.abs(hx2 - hx1) < 0.5);
            }
        }
        updateSeqDeleteButton();
    }

    function selectSeqItem(type, index) {
        seqSelected = type ? { type: type, index: index } : null;
        applySeqSelectionClasses();
    }

    function renderSequenceEditor() {
        if (!mermaidSeqPreview) return;
        var geo = seqMeasure();
        seqGeo = geo;
        var W = geo.width, H = geo.height;
        mermaidSeqPreview.innerHTML = "";
        var svg = seqSvgNode("svg");
        svg.setAttribute("class", "seq-canvas");
        svg.setAttribute("viewBox", "0 0 " + W + " " + H);
        svg.setAttribute("width", W);
        svg.setAttribute("height", H);

        var defs = seqSvgNode("defs");
        var markerIds = [];
        for (var tone = 0; tone < SEQ_TONES; tone++) {
            markerIds.push(["seq-arrow-t" + tone, "seq-marker seq-tone-" + tone]);
        }
        markerIds.push(["seq-arrow-sel", "seq-marker seq-marker-sel"]);
        markerIds.forEach(function (item) {
            var marker = seqSvgNode("marker");
            marker.setAttribute("id", item[0]);
            marker.setAttribute("class", item[1]);
            marker.setAttribute("viewBox", "0 0 10 10");
            marker.setAttribute("refX", "9.5");
            marker.setAttribute("refY", "5");
            marker.setAttribute("markerWidth", "9");
            marker.setAttribute("markerHeight", "9");
            marker.setAttribute("markerUnits", "userSpaceOnUse");
            marker.setAttribute("orient", "auto");
            var head = seqSvgNode("path");
            head.setAttribute("d", "M0,0 L10,5 L0,10 z");
            head.setAttribute("class", "seq-marker-head");
            marker.appendChild(head);
            defs.appendChild(marker);
        });
        svg.appendChild(defs);

        /* 参与者方框 + 生命线（竖线） */
        seqParticipants.forEach(function (p, index) {
            var cx = seqLiveX(index);
            var isSel = !!seqSelected && seqSelected.type === "participant" && seqSelected.index === index;

            var line = seqSvgNode("line");
            line.setAttribute("class", "seq-lifeline" + seqToneClass(p.id) + (isSel ? " selected" : ""));
            line.setAttribute("x1", cx);
            line.setAttribute("x2", cx);
            line.setAttribute("y1", SEQ_TOP + SEQ_PART_H);
            line.setAttribute("y2", geo.bottomY);
            svg.appendChild(line);

            var hit = seqSvgNode("rect");
            hit.setAttribute("class", "seq-lifeline-hit");
            hit.setAttribute("x", cx - 7);
            hit.setAttribute("y", SEQ_TOP + SEQ_PART_H);
            hit.setAttribute("width", 14);
            hit.setAttribute("height", Math.max(10, geo.bottomY - SEQ_TOP - SEQ_PART_H));
            hit.setAttribute("data-seq-role", "lifeline");
            hit.setAttribute("data-index", index);
            svg.appendChild(hit);

            var box = seqSvgNode("rect");
            box.setAttribute("class", "seq-participant" + seqToneClass(p.id) + (isSel ? " selected" : ""));
            box.setAttribute("x", cx - geo.partW / 2);
            box.setAttribute("y", SEQ_TOP);
            box.setAttribute("width", geo.partW);
            box.setAttribute("height", SEQ_PART_H);
            box.setAttribute("rx", 5);
            box.setAttribute("data-seq-role", "participant");
            box.setAttribute("data-index", index);
            svg.appendChild(box);

            var label = seqSvgNode("text");
            label.setAttribute("class", "seq-participant-label" + seqToneClass(p.id) + (isSel ? " selected" : ""));
            label.setAttribute("x", cx);
            label.setAttribute("y", SEQ_TOP + SEQ_PART_H / 2);
            label.setAttribute("dominant-baseline", "middle");
            label.setAttribute("data-seq-role", "participant");
            label.setAttribute("data-index", index);
            label.textContent = p.alias || p.id;
            svg.appendChild(label);
        });

        /* 消息箭头 */
        seqMessages.forEach(function (m, index) {
            var fromIndex = seqParticipantIndex(m.from);
            var toIndex = seqParticipantIndex(m.to);
            if (fromIndex < 0 || toIndex < 0) return;
            var x1 = seqLiveX(fromIndex);
            var x2 = seqLiveX(toIndex);
            /* 拖动端点改指向时，端点跟随鼠标自由移动（不做跳跃吸附） */
            if (seqRepoint && seqRepoint.index === index) {
                if (seqRepoint.which === "from") x1 = seqRepoint.x;
                else x2 = seqRepoint.x;
            }
            var y = seqRowY(index);
            var isSel = !!seqSelected && seqSelected.type === "message" && seqSelected.index === index;
            /* 约定：向右实线、向左虚线；拖动端点时实时按当前方向切换 */
            var dashed = m.dashed;
            if (seqDrag || (seqRepoint && seqRepoint.index === index)) dashed = x2 < x1 - 0.5;
            var tone = seqToneOf(m.from);
            var msgClass = "seq-message seq-tone-" + tone +
                (dashed ? " dashed" : "") + (isSel ? " selected" : "");
            var marker = "url(#" + (isSel ? "seq-arrow-sel" : "seq-arrow-t" + tone) + ")";

            if (Math.abs(x2 - x1) < 0.5) {
                /* 自调用：从竖线右侧绕出去再回到竖线 */
                var loopD = seqSelfLoopPath(x1, y, 46, 26);
                var loop = seqSvgNode("path");
                loop.setAttribute("class", msgClass + " self");
                loop.setAttribute("d", loopD);
                loop.setAttribute("marker-end", marker);
                loop.setAttribute("data-seq-role", "message");
                loop.setAttribute("data-index", index);
                svg.appendChild(loop);

                var loopHit = seqSvgNode("path");
                loopHit.setAttribute("class", "seq-message-hit");
                loopHit.setAttribute("d", loopD);
                loopHit.setAttribute("data-seq-role", "message");
                loopHit.setAttribute("data-index", index);
                svg.appendChild(loopHit);

                var loopText = seqSvgNode("text");
                loopText.setAttribute("class",
                    "seq-message-label seq-tone-" + tone + (isSel ? " selected" : ""));
                loopText.setAttribute("x", x1 + 56);
                loopText.setAttribute("y", y + 4);
                loopText.setAttribute("text-anchor", "start");
                loopText.setAttribute("data-seq-role", "message-label");
                loopText.setAttribute("data-index", index);
                loopText.textContent = m.text || "";
                svg.appendChild(loopText);
                if (isSel) {
                    appendSeqEndpoints(svg, index, x1, x1, y, true);
                }
                return;
            }

            var line = seqSvgNode("line");
            line.setAttribute("class", msgClass);
            line.setAttribute("x1", x1);
            line.setAttribute("y1", y);
            line.setAttribute("x2", x2);
            line.setAttribute("y2", y);
            line.setAttribute("marker-end", marker);
            line.setAttribute("data-seq-role", "message");
            line.setAttribute("data-index", index);
            svg.appendChild(line);

            var hit = seqSvgNode("line");
            hit.setAttribute("class", "seq-message-hit");
            hit.setAttribute("x1", x1);
            hit.setAttribute("y1", y);
            hit.setAttribute("x2", x2);
            hit.setAttribute("y2", y);
            hit.setAttribute("data-seq-role", "message");
            hit.setAttribute("data-index", index);
            svg.appendChild(hit);

            var text = seqSvgNode("text");
            text.setAttribute("class", "seq-message-label seq-tone-" + tone + (isSel ? " selected" : ""));
            text.setAttribute("x", (x1 + x2) / 2);
            text.setAttribute("y", y - 9);
            text.setAttribute("data-seq-role", "message-label");
            text.setAttribute("data-index", index);
            text.textContent = m.text || "";
            svg.appendChild(text);
            if (isSel) appendSeqEndpoints(svg, index, x1, x2, y, false);
        });

        /* 底部镜像参与者（与 Mermaid 预览的上下两行一致） */
        seqParticipants.forEach(function (p, index) {
            var cx = seqLiveX(index);
            var isSel = !!seqSelected && seqSelected.type === "participant" && seqSelected.index === index;

            var box = seqSvgNode("rect");
            box.setAttribute("class", "seq-participant mirror" + seqToneClass(p.id) + (isSel ? " selected" : ""));
            box.setAttribute("x", cx - geo.partW / 2);
            box.setAttribute("y", geo.bottomY);
            box.setAttribute("width", geo.partW);
            box.setAttribute("height", SEQ_PART_H);
            box.setAttribute("rx", 5);
            box.setAttribute("data-seq-role", "participant");
            box.setAttribute("data-index", index);
            svg.appendChild(box);

            var mirrorLabel = seqSvgNode("text");
            mirrorLabel.setAttribute("class", "seq-participant-label mirror" + seqToneClass(p.id) + (isSel ? " selected" : ""));
            mirrorLabel.setAttribute("x", cx);
            mirrorLabel.setAttribute("y", geo.bottomY + SEQ_PART_H / 2);
            mirrorLabel.setAttribute("dominant-baseline", "middle");
            mirrorLabel.setAttribute("data-seq-role", "participant");
            mirrorLabel.setAttribute("data-index", index);
            mirrorLabel.textContent = p.alias || p.id;
            svg.appendChild(mirrorLabel);
        });

        /* 正在拖出的消息箭头 */
        if (seqLink) {
            var fromX = seqLiveX(seqLink.from);
            var rowY = seqRowY(seqLink.row);
            var guide = seqSvgNode("line");
            guide.setAttribute("class", "seq-row-guide");
            guide.setAttribute("x1", 0);
            guide.setAttribute("y1", rowY);
            guide.setAttribute("x2", W);
            guide.setAttribute("y2", rowY);
            svg.appendChild(guide);

            var temp = seqSvgNode("line");
            if (seqLink.target === seqLink.from) {
                temp = seqSvgNode("path");
                temp.setAttribute("class", "seq-message temp self" + (seqLink.dashed ? " dashed" : ""));
                temp.setAttribute("d", seqSelfLoopPath(fromX, rowY, 46, 26));
            } else {
                temp.setAttribute("class", "seq-message temp" + (seqLink.dashed ? " dashed" : ""));
                temp.setAttribute("x1", fromX);
                temp.setAttribute("y1", rowY);
                temp.setAttribute("x2", seqLink.curX);
                temp.setAttribute("y2", rowY);
            }
            temp.setAttribute("marker-end", "url(#seq-arrow-sel)");
            svg.appendChild(temp);
        }

        mermaidSeqPreview.appendChild(svg);
        applySeqZoom();
        updateSeqDeleteButton();
    }

    function seqParticipantIndex(id) {
        for (var i = 0; i < seqParticipants.length; i++) {
            if (seqParticipants[i].id === id) return i;
        }
        return -1;
    }

    /* 自调用回环：从竖线右侧绕出去再折回竖线 */
    function seqSelfLoopPath(x, y, w, h) {
        return "M " + (x + 1) + " " + (y - h / 2) +
            " H " + (x + w) +
            " V " + (y + h / 2) +
            " H " + (x + 1);
    }

    /* 选中消息时在两端显示可拖拽手柄，拖到别的竖线即可改指向 */
    function appendSeqEndpoints(svg, index, x1, x2, y, isSelf) {
        var points = isSelf
            ? [{ x: x1 + 1, y: y - 13, end: "from" }, { x: x1 + 1, y: y + 13, end: "to" }]
            : [{ x: x1, y: y, end: "from" }, { x: x2, y: y, end: "to" }];
        points.forEach(function (pt) {
            var handle = seqSvgNode("circle");
            handle.setAttribute("class", "seq-endpoint");
            handle.setAttribute("cx", pt.x);
            handle.setAttribute("cy", pt.y);
            handle.setAttribute("r", 5);
            handle.setAttribute("data-seq-role", "msg-end");
            handle.setAttribute("data-seq-end", pt.end);
            handle.setAttribute("data-index", index);
            svg.appendChild(handle);
        });
    }

    function startSeqParticipantDrag(e, index) {
        if (!seqParticipants[index]) return;
        e.preventDefault();
        e.stopPropagation();
        commitSeqEdit();
        selectSeqItem("participant", index);
        var svg = mermaidSeqPreview.querySelector("svg");
        var scale = svg && svg.getScreenCTM() ? (svg.getScreenCTM().a || 1) : 1;
        var startClientX = e.clientX;
        var geo = seqGeo || seqMeasure();
        var baseX = seqSlotX(index, geo);
        var minX = 10;
        var maxX = Math.max(minX, geo.width - 10);
        seqDrag = { index: index, liveX: baseX };
        renderSequenceEditor();

        function onMove(ev) {
            if (!seqDrag) return;
            var nx = baseX + (ev.clientX - startClientX) / (scale || 1);
            seqDrag.liveX = Math.max(minX, Math.min(maxX, nx));
            renderSequenceEditor();
        }
        function onUp() {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            if (!seqDrag) return;
            var liveX = seqDrag.liveX;
            var dragged = seqParticipants[index];
            seqDrag = null;
            if (!dragged) { updateSequencePreview(); return; }
            /* 按松开位置插入新次序：越过邻居即交换，序列化顺序与预览保持一致 */
            var rest = seqParticipants.filter(function (p, i) { return i !== index; });
            var insertAt = 0;
            seqParticipants.forEach(function (p, i) {
                if (i === index) return;
                if (seqSlotX(i, geo) < liveX) insertAt++;
            });
            rest.splice(Math.max(0, Math.min(rest.length, insertAt)), 0, dragged);
            seqParticipants = rest;
            /* 顺序变了，按新方向重算实线 / 虚线（向右实线、向左虚线） */
            seqMessages.forEach(function (msg) {
                var f = seqParticipantIndex(msg.from);
                var t = seqParticipantIndex(msg.to);
                if (f >= 0 && t >= 0) msg.dashed = f !== t && t < f;
            });
            var newIndex = seqParticipants.indexOf(dragged);
            seqSelected = newIndex >= 0 ? { type: "participant", index: newIndex } : null;
            updateSequencePreview();
            if (mermaidEditorHint) {
                mermaidEditorHint.textContent = newIndex >= 0
                    ? "参与者顺序已更新：" + seqParticipants.map(function (p) { return p.alias || p.id; }).join(" → ")
                    : "";
            }
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
    }

    function startSeqLinkDrag(e, index) {
        if (!seqParticipants[index]) return;
        e.preventDefault();
        e.stopPropagation();
        commitSeqEdit();
        var startX = seqSlotX(index);
        var pt = seqCanvasPoint(e);
        seqLink = {
            from: index,
            curX: pt.x,
            row: seqRowFromY(pt.y),
            target: null,
            dashed: false,
            leftSource: false
        };
        if (mermaidEditorHint) {
            mermaidEditorHint.textContent =
                "拖到其他竖线上松开即可创建消息（向右实线、向左虚线）；先向外拖出再回到这条竖线，才会生成指向自己的箭头";
        }
        renderSequenceEditor();

        function updateFromPointer(ev) {
            if (!seqLink) return;
            var p = seqCanvasPoint(ev);
            seqLink.row = seqRowFromY(p.y);
            /* 必须先离开起始竖线（超过吸附半径），再回来才会吸附到自身 */
            if (Math.abs(p.x - startX) > SEQ_SNAP) seqLink.leftSource = true;
            var nearest = -1;
            var bestDist = SEQ_SNAP;
            seqParticipants.forEach(function (item, i) {
                if (i === seqLink.from && !seqLink.leftSource) return;
                var dist = Math.abs(seqSlotX(i) - p.x);
                if (dist <= bestDist) { bestDist = dist; nearest = i; }
            });
            seqLink.target = nearest >= 0 ? nearest : null;
            seqLink.curX = nearest >= 0 ? seqSlotX(nearest) : p.x;
            seqLink.dashed = seqLink.curX < startX;
            renderSequenceEditor();
        }
        function onMove(ev) { updateFromPointer(ev); }
        function onUp(ev) {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            if (!seqLink) return;
            updateFromPointer(ev);
            var link = seqLink;
            seqLink = null;
            if (link.target === null) {
                renderSequenceEditor();
                if (mermaidEditorHint) {
                    mermaidEditorHint.textContent =
                        "已取消：拖到其他竖线上松开可创建消息；先向外拖出再回到这条竖线，即可创建指向自己的箭头";
                }
                return;
            }
            var fromP = seqParticipants[link.from];
            var toP = seqParticipants[link.target];
            if (!fromP || !toP) { renderSequenceEditor(); return; }
            var message = {
                from: fromP.id,
                to: toP.id,
                text: "消息",
                dashed: link.dashed
            };
            var row = Math.max(0, Math.min(seqMessages.length, link.row));
            seqMessages.splice(row, 0, message);
            seqSelected = { type: "message", index: row };
            updateSequencePreview();
            if (mermaidEditorHint) {
                mermaidEditorHint.textContent = "已创建消息，直接输入文字后回车即可（Esc 取消）";
            }
            startSeqMessageEdit(row, true);
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
    }

    /* 拖动消息本体上下移动，其他消息自动让位 */
    function startSeqMessageDrag(e, index) {
        if (!seqMessages[index]) return;
        selectSeqItem("message", index);
        var startY = e.clientY;
        var current = index;
        var moved = false;
        function onMove(ev) {
            if (!moved) {
                if (Math.abs(ev.clientY - startY) < 6) return;
                moved = true;
            }
            var p = seqCanvasPoint(ev);
            var target = seqRowFromY(p.y);
            target = Math.max(0, Math.min(seqMessages.length - 1, target));
            if (target === current) return;
            var msg = seqMessages.splice(current, 1)[0];
            seqMessages.splice(target, 0, msg);
            current = target;
            seqSelected = { type: "message", index: current };
            updateSequencePreview();
            if (mermaidEditorHint) {
                mermaidEditorHint.textContent = "消息已移动到第 " + (current + 1) + " 行";
            }
        }
        function onUp() {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            if (moved) updateSequencePreview();
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
    }

    /* 拖动消息端点改写指向：拖动时端点跟随鼠标，松开时吸附到最近竖线 */
    function startSeqRepoint(e, index, which) {
        var message = seqMessages[index];
        if (!message) return;
        e.preventDefault();
        e.stopPropagation();
        commitSeqEdit();
        selectSeqItem("message", index);
        var fromIndex = seqParticipantIndex(message.from);
        var toIndex = seqParticipantIndex(message.to);
        var startX = which === "from" ? seqLiveX(fromIndex) : seqLiveX(toIndex);
        seqRepoint = { index: index, which: which, x: startX };
        renderSequenceEditor();
        var snap = Math.max(60, SEQ_SNAP * 1.8);
        if (mermaidEditorHint) {
            mermaidEditorHint.textContent = which === "from"
                ? "拖动起点：端点跟随鼠标移动，松开时吸附到最近的竖线"
                : "拖动终点：端点跟随鼠标移动，松开时吸附到最近的竖线（拖到同一条竖线则成为自调用）";
        }
        function onMove(ev) {
            if (!seqRepoint) return;
            var p = seqCanvasPoint(ev);
            seqRepoint.x = p.x;
            renderSequenceEditor();
        }
        function onUp(ev) {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            if (!seqRepoint) return;
            var p = seqCanvasPoint(ev);
            var nearest = -1;
            var bestDist = snap;
            seqParticipants.forEach(function (item, i) {
                var dist = Math.abs(seqSlotX(i) - p.x);
                if (dist <= bestDist) { bestDist = dist; nearest = i; }
            });
            seqRepoint = null;
            if (nearest >= 0) {
                var id = seqParticipants[nearest].id;
                if (which === "from") message.from = id;
                else message.to = id;
                /* 方向变了就同步线型：向右实线、向左虚线、自调用实线 */
                var fromIdx = seqParticipantIndex(message.from);
                var toIdx = seqParticipantIndex(message.to);
                if (fromIdx >= 0 && toIdx >= 0) {
                    message.dashed = fromIdx !== toIdx && toIdx < fromIdx;
                }
            }
            updateSequencePreview();
            if (!mermaidEditorHint) return;
            if (nearest < 0) {
                mermaidEditorHint.textContent = "未吸附到竖线，已还原原指向";
                return;
            }
            if (message.from === message.to) {
                mermaidEditorHint.textContent = "已改为自调用箭头（起止同一条竖线）";
                return;
            }
            var fromP = seqParticipantById(message.from);
            var toP = seqParticipantById(message.to);
            mermaidEditorHint.textContent = "已更新消息指向：" +
                ((fromP && fromP.alias) || message.from) + " → " +
                ((toP && toP.alias) || message.to) +
                (message.dashed ? "（向左 · 虚线）" : "（向右 · 实线）");
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
    }

    /* 预览区用：把解析后的时序图渲染成与编辑器同色系的静态 SVG（不再用 Mermaid 的单调配色） */
    function buildSequencePreviewSvg(parsed) {
        var participants = (parsed && parsed.participants) || [];
        var messages = (parsed && parsed.messages) || [];
        if (!participants.length) return null;
        var partW = 96;
        participants.forEach(function (p) {
            partW = Math.max(partW, Math.min(220, seqTextWidth(p.alias || p.id, 14) + 30));
        });
        var slot = SEQ_MIN_SLOT;
        messages.forEach(function (m) {
            slot = Math.max(slot, seqTextWidth(m.text || "", 13) + 64);
        });
        var count = participants.length;
        var width = Math.max(360, SEQ_PAD * 2 + partW + slot * (count - 1));
        var rows = Math.max(1, messages.length);
        var firstRow = SEQ_TOP + SEQ_PART_H + SEQ_ROW_TOP;
        var bottomY = firstRow + (rows - 1) * SEQ_ROW_H + 46;
        var height = bottomY + SEQ_PART_H + 20;
        var xOf = function (index) { return SEQ_PAD + partW / 2 + index * slot; };
        var idxOf = function (id) {
            for (var i = 0; i < participants.length; i++) {
                if (participants[i].id === id) return i;
            }
            return -1;
        };

        var svg = seqSvgNode("svg");
        svg.setAttribute("class", "seq-canvas seq-preview-canvas");
        svg.setAttribute("viewBox", "0 0 " + width + " " + height);
        svg.setAttribute("width", "100%");
        svg.style.maxWidth = width + "px";
        svg.style.height = "auto";

        var defs = seqSvgNode("defs");
        for (var tone = 0; tone < SEQ_TONES; tone++) {
            var marker = seqSvgNode("marker");
            marker.setAttribute("id", "seq-arrow-t" + tone);
            marker.setAttribute("class", "seq-marker seq-tone-" + tone);
            marker.setAttribute("viewBox", "0 0 10 10");
            marker.setAttribute("refX", "9.5");
            marker.setAttribute("refY", "5");
            marker.setAttribute("markerWidth", "9");
            marker.setAttribute("markerHeight", "9");
            marker.setAttribute("markerUnits", "userSpaceOnUse");
            marker.setAttribute("orient", "auto");
            var head = seqSvgNode("path");
            head.setAttribute("d", "M0,0 L10,5 L0,10 z");
            head.setAttribute("class", "seq-marker-head");
            marker.appendChild(head);
            defs.appendChild(marker);
        }
        svg.appendChild(defs);

        participants.forEach(function (p, index) {
            var cx = xOf(index);
            var line = seqSvgNode("line");
            line.setAttribute("class", "seq-lifeline" + seqToneClass(p.id));
            line.setAttribute("x1", cx);
            line.setAttribute("y1", SEQ_TOP + SEQ_PART_H);
            line.setAttribute("x2", cx);
            line.setAttribute("y2", bottomY);
            svg.appendChild(line);
            [SEQ_TOP, bottomY].forEach(function (top) {
                var box = seqSvgNode("rect");
                box.setAttribute("class", "seq-participant" + seqToneClass(p.id));
                box.setAttribute("x", cx - partW / 2);
                box.setAttribute("y", top);
                box.setAttribute("width", partW);
                box.setAttribute("height", SEQ_PART_H);
                box.setAttribute("rx", 5);
                svg.appendChild(box);
                var label = seqSvgNode("text");
                label.setAttribute("class", "seq-participant-label" + seqToneClass(p.id));
                label.setAttribute("x", cx);
                label.setAttribute("y", top + SEQ_PART_H / 2);
                label.setAttribute("dominant-baseline", "middle");
                label.textContent = p.alias || p.id;
                svg.appendChild(label);
            });
        });

        messages.forEach(function (m, index) {
            var fromIndex = idxOf(m.from);
            var toIndex = idxOf(m.to);
            if (fromIndex < 0 || toIndex < 0) return;
            var x1 = xOf(fromIndex);
            var x2 = xOf(toIndex);
            var y = firstRow + index * SEQ_ROW_H;
            var tone = seqToneOf(m.from);
            var cls = "seq-message seq-tone-" + tone + (m.dashed ? " dashed" : "");
            var markerUrl = "url(#seq-arrow-t" + tone + ")";
            if (Math.abs(x2 - x1) < 0.5) {
                var loop = seqSvgNode("path");
                loop.setAttribute("class", cls + " self");
                loop.setAttribute("d", seqSelfLoopPath(x1, y, 46, 26));
                loop.setAttribute("marker-end", markerUrl);
                svg.appendChild(loop);
                var loopText = seqSvgNode("text");
                loopText.setAttribute("class", "seq-message-label seq-tone-" + tone);
                loopText.setAttribute("x", x1 + 56);
                loopText.setAttribute("y", y + 4);
                loopText.setAttribute("text-anchor", "start");
                loopText.textContent = m.text || "";
                svg.appendChild(loopText);
                return;
            }
            var lineEl = seqSvgNode("line");
            lineEl.setAttribute("class", cls);
            lineEl.setAttribute("x1", x1);
            lineEl.setAttribute("y1", y);
            lineEl.setAttribute("x2", x2);
            lineEl.setAttribute("y2", y);
            lineEl.setAttribute("marker-end", markerUrl);
            svg.appendChild(lineEl);
            var text = seqSvgNode("text");
            text.setAttribute("class", "seq-message-label seq-tone-" + tone);
            text.setAttribute("x", (x1 + x2) / 2);
            text.setAttribute("y", y - 9);
            text.textContent = m.text || "";
            svg.appendChild(text);
        });
        return svg;
    }

    /* 画布内联编辑：双击消息文字 / 双击参与者改名 */
    function startSeqEdit(kind, index, initial, anchorEl, commit) {
        commitSeqEdit();
        if (!anchorEl || !mermaidSeqPreview) return;
        var input = document.createElement("input");
        input.type = "text";
        input.className = "seq-inline-input";
        input.value = initial || "";
        input.spellcheck = false;
        var hostRect = mermaidSeqPreview.getBoundingClientRect();
        var rect = anchorEl.getBoundingClientRect();
        input.style.left = Math.round(rect.left - hostRect.left + mermaidSeqPreview.scrollLeft - 14) + "px";
        input.style.top = Math.round(rect.top - hostRect.top + mermaidSeqPreview.scrollTop - 8) + "px";
        input.style.width = Math.max(96, Math.round(rect.width + 34)) + "px";
        mermaidSeqPreview.appendChild(input);
        seqEdit = { input: input, commit: commit, kind: kind, index: index };
        input.addEventListener("keydown", function (ev) {
            if (ev.key === "Escape") {
                ev.preventDefault();
                ev.stopPropagation();
                cancelSeqEdit();
            } else if (ev.key === "Enter") {
                ev.preventDefault();
                ev.stopPropagation();
                commitSeqEdit();
            }
        });
        input.addEventListener("blur", function () { commitSeqEdit(); });
        input.focus();
        input.select();
    }

    function startSeqMessageEdit(index, autoSelect) {
        var message = seqMessages[index];
        if (!message) return;
        var label = mermaidSeqPreview.querySelector(
            '.seq-message-label[data-index="' + index + '"]');
        if (!label) return;
        selectSeqItem("message", index);
        startSeqEdit("message", index, message.text || "", label, function (value) {
            if (!seqMessages[index]) return;
            seqMessages[index].text = String(value || "").trim();
            updateSequencePreview();
        });
        if (autoSelect) {
            var input = seqEdit && seqEdit.input;
            if (input) input.select();
        }
    }

    function startSeqParticipantRename(index) {
        var p = seqParticipants[index];
        if (!p) return;
        var label = mermaidSeqPreview.querySelector(
            '.seq-participant-label[data-index="' + index + '"]');
        if (!label) return;
        startSeqEdit("participant", index, p.alias || p.id, label, function (value) {
            if (!seqParticipants[index]) return;
            var name = String(value || "").trim();
            seqParticipants[index].alias = name || seqParticipants[index].id;
            updateSequencePreview();
        });
    }

    function commitSeqEdit() {
        if (!seqEdit) return;
        var edit = seqEdit;
        seqEdit = null;
        var value = edit.input.value;
        if (edit.input.parentNode) edit.input.parentNode.removeChild(edit.input);
        edit.commit(value);
    }

    function cancelSeqEdit() {
        if (!seqEdit) return;
        var edit = seqEdit;
        seqEdit = null;
        if (edit.input.parentNode) edit.input.parentNode.removeChild(edit.input);
        applySeqSelectionClasses();
    }

    function deleteSeqSelection() {
        if (!seqSelected) return;
        if (seqSelected.type === "message") {
            seqMessages.splice(seqSelected.index, 1);
        } else {
            var p = seqParticipants[seqSelected.index];
            if (!p) return;
            if (seqParticipants.length <= 1) {
                if (mermaidEditorHint) mermaidEditorHint.textContent = "至少保留一个参与者";
                return;
            }
            seqParticipants.splice(seqSelected.index, 1);
            seqMessages = seqMessages.filter(function (m) { return m.from !== p.id && m.to !== p.id; });
        }
        seqSelected = null;
        updateSequencePreview();
        if (mermaidEditorHint) mermaidEditorHint.textContent = "已删除选中项";
    }

    function addSequenceParticipant() {
        seqParticipantSeq++;
        var id = "P" + seqParticipantSeq;
        while (seqParticipantById(id)) { seqParticipantSeq++; id = "P" + seqParticipantSeq; }
        var n = seqParticipants.length + 1;
        seqParticipants.push({ id: id, alias: "参与者" + n });
        seqSelected = { type: "participant", index: seqParticipants.length - 1 };
        updateSequencePreview();
        if (mermaidEditorHint) mermaidEditorHint.textContent = "已添加参与者「" + seqParticipants[n - 1].alias + "」";
    }

    if (mermaidSeqPreview) {
        mermaidSeqPreview.addEventListener("pointerdown", function (e) {
            if (!mermaidEditorOpen() || !mermaidSeqPane || mermaidSeqPane.hidden) return;
            if (e.button !== undefined && e.button !== 0) return;
            var target = e.target;
            if (target && target.classList && target.classList.contains("seq-inline-input")) return;
            var role = target && target.getAttribute ? target.getAttribute("data-seq-role") : null;
            var index = target && target.getAttribute
                ? parseInt(target.getAttribute("data-index"), 10) : NaN;
            if (role === "participant" && !isNaN(index)) { startSeqParticipantDrag(e, index); return; }
            if (role === "lifeline" && !isNaN(index)) { startSeqLinkDrag(e, index); return; }
            if (role === "msg-end" && !isNaN(index)) {
                startSeqRepoint(e, index, target.getAttribute("data-seq-end") || "to");
                return;
            }
            if ((role === "message" || role === "message-label") && !isNaN(index)) {
                startSeqMessageDrag(e, index);
                return;
            }
            commitSeqEdit();
            selectSeqItem(null, -1);
        });
        mermaidSeqPreview.addEventListener("dblclick", function (e) {
            if (!mermaidEditorOpen() || !mermaidSeqPane || mermaidSeqPane.hidden) return;
            var target = e.target;
            var role = target && target.getAttribute ? target.getAttribute("data-seq-role") : null;
            var index = target && target.getAttribute
                ? parseInt(target.getAttribute("data-index"), 10) : NaN;
            if (isNaN(index)) return;
            e.preventDefault();
            if (role === "message-label" || role === "message") startSeqMessageEdit(index, false);
            else if (role === "participant") startSeqParticipantRename(index);
        });
        mermaidSeqPreview.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    }


    function renderMermaidInto(target, source) {
        if (!window.mermaid || !target) return;
        try {
            window.mermaid.initialize({
                startOnLoad: false,
                securityLevel: "strict",
                theme: mermaidThemeName()
            });
        } catch (e) { /* 初始化失败时仍尝试渲染 */ }
        var seq = ++mermaidPreviewSeq;
        try {
            var result = window.mermaid.render("mermaid-seq-preview-" + seq, source);
            Promise.resolve(result).then(function (res) {
                if (seq !== mermaidPreviewSeq) return;
                var svg = typeof res === "string" ? res : (res && res.svg);
                target.innerHTML = svg || "";
                if (target === mermaidSeqPreview) applySeqZoom();
            }).catch(function (err) {
                if (seq !== mermaidPreviewSeq) return;
                target.innerHTML = '<div class="mermaid-error">' +
                    escapeHtml(String(err && err.message || err)) + "</div>";
            });
        } catch (err) {
            target.innerHTML = '<div class="mermaid-error">' +
                escapeHtml(String(err && err.message || err)) + "</div>";
        }
    }

    function updateSequencePreview() {
        if (!mermaidSeqPreview) return;
        mermaidSource.value = serializeSequence();
        renderSequenceEditor();
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

    /* 方向感知的三次贝塞尔走线，接近 Mermaid 预览的平滑曲线 */
    function flowEdgeCurve(a, p1, b, p2) {
        var dx = p2.x - p1.x;
        var dy = p2.y - p1.y;
        var vertical = Math.abs(dy) > Math.abs(dx);
        var c1x = p1.x, c1y = p1.y, c2x = p2.x, c2y = p2.y;
        if (vertical) {
            var ky = dy * 0.48;
            c1y = p1.y + ky;
            c2y = p2.y - ky;
        } else {
            var kx = dx * 0.48;
            c1x = p1.x + kx;
            c2x = p2.x - kx;
        }
        return {
            d: "M " + p1.x + " " + p1.y +
                " C " + c1x + " " + c1y + ", " + c2x + " " + c2y + ", " + p2.x + " " + p2.y,
            midX: (p1.x + 3 * c1x + 3 * c2x + p2.x) / 8,
            midY: (p1.y + 3 * c1y + 3 * c2y + p2.y) / 8
        };
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
            var curve = flowEdgeCurve(a, p1, b, p2);
            var path = svgEl("path");
            path.setAttribute("class", "fc-edge" + flowToneClass(edge.from) +
                (flowSelected && flowSelected.type === "edge" && flowSelected.id === edge.id
                    ? " selected" : ""));
            path.setAttribute("data-edge-id", edge.id);
            path.setAttribute("d", curve.d);
            var arrowUrl = "url(#" + (
                flowSelected && flowSelected.type === "edge" && flowSelected.id === edge.id
                    ? "mermaid-arrow-sel"
                    : "mermaid-arrow-t" + flowToneIndex(edge.from)) + ")";
            path.setAttribute("marker-end", arrowUrl);
            if (edge.bidir) path.setAttribute("marker-start", arrowUrl);
            path.addEventListener("click", function (e) {
                e.stopPropagation();
                selectFlowEdge(edge.id);
            });
            mermaidEdgeLayer.appendChild(path);

            if (edge.label) {
                var text = svgEl("text");
                text.setAttribute("class", "fc-edge-label");
                text.setAttribute("x", curve.midX);
                text.setAttribute("y", curve.midY - 6);
                text.textContent = edge.label;
                mermaidEdgeLayer.appendChild(text);
            }
        });
        if (flowTempPath) mermaidEdgeLayer.appendChild(flowTempPath);
    }

    function renderFlowNode(node) {
        var g = svgEl("g");
        g.setAttribute("class", "fc-node" + flowToneClass(node.id) +
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
        var start = -((lines.length - 1) * FLOW_LINE_H) / 2;
        lines.forEach(function (line, i) {
            var tspan = svgEl("tspan");
            tspan.setAttribute("x", 0);
            tspan.setAttribute("y", start + i * FLOW_LINE_H);
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
        flowEnsureMarkers();
        renderFlowGroups();
        renderFlowEdges();
        mermaidNodeLayer.innerHTML = "";
        flowNodes.forEach(renderFlowNode);
        refreshFlowSelection();
    }

    /* 流程图配色：按 id 稳定取色（与预览区的后处理一致） */
    var FLOW_TONE_COUNT = 8;

    function flowToneIndex(id) {
        var text = String(id || "");
        var hash = 0;
        for (var i = 0; i < text.length; i++) {
            hash = (hash * 31 + text.charCodeAt(i)) % 100003;
        }
        return hash % FLOW_TONE_COUNT;
    }

    function flowToneClass(id) {
        return " fc-tone-" + flowToneIndex(id);
    }

    function flowEnsureMarkers() {
        if (!mermaidCanvas) return;
        var defs = mermaidCanvas.querySelector("defs");
        if (!defs) return;
        for (var tone = 0; tone < FLOW_TONE_COUNT; tone++) {
            var id = "mermaid-arrow-t" + tone;
            if (defs.querySelector('marker[id="' + id + '"]')) continue;
            var marker = svgEl("marker");
            marker.setAttribute("id", id);
            marker.setAttribute("class", "fc-marker fc-tone-" + tone);
            marker.setAttribute("viewBox", "0 0 10 10");
            marker.setAttribute("refX", "9");
            marker.setAttribute("refY", "5");
            marker.setAttribute("markerWidth", "6");
            marker.setAttribute("markerHeight", "6");
            marker.setAttribute("markerUnits", "userSpaceOnUse");
            marker.setAttribute("orient", "auto-start-reverse");
            var head = svgEl("path");
            head.setAttribute("d", "M0,0 L10,5 L0,10 z");
            marker.appendChild(head);
            defs.appendChild(marker);
        }
        if (!defs.querySelector('marker[id="mermaid-arrow-sel"]')) {
            var selMarker = svgEl("marker");
            selMarker.setAttribute("id", "mermaid-arrow-sel");
            selMarker.setAttribute("class", "fc-marker-sel");
            selMarker.setAttribute("viewBox", "0 0 10 10");
            selMarker.setAttribute("refX", "9");
            selMarker.setAttribute("refY", "5");
            selMarker.setAttribute("markerWidth", "6");
            selMarker.setAttribute("markerHeight", "6");
            selMarker.setAttribute("markerUnits", "userSpaceOnUse");
            selMarker.setAttribute("orient", "auto-start-reverse");
            var selHead = svgEl("path");
            selHead.setAttribute("d", "M0,0 L10,5 L0,10 z");
            selMarker.appendChild(selHead);
            defs.appendChild(selMarker);
        }
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

    function flowGroupById(id) {
        if (!id) return null;
        for (var i = 0; i < flowGroups.length; i++) {
            if (flowGroups[i].id === id) return flowGroups[i];
        }
        return null;
    }

    function rebuildFlowGroupMembers() {
        flowGroups.forEach(function (group) {
            group.members = flowNodes
                .filter(function (node) { return node.group === group.id; })
                .map(function (node) { return node.id; });
        });
    }

    function hideFlowGroupFields() {
        if (mermaidGroupField) mermaidGroupField.hidden = true;
        if (mermaidGroupRenameField) mermaidGroupRenameField.hidden = true;
        if (mermaidGroupMake) mermaidGroupMake.hidden = true;
        if (mermaidGroupActions) mermaidGroupActions.hidden = true;
    }

    function refreshFlowGroupFields(node) {
        if (!mermaidGroupField || !mermaidGroupSelect) return;
        mermaidGroupField.hidden = false;
        mermaidGroupSelect.innerHTML = "";
        var none = document.createElement("option");
        none.value = "";
        none.textContent = "（不属于分组）";
        mermaidGroupSelect.appendChild(none);
        flowGroups.forEach(function (group) {
            var opt = document.createElement("option");
            opt.value = group.id;
            opt.textContent = group.label || group.id;
            mermaidGroupSelect.appendChild(opt);
        });
        mermaidGroupSelect.value = node.group || "";

        if (mermaidGroupMake) mermaidGroupMake.hidden = false;
        if (mermaidGroupName) mermaidGroupName.value = "";

        var group = flowGroupById(node.group);
        if (mermaidGroupRenameField) mermaidGroupRenameField.hidden = !group;
        if (group && mermaidGroupRename) mermaidGroupRename.value = group.label || group.id;
        if (mermaidGroupActions) mermaidGroupActions.hidden = !group;
    }

    function setNodeGroup(node, groupId) {
        if (!node) return;
        node.group = groupId || "";
        var group = flowGroupById(node.group);
        if (group) expandGroupBoxToNode(group, node);
        rebuildFlowGroupMembers();
        renderFlowGraph();
        syncFlowSource();
        showFlowProps();
    }

    function showFlowProps() {
        if (!mermaidProps || !flowSelected) {
            if (mermaidProps) mermaidProps.hidden = true;
            hideFlowGroupFields();
            return;
        }
        if (flowSelected.type === "node") {
            var node = flowNodeById(flowSelected.id);
            if (!node) { mermaidProps.hidden = true; hideFlowGroupFields(); return; }
            mermaidPropsTitle.textContent = "节点属性";
            mermaidShapeField.hidden = false;
            mermaidLabelInput.value = node.label;
            mermaidShapeSelect.value = node.shape;
            refreshFlowGroupFields(node);
        } else {
            var edge = flowEdgeById(flowSelected.id);
            if (!edge) { mermaidProps.hidden = true; hideFlowGroupFields(); return; }
            mermaidPropsTitle.textContent = "连线属性";
            mermaidShapeField.hidden = true;
            hideFlowGroupFields();
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

    /* ---------- 流程图画布：无边界视口（滚轮缩放 + 右键平移） ---------- */
    var FLOW_CANVAS_W = 1200;
    var FLOW_CANVAS_H = 800;
    var FLOW_ZOOM_MIN = 0.4;
    var FLOW_ZOOM_MAX = 4;
    var flowView = { x: 0, y: 0, w: FLOW_CANVAS_W, h: FLOW_CANVAS_H };

    function flowCanvasAspect() {
        if (!mermaidCanvas) return FLOW_CANVAS_W / FLOW_CANVAS_H;
        var rect = mermaidCanvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return FLOW_CANVAS_W / FLOW_CANVAS_H;
        return rect.width / rect.height;
    }

    function applyFlowView() {
        if (mermaidCanvas) {
            mermaidCanvas.setAttribute("viewBox",
                flowView.x + " " + flowView.y + " " + flowView.w + " " + flowView.h);
        }
        updateFlowZoomLabel();
    }

    /* 窗口尺寸变化后重新对齐视口宽高比，保证编辑区与预览一致、无留白 */
    function ensureFlowAspect() {
        var aspect = flowCanvasAspect();
        if (!aspect || !isFinite(aspect)) return;
        var current = flowView.w / flowView.h;
        if (Math.abs(current - aspect) / aspect <= 0.02) return;
        var cx = flowView.x + flowView.w / 2;
        var cy = flowView.y + flowView.h / 2;
        var h = flowView.h;
        var w = h * aspect;
        flowView = { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
        applyFlowView();
    }

    /* 把节点内容居中显示（保持当前缩放） */
    function fitFlowViewToCenter() {
        if (!flowNodes.length) return;
        ensureFlowAspect();
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        flowNodes.forEach(function (node) {
            minX = Math.min(minX, node.x - node.w / 2);
            maxX = Math.max(maxX, node.x + node.w / 2);
            minY = Math.min(minY, node.y - node.h / 2);
            maxY = Math.max(maxY, node.y + node.h / 2);
        });
        flowView.x = (minX + maxX) / 2 - flowView.w / 2;
        flowView.y = (minY + maxY) / 2 - flowView.h / 2;
        applyFlowView();
    }

    /* 按内容自动缩放并居中，打开编辑器时与预览的构图一致 */
    function fitFlowViewToContent() {
        if (!flowNodes.length) return;
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        flowNodes.forEach(function (node) {
            minX = Math.min(minX, node.x - node.w / 2);
            maxX = Math.max(maxX, node.x + node.w / 2);
            minY = Math.min(minY, node.y - node.h / 2);
            maxY = Math.max(maxY, node.y + node.h / 2);
        });
        var pad = 40;
        var contentW = Math.max(120, (maxX - minX) + pad * 2);
        var contentH = Math.max(120, (maxY - minY) + pad * 2);
        var aspect = flowCanvasAspect();
        var zoom;
        if (contentW / contentH < aspect) {
            zoom = FLOW_CANVAS_H / contentH;
        } else {
            zoom = (FLOW_CANVAS_H * aspect) / contentW;
        }
        zoom = Math.max(FLOW_ZOOM_MIN, Math.min(1.3, zoom));
        var h = FLOW_CANVAS_H / zoom;
        var w = h * aspect;
        flowZoom = zoom;
        flowView = {
            x: (minX + maxX) / 2 - w / 2,
            y: (minY + maxY) / 2 - h / 2,
            w: w,
            h: h
        };
        applyFlowView();
    }

    function updateFlowZoomLabel() {
        if (mermaidZoomLabel) mermaidZoomLabel.textContent = Math.round(flowZoom * 100) + "%";
    }

    function setFlowZoom(next, anchor) {
        next = Math.max(FLOW_ZOOM_MIN, Math.min(FLOW_ZOOM_MAX, next));
        /* 视口宽高比始终跟随画布元素，避免出现留白（编辑所见即预览所得） */
        var aspect = flowCanvasAspect();
        var h1 = FLOW_CANVAS_H / next;
        var w1 = h1 * aspect;
        var nx, ny;
        if (anchor) {
            var fx = (anchor.x - flowView.x) / flowView.w;
            var fy = (anchor.y - flowView.y) / flowView.h;
            nx = anchor.x - fx * w1;
            ny = anchor.y - fy * h1;
        } else {
            nx = flowView.x + flowView.w / 2 - w1 / 2;
            ny = flowView.y + flowView.h / 2 - h1 / 2;
        }
        flowZoom = next;
        flowView = { x: nx, y: ny, w: w1, h: h1 };
        applyFlowView();
    }

    function resetFlowZoom() {
        flowZoom = 1;
        var aspect = flowCanvasAspect();
        var h = FLOW_CANVAS_H;
        var w = h * aspect;
        flowView = { x: FLOW_CANVAS_W / 2 - w / 2, y: 0, w: w, h: h };
        applyFlowView();
    }

    function mermaidEditorOpen() {
        return !!(mermaidEditor && !mermaidEditor.hidden);
    }

    function onFlowCanvasWheel(e) {
        if (!mermaidEditorOpen()) return;
        e.preventDefault();
        var step = e.deltaY;
        if (!step) return;
        ensureFlowAspect();
        var factor = Math.pow(1.0016, -step);
        factor = Math.max(0.82, Math.min(1.22, factor));
        var anchor = flowCanvasPoint(e);
        setFlowZoom(flowZoom * factor, { x: anchor.x, y: anchor.y });
    }

    if (mermaidCanvasWrap) {
        mermaidCanvasWrap.addEventListener("wheel", onFlowCanvasWheel, { passive: false });
    }
    if (mermaidZoomIn) {
        mermaidZoomIn.addEventListener("click", function () { setFlowZoom(flowZoom * 1.2, null); });
    }
    if (mermaidZoomOut) {
        mermaidZoomOut.addEventListener("click", function () { setFlowZoom(flowZoom / 1.2, null); });
    }
    if (mermaidZoomReset) {
        mermaidZoomReset.addEventListener("click", resetFlowZoom);
    }

    /* 右键（或中键）拖动平移流程图画布 */
    function startFlowPan(e) {
        if (!mermaidEditorOpen()) return;
        e.preventDefault();
        e.stopPropagation();
        ensureFlowAspect();
        var scale = 1;
        try {
            scale = mermaidCanvas.getScreenCTM().a || 1;
        } catch (err) { scale = 1; }
        var startX = e.clientX, startY = e.clientY;
        var base = { x: flowView.x, y: flowView.y };
        document.body.classList.add("canvas-panning");
        function onMove(ev) {
            flowView.x = base.x - (ev.clientX - startX) / scale;
            flowView.y = base.y - (ev.clientY - startY) / scale;
            applyFlowView();
        }
        function onUp() {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.body.classList.remove("canvas-panning");
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
    }

    if (mermaidCanvas) {
        mermaidCanvas.addEventListener("pointerdown", function (e) {
            if (e.button !== 1 && e.button !== 2) return;
            startFlowPan(e);
        });
        mermaidCanvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    }
    if (mermaidCanvasWrap) {
        mermaidCanvasWrap.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    }

    /* ---------- 时序图预览缩放 ---------- */
    function applySeqZoom() {
        if (!mermaidSeqPreview) return;
        var svg = mermaidSeqPreview.querySelector("svg");
        if (svg) {
            var base = parseFloat(svg.getAttribute("data-base-width") || "0");
            if (!base) {
                var vbWidth = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal.width : 0;
                if (!vbWidth) {
                    var mw = /max-width:\s*([\d.]+)px/i.exec(svg.getAttribute("style") || "");
                    vbWidth = mw ? parseFloat(mw[1]) : (svg.getBoundingClientRect().width || 600);
                }
                base = Math.max(160, Math.round(vbWidth || 600));
                svg.setAttribute("data-base-width", String(base));
            }
            svg.style.maxWidth = "none";
            svg.style.width = Math.round(base * seqZoom) + "px";
            svg.style.height = "auto";
        }
        if (seqZoomLabel) seqZoomLabel.textContent = Math.round(seqZoom * 100) + "%";
    }

    function setSeqZoom(next) {
        seqZoom = Math.max(0.4, Math.min(3, next));
        applySeqZoom();
    }

    if (mermaidSeqCanvasWrap) {
        mermaidSeqCanvasWrap.addEventListener("wheel", function (e) {
            if (!mermaidEditorOpen() || !mermaidSeqPane || mermaidSeqPane.hidden) return;
            e.preventDefault();
            var factor = Math.max(0.85, Math.min(1.18, Math.pow(1.0016, -e.deltaY)));
            setSeqZoom(seqZoom * factor);
        }, { passive: false });
    }
    if (seqZoomIn) seqZoomIn.addEventListener("click", function () { setSeqZoom(seqZoom * 1.2); });
    if (seqZoomOut) seqZoomOut.addEventListener("click", function () { setSeqZoom(seqZoom / 1.2); });
    if (seqZoomReset) seqZoomReset.addEventListener("click", function () { setSeqZoom(1); });

    /* ---------- UI 原型画布缩放（CSS zoom，保持滚动锚点） ---------- */
    function applyUiZoom() {
        if (uiCanvas) uiCanvas.style.zoom = uiZoom;
        if (uiZoomLabel) uiZoomLabel.textContent = Math.round(uiZoom * 100) + "%";
    }

    function setUiZoom(next, anchorClient) {
        next = Math.max(0.4, Math.min(2.5, next));
        if (Math.abs(next - uiZoom) < 0.001) return;
        var prev = uiZoom;
        var wrap = uiCanvasWrap;
        var ax = 0, ay = 0, rect = null;
        if (wrap && anchorClient) {
            rect = wrap.getBoundingClientRect();
            ax = anchorClient.x - rect.left + wrap.scrollLeft;
            ay = anchorClient.y - rect.top + wrap.scrollTop;
        }
        uiZoom = next;
        applyUiZoom();
        if (wrap && anchorClient && rect) {
            wrap.scrollLeft = ax * (uiZoom / prev) - (anchorClient.x - rect.left);
            wrap.scrollTop = ay * (uiZoom / prev) - (anchorClient.y - rect.top);
        }
    }

    if (uiCanvasWrap) {
        uiCanvasWrap.addEventListener("wheel", function (e) {
            if (!uiEditor || uiEditor.hidden) return;
            e.preventDefault();
            var factor = Math.max(0.85, Math.min(1.18, Math.pow(1.0016, -e.deltaY)));
            setUiZoom(uiZoom * factor, { x: e.clientX, y: e.clientY });
        }, { passive: false });
    }
    if (uiZoomIn) uiZoomIn.addEventListener("click", function () { setUiZoom(uiZoom * 1.2, null); });
    if (uiZoomOut) uiZoomOut.addEventListener("click", function () { setUiZoom(uiZoom / 1.2, null); });
    if (uiZoomReset) uiZoomReset.addEventListener("click", function () { setUiZoom(1, null); });

    /* ---------- 右键 / 中键拖动平移可滚动画布（时序图预览、UI 原型画布） ---------- */
    function bindScrollPan(wrap, isActive) {
        if (!wrap) return;
        wrap.addEventListener("contextmenu", function (e) { e.preventDefault(); });
        wrap.addEventListener("pointerdown", function (e) {
            if (e.button !== 1 && e.button !== 2) return;
            if (isActive && !isActive()) return;
            e.preventDefault();
            var startX = e.clientX, startY = e.clientY;
            var baseLeft = wrap.scrollLeft, baseTop = wrap.scrollTop;
            document.body.classList.add("canvas-panning");
            function onMove(ev) {
                wrap.scrollLeft = baseLeft - (ev.clientX - startX);
                wrap.scrollTop = baseTop - (ev.clientY - startY);
            }
            function onUp() {
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                document.body.classList.remove("canvas-panning");
            }
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
        });
    }

    bindScrollPan(mermaidSeqPreview, function () {
        return mermaidEditorOpen() && mermaidSeqPane && !mermaidSeqPane.hidden;
    });
    bindScrollPan(uiCanvasWrap, function () {
        return !!(uiEditor && !uiEditor.hidden);
    });

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
            /* 无边界画布：不再把节点限制在 1200×800 范围内 */
            node.x = Math.round(p.x + flowDrag.offsetX);
            node.y = Math.round(p.y + flowDrag.offsetY);
            group.setAttribute("transform", "translate(" + node.x + " " + node.y + ")");
            renderFlowEdges();
            flowDrag.moved = true;
        }

        function onUp() {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            var moved = !!(flowDrag && flowDrag.moved);
            flowDrag = null;
            if (!moved) return;
            /* 拖拽落点若落在某个分组框内，则自动加入该分组；落在框外则移出分组 */
            var target = null;
            for (var i = 0; i < flowGroups.length; i++) {
                var box = flowGroups[i].box;
                if (groupBoxContains(box, node.x, node.y)) target = flowGroups[i];
            }
            var nextGroup = target ? target.id : "";
            if (nextGroup !== (node.group || "")) {
                node.group = nextGroup;
                if (target) expandGroupBoxToNode(target, node);
                rebuildFlowGroupMembers();
                renderFlowGraph();
                showFlowProps();
            }
            syncFlowSource();
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
        // 若当前选中的节点属于某个分组，新节点默认加入同一分组
        var selectedNode = (flowSelected && flowSelected.type === "node")
            ? flowNodeById(flowSelected.id) : null;
        var node = addFlowNodeRaw(label, shape, x, y);
        if (selectedNode && selectedNode.group && flowGroupById(selectedNode.group)) {
            node.group = selectedNode.group;
            rebuildFlowGroupMembers();
        }
        flowSelected = { type: "node", id: node.id };
        renderFlowGraph();
        showFlowProps();
        syncFlowSource();
    }

    function autoLayoutFlow() {
        layoutFlowNodes(false);
        renderFlowGraph();
        syncFlowSource();
        fitFlowViewToContent();
    }

    function setMermaidTab(mode, skipParse) {
        if (mode === "visual" && !skipParse) {
            var src = mermaidSource.value;
            if (/^\s*sequenceDiagram\b/i.test(src)) {
                var parsedSeq = parseSequence(src);
                if (parsedSeq) {
                    seqParticipants = parsedSeq.participants;
                    seqMessages = parsedSeq.messages;
                    seqExtras = parsedSeq.extras;
                    seqSelected = null;
                    seqDrag = null;
                    seqLink = null;
                    mermaidMode = "sequence";
                } else {
                    mermaidMode = "sequence";
                    mermaidEditorHint.textContent =
                        "该时序图包含 loop / alt 等复杂结构，请在源码模式编辑";
                    mode = "source";
                }
            } else if (!importFlowGraph(src)) {
                mermaidMode = "flow";
                mermaidEditorHint.textContent =
                    "当前源码包含图形编辑器暂不支持的语法，请继续使用源码模式";
                mode = "source";
            } else {
                mermaidMode = "flow";
            }
        }
        if (mode === "source" && mermaidTab === "visual" && !skipParse) {
            if (mermaidMode === "sequence") mermaidSource.value = serializeSequence();
            else syncFlowSource();
        }
        mermaidTab = mode;
        if (mermaidVisualPane) mermaidVisualPane.hidden = !(mode === "visual" && mermaidMode === "flow");
        if (mermaidSeqPane) mermaidSeqPane.hidden = !(mode === "visual" && mermaidMode === "sequence");
        if (mermaidSourcePane) mermaidSourcePane.hidden = mode !== "source";
        if (mermaidTabVisual) mermaidTabVisual.classList.toggle("active", mode === "visual");
        if (mermaidTabSource) mermaidTabSource.classList.toggle("active", mode === "source");
        if (mode === "visual") {
            if (mermaidMode === "sequence") {
                renderSequenceEditor();
                updateSequencePreview();
                mermaidEditorHint.textContent =
                    "拖动参与者左右移动；在竖线上按住拖动创建消息；双击消息文字编辑 · Ctrl+Enter 应用";
            } else {
                if (flowDirection) mermaidDirection.value = flowDirection;
                renderFlowGraph();
                showFlowProps();
                mermaidEditorHint.textContent =
                    "拖动节点移动；从节点边缘圆点拖到另一个节点连线；Ctrl+Enter 应用 · Esc 取消";
            }
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
        if (mermaidTab === "visual") {
            if (mermaidMode === "sequence") mermaidSource.value = serializeSequence();
            else syncFlowSource();
        }
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

        if (mermaidSeqAddParticipant) {
            mermaidSeqAddParticipant.addEventListener("click", function () {
                addSequenceParticipant();
            });
        }
        if (mermaidSeqDeleteBtn) {
            mermaidSeqDeleteBtn.addEventListener("click", function () {
                deleteSeqSelection();
            });
        }

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

        if (mermaidGroupSelect) {
            mermaidGroupSelect.addEventListener("change", function () {
                if (!flowSelected || flowSelected.type !== "node") return;
                var node = flowNodeById(flowSelected.id);
                if (node) setNodeGroup(node, mermaidGroupSelect.value);
            });
        }
        if (mermaidGroupAdd) {
            mermaidGroupAdd.addEventListener("click", function () {
                if (!flowSelected || flowSelected.type !== "node") return;
                var node = flowNodeById(flowSelected.id);
                if (!node) return;
                var label = ((mermaidGroupName && mermaidGroupName.value) || "").trim();
                var n = flowGroups.length + 1;
                var id = "g" + n;
                while (flowGroupById(id)) { n++; id = "g" + n; }
                if (!label) label = "分组" + n;
                flowGroups.push({ id: id, label: label, members: [] });
                setNodeGroup(node, id);
                mermaidEditorHint.textContent = "已新建分组「" + label + "」并加入当前节点";
            });
        }
        if (mermaidGroupRemove) {
            mermaidGroupRemove.addEventListener("click", function () {
                if (!flowSelected || flowSelected.type !== "node") return;
                var node = flowNodeById(flowSelected.id);
                if (node) setNodeGroup(node, "");
            });
        }
        if (mermaidGroupDelete) {
            mermaidGroupDelete.addEventListener("click", function () {
                if (!flowSelected || flowSelected.type !== "node") return;
                var node = flowNodeById(flowSelected.id);
                if (!node || !node.group) return;
                var gid = node.group;
                flowGroups = flowGroups.filter(function (group) { return group.id !== gid; });
                flowNodes.forEach(function (item) {
                    if (item.group === gid) item.group = "";
                });
                renderFlowGraph();
                syncFlowSource();
                showFlowProps();
                mermaidEditorHint.textContent = "已删除分组，组内节点已移出";
            });
        }
        if (mermaidGroupRename) {
            mermaidGroupRename.addEventListener("input", function () {
                if (!flowSelected || flowSelected.type !== "node") return;
                var node = flowNodeById(flowSelected.id);
                var group = node ? flowGroupById(node.group) : null;
                if (!group) return;
                group.label = mermaidGroupRename.value || group.id;
                renderFlowGraph();
                syncFlowSource();
            });
        }

        mermaidDeleteSelection.addEventListener("click", deleteFlowSelection);

        mermaidEditor.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                if (seqEdit) {
                    e.preventDefault();
                    e.stopPropagation();
                    cancelSeqEdit();
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                closeMermaidEditor();
            } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                commitSeqEdit();
                applyMermaidEditor();
            } else if ((e.key === "Delete" || e.key === "Backspace") &&
                mermaidTab === "visual") {
                var tag = e.target && e.target.tagName;
                if (tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") {
                    if (mermaidMode === "sequence" && seqSelected) {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteSeqSelection();
                    } else if (flowSelected) {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteFlowSelection();
                    }
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
        if (parent && page.kind === "dialog") {
            // 对话框始终浮在所属窗口上方，与画布里的并排布局无关
            var ownerPos = uiRuntimePagePosition(parent, index, ctx);
            var overlay = {
                left: Math.max(0, ownerPos.left + 72),
                top: Math.max(0, ownerPos.top + 64),
                z: 100 + index
            };
            ctx.positions[page.id] = overlay;
            return overlay;
        }
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
        if (!id || !uiCanvas) return null;
        var scope = (uiMode === "canvas" && uiLayout) ? (uiFrameNode(uiLayout.id) || uiCanvas) : uiCanvas;
        return scope.querySelector('.ui-canvas-el[data-id="' + id + '"]');
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
        uiSelectedPageId = page.id;
        uiSelectedId = null;
        uiConnectFrom = null;
        if (uiMode === "preview") {
            uiMode = "canvas";
            if (uiModeCanvasBtn) uiModeCanvasBtn.classList.add("active");
            if (uiModePreviewBtn) uiModePreviewBtn.classList.remove("active");
        }
        uiRenderEditor();
        uiScrollFrameIntoView(page.id);
        uiEditorHint.textContent = "当前窗口：" + page.name + "（" + (UI_PAGE_KINDS[page.kind] || "窗口") + "）";
    }

    function uiRenderStructure() {
        if (!uiStructure || !uiDoc) return;
        uiStructure.innerHTML = "";
        uiDoc.pages.forEach(function (page) {
            var group = document.createElement("div");
            group.className = "ui-structure-group" +
                (uiLayout && page.id === uiLayout.id ? " active" : "");
            group.innerHTML = '<span class="ui-structure-icon">' +
                (page.kind === "dialog" ? "◈" : "▣") + "</span>" +
                '<span class="ui-structure-label">' + escapeHtml(page.name || page.id) + "</span>" +
                '<span class="ui-structure-kind">' +
                escapeHtml(UI_PAGE_KINDS[page.kind] || "窗口") + "</span>";
            group.title = "窗口：" + (page.name || page.id) +
                (page.open ? " · 初始打开" : "") +
                (uiDoc.start === page.id ? " · 启动页" : "");
            group.tabIndex = 0;
            group.addEventListener("click", function () {
                uiSelectPage(page.id);
                uiScrollFrameIntoView(page.id);
            });
            uiStructure.appendChild(group);
            var renderLevel = function (parentId, depth) {
                page.elements.filter(function (el) { return (el.parentId || "") === parentId; })
                    .forEach(function (el) {
                        var row = document.createElement("div");
                        row.className = "ui-structure-item" + (el.id === uiSelectedId &&
                            uiLayout && uiLayout.id === page.id ? " active" : "") +
                            (uiIsContainerType(el.type) ? " container" : "");
                        row.style.paddingLeft = (8 + (depth + 1) * 12) + "px";
                        row.innerHTML = '<span class="ui-structure-icon">' +
                            escapeHtml(UI_TYPE_ICONS[el.type] || "•") +
                            '</span><span class="ui-structure-label">' +
                            escapeHtml(el.text || UI_TYPE_LABELS[el.type]) + "</span>";
                        row.title = (page.name || page.id) + " · " + UI_TYPE_LABELS[el.type] + " · " + el.id;
                        row.tabIndex = 0;
                        row.setAttribute("role", "button");
                        row.addEventListener("keydown", function (e) {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                uiSelectElementOnPage(page, el.id);
                                uiRenderStructure();
                            }
                        });
                        row.addEventListener("click", function () {
                            uiSelectElementOnPage(page, el.id);
                            uiRenderStructure();
                        });
                        uiStructure.appendChild(row);
                        renderLevel(el.id, depth + 1);
                    });
            };
            renderLevel("", 0);
        });
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

    function buildUiCanvasElement(el, page) {
        var host = page || uiLayout;
        var node = document.createElement("div");
        var depth = host ? uiElementDepth(host, el) : 0;
        var childCount = host ? host.elements.filter(function (child) {
            return child.parentId === el.id;
        }).length : 0;
        node.className = "ui-canvas-el" + (el.id === uiSelectedId ? " selected" : "") +
            (depth ? " nested" : "") + (uiIsContainerType(el.type) ? " container-type" : "") +
            (el.id === uiConnectFrom ? " connect-source" : "");
        node.setAttribute("data-id", el.id);
        node.setAttribute("data-page-id", host ? host.id : "");
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
        node.style.zIndex = String(10 + depth * 10 + (host ? host.elements.indexOf(el) : 0));
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
            var zoomFactor = uiZoom || 1;
            var dx = Math.round((ev.clientX - startX) / zoomFactor / 5) * 5;
            var dy = Math.round((ev.clientY - startY) / zoomFactor / 5) * 5;
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

    /* ===================== 画布模式 / 预览模式 ===================== */
    var UI_FRAME_HEAD = 30;
    var UI_FRAME_GAP_X = 140;
    var UI_FRAME_GAP_Y = 90;
    var UI_CANVAS_PAD = 40;

    function uiPageById(pageId) {
        return uiDoc && pageId ? uiFindPage(uiDoc, pageId) : null;
    }

    function uiDocHasPagePositions() {
        if (!uiDoc) return false;
        return uiDoc.pages.some(function (page) { return page.x || page.y; });
    }

    /* 按窗口归属树自动排布所有窗口：列 = 层级深度，行 = 同级顺序 */
    function uiAutoLayoutPages() {
        if (!uiDoc || !uiDoc.pages.length) return;
        var depthOf = Object.create(null);
        var order = [];
        var visit = function (page, depth) {
            if (depthOf[page.id] !== undefined) return;
            depthOf[page.id] = depth;
            order.push(page);
            uiDoc.pages.forEach(function (child) {
                if (child.parentId === page.id) visit(child, depth + 1);
            });
        };
        uiDoc.pages.forEach(function (page) {
            if (!page.parentId || !uiFindPage(uiDoc, page.parentId)) visit(page, 0);
        });
        uiDoc.pages.forEach(function (page) {
            if (depthOf[page.id] === undefined) visit(page, 0);
        });
        var colWidth = Object.create(null);
        var colX = Object.create(null);
        order.forEach(function (page) {
            var d = depthOf[page.id];
            colWidth[d] = Math.max(colWidth[d] || 0, page.width);
        });
        var x = UI_CANVAS_PAD;
        Object.keys(colWidth).map(Number).sort(function (a, b) { return a - b; })
            .forEach(function (d) {
                colX[d] = x;
                x += colWidth[d] + UI_FRAME_GAP_X;
            });
        var cursor = Object.create(null);
        order.forEach(function (page) {
            var d = depthOf[page.id];
            page.x = Math.round(colX[d]);
            page.y = Math.round(UI_CANVAS_PAD + (cursor[d] || 0));
            cursor[d] = (cursor[d] || 0) + page.height + UI_FRAME_HEAD + UI_FRAME_GAP_Y;
        });
    }

    function uiPlacePageBelow(page) {
        if (!uiDoc) return;
        var maxY = 0;
        uiDoc.pages.forEach(function (other) {
            if (other === page) return;
            maxY = Math.max(maxY, (other.y || 0) + other.height + UI_FRAME_HEAD);
        });
        page.x = UI_CANVAS_PAD;
        page.y = maxY ? maxY + UI_FRAME_GAP_Y : UI_CANVAS_PAD;
    }

    function uiDocCanvasSize() {
        var maxX = 0, maxY = 0;
        (uiDoc ? uiDoc.pages : []).forEach(function (page) {
            maxX = Math.max(maxX, (page.x || 0) + page.width);
            maxY = Math.max(maxY, (page.y || 0) + page.height + UI_FRAME_HEAD);
        });
        var zoom = uiZoom || 1;
        var wrapW = uiCanvasWrap ? Math.max(0, uiCanvasWrap.clientWidth - 40) / zoom : 0;
        var wrapH = uiCanvasWrap ? Math.max(0, uiCanvasWrap.clientHeight - 40) / zoom : 0;
        return {
            width: Math.max(320, Math.round(maxX + UI_CANVAS_PAD), Math.round(wrapW)),
            height: Math.max(240, Math.round(maxY + UI_CANVAS_PAD), Math.round(wrapH))
        };
    }

    function uiFrameNode(pageId) {
        if (!uiCanvas || !pageId) return null;
        return uiCanvas.querySelector('.ui-frame[data-page-id="' + pageId + '"]');
    }

    function uiRefreshFrameSelection() {
        if (!uiCanvas) return;
        var frames = uiCanvas.querySelectorAll(".ui-frame");
        for (var i = 0; i < frames.length; i++) {
            frames[i].classList.toggle("selected",
                frames[i].getAttribute("data-page-id") === uiSelectedPageId);
        }
    }

    function uiUpdateCanvasExtent() {
        if (!uiCanvas || !uiDoc) return;
        var sizes = uiDocCanvasSize();
        uiCanvas.style.width = sizes.width + "px";
        uiCanvas.style.height = sizes.height + "px";
        uiEditorSize.textContent = uiDoc.pages.length + " 个窗口 · 画布 " +
            sizes.width + " × " + sizes.height;
    }

    /* 页面属性变化时原地刷新窗口框外观 */
    function uiRefreshFrame(page) {
        if (!page || !uiCanvas) return;
        var node = uiFrameNode(page.id);
        if (!node) return;
        node.classList.toggle("dialog", page.kind === "dialog");
        node.style.left = (page.x || 0) + "px";
        node.style.top = (page.y || 0) + "px";
        node.style.width = page.width + "px";
        var title = node.querySelector(".ui-frame-title");
        if (title) title.textContent = page.name || page.id;
        var kind = node.querySelector(".ui-frame-kind");
        if (kind) kind.textContent = UI_PAGE_KINDS[page.kind] || "窗口";
        var body = node.querySelector(".ui-frame-body");
        if (body) {
            body.style.width = page.width + "px";
            body.style.height = page.height + "px";
        }
        uiUpdateCanvasExtent();
        uiRenderPageTabs();
        uiRenderPageLinks();
    }

    function uiSelectPage(pageId) {
        uiSelectedPageId = pageId || "";
        var page = uiPageById(uiSelectedPageId);
        if (page) uiLayout = page;
        uiSelectedId = null;
        uiRefreshFrameSelection();
        uiRenderProps();
        uiRenderStructure();
        uiRenderPageLinks();
    }

    /* 选中某个窗口里的控件：先切到该窗口上下文，再走原有选中流程 */
    function uiSelectElementOnPage(page, id) {
        if (page) {
            uiLayout = page;
            uiSelectedPageId = page.id;
            uiRefreshFrameSelection();
        }
        uiSelectElement(id);
    }

    function uiScrollFrameIntoView(pageId) {
        var node = uiFrameNode(pageId);
        if (!node || !uiCanvasWrap || uiMode !== "canvas") return;
        var wrapRect = uiCanvasWrap.getBoundingClientRect();
        var rect = node.getBoundingClientRect();
        uiCanvasWrap.scrollLeft += (rect.left - wrapRect.left) - 24;
        uiCanvasWrap.scrollTop += (rect.top - wrapRect.top) - 24;
    }

    function uiStartFrameDrag(e, page) {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (uiConnectMode && uiConnectFrom) {
            uiCreateConnectionTo(page.id);
            return;
        }
        uiSelectPage(page.id);
        uiScrollFrameIntoView(page.id);
        var startX = e.clientX, startY = e.clientY;
        var baseX = page.x, baseY = page.y;
        var zoom = uiZoom || 1;
        var moved = false;
        document.body.classList.add("dialog-dragging");
        document.body.style.cursor = "move";
        function onMove(ev) {
            page.x = Math.max(0, Math.round(baseX + (ev.clientX - startX) / zoom));
            page.y = Math.max(0, Math.round(baseY + (ev.clientY - startY) / zoom));
            var node = uiFrameNode(page.id);
            if (node) {
                node.style.left = page.x + "px";
                node.style.top = page.y + "px";
            }
            uiRenderPageLinks();
            moved = true;
        }
        function onUp() {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.body.classList.remove("dialog-dragging");
            document.body.style.cursor = "";
            if (!moved) return;
            uiUpdateCanvasExtent();
            uiRenderPageLinks();
            uiSyncPropInputs();
            uiRenderPageProps();
            if (uiPageX) uiPageX.value = Math.round(page.x || 0);
            if (uiPageY) uiPageY.value = Math.round(page.y || 0);
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
    }

    /* 从窗口右侧 ⇢ 手柄拖到另一个窗口：建立窗口之间的打开/关闭关系 */
    function uiStartPageLinkDrag(e, page) {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        uiSelectPage(page.id);
        uiPageLinkDrag = { from: page.id, x: 0, y: 0 };
        uiEditorHint.textContent = "拖到目标窗口上松开即可建立「打开」关系；动作可在右侧「交互」里改为关闭/返回";
        function onMove(ev) {
            if (!uiPageLinkDrag) return;
            var rect = uiCanvas.getBoundingClientRect();
            var zoom = uiZoom || 1;
            uiPageLinkDrag.x = (ev.clientX - rect.left) / zoom;
            uiPageLinkDrag.y = (ev.clientY - rect.top) / zoom;
            uiRenderPageLinks();
        }
        function onUp(ev) {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            var fromPage = uiPageById(uiPageLinkDrag ? uiPageLinkDrag.from : "");
            /* 用几何命中窗口框，避免被连线 SVG 或子元素挡住拖拽命中 */
            var toPage = null;
            if (uiDoc && uiCanvas) {
                var rect = uiCanvas.getBoundingClientRect();
                var zoom = uiZoom || 1;
                var cx = (ev.clientX - rect.left) / zoom;
                var cy = (ev.clientY - rect.top) / zoom;
                for (var i = uiDoc.pages.length - 1; i >= 0; i--) {
                    var candidate = uiDoc.pages[i];
                    if (cx >= candidate.x && cx <= candidate.x + candidate.width &&
                        cy >= (candidate.y || 0) &&
                        cy <= (candidate.y || 0) + candidate.height + UI_FRAME_HEAD) {
                        toPage = candidate;
                        break;
                    }
                }
            }
            uiPageLinkDrag = null;
            if (fromPage && toPage && toPage.id !== fromPage.id) {
                uiCreatePageTransition(fromPage, toPage, "open");
                return;
            }
            uiRenderPageLinks();
            uiEditorHint.textContent = fromPage && toPage
                ? "不能连接到自己，请拖到另一个窗口"
                : "已取消建立关系";
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
    }

    function uiCreatePageTransition(fromPage, toPage, action) {
        if (!uiDoc || !fromPage || !toPage || fromPage.id === toPage.id) return;
        var trigger = fromPage.elements.filter(function (el) { return el.type === "button"; })[0];
        if (!trigger) {
            var w = Math.min(180, Math.max(96, fromPage.width - 48));
            var h = Math.min(36, Math.max(24, fromPage.height - 24));
            var created = {
                id: "e" + (++uiElementSeq),
                type: "button",
                parentId: "",
                x: Math.max(16, Math.round((fromPage.width - w) / 2)),
                y: Math.max(16, Math.round((fromPage.height - h) / 2)),
                w: w, h: h,
                text: (toPage.kind === "dialog" ? "打开：" : "前往：") + (toPage.name || toPage.id),
                props: { variant: "primary" }
            };
            while (uiFindElementAnywhere(uiDoc, created.id)) created.id = "e" + (++uiElementSeq);
            fromPage.elements.push(created);
            trigger = created;
        }
        var conn = {
            id: "c" + (++uiConnSeq),
            from: trigger.id,
            event: "click",
            action: UI_ACTIONS.indexOf(action) >= 0 ? action : "open",
            target: toPage.id,
            value: ""
        };
        while (uiDoc.connections.some(function (item) { return item.id === conn.id; })) {
            conn.id = "c" + (++uiConnSeq);
        }
        uiDoc.connections.push(conn);
        uiRenderEditor();
        uiSelectElementOnPage(fromPage, trigger.id);
        uiEditorHint.textContent = "已建立窗口关系：" + (fromPage.name || fromPage.id) + " → " +
            (UI_ACTION_LABELS[conn.action] || conn.action) + " → " + (toPage.name || toPage.id) +
            "（触发控件：" + (trigger.text || trigger.id) + "）；可在右侧「交互」里改动作";
    }

    function buildUiFrame(page) {
        var frame = document.createElement("div");
        frame.className = "ui-frame" + (page.kind === "dialog" ? " dialog" : "") +
            (page.id === uiSelectedPageId ? " selected" : "");
        frame.setAttribute("data-page-id", page.id);
        frame.style.left = (page.x || 0) + "px";
        frame.style.top = (page.y || 0) + "px";
        frame.style.width = page.width + "px";

        var head = document.createElement("div");
        head.className = "ui-frame-head";
        head.title = "拖动标题栏移动窗口；点右侧 ⇢ 拖到别的窗口建立打开/关闭关系";
        var icon = document.createElement("span");
        icon.className = "ui-frame-icon";
        icon.textContent = page.kind === "dialog" ? "◈" : "▣";
        head.appendChild(icon);
        var title = document.createElement("span");
        title.className = "ui-frame-title";
        title.textContent = page.name || page.id;
        head.appendChild(title);
        var kind = document.createElement("span");
        kind.className = "ui-frame-kind";
        kind.textContent = UI_PAGE_KINDS[page.kind] || "窗口";
        head.appendChild(kind);
        if (uiDoc && page.id === uiDoc.start) {
            var startFlag = document.createElement("span");
            startFlag.className = "ui-frame-flag start";
            startFlag.textContent = "启动";
            head.appendChild(startFlag);
        }
        if (page.open) {
            var openFlag = document.createElement("span");
            openFlag.className = "ui-frame-flag open";
            openFlag.textContent = "初始打开";
            head.appendChild(openFlag);
        }
        if (page.parentId) {
            var owner = uiPageById(page.parentId);
            if (owner) {
                var ownerFlag = document.createElement("span");
                ownerFlag.className = "ui-frame-flag";
                ownerFlag.textContent = "属于 " + (owner.name || owner.id);
                head.appendChild(ownerFlag);
            }
        }
        var link = document.createElement("button");
        link.type = "button";
        link.className = "ui-frame-link";
        link.textContent = "⇢";
        link.title = "拖动到另一个窗口，建立“打开 / 关闭”关系";
        link.addEventListener("pointerdown", function (e) {
            uiStartPageLinkDrag(e, page);
        });
        head.appendChild(link);
        head.addEventListener("pointerdown", function (e) {
            if (e.target && e.target.closest && e.target.closest("button")) return;
            uiStartFrameDrag(e, page);
        });
        frame.appendChild(head);

        var body = document.createElement("div");
        body.className = "ui-frame-body";
        body.style.width = page.width + "px";
        body.style.height = page.height + "px";
        uiSortedElements(page).forEach(function (el) {
            body.appendChild(buildUiCanvasElement(el, page));
        });
        frame.appendChild(body);
        return frame;
    }

    function uiFrameElementPoint(page, el, side) {
        var originX = page.x || 0;
        var originY = (page.y || 0) + UI_FRAME_HEAD;
        if (!el) {
            return side === "left"
                ? { x: originX, y: originY + page.height / 2 }
                : { x: originX + page.width, y: originY + page.height / 2 };
        }
        return {
            x: originX + el.x + (side === "left" ? 0 : el.w),
            y: originY + el.y + el.h / 2
        };
    }

    /* 窗口之间的打开/关闭关系 = 流程图式连线；开启「逻辑连线」时再叠加控件级连线 */
    function uiRenderPageLinks() {
        if (!uiCanvas || !uiDoc || uiMode !== "canvas") return;
        var old = uiCanvas.querySelector(".ui-link-svg");
        if (old && old.parentNode) old.parentNode.removeChild(old);
        var width = parseInt(uiCanvas.style.width, 10) || 0;
        var height = parseInt(uiCanvas.style.height, 10) || 0;
        if (!width || !height) return;
        var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "ui-link-svg");
        svg.setAttribute("viewBox", "0 0 " + width + " " + height);
        svg.setAttribute("width", width);
        svg.setAttribute("height", height);
        svg.innerHTML = "<defs>" +
            '<marker id="ui-link-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">' +
            '<path d="M0,0 L9,4.5 L0,9 z" fill="#0969da"></path></marker>' +
            '<marker id="ui-link-arrow-close" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">' +
            '<path d="M0,0 L9,4.5 L0,9 z" fill="#cf222e"></path></marker>' +
            '<marker id="ui-link-arrow-back" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">' +
            '<path d="M0,0 L9,4.5 L0,9 z" fill="#bf8700"></path></marker>' +
            "</defs>";

        var addPath = function (d, className, color) {
            var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", d);
            path.setAttribute("class", className);
            if (color) path.setAttribute("stroke", color);
            svg.appendChild(path);
            return path;
        };
        var addLabel = function (x, y, text) {
            var label = document.createElementNS("http://www.w3.org/2000/svg", "text");
            label.setAttribute("x", x);
            label.setAttribute("y", y);
            label.setAttribute("text-anchor", "middle");
            label.setAttribute("class", "ui-link-label");
            label.textContent = text;
            svg.appendChild(label);
        };

        /* 1) 窗口归属（窗口包含关系），虚线：父窗口底边 → 子窗口顶边 */
        uiDoc.pages.forEach(function (page) {
            if (!page.parentId) return;
            var parent = uiPageById(page.parentId);
            if (!parent) return;
            var from = { x: (parent.x || 0) + parent.width / 2,
                         y: (parent.y || 0) + parent.height + UI_FRAME_HEAD };
            var to = { x: (page.x || 0) + page.width / 2, y: page.y || 0 };
            var midY = (from.y + to.y) / 2;
            addPath("M" + from.x + "," + from.y +
                " C" + from.x + "," + midY + " " + to.x + "," + midY +
                " " + to.x + "," + to.y,
                "ui-link-line", "#8250df").setAttribute("stroke-dasharray", "3 4");
            addLabel((from.x + to.x) / 2, midY - 4, "窗口归属");
        });

        /* 2) 窗口之间的打开 / 关闭 / 返回关系（按 源窗口→目标窗口→动作 聚合） */
        var transitions = [];
        var index = Object.create(null);
        uiDoc.connections.forEach(function (conn) {
            var source = uiFindElementAnywhere(uiDoc, conn.from);
            if (!source) return;
            var fromPage = source.page;
            var toPage = uiPageById(conn.target);
            var targetElement = null;
            if (!toPage) {
                var info = uiFindElementAnywhere(uiDoc, conn.target);
                if (info) {
                    toPage = info.page;
                    targetElement = info.element;
                } else if (conn.action === "back") {
                    toPage = fromPage.parentId ? uiPageById(fromPage.parentId) : null;
                } else if (conn.action === "close") {
                    toPage = fromPage;
                }
            }
            if (!toPage || toPage.id === fromPage.id) return;
            var key = fromPage.id + "|" + toPage.id + "|" + conn.action;
            if (index[key] === undefined) {
                index[key] = transitions.length;
                transitions.push({
                    from: fromPage,
                    to: toPage,
                    action: conn.action,
                    count: 1,
                    via: source.element,
                    target: targetElement
                });
            } else {
                transitions[index[key]].count++;
            }
        });
        transitions.forEach(function (item) {
            var from = uiFrameElementPoint(item.from, null, "right");
            var to = item.target
                ? uiFrameElementPoint(item.to, item.target, "left")
                : uiFrameElementPoint(item.to, null, "left");
            var dx = Math.max(40, Math.abs(to.x - from.x) * 0.45);
            var path = addPath("M" + from.x + "," + from.y +
                " C" + (from.x + dx) + "," + from.y + " " + (to.x - dx) + "," + to.y +
                " " + to.x + "," + to.y,
                "ui-link-line action-" + item.action);
            path.setAttribute("marker-end", "url(#ui-link-arrow" +
                (item.action === "close" ? "-close" : (item.action === "back" ? "-back" : "")) + ")");
            path.addEventListener("click", function (e) {
                e.stopPropagation();
                uiSelectElementOnPage(item.from, item.via.id);
                uiEditorHint.textContent = "窗口关系：" + (item.from.name || item.from.id) + " → " +
                    (UI_ACTION_LABELS[item.action] || item.action) + " → " + (item.to.name || item.to.id);
            });
            addLabel((from.x + to.x) / 2, (from.y + to.y) / 2 - 6,
                (UI_ACTION_LABELS[item.action] || item.action) + (item.count > 1 ? " ×" + item.count : ""));
        });

        /* 3) 控件级交互连线（可选） */
        if (uiLogicOn) {
            uiDoc.connections.forEach(function (conn) {
                var source = uiFindElementAnywhere(uiDoc, conn.from);
                if (!source) return;
                var info = uiFindElementAnywhere(uiDoc, conn.target);
                var from = uiFrameElementPoint(source.page, source.element, "right");
                var to;
                if (info) {
                    to = uiFrameElementPoint(info.page, info.element, "left");
                } else {
                    var targetPage = uiPageById(conn.target);
                    if (!targetPage) return;
                    to = uiFrameElementPoint(targetPage, null, "left");
                }
                var dx = Math.max(30, Math.abs(to.x - from.x) * 0.4);
                addPath("M" + from.x + "," + from.y +
                    " C" + (from.x + dx) + "," + from.y + " " + (to.x - dx) + "," + to.y +
                    " " + to.x + "," + to.y,
                    "ui-link-line action-" + conn.action, "#8c959f")
                    .setAttribute("stroke-dasharray", "2 3");
            });
        }

        /* 4) 正在拖拽建立关系的临时线 */
        if (uiPageLinkDrag) {
            var fromPage = uiPageById(uiPageLinkDrag.from);
            if (fromPage) {
                var start = uiFrameElementPoint(fromPage, null, "right");
                addPath("M" + start.x + "," + start.y + " L" + uiPageLinkDrag.x + "," + uiPageLinkDrag.y,
                    "ui-link-line temp", "#bf8700");
            }
        }
        uiCanvas.appendChild(svg);
    }

    function uiRenderCanvasMode() {
        if (uiPreviewHost) {
            uiPreviewHost.hidden = true;
            uiPreviewHost.innerHTML = "";
        }
        uiPreviewRuntime = null;
        uiCanvas.hidden = false;
        if (!uiDocHasPagePositions()) uiAutoLayoutPages();
        if (!uiSelectedPageId) uiSelectedPageId = uiLayout ? uiLayout.id : "";
        var sizes = uiDocCanvasSize();
        uiCanvas.style.width = sizes.width + "px";
        uiCanvas.style.height = sizes.height + "px";
        uiCanvas.innerHTML = "";
        uiDoc.pages.forEach(function (page) {
            uiCanvas.appendChild(buildUiFrame(page));
        });
        if (uiLayout) {
            uiCanvasWidth.value = uiLayout.width;
            uiCanvasHeight.value = uiLayout.height;
        }
        uiEditorSize.textContent = uiDoc.pages.length + " 个窗口 · 画布 " +
            sizes.width + " × " + sizes.height;
        uiRefreshFrameSelection();
        uiRenderPageLinks();
    }

    function uiRenderPreviewMode() {
        if (!uiPreviewHost || !uiDoc) return;
        uiCanvas.hidden = true;
        uiPreviewHost.hidden = false;
        uiPreviewHost.innerHTML = "";
        var runtime = buildUiRuntime(uiDoc);
        uiPreviewHost.appendChild(runtime);
        uiPreviewRuntime = runtime;
        if (runtime._uiFit) setTimeout(runtime._uiFit, 0);
        uiEditorSize.textContent = "预览 · " + uiDoc.pages.length + " 个窗口";
    }

    function uiRenderEditor() {
        if (!uiCanvas || !uiLayout || !uiDoc) return;
        if (uiSelectedId && !uiSelectedElement()) uiSelectedId = null;
        if (uiMode === "preview") {
            uiRenderPreviewMode();
        } else {
            uiRenderCanvasMode();
        }
        uiRenderPageTabs();
        uiRenderStructure();
        uiRenderProps();
    }

    function uiSetMode(mode) {
        uiMode = mode === "preview" ? "preview" : "canvas";
        if (uiModeCanvasBtn) uiModeCanvasBtn.classList.toggle("active", uiMode === "canvas");
        if (uiModePreviewBtn) uiModePreviewBtn.classList.toggle("active", uiMode === "preview");
        if (uiMode === "preview") {
            uiConnectMode = false;
            uiConnectFrom = null;
            uiPageLinkDrag = null;
            uiUpdateConnectButton();
        }
        uiRenderEditor();
        uiEditorHint.textContent = uiMode === "preview"
            ? "预览模式：直接运行原型，点按钮可打开/关闭窗口（改动需切回画布模式）"
            : "画布模式：拖窗口标题栏移动，拖 ⇢ 手柄到目标窗口建立打开/关闭关系";
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
        uiEditorHint.textContent = "当前窗口尺寸已调整为 " + w + " × " + h;
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
        uiPlacePageBelow(page);
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
        if (uiSelectedPageId === removed.id) uiSelectedPageId = "";
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
            ? "连线模式：先点击源控件，再点击目标控件或目标窗口框"
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
        uiEditorHint.textContent = uiLogicOn
            ? "已显示控件级交互连线（灰色虚线）；窗口打开/关闭关系始终显示"
            : "已隐藏控件级交互连线（窗口关系仍显示）";
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
        /* 画布模式：窗口打开/关闭关系与控件连线统一由 uiRenderPageLinks 绘制 */
        uiRenderPageLinks();
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
        uiMode = "canvas";
        uiSelectedPageId = uiLayout ? uiLayout.id : "";
        if (uiModeCanvasBtn) uiModeCanvasBtn.classList.add("active");
        if (uiModePreviewBtn) uiModePreviewBtn.classList.remove("active");
        uiEditor.hidden = false;
        uiRenderEditor();
        applyUiZoom();
        layoutFloatingDialog(uiEditor, uiEditorBox);
        uiCanvasWrap.scrollLeft = 0;
        uiCanvasWrap.scrollTop = 0;
        setTimeout(function () {
            if (uiLayout) uiScrollFrameIntoView(uiLayout.id);
            uiCanvas.focus();
        }, 30);
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
        if (uiModeCanvasBtn) uiModeCanvasBtn.addEventListener("click", function () { uiSetMode("canvas"); });
        if (uiModePreviewBtn) uiModePreviewBtn.addEventListener("click", function () { uiSetMode("preview"); });
        if (uiPageDelete) uiPageDelete.addEventListener("click", uiDeletePage);
        if (uiLogicToggle) uiLogicToggle.addEventListener("click", uiToggleLogic);
        if (uiConnectToggle) uiConnectToggle.addEventListener("click", uiToggleConnect);
        if (uiAddInteractionBtn) uiAddInteractionBtn.addEventListener("click", uiAddInteraction);

        uiPalette.addEventListener("click", function (e) {
            var btn = e.target && e.target.closest ? e.target.closest("button[data-type]") : null;
            if (btn) addUiElement(btn.getAttribute("data-type"));
        });

        uiCanvas.addEventListener("pointerdown", function (e) {
            if (e.button !== undefined && e.button !== 0) return;
            var node = e.target && e.target.closest ? e.target.closest(".ui-canvas-el") : null;
            if (!node) {
                var frame = e.target && e.target.closest ? e.target.closest(".ui-frame") : null;
                if (frame) {
                    var frameId = frame.getAttribute("data-page-id");
                    if (uiConnectMode && uiConnectFrom) {
                        uiCreateConnectionTo(frameId);
                        return;
                    }
                    uiSelectPage(frameId);
                    return;
                }
                if (uiConnectMode && uiConnectFrom) {
                    uiConnectFrom = null;
                    uiUpdateConnectButton();
                    uiSelectElement(null);
                    uiEditorHint.textContent = "已取消连线源，请重新选择源控件";
                } else {
                    uiSelectElement(null);
                    uiSelectedPageId = "";
                    uiRefreshFrameSelection();
                    uiRenderProps();
                }
                return;
            }
            var page = uiPageById(node.getAttribute("data-page-id")) || uiLayout;
            if (page && page !== uiLayout) {
                uiLayout = page;
                uiSelectedPageId = page.id;
                uiRefreshFrameSelection();
            }
            var el = uiFindElement(page, node.getAttribute("data-id"));
            if (!el) return;
            if (uiConnectMode) {
                if (!uiConnectFrom) {
                    uiConnectFrom = el.id;
                    uiSelectedId = el.id;
                    uiUpdateConnectButton();
                    uiSelectElement(el.id);
                    uiEditorHint.textContent = "已选择源控件「" + (el.text || UI_TYPE_LABELS[el.type]) +
                        "」，现在点击目标控件或目标窗口框";
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
            uiRefreshFrame(uiLayout);
            uiRenderStructure();
        });
        if (uiPageKind) uiPageKind.addEventListener("change", function () {
            if (!uiLayout) return;
            uiLayout.kind = uiPageKind.value === "dialog" ? "dialog" : "window";
            uiRefreshFrame(uiLayout);
            uiRenderStructure();
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
            uiRenderEditor();
            uiEditorHint.textContent = parentId
                ? "已将「" + (uiLayout.name || uiLayout.id) + "」归属到「" +
                  ((uiPageById(parentId) || {}).name || parentId) + "」"
                : "已取消窗口归属";
        });
        if (uiPageOpen) uiPageOpen.addEventListener("change", function () {
            if (!uiLayout) return;
            uiLayout.open = uiPageOpen.checked;
            uiRenderEditor();
        });
        [uiPageX, uiPageY].forEach(function (input) {
            if (!input) return;
            input.addEventListener("change", function () {
                if (!uiLayout) return;
                uiLayout.x = Math.max(0, parseInt(uiPageX.value, 10) || 0);
                uiLayout.y = Math.max(0, parseInt(uiPageY.value, 10) || 0);
                uiPageX.value = uiLayout.x;
                uiPageY.value = uiLayout.y;
                uiRefreshFrame(uiLayout);
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
            uiRenderEditor();
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

    /* ===================== 光标处对象 / 预览内直接编辑 ===================== */
    var lastPreviewEditTarget = null;   // { kind, index, source }

    function fencedBlockAtLine(text, line) {
        var re = /^```([A-Za-z][\w-]*)[^\n]*\n([\s\S]*?)^```/gm;
        var m;
        while ((m = re.exec(text)) !== null) {
            var startLine = text.slice(0, m.index).split("\n").length - 1;
            var endLine = text.slice(0, re.lastIndex).split("\n").length - 1;
            if (line >= startLine && line <= endLine) {
                return { lang: m[1].toLowerCase(), body: m[2], start: m.index, end: re.lastIndex };
            }
        }
        return null;
    }

    function countFencedBefore(text, endIndex, lang) {
        var re = new RegExp("```" + lang + "[^\\n]*\\n", "g");
        var count = 0;
        var m;
        while ((m = re.exec(text)) !== null && m.index < endIndex) count++;
        return count;
    }

    function tableIndexAtLine(text, line) {
        var lines = text.split(/\r?\n/);
        if (line < 0 || line >= lines.length || lines[line].indexOf("|") < 0) return -1;
        var start = line;
        while (start > 0 && lines[start - 1].indexOf("|") >= 0) start--;
        var end = line;
        while (end + 1 < lines.length && lines[end + 1].indexOf("|") >= 0) end++;
        if (end - start < 1 || !/^\s*\|?\s*:?-{2,}/.test(lines[start + 1])) return -1;
        var index = 0;
        for (var i = 0; i < start; i++) {
            if (lines[i].indexOf("|") >= 0 && (i === 0 || lines[i - 1].indexOf("|") < 0) &&
                i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
                index++;
            }
        }
        return index;
    }

    function editObjectAtCursor(only) {
        if (!cm) return;
        var text = cm.getValue();
        var line = cm.getCursor().line;
        var block = fencedBlockAtLine(text, line);
        var status = function (msg) { postMessage({ type: "status", text: msg }); };

        if (block && block.lang === "mermaid") {
            var isSeq = /^\s*sequenceDiagram\b/i.test(block.body);
            if (only === "table" || only === "ui") { status("光标处没有可编辑的" + (only === "table" ? "表格" : "UI 原型")); return; }
            if (only === "sequence" && !isSeq) { status("光标处是流程图，请用「流程图」编辑"); return; }
            if (only === "mermaid" && isSeq) { status("光标处是时序图，请用「时序图」编辑"); return; }
            openMermaidEditor(countFencedBefore(text, block.start, "mermaid"), block.body,
                isSeq ? "sequence" : "flow");
            return;
        }
        if (block && block.lang === "ui") {
            if (only && only !== "ui") { status("光标处是 UI 原型，请用「UI 原型」编辑"); return; }
            openUiEditor(countFencedBefore(text, block.start, "ui"), block.body);
            return;
        }
        var tIndex = tableIndexAtLine(text, line);
        if (tIndex >= 0) {
            if (only && only !== "table") { status("光标处是表格，请用「表格」编辑"); return; }
            openTableEditor(tIndex);
            return;
        }
        if (lastPreviewEditTarget) {
            var target = lastPreviewEditTarget;
            if (target.kind === "mermaid" && (!only || only === "mermaid" || only === "sequence")) {
                var seq = /^\s*sequenceDiagram\b/i.test(target.source);
                if ((only === "sequence" && seq) || (only === "mermaid" && !seq) || !only) {
                    openMermaidEditor(target.index, target.source, seq ? "sequence" : "flow");
                    return;
                }
            } else if (target.kind === "ui" && (!only || only === "ui")) {
                openUiEditor(target.index, target.source);
                return;
            } else if (target.kind === "table" && (!only || only === "table")) {
                openTableEditor(target.index);
                return;
            }
        }
        status(only
            ? "光标处没有可编辑的" + ({ table: "表格", mermaid: "流程图", sequence: "时序图", ui: "UI 原型" }[only] || "对象")
            : "请把光标放在表格或 ```mermaid / ```ui 代码块中，或在预览中点击要编辑的对象");
    }

    /* 预览内 Ctrl+单击（或单击记录目标后点“编辑光标处对象”）直接打开编辑器 */
    document.getElementById("md-body").addEventListener("click", function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var uiBlock = t.closest(".ui-block");
        if (uiBlock) {
            lastPreviewEditTarget = {
                kind: "ui",
                index: parseInt(uiBlock.getAttribute("data-ui-index"), 10),
                source: uiBlock.getAttribute("data-ui-src")
            };
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                openUiEditor(lastPreviewEditTarget.index, lastPreviewEditTarget.source);
            }
            return;
        }
        var node = t.closest(".mermaid");
        if (node) {
            lastPreviewEditTarget = {
                kind: "mermaid",
                index: parseInt(node.getAttribute("data-mermaid-index"), 10),
                source: node.getAttribute("data-mermaid-src")
            };
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                var seq = /^\s*sequenceDiagram\b/i.test(lastPreviewEditTarget.source || "");
                openMermaidEditor(lastPreviewEditTarget.index, lastPreviewEditTarget.source,
                    seq ? "sequence" : "flow");
            }
            return;
        }
        var tableWrap = t.closest(".table-wrap");
        if (tableWrap) {
            lastPreviewEditTarget = {
                kind: "table",
                index: parseInt(tableWrap.getAttribute("data-table-index"), 10),
                source: ""
            };
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                openTableEditor(lastPreviewEditTarget.index);
            }
        }
    }, true);

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
            body.querySelectorAll(".mermaid-edit-btn, .mermaid-zoom-ui, .table-edit-btn, .ui-edit-btn").forEach(function (b) { b.remove(); });
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
            // 图表类对象（流程图 / 时序图）同步缩放
            diagramZoom = z;
            applyDiagramZoom();
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
            openMermaidEditor(null, data.source || null, data.mode || null);
        } else if (data.type === "editObjectAtCursor") {
            editObjectAtCursor(data.only || "");
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
