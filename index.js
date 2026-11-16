/**
 * @local/dsh-mcp-manager — 宿主端（host）插件
 *
 * 职责：
 *   1. 注册 webServer 路由提供 MCP 管理 RPC（线上协议与 client-connection 一致，
 *      认证走 ctx.connection.admit；不用 ctx.connection.rpc.handle，见 registerChannel 注释）。
 *   2. 通过 ctx.systemPrompt.section(...) 注入 MCP 工具使用规范（模型行为指令）。
 *
 * RPC 通道：/dsh-mcp-manager
 * handler 签名：(endpoint, payload, signal, peer) =>
 *   Promise<{ ok: true, value } | { ok: false, error: { code, message, details } }>
 *   （error.details 恒为对象；handler 内异常一律折成 ok:false。）
 *
 * 端点（endpoint → payload → value）：
 *   - list      payload {} → { servers: [ { id, serverName, source, transport, url?, command?, args?, enabled, phase, remark, nativeState?, ... } ] }
 *                 合并两类：DSH 原生 MCP 管理器（0.2.2+）托管的服务器（source: 'native'）与插件旧静态 mcp-client 行（source: 'plugin'）。
 *   - add       payload { serverName, transport, url?, headers?, command?, args?, env? }
 *                 写入 DSH 原生 MCP 管理器的 config.servers（幂等：重名拒绝）；
 *                 鉴权头默认转成 ${credential:REF} 模板并把原值存入凭据库，失败则回退明文并注明。
 *                                                                               → { id: 'native:<name>', applied, application, message }
 *   - toggle    payload { id, enabled }：native:<name> 改原生 servers.<name>.enabled；
 *                 旧静态行仍走 pluginManager.setPluginEnabled。                        → { applied, application, message }
 *   - remove    payload { id }：native:<name> 从原生 servers 删除；旧静态行移除对应 bundle。  → { applied, application, message }
 *   - setRemark payload { key, remark, id? }：备注按 serverName 存储（兼容旧 entry id 键）。   → {}
 *
 * 失败 code：invalid-input / unknown-method / aborted / already-installed / native-write-failed /
 *           no-native-manager / toggle-failed / remove-failed / no-profile-entry / edit-failed / internal-error
 */

export const name = 'mcp-manager'
// webServer：connection.rpc.handle 会把「读取 connection 服务的上下文」作为 owner，
// 并要求该上下文注入 webServer（owner.webServer.register(route)）。
export const inject = ['configEditor', 'pluginManager', 'connection', 'systemPrompt', 'webServer']

const CHANNEL = '/dsh-mcp-manager'
const MCP_CLIENT_NAME = '@deepseek-ai/dsh-mcp-client'
const NATIVE_MANAGER_ID = 'mcp-manager'
const NATIVE_MANAGER_NAME = '@deepseek-ai/dsh-mcp-manager'
const SELF_ENTRY_ID = 'mcp-manager-panel'
const SELF_PACKAGE_NAME = '@local/dsh-mcp-manager'
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/** 模型行为指令：MCP 工具来源注明 / 备注别名映射 / 未启用不得代用 / 数据如实转述。 */
const USAGE_GUIDANCE_TEXT = [
  'MCP 工具使用规范：',
  '1. 当调用名称形如 mcp__<服务器名>__<工具名> 的工具获取数据并在回答中呈现结果时，回答开头必须注明来源，写「我调取了 <服务器名>mcp」或「我使用了 <服务器名>mcp」。',
  '2. 用户可能用备注或中文别名称呼某个 MCP（例如备注「天气助手」可能指代某个服务器）。请对照下方「当前已接入的 MCP」清单，把用户的称呼解析到对应的 mcp__<服务器名>__ 工具上。',
  '3. 如果用户要求使用某个 MCP，但解析不到对应服务器，或该服务器未启用（可用工具列表中没有 mcp__<名称>__ 前缀的工具），不得擅自改用其他 MCP 或别的工具代替；应提醒用户到侧边栏「MCP」页面确认名称或备注，并手动启用/添加该 MCP，待其可用后再继续。',
  '4. MCP 工具返回的数据如实转述，不虚构。',
].join('\n')

