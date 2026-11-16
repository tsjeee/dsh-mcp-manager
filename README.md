# dsh-mcp-manager

DeepSeek Harness（DSH）插件：在 Web 界面的侧边栏提供 **MCP 管理面板**，用来统一管理已接入的 MCP 服务器，并规范模型调用 MCP 工具时的回答格式。

> 这是个人自用的第三方 DSH 插件，按「本地 bundle」方式安装。与官方 DSH 无隶属关系。

## 功能

- **侧边栏「MCP」入口**：点击打开 MCP 管理面板，列出当前已安装的 MCP 服务器。
- **统一列表**：同时展示插件添加的 MCP 与 DSH 原生 MCP 管理器（0.2.2+）托管的服务器；原生条目显示连接状态与工具数，可写备注，启停/删除请在官方 MCP 设置中操作。
- **添加 MCP**：支持 `streamable-http`（URL + 可选鉴权头）和 `stdio`（命令 + 参数 + 环境变量）；写入 **DSH 原生 MCP 管理器**的 `config.servers`（Settings 的 MCP 配置同步可见），鉴权头自动转成 `${credential:REF}` 凭据模板，令牌存入凭据库而非明文配置。
- **备注**：给每个 MCP 起中文备注（例如把 `weather-mcp` 备注为「天气助手」），页面里可随时修改。
- **启用 / 停用开关**：随时开关某个 MCP，改动即时生效（写入 profile 补丁，热重载）。
- **删除**：垃圾桶按钮，二次确认后移除该 MCP。
- **模型行为规范**（自动注入系统提示词）：
  1. 调用 `mcp__<服务器名>__<工具名>` 取数作答时，回答开头注明「我调取了 xxxmcp」/「我使用了 xxxmcp」；
  2. 用户用备注/中文别名称呼 MCP 时，按对照表解析到对应服务器；
  3. 目标 MCP 未启用或不存在时，提醒用户到「MCP」页面处理，**不得擅自替换成其他 MCP**；
  4. MCP 返回数据如实转述。
- **响应式界面**：页面宽度、间距随 DSH 窗口缩放，窄窗口下控件自动换行。
- 中英文界面、深/浅色主题自适应（只使用宿主主题 token）。

## 环境要求

- 已安装并可运行 DSH（Web 界面）。
- DSH 的 profile 中包含以下 Host 服务（标准 Web 配置默认具备）：
  `configEditor`、`pluginManager`、`connection`、`systemPrompt`、`webServer`。

## 安装

### 方式一：插件管理器（推荐）

在会话中让 Agent 执行：

```
plugin_manager install_bundle <本仓库绝对路径>
```

或在 Web 界面 **Plugins** 页 → Add plugin，填入本仓库目录的绝对路径后安装。安装完成后侧边栏出现「MCP」入口。

### 方式二：直接编辑 profile

把本目录链接/复制到 profile 依赖中，并确保其 patch 行被加载（不推荐手改 `cordis.patch.yml`）。

安装后：**Plugins** 页面可见 bundle `@local/dsh-mcp-manager`，其行 `mcp-manager-panel` 的开关可用来启用/停用整个插件（行 id 避开 DSH 0.2.2+ 原生 MCP 管理器的 `mcp-manager` 行）。

## 使用

1. 点击侧边栏 **MCP** 打开管理面板；
2. 点「添加 MCP」，选择连接方式：
   - `streamable-http`：填 URL；如服务器需要鉴权，在「鉴权头」里按每行 `名称: 值` 填写，例如
     ```
     Authorization: Bearer <your-token>
     ```
   - `stdio`：填命令与参数（参数用空格或逗号分隔）；
3. 保存后服务器行出现，可改备注、用开关启用/停用、点垃圾桶删除；
4. 之后在对话里直接说「使用 <备注> 帮我…」或「使用 <服务器名> 帮我…」，模型会调用对应 MCP 工具并注明来源。

## 技术说明

