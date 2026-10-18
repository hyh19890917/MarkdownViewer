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

    var md = window.markdownit({
        html: false,
        linkify: true,
        typographer: true,
        breaks: false,
        highlight: function (code, lang) {
            var esc = code
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;");
            return '<pre class="code-block"><code class="language-' +
                (lang || "") + '">' + esc + "</code></pre>";
        }
    });

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
            if (src && !/^([a-z][a-z0-9+.-]*:)?\/\//i.test(src) &&
                src.indexOf("data:") !== 0 && src.indexOf("//") !== 0) {
                var rel = src.replace(/^\.\//, "").replace(/\\/g, "/");
                token.attrs[srcIndex][1] = "https://mdfile.local/" + encodeURI(rel);
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
    var buffers = {};           // tabId -> { text, dirty, editScroll, cursor, previewScroll }
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
        if (!b.dirty) {
            b.dirty = true;
            postMessage({ type: "dirty", tabId: currentTabId, dirty: true });
        }
        scheduleRender();
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

    /* ===================== 渲染 ===================== */
    function renderMarkdown(source, tabId, restoreScroll) {
        var tokens = md.parse(source, {});
        var used = {};
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
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }

        // 带协议的链接（http/mailto 等）已由 target=_blank 交给 C# 用系统浏览器打开
        if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return;

        e.preventDefault();
        postMessage({ type: "openLink", tabId: currentTabId, href: href });
    });

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
        // CodeMirror 主题：基础 mdview + 配色后缀
        var suffix = mode === "dark" ? "dark" : mode === "green" ? "green" : "";
        cm.setOption("theme", suffix ? "mdview " + suffix : "mdview");
    }

    function setEditorSilent(text) {
        suppressChange = true;
        cm.setValue(text);
        cm.clearHistory();
        suppressChange = false;
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

    /* ===================== C# -> JS 消息 ===================== */
    window.chrome.webview.addEventListener("message", function (ev) {
        var data = ev.data;
        if (!data || typeof data !== "object") return;

        if (data.type === "load") {
            // 记录旧标签的滚动位置（编辑独占视图时预览隐藏，保留原记录）
            if (currentTabId && buffers[currentTabId]) {
                buffers[currentTabId].editScroll = cm.getScrollInfo();
                buffers[currentTabId].cursor = cm.getCursor();
                if (viewMode !== "edit") {
                    buffers[currentTabId].previewScroll = previewPane.scrollTop;
                }
            }

            currentTabId = data.tabId || null;
            // 新文档加载后由预览位置决定目录高亮（分栏/预览模式）
            activeDriver = viewMode === "edit" ? "editor" : "preview";
            previewSpySilentUntil = 0;
            scrollSyncPausedUntil = Date.now() + 300;

            // reset=true：重新加载/另存为，丢弃旧缓冲区
            if (currentTabId && data.reset) delete buffers[currentTabId];

            if (currentTabId && !buffers[currentTabId]) {
                buffers[currentTabId] = {
                    text: data.text || "",
                    dirty: !!data.dirty,
                    editScroll: null,
                    cursor: null,
                    previewScroll: data.initialScroll || 0
                };
            } else if (currentTabId && data.editText !== undefined && data.editText !== null) {
                // 跨窗口带来的编辑内容
                buffers[currentTabId].text = data.editText;
                buffers[currentTabId].dirty = !!data.dirty;
            }

            var b = currentTabId ? buffers[currentTabId] : null;
            if (b) {
                setEditorSilent(b.text);
                renderMarkdown(b.text, currentTabId, data.initialScroll || b.previewScroll || 0);
                if (b.editScroll) cm.scrollTo(b.editScroll.left, b.editScroll.top);
                if (b.cursor) cm.setCursor(b.cursor);
            }
        } else if (data.type === "scrollTo") {
            scrollToHeading(data.id);
        } else if (data.type === "theme") {
            applyTheme(data.mode);
        } else if (data.type === "view") {
            setView(data.mode);
        } else if (data.type === "saved") {
            // 保存成功：清脏标记
            var sb = buffers[data.tabId];
            if (sb) sb.dirty = false;
        } else if (data.type === "dropTab") {
            // 标签已关闭/已移交给其他窗口：释放缓冲区，避免内存泄漏
            if (data.tabId) delete buffers[data.tabId];
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

    window.addEventListener("keydown", function (e) {
        var t = e.target;
        if (!(t && t.closest && t.closest(".CodeMirror"))) onPreviewUserScroll();
    });

    // 焦点不在 CodeMirror 中时（如点击预览/目录）也能用 Ctrl+S 保存
    // Ctrl+W 关闭当前标签；Ctrl+Tab / Ctrl+Shift+Tab 切换标签
    window.addEventListener("keydown", function (e) {
        if (!(e.ctrlKey || e.metaKey)) return;
        var t = e.target;
        var inEditor = !!(t && t.closest && t.closest(".CodeMirror"));

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
        if (e.key === "Tab") {
            e.preventDefault();
            postMessage({ type: "switchTab", delta: e.shiftKey ? -1 : 1 });
        }
    });
})();