/** 生成「当前已接入的 MCP」对照表（备注 → 服务器名 → 工具前缀），供模型解析用户称呼。 */
function buildUsageGuidance(ctx) {
  let mapping = '\n当前没有已接入的 MCP 服务器。'
  try {
    const rows = configurationRows(ctx)
    const remarks = readRemarks(ctx, rows)
    const byName = new Map()
    for (const row of rows) {
      const entry = row?.entry
      if (entryNameOf(entry) !== MCP_CLIENT_NAME) continue
      const id = entryIdOf(entry)
      const raw = rawConfigFor(undefined, row)
      const serverName = typeof raw.serverName === 'string' && raw.serverName ? raw.serverName : id.replace(/^mcp-/, '')
      byName.set(serverName, { serverName, remark: remarkFor(remarks, serverName, id) })
    }
    // 原生 MCP 管理器（@deepseek-ai/dsh-mcp-manager，0.2.2+）托管的服务器同样参与别名解析。
    for (const item of nativeServerViews(ctx)) {
      if (!byName.has(item.name)) byName.set(item.name, { serverName: item.name, remark: remarkFor(remarks, item.name, '') })
    }
    const servers = [...byName.values()]
    if (servers.length > 0) {
      mapping = `\n当前已接入的 MCP（用户可能用备注称呼它们）：\n${servers.map((server) => server.remark
        ? `- 备注「${server.remark}」→ 服务器名 ${server.serverName}，工具前缀 mcp__${server.serverName}__`
        : `- ${server.serverName}（无备注），工具前缀 mcp__${server.serverName}__`).join('\n')}`
    }
  } catch {
    // 读取失败时保留默认提示，不让提示词组装失败。
  }
  return `${USAGE_GUIDANCE_TEXT}\n${mapping}`
}

/** 组装时按需刷新对照表（5 秒缓存，避免每次组装都读 profile 文件）。 */
let guidanceCache = { at: 0, text: USAGE_GUIDANCE_TEXT }
function guidanceText(ctx) {
  const now = Date.now()
  if (now - guidanceCache.at < 5000) return guidanceCache.text
  guidanceCache = { at: now, text: buildUsageGuidance(ctx) }
  return guidanceCache.text
}

// ---------------------------------------------------------------------------
// 通用小工具
// ---------------------------------------------------------------------------

function ok(value) {
  return { ok: true, value }
}

