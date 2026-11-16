// MCP Manager — 浏览器端（client half）。
// 通过 shell 的惰性模块加载器注册；宿主端 index.js 通过 RPC 通道
// `/dsh-mcp-manager` 提供 list / add / toggle / remove / setRemark。
window.__ModuleLoader__.load({
  id: "@local/dsh-mcp-manager",
  factory: function (require) {
    var React = require("react");
    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useRef = React.useRef;
    var useCallback = React.useCallback;

    var NS = "mcpManager";
    // 通道名必须匹配 /^\/[A-Za-z0-9._~-]+$/（以 / 开头，@ 不合法）。
    var CHANNEL = "/dsh-mcp-manager";

    // ---- 本地化字典（内联，注册到 ctx.locale） ----
    var dicts = {
      zh: {
        panel: "MCP",
        title: "MCP",
        refreshAria: "刷新 MCP 服务器列表",
        addMcp: "添加 MCP",
        addFormTitle: "添加 MCP 服务器",
        serverName: "服务器名",
        serverNamePlaceholder: "字母、数字、_ 或 -，不超过 32 个字符",
        transport: "连接方式",
        transportHttp: "streamable-http",
        transportStdio: "stdio",
        url: "URL",
        urlPlaceholder: "https://example.com/mcp",
        headers: "鉴权头（可选）",
        headersPlaceholder: "Authorization: Bearer xxx",
        headersHint: "每行一条「名称: 值」，没有可不填",
        formErrorHeaders: "鉴权头格式应为每行「名称: 值」",
        command: "命令",
        commandPlaceholder: "例如 npx",
        args: "参数",
        argsPlaceholder: "-y @modelcontextprotocol/server-filesystem ./data",
        argsHint: "多个参数用空格或逗号分隔",
        submit: "添加",
        cancel: "取消",
        formErrorName: "服务器名只能包含字母、数字、_ 或 -，且不超过 32 个字符",
        formErrorUrl: "streamable-http 方式需要填写 URL",
        formErrorCommand: "stdio 方式需要填写命令",
        addFailed: "添加失败：{reason}",
        empty: "还没有 MCP。点击「添加 MCP」导入你的第一个 MCP 服务器。",
        loading: "正在加载…",
        loadFailed: "加载失败：{reason}",
        retry: "重试",
        enabled: "已启用",
        disabled: "已停用",
        "phase.active": "运行中",
        "phase.failed": "失败",
        "phase.loading": "加载中",
        "phase.pending": "等待中",
        "phase.unloading": "卸载中",
        phaseUnknown: "状态未知",
        sourcePlugin: "插件静态",
        sourceNative: "原生托管",
        "native.connected": "已连接",
        "native.connecting": "连接中",
        "native.reconnecting": "重连中",
        "native.disabled": "已停用",
        "native.waiting-credentials": "等待凭据",
        "native.closed": "已关闭",
        "native.failed": "失败",
        "native.unknown": "状态未知",
        nativeTools: "· {count} 个工具",
        managedNote: "原生托管，启停/删除请在官方 MCP 设置中操作",
        remarkPlaceholder: "添加备注…",
        remarkAria: "{name} 的备注",
        remarkFailed: "保存备注失败：{reason}",
        toggleAria: "启用或停用 {name}",
        toggleFailed: "切换 {name} 失败：{reason}",
        removeAria: "删除 {name}",
        removeConfirmTitle: "删除 {name}？",
        removeConfirmText: "将移除该 MCP 服务器，此操作不可撤销。",
        removeConfirm: "删除",
        removeFailed: "删除 {name} 失败：{reason}",
        restartRequired: "更改已保存，重启应用后生效。",
        opNotApplied: "操作未完全生效：{message}",
        opNotAppliedShort: "操作未完全生效。",
        dismissNotice: "关闭提示",
        busying: "处理中…",
      },
      en: {
        panel: "MCP",
        title: "MCP",
        refreshAria: "Refresh the MCP server list",
        addMcp: "Add MCP",
        addFormTitle: "Add an MCP server",
        serverName: "Server name",
        serverNamePlaceholder: "Letters, digits, _ or -, up to 32 characters",
        transport: "Transport",
        transportHttp: "streamable-http",
        transportStdio: "stdio",
        url: "URL",
        urlPlaceholder: "https://example.com/mcp",
        headers: "Headers (optional)",
        headersPlaceholder: "Authorization: Bearer xxx",
        headersHint: "One \"Name: value\" per line; leave empty when none",
        formErrorHeaders: "Each header line must be \"Name: value\"",
        command: "Command",
        commandPlaceholder: "e.g. npx",
        args: "Arguments",
        argsPlaceholder: "-y @modelcontextprotocol/server-filesystem ./data",
        argsHint: "Separate arguments with spaces or commas",
        submit: "Add",
        cancel: "Cancel",
        formErrorName: "The server name may only contain letters, digits, _ or -, up to 32 characters",
        formErrorUrl: "A URL is required for streamable-http",
        formErrorCommand: "A command is required for stdio",
        addFailed: "Failed to add: {reason}",
        empty: "No MCP servers yet. Click \u201cAdd MCP\u201d to import your first MCP server.",
        loading: "Loading\u2026",
        loadFailed: "Failed to load: {reason}",
        retry: "Retry",
        enabled: "Enabled",
        disabled: "Disabled",
        "phase.active": "Active",
        "phase.failed": "Failed",
        "phase.loading": "Loading",
        "phase.pending": "Pending",
        "phase.unloading": "Unloading",
        phaseUnknown: "Unknown",
        sourcePlugin: "Static",
        sourceNative: "Native",
        "native.connected": "Connected",
        "native.connecting": "Connecting",
        "native.reconnecting": "Reconnecting",
        "native.disabled": "Disabled",
        "native.waiting-credentials": "Waiting for credentials",
        "native.closed": "Closed",
        "native.failed": "Failed",
        "native.unknown": "Unknown",
        nativeTools: "\u00b7 {count} tools",
        managedNote: "Managed natively; enable or remove it in the official MCP settings",
        remarkPlaceholder: "Add a note\u2026",
        remarkAria: "Note for {name}",
        remarkFailed: "Failed to save note: {reason}",
        toggleAria: "Enable or disable {name}",
        toggleFailed: "Failed to toggle {name}: {reason}",
        removeAria: "Remove {name}",
        removeConfirmTitle: "Remove {name}?",
        removeConfirmText: "This removes the MCP server. This action cannot be undone.",
        removeConfirm: "Remove",
        removeFailed: "Failed to remove {name}: {reason}",
        restartRequired: "Changes saved. Restart the app for them to take effect.",
        opNotApplied: "The operation did not fully apply: {message}",
        opNotAppliedShort: "The operation did not fully apply.",
        dismissNotice: "Dismiss",
        busying: "Working\u2026",
      },
    };

    // ---- 样式：只用主题 token（--dsw-alias-* / --dsw-static-*） ----
    var CSS = [
      ".mcp-mgr-page{display:flex;flex-direction:column;gap:clamp(10px,1.5vw,14px);width:100%;max-width:1280px;margin:0 auto;padding:clamp(12px,2.5vw,24px) clamp(14px,3vw,28px);box-sizing:border-box;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,inherit);font-size:14px;line-height:22px}",
      ".mcp-mgr-header{display:flex;align-items:center;flex-wrap:wrap;gap:10px}",
      ".mcp-mgr-title{margin:0;font-size:18px;font-weight:600;line-height:28px;flex:1 1 auto;min-width:140px}",
      ".mcp-mgr-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;padding:6px 12px;cursor:pointer;font-family:inherit}",
      "@media (hover:hover){.mcp-mgr-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}}",
      ".mcp-mgr-btn:disabled{opacity:.55;cursor:default}",
      ".mcp-mgr-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}",
      ".mcp-mgr-btn-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-static-neutral-00)}",
      "@media (hover:hover){.mcp-mgr-btn-primary:hover:not(:disabled){background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}}",
      ".mcp-mgr-btn-danger-solid{background:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-static-neutral-00)}",
      ".mcp-mgr-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;box-sizing:border-box;border:1px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}",
      "@media (hover:hover){.mcp-mgr-iconbtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}}",
      ".mcp-mgr-iconbtn:disabled{opacity:.55;cursor:default}",
      ".mcp-mgr-iconbtn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}",
      ".mcp-mgr-iconbtn-danger{color:var(--dsw-alias-state-error-primary)}",
      "@media (hover:hover){.mcp-mgr-iconbtn-danger:hover:not(:disabled){color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-interactive-bg-hover)}}",
      ".mcp-mgr-notices{display:flex;flex-direction:column;gap:8px}",
      ".mcp-mgr-notice{display:flex;align-items:flex-start;gap:8px;border:1px solid var(--dsw-alias-state-warn-primary);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);padding:8px 10px;font-size:13px;line-height:20px}",
      ".mcp-mgr-notice-error{border-color:var(--dsw-alias-state-error-primary)}",
      ".mcp-mgr-noticeText{flex:1;min-width:0}",
      ".mcp-mgr-noticeClose{width:24px;height:24px;flex:none;font-size:16px;line-height:1;color:var(--dsw-alias-label-secondary)}",
      ".mcp-mgr-form{display:flex;flex-direction:column;gap:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);padding:14px}",
      ".mcp-mgr-formTitle{margin:0;font-size:14px;font-weight:600;line-height:22px}",
      ".mcp-mgr-field{display:flex;flex-direction:column;gap:4px;min-width:0}",
      ".mcp-mgr-label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
      ".mcp-mgr-input{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;padding:6px 10px;font-family:inherit}",
      ".mcp-mgr-input:focus{border-color:var(--dsw-alias-state-business-primary);outline:none}",
      ".mcp-mgr-input::placeholder{color:var(--dsw-alias-label-caption)}",
      ".mcp-mgr-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}",
      ".mcp-mgr-radioRow{display:flex;flex-wrap:wrap;gap:8px 20px}",
      ".mcp-mgr-radio{display:inline-flex;align-items:center;gap:6px;font-size:13px;line-height:20px;cursor:pointer}",
      ".mcp-mgr-radio input{margin:0}",
      ".mcp-mgr-formActions{display:flex;gap:8px;justify-content:flex-end}",
      ".mcp-mgr-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}",
      ".mcp-mgr-list{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);overflow:hidden}",
      ".mcp-mgr-item{border-bottom:1px solid var(--dsw-alias-border-l1)}",
      ".mcp-mgr-item:last-child{border-bottom:none}",
      ".mcp-mgr-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;padding:12px 14px}",
      ".mcp-mgr-rowMain{flex:1 1 240px;min-width:180px;display:flex;flex-direction:column;gap:3px}",
      ".mcp-mgr-rowActions{display:flex;align-items:center;gap:8px;margin-left:auto;flex:none}",
      ".mcp-mgr-name{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0}",
      ".mcp-mgr-nameText{font-size:14px;font-weight:600;line-height:20px;overflow-wrap:anywhere}",
      ".mcp-mgr-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}",
      ".mcp-mgr-badge{display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:0 8px;font-size:11px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
      ".mcp-mgr-badge-on{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}",
      ".mcp-mgr-badge-off{color:var(--dsw-alias-label-caption)}",
      ".mcp-mgr-badge-failed{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}",
      ".mcp-mgr-remarkWrap{display:flex;flex-direction:column;gap:2px;margin-top:2px}",
      ".mcp-mgr-remark{box-sizing:border-box;width:100%;border:1px solid transparent;border-radius:var(--dsw-radius-xs);background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;padding:2px 6px;font-family:inherit}",
      "@media (hover:hover){.mcp-mgr-remark:hover:not(:disabled){background:var(--dsw-alias-bg-base)}}",
      ".mcp-mgr-remark:focus{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);outline:none}",
      ".mcp-mgr-remark:disabled{opacity:.6}",
      ".mcp-mgr-switch{position:relative;flex:none;width:38px;height:22px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-base);cursor:pointer;transition:background .15s ease,border-color .15s ease}",
      ".mcp-mgr-switch[aria-checked='true']{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}",
      ".mcp-mgr-switch:disabled{opacity:.6;cursor:default}",
      ".mcp-mgr-switch:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}",
      ".mcp-mgr-switchKnob{position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-secondary);transition:transform .15s ease,background .15s ease}",
      ".mcp-mgr-switch[aria-checked='true'] .mcp-mgr-switchKnob{transform:translateX(16px);background:var(--dsw-static-neutral-00)}",
      ".mcp-mgr-switchSpinner{position:absolute;top:4px;left:4px;width:12px;height:12px}",
      ".mcp-mgr-spinner{display:inline-block;box-sizing:border-box;width:14px;height:14px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:mcp-mgr-spin .8s linear infinite}",
      "@keyframes mcp-mgr-spin{to{transform:rotate(360deg)}}",
      ".mcp-mgr-confirm{display:flex;align-items:center;flex-wrap:wrap;gap:8px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);padding:8px 14px;font-size:13px;line-height:20px}",
      ".mcp-mgr-confirmText{flex:1;min-width:0;color:var(--dsw-alias-label-primary)}",
      ".mcp-mgr-empty{display:flex;flex-direction:column;align-items:center;gap:12px;padding:36px 16px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}",
      ".mcp-mgr-loading{display:flex;align-items:center;gap:8px;padding:16px 14px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}",
      ".mcp-mgr-errorBox{display:flex;flex-direction:column;align-items:flex-start;gap:10px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);padding:14px}",
      "@media (max-width:560px){.mcp-mgr-page{padding:12px}.mcp-mgr-row{padding:10px 12px}.mcp-mgr-title{font-size:16px}}",
    ].join("\n");

    // ---- RPC 辅助：统一封装 ok/error 信封 ----
    function rpcCall(ctx, method, args) {
      var connection = ctx.get("connection");
      var rpc = connection && connection.rpc;
      if (!rpc || typeof rpc.call !== "function") {
        return Promise.reject(new Error("connection.rpc is unavailable"));
      }
      var payload = args === undefined || args === null ? {} : args;
      return rpc.call(CHANNEL, method, payload).then(function (result) {
        if (result && result.ok === true) return result.value;
        var failure = result && result.error ? result.error : {};
        var error = new Error(failure.message || "RPC call failed");
        error.code = failure.code;
        error.details = failure.details;
        throw error;
      });
    }

    function errorMessage(error) {
      if (error && error.message) return error.message;
      return String(error);
    }

    // ---- 样式注入：优先 Builtin styles.insert，退化到自管 <style> ----
    function installStyles(ctx, css) {
      var styles = null;
      try {
        styles = ctx.get("styles");
      } catch (_error) {
        styles = null;
      }
      if (styles && typeof styles.insert === "function") {
        return styles.insert(css);
      }
      var el = document.createElement("style");
      el.setAttribute("data-plugin", "@local/dsh-mcp-manager");
      el.textContent = css;
      document.head.appendChild(el);
      return function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      };
    }

    // ---- 侧边栏图标：三节点网络（原创，随 currentColor 变色） ----
    function McpPanelIcon(props) {
      var size = typeof props.size === "number" && props.size > 0 ? props.size : 16;
      return h(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 24 24",
          fill: "none",
          "aria-hidden": true,
          focusable: false,
        },
        [
          h("path", {
            key: "edge-a",
            d: "M11.2 8.3 7 15.2",
            stroke: "currentColor",
            strokeWidth: 1.7,
            strokeLinecap: "round",
          }),
          h("path", {
            key: "edge-b",
            d: "m12.8 8.3 4.2 6.9",
            stroke: "currentColor",
            strokeWidth: 1.7,
            strokeLinecap: "round",
          }),
          h("path", {
            key: "edge-c",
            d: "M8.2 17.6h7.6",
            stroke: "currentColor",
            strokeWidth: 1.7,
            strokeLinecap: "round",
          }),
          h("circle", { key: "hub", cx: 12, cy: 5.8, r: 2.7, fill: "currentColor" }),
          h("circle", { key: "left", cx: 5.6, cy: 17.6, r: 2.7, fill: "currentColor" }),
          h("circle", { key: "right", cx: 18.4, cy: 17.6, r: 2.7, fill: "currentColor" }),
        ]
      );
    }

    // ---- 小图标 ----
    function RefreshIcon() {
      // 标准 Material 风格「刷新」循环箭头（填充式，识别度高于细线箭头）。
      return h(
        "svg",
        { width: 16, height: 16, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true, focusable: false },
        h("path", {
          d: "M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
        })
      );
    }

    function TrashIcon() {
      return h(
        "svg",
        { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true, focusable: false },
        [
          h("path", {
            key: "lid",
            d: "M3.6 5.6h8.8",
            stroke: "currentColor",
            strokeWidth: 1.3,
            strokeLinecap: "round",
          }),
          h("path", {
            key: "handle",
            d: "M6.4 5.6V4.2a1.4 1.4 0 0 1 1.4-1.4h.4a1.4 1.4 0 0 1 1.4 1.4v1.4",
            stroke: "currentColor",
            strokeWidth: 1.3,
            strokeLinecap: "round",
            strokeLinejoin: "round",
          }),
          h("path", {
            key: "bin",
            d: "m4.6 5.6.6 6.8a1.6 1.6 0 0 0 1.6 1.5h2.4a1.6 1.6 0 0 0 1.6-1.5l.6-6.8",
            stroke: "currentColor",
            strokeWidth: 1.3,
            strokeLinecap: "round",
            strokeLinejoin: "round",
          }),
          h("path", {
            key: "line-l",
            d: "M6.8 8.4v3.2",
            stroke: "currentColor",
            strokeWidth: 1.3,
            strokeLinecap: "round",
          }),
          h("path", {
            key: "line-r",
            d: "M9.2 8.4v3.2",
            stroke: "currentColor",
            strokeWidth: 1.3,
            strokeLinecap: "round",
          }),
        ]
      );
    }

    function Spinner(props) {
      return h("span", {
        className: "mcp-mgr-spinner" + (props && props.className ? " " + props.className : ""),
        "aria-hidden": true,
      });
    }

    // ---- 顶部提示条 ----
    function NoticeList(props) {
      var notices = props.notices || [];
      if (notices.length === 0) return null;
      return h(
        "div",
        { className: "mcp-mgr-notices" },
        notices.map(function (notice) {
          return h(
            "div",
            {
              key: notice.id,
              className: "mcp-mgr-notice" + (notice.kind === "error" ? " mcp-mgr-notice-error" : ""),
              role: notice.kind === "error" ? "alert" : "status",
            },
            h("span", { className: "mcp-mgr-noticeText" }, notice.text),
            h(
              "button",
              {
                type: "button",
                className: "mcp-mgr-iconbtn mcp-mgr-noticeClose",
                "aria-label": props.t("dismissNotice"),
                onClick: function () {
                  props.onDismiss(notice.id);
                },
              },
              "\u00d7"
            )
          );
        })
      );
    }

    // ---- 添加表单 ----
    function AddForm(props) {
      var t = props.t;
      var _serverName = useState("");
      var serverName = _serverName[0];
      var setServerName = _serverName[1];
      var _transport = useState("streamable-http");
      var transport = _transport[0];
      var setTransport = _transport[1];
      var _url = useState("");
      var url = _url[0];
      var setUrl = _url[1];
      var _headers = useState("");
      var headers = _headers[0];
      var setHeaders = _headers[1];
      var _command = useState("");
      var command = _command[0];
      var setCommand = _command[1];
      var _args = useState("");
      var args = _args[0];
      var setArgs = _args[1];
      var _localError = useState(null);
      var localError = _localError[0];
      var setLocalError = _localError[1];

      var submit = function (event) {
        event.preventDefault();
        var name = serverName.trim();
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) {
          setLocalError(t("formErrorName"));
          return;
        }
        var payload = { serverName: name, transport: transport };
        if (transport === "streamable-http") {
          var trimmedUrl = url.trim();
          if (trimmedUrl === "") {
            setLocalError(t("formErrorUrl"));
            return;
          }
          payload.url = trimmedUrl;
          var headerMap = {};
          var headerLines = headers.split(/\r?\n/);
          for (var index = 0; index < headerLines.length; index++) {
            var line = headerLines[index].trim();
            if (line === "") continue;
            var colon = line.indexOf(":");
            if (colon <= 0) {
              setLocalError(t("formErrorHeaders"));
              return;
            }
            headerMap[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
          }
          if (Object.keys(headerMap).length > 0) payload.headers = headerMap;
        } else {
          var trimmedCommand = command.trim();
          if (trimmedCommand === "") {
            setLocalError(t("formErrorCommand"));
            return;
          }
          payload.command = trimmedCommand;
          payload.args = args
            .split(/[\s,]+/)
            .filter(function (piece) {
              return piece !== "";
            });
        }
        setLocalError(null);
        props.onSubmit(payload);
      };

      return h(
        "form",
        { className: "mcp-mgr-form", onSubmit: submit, "aria-label": t("addFormTitle") },
        h("h2", { className: "mcp-mgr-formTitle" }, t("addFormTitle")),
        h(
          "label",
          { className: "mcp-mgr-field" },
          h("span", { className: "mcp-mgr-label" }, t("serverName")),
          h("input", {
            className: "mcp-mgr-input",
            type: "text",
            value: serverName,
            placeholder: t("serverNamePlaceholder"),
            maxLength: 32,
            autoComplete: "off",
            disabled: props.busy,
            onChange: function (event) {
              setServerName(event.target.value);
            },
          })
        ),
        h(
          "fieldset",
          { className: "mcp-mgr-field", style: { border: "none", padding: 0, margin: 0 } },
          h("legend", { className: "mcp-mgr-label" }, t("transport")),
          h(
            "div",
            { className: "mcp-mgr-radioRow" },
            h(
              "label",
              { className: "mcp-mgr-radio" },
              h("input", {
                type: "radio",
                name: "mcp-mgr-add-transport",
                value: "streamable-http",
                checked: transport === "streamable-http",
                disabled: props.busy,
                onChange: function () {
                  setTransport("streamable-http");
                },
              }),
              t("transportHttp")
            ),
            h(
              "label",
              { className: "mcp-mgr-radio" },
              h("input", {
                type: "radio",
                name: "mcp-mgr-add-transport",
                value: "stdio",
                checked: transport === "stdio",
                disabled: props.busy,
                onChange: function () {
                  setTransport("stdio");
                },
              }),
              t("transportStdio")
            )
          )
        ),
        transport === "streamable-http"
          ? [
              h(
                "label",
                { className: "mcp-mgr-field", key: "url" },
                h("span", { className: "mcp-mgr-label" }, t("url")),
                h("input", {
                  className: "mcp-mgr-input",
                  type: "text",
                  value: url,
                  placeholder: t("urlPlaceholder"),
                  autoComplete: "off",
                  spellCheck: false,
                  disabled: props.busy,
                  onChange: function (event) {
                    setUrl(event.target.value);
                  },
                })
              ),
              h(
                "label",
                { className: "mcp-mgr-field", key: "headers" },
                h("span", { className: "mcp-mgr-label" }, t("headers")),
                h("textarea", {
                  className: "mcp-mgr-input",
                  value: headers,
                  placeholder: t("headersPlaceholder"),
                  rows: 2,
                  autoComplete: "off",
                  spellCheck: false,
                  disabled: props.busy,
                  onChange: function (event) {
                    setHeaders(event.target.value);
                  },
                }),
                h("span", { className: "mcp-mgr-hint" }, t("headersHint"))
              ),
            ]
          : null,
        transport === "stdio"
          ? h(
              "label",
              { className: "mcp-mgr-field" },
              h("span", { className: "mcp-mgr-label" }, t("command")),
              h("input", {
                className: "mcp-mgr-input",
                type: "text",
                value: command,
                placeholder: t("commandPlaceholder"),
                autoComplete: "off",
                spellCheck: false,
                disabled: props.busy,
                onChange: function (event) {
                  setCommand(event.target.value);
                },
              })
            )
          : null,
        transport === "stdio"
          ? h(
              "label",
              { className: "mcp-mgr-field" },
              h("span", { className: "mcp-mgr-label" }, t("args")),
              h("input", {
                className: "mcp-mgr-input",
                type: "text",
                value: args,
                placeholder: t("argsPlaceholder"),
                autoComplete: "off",
                spellCheck: false,
                disabled: props.busy,
                onChange: function (event) {
                  setArgs(event.target.value);
                },
              }),
              h("span", { className: "mcp-mgr-hint" }, t("argsHint"))
            )
          : null,
        localError !== null || props.error !== null
          ? h(
              "div",
              { className: "mcp-mgr-error", role: "alert" },
              props.error !== null ? props.error : localError
            )
          : null,
        h(
          "div",
          { className: "mcp-mgr-formActions" },
          h(
            "button",
            {
              type: "button",
              className: "mcp-mgr-btn",
              disabled: props.busy,
              onClick: props.onCancel,
            },
            t("cancel")
          ),
          h(
            "button",
            { type: "submit", className: "mcp-mgr-btn mcp-mgr-btn-primary", disabled: props.busy },
            props.busy ? [h(Spinner, { key: "spinner" }), t("busying")] : t("submit")
          )
        )
      );
    }

    // ---- 备注编辑：失焦 / 回车保存 ----
    function RemarkField(props) {
      var server = props.server;
      var t = props.t;
      var _text = useState(server.remark == null ? "" : server.remark);
      var text = _text[0];
      var setText = _text[1];
      var _saving = useState(false);
      var saving = _saving[0];
      var setSaving = _saving[1];
      var _error = useState(null);
      var error = _error[0];
      var setError = _error[1];

      useEffect(
        function () {
          setText(server.remark == null ? "" : server.remark);
          setError(null);
        },
        [server.id, server.remark]
      );

      var commit = function () {
        var next = text.trim();
        if (next === (server.remark == null ? "" : server.remark)) return;
        setSaving(true);
        setError(null);
        props
          .onSave(server, next)
          .then(function () {
            setSaving(false);
          })
          .catch(function (saveError) {
            setSaving(false);
            setError(errorMessage(saveError));
          });
      };

      return h(
        "div",
        { className: "mcp-mgr-remarkWrap" },
        h("input", {
          className: "mcp-mgr-remark",
          type: "text",
          value: text,
          placeholder: t("remarkPlaceholder"),
          "aria-label": t("remarkAria", { name: server.serverName }),
          disabled: saving,
          onChange: function (event) {
            setText(event.target.value);
          },
          onKeyDown: function (event) {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          },
          onBlur: commit,
        }),
        error !== null
          ? h("span", { className: "mcp-mgr-error", role: "alert" }, t("remarkFailed", { reason: error }))
          : null
      );
    }

    // ---- 自绘删除确认条 ----
    function ConfirmBar(props) {
      var t = props.t;
      return h(
        "div",
        {
          className: "mcp-mgr-confirm",
          role: "group",
          "aria-label": t("removeConfirmTitle", { name: props.server.serverName }),
        },
        h("span", { className: "mcp-mgr-confirmText" }, t("removeConfirmText")),
        h(
          "button",
          {
            type: "button",
            className: "mcp-mgr-btn",
            disabled: props.busy,
            onClick: props.onCancel,
          },
          t("cancel")
        ),
        h(
          "button",
          {
            type: "button",
            className: "mcp-mgr-btn mcp-mgr-btn-danger-solid",
            disabled: props.busy,
            onClick: props.onConfirm,
          },
          props.busy ? [h(Spinner, { key: "spinner" }), t("busying")] : t("removeConfirm")
        )
      );
    }

    var PHASE_KEYS = {
      active: "phase.active",
      failed: "phase.failed",
      loading: "phase.loading",
      pending: "phase.pending",
      unloading: "phase.unloading",
    };

    function phaseLabel(t, phase) {
      if (phase == null) return null;
      var key = PHASE_KEYS[phase];
      return key ? t(key) : t("phaseUnknown");
    }

    function transportLine(server) {
      if (server.transport === "streamable-http") {
        return "streamable-http \u00b7 " + (server.url || "");
      }
      var argsText =
        Array.isArray(server.args) && server.args.length > 0 ? " " + server.args.join(" ") : "";
      return "stdio \u00b7 " + (server.command || "") + argsText;
    }

    // 原生管理器（0.2.2+）托管服务器的状态文案。
    function nativeStatusLabel(t, server) {
      var state = server.nativeState || "unknown";
      var key =
        state === "connected" ? "native.connected" :
        state === "connecting" ? "native.connecting" :
        state === "reconnecting" ? "native.reconnecting" :
        state === "disabled" ? "native.disabled" :
        state === "waiting-credentials" ? "native.waiting-credentials" :
        state === "closed" ? "native.closed" :
        state === "failed" ? "native.failed" : "native.unknown";
      var text = t(key);
      if (typeof server.nativeToolCount === "number") text = text + " " + t("nativeTools", { count: server.nativeToolCount });
      return text;
    }

    // ---- 主页面 ----
    function createPage(ctx, fallbackT) {
      return function McpPage(props) {
        var t = typeof props.t === "function" ? props.t : fallbackT;

        var _servers = useState(null);
        var servers = _servers[0];
        var setServers = _servers[1];
        var _listError = useState(null);
        var listError = _listError[0];
        var setListError = _listError[1];
        var _refreshing = useState(false);
        var refreshing = _refreshing[0];
        var setRefreshing = _refreshing[1];
        var _notices = useState([]);
        var notices = _notices[0];
        var setNotices = _notices[1];
        var _formOpen = useState(false);
        var formOpen = _formOpen[0];
        var setFormOpen = _formOpen[1];
        var _formBusy = useState(false);
        var formBusy = _formBusy[0];
        var setFormBusy = _formBusy[1];
        var _formError = useState(null);
        var formError = _formError[0];
        var setFormError = _formError[1];
        var _toggleBusy = useState({});
        var toggleBusy = _toggleBusy[0];
        var setToggleBusy = _toggleBusy[1];
        var _removeId = useState(null);
        var removeId = _removeId[0];
        var setRemoveId = _removeId[1];
        var _removeBusy = useState(false);
        var removeBusy = _removeBusy[0];
        var setRemoveBusy = _removeBusy[1];
        var noticeSeq = useRef(0);

        var pushNotice = useCallback(function (kind, text) {
          noticeSeq.current += 1;
          var id = noticeSeq.current;
          setNotices(function (prev) {
            return prev.concat([{ id: id, kind: kind, text: text }]);
          });
        }, []);

        var dismissNotice = useCallback(function (id) {
          setNotices(function (prev) {
            return prev.filter(function (notice) {
              return notice.id !== id;
            });
          });
        }, []);

        var noteFromResult = useCallback(
          function (value) {
            if (!value || typeof value !== "object") return null;
            if (value.applied !== true) {
              var message =
                typeof value.message === "string" && value.message !== "" ? value.message : "";
              return message === "" ? t("opNotAppliedShort") : t("opNotApplied", { message: message });
            }
            if (value.application === "restart-required") return t("restartRequired");
            return null;
          },
          [t]
        );

        var load = useCallback(function () {
          setRefreshing(true);
          setListError(null);
          return rpcCall(ctx, "list", {})
            .then(function (value) {
              var list = value && Array.isArray(value.servers) ? value.servers : [];
              setServers(list);
            })
            .catch(function (error) {
              setListError(errorMessage(error));
            })
            .then(function () {
              setRefreshing(false);
            });
        }, []);

        useEffect(
          function () {
            load();
          },
          [load]
        );

        var showResultNotice = useCallback(
          function (value) {
            var note = noteFromResult(value);
            if (note !== null) {
              pushNotice("warn", note);
              return;
            }
            if (value && typeof value.message === "string" && value.message !== "") {
              pushNotice("info", value.message);
            }
          },
          [noteFromResult]
        );

        var handleToggle = function (server) {
          var next = !server.enabled;
          setToggleBusy(function (prev) {
            var busy = {};
            for (var key in prev) busy[key] = prev[key];
            busy[server.id] = true;
            return busy;
          });
          rpcCall(ctx, "toggle", { id: server.id, enabled: next })
            .then(function (value) {
              showResultNotice(value);
              return load();
            })
            .catch(function (error) {
              pushNotice(
                "error",
                t("toggleFailed", { name: server.serverName, reason: errorMessage(error) })
              );
            })
            .then(function () {
              setToggleBusy(function (prev) {
                var busy = {};
                for (var key in prev) busy[key] = prev[key];
                delete busy[server.id];
                return busy;
              });
            });
        };

        var handleRemove = function (server) {
          setRemoveBusy(true);
          rpcCall(ctx, "remove", { id: server.id })
            .then(function (value) {
              setRemoveId(null);
              showResultNotice(value);
              return load();
            })
            .catch(function (error) {
              pushNotice(
                "error",
                t("removeFailed", { name: server.serverName, reason: errorMessage(error) })
              );
            })
            .then(function () {
              setRemoveBusy(false);
            });
        };

        var handleAdd = function (payload) {
          setFormBusy(true);
          setFormError(null);
          rpcCall(ctx, "add", payload)
            .then(function (value) {
              setFormOpen(false);
              showResultNotice(value);
              return load();
            })
            .catch(function (error) {
              setFormError(t("addFailed", { reason: errorMessage(error) }));
            })
            .then(function () {
              setFormBusy(false);
            });
        };

        var saveRemark = function (server, remark) {
          return rpcCall(ctx, "setRemark", {
            key: server.remarkKey || server.id,
            id: server.id,
            remark: remark,
          });
        };

        var serverRows = [];
        if (servers !== null) {
          servers.forEach(function (server) {
            var isNative = server.source === "native";
            var enabled = server.enabled === true;
            var busy = toggleBusy[server.id] === true;
            var phaseText = isNative ? null : phaseLabel(t, server.phase);
            var statusBadgeClass = isNative
              ? "mcp-mgr-badge" +
                (server.nativeState === "failed" || server.nativeState === "waiting-credentials"
                  ? " mcp-mgr-badge-failed"
                  : server.nativeState === "connected"
                    ? " mcp-mgr-badge-on"
                    : server.nativeState === "disabled"
                      ? " mcp-mgr-badge-off"
                      : "")
              : "mcp-mgr-badge" + (server.phase === "failed" ? " mcp-mgr-badge-failed" : "");
            var actions = [];
            actions.push(
              h(
                "button",
                {
                  key: "switch",
                  type: "button",
                  role: "switch",
                  "aria-checked": enabled,
                  "aria-busy": busy ? true : undefined,
                  className: "mcp-mgr-switch",
                  disabled: busy,
                  "aria-label": t("toggleAria", { name: server.serverName }),
                  title: t("toggleAria", { name: server.serverName }),
                  onClick: function () {
                    handleToggle(server);
                  },
                },
                busy
                  ? h(Spinner, { className: "mcp-mgr-switchSpinner" })
                  : h("span", { className: "mcp-mgr-switchKnob", "aria-hidden": true })
              )
            );
            actions.push(
              h(
                "button",
                {
                  key: "remove",
                  type: "button",
                  className: "mcp-mgr-iconbtn mcp-mgr-iconbtn-danger",
                  "aria-label": t("removeAria", { name: server.serverName }),
                  title: t("removeAria", { name: server.serverName }),
                  onClick: function () {
                    setRemoveId(server.id);
                  },
                },
                h(TrashIcon)
              )
            );
            serverRows.push(
              h(
                "div",
                { key: server.id, className: "mcp-mgr-item" },
                h(
                  "div",
                  { className: "mcp-mgr-row" },
                  h(
                    "div",
                    { className: "mcp-mgr-rowMain" },
                    h(
                      "div",
                      { className: "mcp-mgr-name" },
                      h("span", { className: "mcp-mgr-nameText" }, server.serverName),
                      h(
                        "span",
                        { className: "mcp-mgr-badge" },
                        isNative ? t("sourceNative") : t("sourcePlugin")
                      ),
                      h(
                        "span",
                        { className: "mcp-mgr-badge" + (enabled ? " mcp-mgr-badge-on" : " mcp-mgr-badge-off") },
                        enabled ? t("enabled") : t("disabled")
                      ),
                      isNative
                        ? h("span", { className: statusBadgeClass }, nativeStatusLabel(t, server))
                        : enabled && phaseText !== null
                          ? h("span", { className: statusBadgeClass }, phaseText)
                          : null
                    ),
                    h(
                      "div",
                      { className: "mcp-mgr-meta" },
                      server.transport === "native" ? t("sourceNative") : transportLine(server)
                    ),
                    h(RemarkField, { server: server, t: t, onSave: saveRemark })
                  ),
                  h("div", { className: "mcp-mgr-rowActions" }, actions)
                ),
                removeId === server.id
                  ? h(ConfirmBar, {
                      server: server,
                      t: t,
                      busy: removeBusy,
                      onCancel: function () {
                        setRemoveId(null);
                      },
                      onConfirm: function () {
                        handleRemove(server);
                      },
                    })
                  : null
              )
            );
          });
        }

        var content;
        if (servers === null && listError === null) {
          content = h(
            "div",
            { className: "mcp-mgr-loading", role: "status" },
            h(Spinner),
            t("loading")
          );
        } else if (servers === null) {
          content = h(
            "div",
            { className: "mcp-mgr-errorBox", role: "alert" },
            h("span", null, t("loadFailed", { reason: listError })),
            h(
              "button",
              { type: "button", className: "mcp-mgr-btn", disabled: refreshing, onClick: load },
              t("retry")
            )
          );
        } else if (servers.length === 0) {
          content = h(
            "div",
            { className: "mcp-mgr-empty" },
            h("span", null, t("empty")),
            h(
              "button",
              {
                type: "button",
                className: "mcp-mgr-btn mcp-mgr-btn-primary",
                onClick: function () {
                  setFormOpen(true);
                },
              },
              t("addMcp")
            )
          );
        } else {
          content = h("div", { className: "mcp-mgr-list" }, serverRows);
        }

        return h(
          "div",
          { className: "mcp-mgr-page" },
          h(
            "div",
            { className: "mcp-mgr-header" },
            h("h1", { className: "mcp-mgr-title" }, t("title")),
            h(
              "button",
              {
                type: "button",
                className: "mcp-mgr-iconbtn",
                "aria-label": t("refreshAria"),
                title: t("refreshAria"),
                disabled: refreshing,
                onClick: load,
              },
              refreshing ? h(Spinner) : h(RefreshIcon)
            ),
            h(
              "button",
              {
                type: "button",
                className: "mcp-mgr-btn mcp-mgr-btn-primary",
                "aria-expanded": formOpen,
                onClick: function () {
                  setFormOpen(function (open) {
                    return !open;
                  });
                },
              },
              t("addMcp")
            )
          ),
          h(NoticeList, { notices: notices, t: t, onDismiss: dismissNotice }),
          formOpen
            ? h(AddForm, {
                t: t,
                busy: formBusy,
                error: formError,
                onSubmit: handleAdd,
                onCancel: function () {
                  setFormOpen(false);
                  setFormError(null);
                },
              })
            : null,
          servers !== null && listError !== null
            ? h(
                "div",
                { className: "mcp-mgr-notice mcp-mgr-notice-error", role: "alert" },
                h("span", { className: "mcp-mgr-noticeText" }, t("loadFailed", { reason: listError }))
              )
            : null,
          content
        );
      };
    }

    // ---- 插件本体 ----
    function apply(ctx) {
      ctx.effect(function () {
        return ctx.locale.register(NS, dicts);
      }, "mcp-manager: locale dictionaries");
      var t = ctx.locale.bind(NS);
      ctx.effect(function () {
        return installStyles(ctx, CSS);
      }, "mcp-manager: stylesheet");

      var Page = createPage(ctx, t);
      var disposers = [];
      disposers.push(
        ctx.slots.inject("sidebar.panellist", function () {
          return ctx.slots.register(
            {
              name: "sidebar.panellist",
              id: "mcp",
              order: 20,
              label: function () {
                return t("panel");
              },
              locale: NS,
            },
            McpPanelIcon
          );
        })
      );
      disposers.push(
        ctx.slots.inject("main", function () {
          return ctx.slots.register(
            {
              name: "main",
              key: "mcp",
              locale: NS,
            },
            Page
          );
        })
      );
      return function () {
        disposers.forEach(function (dispose) {
          if (typeof dispose === "function") dispose();
          else if (dispose && typeof dispose.then === "function") {
            dispose
              .then(function (cleanup) {
                if (typeof cleanup === "function") cleanup();
              })
              .catch(function () {
                // 清理失败可忽略
              });
          }
        });
      };
    }

    return { inject: ["slots", "locale", "connection"], apply: apply };
  },
});