- **构成**：单个 DSH bundle 包，Host 端（`index.js`）+ 浏览器端（`client.js`），同一行（`mcp-manager-panel`）承载。
- **Host 端**：
  - 在 Host 树注册 `systemPrompt.section`，动态注入「MCP 使用规范 + 当前已接入 MCP 对照表（备注 → 服务器名 → 工具前缀）」；对照表合并插件行与 `ctx.mcpManager.list()`（DSH 0.2.2+）的原生托管服务器；
  - 通过 `webServer` 注册私有 RPC 路由 `/dsh-mcp-manager/<endpoint>`（`list` / `add` / `toggle` / `remove` / `setRemark`），认证走 `connection.admit`；
  - `add` / `toggle` / `remove` 通过 `configEditor.edit` 编辑原生 `mcp-manager` 行的 `config.servers`（易变配置，不重挂管理器）；旧静态 bundle 行保留原逻辑；
  - 备注保存在本插件行的 config（`remarks`），优先按服务器名（`serverName`）存储并兼容旧 entry id 键，通过 `configEditor.edit` 原子写入 profile 补丁。
- **浏览器端**：`client.js` 通过 `window.__ModuleLoader__.load` 注册惰性工厂；注册 `sidebar.panellist` 入口（id `mcp`）与 `main` 面板（key `mcp`）；所有请求走 `ctx.get('connection').rpc.call('/dsh-mcp-manager', method, payload)`。
- **为什么不用 `connection.rpc.handle`**：本机实测该 API 对第三方插件不可用（内部 shadow 上下文访问 `owner.webServer` 过不了 Cordis 注入检查），因此直接注册 `webServer` 路由并复刻同一套 RPC 信封协议（`client-request` / `server-response`）。

## 目录结构

```
package.json         # bundle 清单（dsh.bundle.patch + dsh.client）
cordis.patch.yml     # 插入 mcp-manager-panel 行
index.js             # Host 端：RPC 路由、systemPrompt 注入、原生管理器读写
client.js            # 浏览器端：侧边栏入口 + MCP 管理面板
locale/              # 插件展示元数据（中/英）
icon.svg             # 插件图标
```

## 开发与调试

修改 `index.js` 后，在 Plugins 页面把 `mcp-manager-panel` 行开关一次（off → on）即可热加载新 Host 代码；
修改 `client.js` 后同样开关一次，页面会应用新 bundle 版本。无需重启 DSH。

## 更新日志

### v1.1.1（2026-11-16）

- 插件显示名改为「更好的 MCP 管理器」/「Better MCP manager」（面板与侧栏入口保持 MCP）。

### v1.1.0（2026-11-16）

- **对接 DSH 0.2.2+ 原生 MCP 管理器**：
  - 面板统一列表：合并展示原生托管服务器（含连接状态、工具数与重连信息）与旧静态 MCP 条目；
  - 「添加」改为写入原生 `mcp-manager` 行的 `config.servers`，不再生成子 bundle；
  - 原生条目支持启停 / 删除（写 `servers.<name>.enabled` / 删除配置键）；
  - 鉴权头自动转成 `${credential:REF}` 凭据模板，令牌存入凭据库而非明文配置；
  - 备注改为按服务器名（`serverName`）存储，兼容旧 entry id 键；
  - 模型指令的「备注 → MCP」对照表覆盖原生托管的服务器。
- **修复**：插件行 id 与官方 `mcp-manager` 行冲突导致不可寻址，行 id 改为 `mcp-manager-panel`。
- **移除**：未生效的「迁移到原生」功能。

### v1.0.0（2026-11-12）

- 首个版本：侧边栏 MCP 面板（查看 / 添加 / 备注 / 启停 / 删除）；
- 模型行为规范：MCP 来源前缀（我调取了 xxxmcp）、备注别名映射、未启用不得替换；
- 响应式界面与深/浅色主题适配。

## License

MIT，见 [LICENSE](LICENSE)。