function fail(code, message, details) {
  return {
    ok: false,
    error: {
      code,
      message,
      details: details !== null && typeof details === 'object' && !Array.isArray(details) ? details : {},
    },
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function entryIdOf(entry) {
  return String(entry?.options?.id ?? entry?.id ?? '')
}

function entryNameOf(entry) {
  return String(entry?.options?.name ?? entry?.name ?? '')
}

function entryConfigOf(entry) {
  const config = entry?.options?.config ?? entry?.config
  return isPlainObject(config) ? config : {}
}

function effectiveConfig(row) {
  return {
    ...(isPlainObject(row?.inherited) ? row.inherited : {}),
    ...(isPlainObject(row?.override) ? row.override : {}),
  }
}

/** 行原始 config：优先 PluginInfo 自带 config，其次 entry.options.config，最后 override 合并 inherited。 */
function rawConfigFor(plugin, row) {
  if (isPlainObject(plugin?.config)) return { ...plugin.config }
  return {
    ...entryConfigOf(row?.entry),
    ...(isPlainObject(row?.inherited) ? row.inherited : {}),
    ...(isPlainObject(row?.override) ? row.override : {}),
  }
}

/** ChangeResult → SPEC 的 { applied, application, message }。 */
function mapChangeResult(result, fallbackMessage) {
  const change = isPlainObject(result) ? result : {}
  const application = change.application ?? 'failed'
  const applied = application === 'applied'
  const parts = []
  if (isPlainObject(change.error)) {
    const code = typeof change.error.code === 'string' ? change.error.code : 'operation-error'
    const diagnostic = typeof change.error.diagnostic === 'string' && change.error.diagnostic ? change.error.diagnostic : ''
    parts.push(`[${code}] ${diagnostic || code}`)
  }
  if (Array.isArray(change.warnings)) {
    for (const warning of change.warnings) if (typeof warning === 'string' && warning) parts.push(warning)
  }
  if (application === 'failed' && isPlainObject(change.packageResult) && typeof change.packageResult.output === 'string') {
    const output = change.packageResult.output.trim()
    if (output) parts.push(output.slice(-2000))
  }
  let message = parts.join('; ')
  if (!message) message = application === 'applied' ? fallbackMessage : `${fallbackMessage}（应用状态：${application}）`
  return { applied, application, message }
}

/** configEditor 里本插件自己的行（id 'mcp-manager'，name '@local/dsh-mcp-manager'）。 */
function selfEntry(ctx) {
  try {
    const entries = ctx.configEditor.entries() ?? []
    return entries.find((entry) => entryIdOf(entry) === SELF_ENTRY_ID || entryNameOf(entry) === SELF_PACKAGE_NAME) ?? null
  } catch {
    return null
  }
}

function configurationRows(ctx) {
  try {
    const rows = ctx.configEditor.configuration()
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

/** 本插件 config.remarks（override 优先合并 inherited；只收字符串值）。 */
function readRemarks(ctx, rows) {
  const self = rows.find((row) => entryIdOf(row?.entry) === SELF_ENTRY_ID || entryNameOf(row?.entry) === SELF_PACKAGE_NAME)
  const merged = effectiveConfig(self)
  const remarks = merged.remarks
  if (!isPlainObject(remarks)) return {}
  const result = {}
  for (const [id, value] of Object.entries(remarks)) if (typeof value === 'string') result[id] = value
  return result
}

/** 备注读取：优先按服务器名（新键），兼容旧的 entry id 键。 */
function remarkFor(remarks, serverName, legacyKey) {
  if (typeof remarks[serverName] === 'string') return remarks[serverName]
  if (legacyKey && typeof remarks[legacyKey] === 'string') return remarks[legacyKey]
  return ''
}

/** 原生 MCP 管理器（@deepseek-ai/dsh-mcp-manager，0.2.2+）托管的服务器视图；旧版本无此服务时返回空。 */
function nativeServerViews(ctx) {
  try {
    const manager = ctx.get('mcpManager')
    if (!manager || typeof manager.list !== 'function') return []
    const list = manager.list()
    if (!Array.isArray(list)) return []
    return list.filter((item) => isPlainObject(item) && typeof item.name === 'string' && item.name !== '')
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// 原生 MCP 管理器接入（DSH 0.2.2+）
// ---------------------------------------------------------------------------
// 写入路径：原生管理器行（id 'mcp-manager'）的 config.servers（volatile 配置，不重挂管理器）；
// 鉴权头默认转成 ${credential:REF} 模板并把原值存入凭据库，避免明文落盘。

/** 原生 MCP 管理器行；旧版 DSH 没有该包时返回 null。 */
function nativeManagerEntry(ctx) {
  try {
    const entries = ctx.configEditor.entries() ?? []
    return entries.find((entry) => entryIdOf(entry) === NATIVE_MANAGER_ID || entryNameOf(entry) === NATIVE_MANAGER_NAME) ?? null
  } catch {
    return null
  }
}

/** 原生管理器当前 config.servers（override 优先合并 inherited）。 */
function nativeServersConfig(ctx) {
  try {
    const rows = configurationRows(ctx)
    const row = rows.find((candidate) => entryIdOf(candidate?.entry) === NATIVE_MANAGER_ID || entryNameOf(candidate?.entry) === NATIVE_MANAGER_NAME)
    const servers = effectiveConfig(row).servers
    return isPlainObject(servers) ? servers : {}
  } catch {
    return {}
  }
}

/** 编辑原生管理器的 config.servers：mutate(servers) 返回新 map 或 null（不修改）。成功返回 null，失败返回 fail(...)。 */
async function editNativeServers(ctx, mutate) {
  const entry = nativeManagerEntry(ctx)
  if (!entry) return fail('no-native-manager', '未找到 DSH 原生 MCP 管理器行（需要 DSH 0.2.2+）')
  let changed = false
  try {
    await ctx.configEditor.edit(entry, (current) => {
      const servers = isPlainObject(current.servers) ? current.servers : {}
      const next = mutate({ ...servers })
      if (next === null || next === undefined) return current
      changed = true
      return { ...current, servers: next }
    })
  } catch (error) {
    return fail('native-write-failed', `写入原生 MCP 管理器配置失败：${String(error?.message ?? error)}`)
  }
  if (!changed) return fail('invalid-input', '未产生任何修改')
  return null
}

/** 等待原生管理器状态刷新（尽力而为，最多约 1.2 秒）。 */
async function nativeStatusAfter(ctx, name) {
  const manager = (() => { try { return ctx.get('mcpManager') } catch { return undefined } })()
  if (!manager || typeof manager.list !== 'function') return null
  for (let index = 0; index < 6; index += 1) {
    try {
      const list = manager.list()
      const hit = Array.isArray(list) ? list.find((item) => isPlainObject(item) && item.name === name) : undefined
      if (hit) return hit
    } catch {
      // 管理器尚未就绪时继续等待。
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return null
}

/** 旧静态 mcp-client 行的 serverName 列表。 */
function staticMcpServerNames(ctx) {
  const names = []
  for (const row of configurationRows(ctx)) {
    const entry = row?.entry
    if (entryNameOf(entry) !== MCP_CLIENT_NAME) continue
    const raw = rawConfigFor(undefined, row)
    const name = typeof raw.serverName === 'string' && raw.serverName ? raw.serverName : entryIdOf(entry).replace(/^mcp-/, '')
    names.push(name)
  }
  return names
}

/** 凭据引用名：POSIX 标识符 MCP_<SERVER>_<HEADER>。 */
function credentialRefName(serverName, headerName) {
  const clean = (value) => String(value).toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'X'
  return `MCP_${clean(serverName).slice(0, 24)}_${clean(headerName).slice(0, 24)}`.slice(0, 64)
}

/** 把 headers 中的疑似密钥值换成 ${credential:REF} 模板并写入凭据库；失败保留明文并给出说明。 */
async function externalizeSecrets(ctx, serverName, headers) {
  const out = { ...headers }
  const notes = []
  const credentials = (() => { try { return ctx.get('credentials') } catch { return undefined } })()
  const SECRET_HEADER = /authorization|token|api-?key|secret/i
  for (const [headerName, value] of Object.entries(headers)) {
    if (typeof value !== 'string' || value.trim() === '') continue
    if (!SECRET_HEADER.test(headerName)) continue
    if (value.length < 8 && !/^bearer\s+/i.test(value)) continue
    if (!credentials || typeof credentials.set !== 'function') {
      notes.push(`凭据服务不可用：${headerName} 以明文保存`)
      continue
    }
    const ref = credentialRefName(serverName, headerName)
    try {
      const bearer = /^\s*bearer\s+(.+)$/i.exec(value)
      const secret = bearer ? bearer[1].trim() : value
      await credentials.set(ref, secret)
      const template = '$' + '{credential:' + ref + '}'
      out[headerName] = bearer ? `Bearer ${template}` : template
    } catch (error) {
      notes.push(`保存凭据失败（${String(error?.message ?? error)}）：${headerName} 以明文保存`)
    }
  }
  return { headers: out, notes }
}

/** 更新本插件 config.remarks；成功返回空串，失败返回说明文本。 */
async function updateRemarks(ctx, mutate) {
  const entry = selfEntry(ctx)
  if (!entry) return '找不到本插件配置行，备注未更新'
  try {
    await ctx.configEditor.edit(entry, (current) => {
      const remarks = isPlainObject(current.remarks) ? { ...current.remarks } : {}
      mutate(remarks)
      return { ...current, remarks }
    })
    return ''
  } catch (error) {
    return `备注更新失败：${String(error?.message ?? error)}`
  }
}

/** 由静态行 id 找到其所属 bundle 名（失败回退 '@local/<id>'）。 */
async function bundleNameForRow(ctx, id) {
  let bundleName = `@local/${id}`
  try {
    const bundles = await ctx.pluginManager.listBundles()
    const match = bundles.find((bundle) => Array.isArray(bundle?.rows) && bundle.rows.some((row) => row?.rowId === id || row?.entryId === id))
    if (match && typeof match.name === 'string' && match.name !== '') bundleName = match.name
  } catch {
    // 关联失败时使用推导名。
  }
  return bundleName
}

/** 构造原生 servers 条目（校验已在调用方完成）。 */
function buildNativeEntry(transport, source) {
  const entry = { transport, enabled: true }
  if (transport === 'streamable-http') {
    entry.url = source.url
    if (source.headers && Object.keys(source.headers).length > 0) entry.headers = source.headers
  } else {
    entry.command = source.command
    if (Array.isArray(source.args) && source.args.length > 0) entry.args = source.args
    if (source.env && Object.keys(source.env).length > 0) entry.env = source.env
  }
  return entry
}

// ---------------------------------------------------------------------------
// 端点实现
// ---------------------------------------------------------------------------

async function listServers(ctx) {
  const plugins = await ctx.pluginManager.listPlugins()
  const rows = configurationRows(ctx)
  const remarks = readRemarks(ctx, rows)
  const servers = []
  for (const plugin of plugins) {
    if (!plugin || typeof plugin !== 'object') continue
    const moduleName = plugin.moduleName ?? plugin.name
    if (moduleName !== MCP_CLIENT_NAME) continue
    const id = String(plugin.entryId ?? plugin.patchId ?? '')
    if (!id) continue
    const row = rows.find((candidate) => entryIdOf(candidate?.entry) === id)
    const raw = rawConfigFor(plugin, row)
    const serverName = typeof raw.serverName === 'string' && raw.serverName ? raw.serverName : id.replace(/^mcp-/, '')
    const transport = raw.transport === 'streamable-http' ? 'streamable-http' : 'stdio'
    const server = {
      id,
      serverName,
      source: 'plugin',
      remarkKey: serverName,
      transport,
      enabled: plugin.enabled === true,
      phase: plugin.fiberPhase ?? null,
      remark: remarkFor(remarks, serverName, id),
      bundleName: `@local/${id}`,
    }
    if (transport === 'streamable-http') {
      if (raw.url !== undefined) server.url = typeof raw.url === 'string' ? raw.url : ''
      server.hasHeaders = isPlainObject(raw.headers) && Object.keys(raw.headers).length > 0
    } else {
      if (raw.command !== undefined) server.command = typeof raw.command === 'string' ? raw.command : ''
      server.args = Array.isArray(raw.args) ? raw.args.map((arg) => String(arg)) : []
    }
    servers.push(server)
  }
  // 原生 MCP 管理器（0.2.2+）托管的服务器：可备注、可启停/删除（写入原生 servers 配置）。
  const nativeConfig = nativeServersConfig(ctx)
  for (const item of nativeServerViews(ctx)) {
    const name = item.name
    const status = isPlainObject(item.status) ? item.status : {}
    const configured = isPlainObject(nativeConfig[name]) ? nativeConfig[name] : {}
    const state = typeof status.state === 'string' ? status.state : 'unknown'
    const transport = configured.transport === 'streamable-http' ? 'streamable-http' : (configured.transport === 'stdio' ? 'stdio' : 'native')
    const server = {
      id: `native:${name}`,
      serverName: name,
      source: 'native',
      remarkKey: name,
      transport,
      enabled: configured.enabled === false ? false : state !== 'disabled',
      phase: state,
      remark: remarkFor(remarks, name, ''),
      nativeState: state,
      nativeConfigured: item.configured === true,
    }
    if (transport === 'streamable-http') {
      server.url = typeof configured.url === 'string' ? configured.url : ''
      server.hasHeaders = isPlainObject(configured.headers) && Object.keys(configured.headers).length > 0
    } else if (transport === 'stdio') {
      server.command = typeof configured.command === 'string' ? configured.command : ''
      server.args = Array.isArray(configured.args) ? configured.args.map((arg) => String(arg)) : []
    }
    if (typeof status.toolCount === 'number') server.nativeToolCount = status.toolCount
    if (typeof status.attempt === 'number') server.nativeAttempt = status.attempt
    if (typeof status.maxAttempts === 'number') server.nativeMaxAttempts = status.maxAttempts
    if (typeof status.lastError === 'string' && status.lastError) server.nativeLastError = status.lastError
    if (typeof status.reason === 'string') server.nativeReason = status.reason
    servers.push(server)
  }
  return { servers }
}

async function addServer(ctx, input) {
  const { serverName, transport } = input
  if (typeof serverName !== 'string' || !SERVER_NAME_PATTERN.test(serverName)) {
    return fail('invalid-input', `serverName 不合法：必须匹配 ^[A-Za-z0-9_-]{1,32}$（收到 ${JSON.stringify(serverName)}）`)
  }
  if (transport !== 'stdio' && transport !== 'streamable-http') {
    return fail('invalid-input', `transport 必须是 "stdio" 或 "streamable-http"（收到 ${JSON.stringify(transport)}）`)
  }
  if (transport === 'streamable-http') {
    if (typeof input.url !== 'string' || input.url.trim() === '') return fail('invalid-input', 'streamable-http 传输必须提供非空 url')
  } else if (typeof input.command !== 'string' || input.command.trim() === '') {
    return fail('invalid-input', 'stdio 传输必须提供非空 command')
  }
  let args = []
  if (input.args !== undefined) {
    if (!Array.isArray(input.args) || !input.args.every((arg) => typeof arg === 'string')) {
      return fail('invalid-input', 'args 必须是字符串数组')
    }
    args = input.args
  }
  let env = {}
  if (input.env !== undefined) {
    if (!isPlainObject(input.env) || !Object.values(input.env).every((value) => typeof value === 'string')) {
      return fail('invalid-input', 'env 必须是「字符串 → 字符串」的键值对象')
    }
    env = input.env
  }
  let headers = {}
  if (input.headers !== undefined) {
    if (!isPlainObject(input.headers) || !Object.values(input.headers).every((value) => typeof value === 'string')) {
      return fail('invalid-input', 'headers 必须是「字符串 → 字符串」的键值对象')
    }
    headers = input.headers
  }
  if (!nativeManagerEntry(ctx)) {
    return fail('no-native-manager', '未找到 DSH 原生 MCP 管理器行（需要 DSH 0.2.2+），无法写入服务器配置')
  }
  // 重名先拦：原生配置或旧静态行已占用该 serverName 时拒绝。
  if (Object.prototype.hasOwnProperty.call(nativeServersConfig(ctx), serverName)) {
    return fail('already-installed', `MCP 服务器 ${serverName} 已存在于原生管理器配置中`)
  }
  if (staticMcpServerNames(ctx).includes(serverName)) {
    return fail('already-installed', `MCP 服务器 ${serverName} 已作为旧静态行存在；请先在面板中迁移或删除它`)
  }
  const notes = []
  let finalHeaders = headers
  if (transport === 'streamable-http' && Object.keys(headers).length > 0) {
    const externalized = await externalizeSecrets(ctx, serverName, headers)
    finalHeaders = externalized.headers
    notes.push(...externalized.notes)
  }
  const buildEntry = (headerMap) => buildNativeEntry(transport, {
    url: transport === 'streamable-http' ? input.url.trim() : undefined,
    headers: headerMap,
    command: transport === 'stdio' ? input.command.trim() : undefined,
    args,
    env,
  })
  let writeError = await editNativeServers(ctx, (servers) => {
    if (Object.prototype.hasOwnProperty.call(servers, serverName)) return null
    return { ...servers, [serverName]: buildEntry(finalHeaders) }
  })
  // 凭据模板若被写入路径拒绝，回退为明文鉴权头并注明风险。
  if (writeError && transport === 'streamable-http' && Object.keys(finalHeaders).some((key) => /\$\{credential:/.test(finalHeaders[key]))) {
    writeError = await editNativeServers(ctx, (servers) => {
      if (Object.prototype.hasOwnProperty.call(servers, serverName)) return null
      return { ...servers, [serverName]: buildEntry(headers) }
    })
    if (!writeError) notes.push('凭据模板写入被拒绝，已回退为明文鉴权头（存在泄露风险）')
  }
  if (writeError) return writeError
  const view = await nativeStatusAfter(ctx, serverName)
  const state = view && isPlainObject(view.status) && typeof view.status.state === 'string' ? view.status.state : ''
  notes.push(state ? `原生管理器状态：${state}` : '已写入原生管理器配置')
  return ok({ id: `native:${serverName}`, applied: true, application: 'applied', message: `MCP 服务器 ${serverName} 已添加；${notes.join('；')}` })
}

async function toggleServer(ctx, input) {
  const id = typeof input.id === 'string' ? input.id : ''
  if (id === '') return fail('invalid-input', '缺少 MCP 标识')
  if (typeof input.enabled !== 'boolean') return fail('invalid-input', 'enabled 必须是布尔值')
  if (id.startsWith('native:')) {
    const name = id.slice('native:'.length)
    if (name === '') return fail('invalid-input', '缺少原生服务器名')
    const writeError = await editNativeServers(ctx, (servers) => {
      const current = servers[name]
      if (!isPlainObject(current)) return null
      return { ...servers, [name]: { ...current, enabled: input.enabled } }
    })
    if (writeError) return writeError
    const view = await nativeStatusAfter(ctx, name)
    const state = view && isPlainObject(view.status) && typeof view.status.state === 'string' ? view.status.state : ''
    return ok({
      applied: true,
      application: 'applied',
      message: `${input.enabled ? '已启用' : '已停用'} ${name}${state ? `（原生管理器状态：${state}）` : ''}`,
    })
  }
  // 旧静态行：沿用插件管理器开关。
  let result
  try {
    result = await ctx.pluginManager.setPluginEnabled(id, input.enabled)
  } catch (error) {
    return fail('toggle-failed', `切换启用状态失败：${String(error?.message ?? error)}`)
  }
  const mapped = mapChangeResult(result, input.enabled ? `已启用 ${id}` : `已停用 ${id}`)
  return ok({ applied: mapped.applied, application: mapped.application, message: `${mapped.message}（旧静态行）` })
}

async function removeServer(ctx, input) {
  const id = typeof input.id === 'string' ? input.id : ''
  if (id === '') return fail('invalid-input', '缺少 MCP 标识')
  if (id.startsWith('native:')) {
    const name = id.slice('native:'.length)
    if (name === '') return fail('invalid-input', '缺少原生服务器名')
    const writeError = await editNativeServers(ctx, (servers) => {
      if (!Object.prototype.hasOwnProperty.call(servers, name)) return null
      const next = { ...servers }
      delete next[name]
      return next
    })
    if (writeError) return writeError
    const cleanup = await updateRemarks(ctx, (remarks) => { delete remarks[name] })
    return ok({ applied: true, application: 'applied', message: `已从原生管理器移除 ${name}${cleanup ? `；${cleanup}` : ''}` })
  }
  // 旧静态行：移除其 bundle。
  const bundleName = await bundleNameForRow(ctx, id)
  let result
  try {
    result = await ctx.pluginManager.removeBundle(bundleName)
  } catch (error) {
    return fail('remove-failed', `移除失败：${String(error?.message ?? error)}`)
  }
  const mapped = mapChangeResult(result, `已移除 ${bundleName}`)
  const cleanup = await updateRemarks(ctx, (remarks) => {
    delete remarks[id]
    for (const key of Object.keys(remarks)) if (key.endsWith(`/${id}`)) delete remarks[key]
  })
  const message = `${mapped.message}（旧静态行）${cleanup ? `；${cleanup}` : ''}`
  return ok({ applied: mapped.applied, application: mapped.application, message })
}

async function setRemarkServer(ctx, input) {
  const key = typeof input.key === 'string' && input.key !== ''
    ? input.key
    : (typeof input.id === 'string' && input.id !== '' ? input.id : '')
  const legacyKey = typeof input.id === 'string' && input.id !== '' && input.id !== key ? input.id : ''
  if (key === '') return fail('invalid-input', '缺少 MCP 服务器标识（key）')
  if (typeof input.remark !== 'string') return fail('invalid-input', 'remark 必须是字符串')
  if (!selfEntry(ctx)) {
    return fail('no-profile-entry', `找不到本插件的配置行（${SELF_ENTRY_ID} / ${SELF_PACKAGE_NAME}），无法保存备注`)
  }
  const failure = await updateRemarks(ctx, (remarks) => {
    remarks[key] = input.remark
    if (legacyKey) delete remarks[legacyKey]
  })
  if (failure) return fail('edit-failed', failure)
  return ok({})
}

// ---------------------------------------------------------------------------
// RPC 通道（自注册 webServer 路由，复刻 client-connection 的线上协议）
// ---------------------------------------------------------------------------
//
// 说明：ctx.connection.rpc.handle() 在本版本运行时中不可用于第三方插件——
// 它把「读取 connection 服务的上下文」的 shadow 子上下文作为 owner，
// 而 shadow 上下文访问 owner.webServer 时过不了 Cordis 的注入检查
// （实测：即使插件 inject 了 webServer，仍报
//  "cannot get property \"webServer\" without inject"）。
// 因此这里直接注册 webServer 前缀路由 + ctx.connection.admit() 认证，
// 线上协议与 client-connection 的 rpcFetchHandler 完全一致：
//   POST /dsh-mcp-manager/<endpoint>
//   请求体 { type: 'client-request', rpcId: string, method: string, payload }
//   响应体 { type: 'server-response', rpcId, result: {ok,value}|{ok:false,error:{code,message,details}} }
const MAX_RPC_BODY_BYTES = 1024 * 1024

function rpcErrorEnvelope(rpcId, code, message) {
  return {
    type: 'server-response',
    rpcId,
    result: { ok: false, error: { code, message, details: {} } },
  }
}

function writeJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function registerChannel(ctx, channel, handler) {
  return ctx.effect(() => {
    const route = {
      kind: 'prefix',
      path: channel,
      handler: async (req, res) => {
        // 1) 认证：浏览器（owner）连接才有权调用管理端点。
        const admission = ctx.connection.admit({ headers: req.headers })
        if (admission && 'rejection' in admission) {
          res.writeHead(admission.rejection, { 'content-type': 'text/plain' })
          res.end(admission.rejection === 401 ? 'unauthorized' : 'forbidden')
          return
        }
        const peer = admission?.peer
        // 2) 路径/方法/内容类型校验。
        let pathname
        try {
          pathname = new URL(req.url ?? '', 'http://localhost').pathname
        } catch {
          pathname = ''
        }
        const endpoint = pathname.startsWith(`${channel}/`) ? pathname.slice(channel.length + 1) : ''
        if (req.method !== 'POST' || endpoint === '' || endpoint.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
          res.writeHead(404, { 'content-type': 'text/plain' })
          res.end('not found')
          return
        }
        const contentType = String(req.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase()
        if (contentType !== 'application/json') {
          res.writeHead(415, { 'content-type': 'text/plain' })
          res.end('content type must be application/json')
          return
        }
        // 3) 读取请求体（带大小上限）。
        let envelope
        try {
          const chunks = []
          let size = 0
          for await (const chunk of req) {
            size += chunk.length
            if (size > MAX_RPC_BODY_BYTES) throw new Error('request body too large')
            chunks.push(chunk)
          }
          envelope = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch (error) {
          writeJson(res, 400, rpcErrorEnvelope('', 'gateway/bad-request', `body is not JSON or too large: ${String(error?.message ?? error)}`))
          return
        }
        if (!isPlainObject(envelope) || envelope.type !== 'client-request' || typeof envelope.rpcId !== 'string' || typeof envelope.method !== 'string') {
          writeJson(res, 400, rpcErrorEnvelope('', 'gateway/bad-request', 'invalid client-request message'))
          return
        }
        if (envelope.method !== endpoint) {
          writeJson(res, 400, rpcErrorEnvelope(envelope.rpcId, 'gateway/bad-request', `method ${JSON.stringify(envelope.method)} does not match endpoint ${JSON.stringify(endpoint)}`))
          return
        }
        // 4) 分发业务端点。
        let result
        try {
          result = await handler(endpoint, envelope.payload, undefined, peer)
        } catch (error) {
          res.writeHead(500, { 'content-type': 'text/plain' })
          res.end(`handler failure: ${String(error)}`)
          return
        }
        if (!isPlainObject(result) || (result.ok !== true && result.ok !== false)) {
          res.writeHead(500, { 'content-type': 'text/plain' })
          res.end('handler returned an invalid result')
          return
        }
        writeJson(res, 200, { type: 'server-response', rpcId: envelope.rpcId, result })
      },
    }
    return ctx.webServer.register(route)
  }, 'mcp-manager: rpc channel route')
}

// ---------------------------------------------------------------------------
// 插件入口
// ---------------------------------------------------------------------------

export function apply(ctx, config) {
  const handler = async (endpoint, payload, signal) => {
    try {
      if (signal?.aborted) return fail('aborted', '请求已取消')
      const input = isPlainObject(payload) ? payload : {}
      switch (endpoint) {
        case 'list': return ok(await listServers(ctx))
        case 'add': return await addServer(ctx, input)
        case 'toggle': return await toggleServer(ctx, input)
        case 'remove': return await removeServer(ctx, input)
        case 'setRemark': return await setRemarkServer(ctx, input)
        default: return fail('unknown-method', `未知端点：${String(endpoint)}`)
      }
    } catch (error) {
      return fail('internal-error', String(error?.message ?? error), { stack: String(error?.stack ?? '') })
    }
  }

  const disposers = []
  // 1) RPC 管理通道（自注册 webServer 路由 + admit 认证；见 registerChannel 说明）。
  disposers.push(registerChannel(ctx, CHANNEL, handler))
  // 2) 模型行为指令（MCP 工具来源注明 / 备注别名映射 / 未启用不得代用 / 如实转述）。
  disposers.push(ctx.effect(() => ctx.systemPrompt.section({
    name: 'mcp:usage-guidance',
    order: 9000,
    interpolate: false,
    text: () => guidanceText(ctx),
  })))

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // 忽略清理阶段的异常
      }
    }
  }
}
