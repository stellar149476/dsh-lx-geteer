# LX Music 自定义音源脚本说明

> 主要依据：LX Music 官方文档《自定义源脚本编写说明》  
> <https://lxmusic.toside.cn/desktop/custom-source>  
> 并结合社区常见 LX 音源脚本（聚合源、商业 API 源、直链源等）的实际行为整理。  
> 官方文档更新后，以官方为准。

## 1. 自定义源是什么

LX Music 本体负责搜索、歌单、歌词、播放器；**自定义源只负责“拿到歌曲 ID 之后，把可播放的 HTTP 链接解析出来”**。

所以一个 LX 自定义源通常不包含搜索功能，它只注册：

- 支持哪些平台（`kw` / `kg` / `tx` / `wy` / `mg` / `local`）；
- 每个平台支持哪些音质；
- 收到 `musicUrl` 请求时，如何用自己的后端/接口换取播放地址。

脚本是**纯 JavaScript**（ES6+），文件名任意，UTF-8 编码。LX Music 桌面版会在一个带 `globalThis.lx` 的沙箱里执行它。

## 2. 最小脚本结构

```js
/*!
 * @name 测试音乐源
 * @description 只是一个测试源
 * @version 1.0.0
 * @author xxx
 * @homepage https://example.com
 */
const { EVENT_NAMES, request, on, send, env, version } = globalThis.lx

const qualities = {
  kw: { '128k': '128', '320k': '320', flac: 'flac', flac24bit: 'flac24bit' },
}

const httpGet = (url, options = {}) => new Promise((resolve, reject) => {
  request(url, options, (err, resp) => {
    if (err) return reject(err)
    resolve(resp.body)
  })
})

on(EVENT_NAMES.request, ({ source, action, info }) => {
  if (action !== 'musicUrl') return Promise.reject(new Error('unsupported action'))
  if (source !== 'kw') return Promise.reject(new Error('unsupported source'))

  const { musicInfo } = info
  const quality = qualities[source][info.type]

  return httpGet(`https://api.example.com/url?id=${musicInfo.songmid}&q=${quality}`)
    .then((body) => body.url)
})

send(EVENT_NAMES.inited, {
  openDevTools: false,
  sources: {
    kw: {
      name: '酷我音乐',
      type: 'music',
      actions: ['musicUrl'],
      qualitys: ['128k', '320k', 'flac', 'flac24bit'],
    },
  },
})
```

## 3. 文件头注释

脚本开头必须有 `/*! ... */` 或 `/** ... */` 注释，LX Music 会解析：

| 字段 | 说明 |
| --- | --- |
| `@name` | 音源名称，建议 ≤ 24 字符，**必填** |
| `@description` | 描述，建议 ≤ 36 字符，可选 |
| `@version` | 版本号，可选 |
| `@author` | 作者，可选 |
| `@homepage` | 主页，可选 |

部分聚合源还会在头部放自定义字段（例如 `@tx_cookie`、`@wy_cookie`），这些字段 LX 本身不解析，由脚本自己从 `globalThis.lx.currentScriptInfo.rawScript` 里再解析一次。**因此运行脚本时 `rawScript` 必须是完整源码**，否则这类音源会丢配置。

## 4. `globalThis.lx` API

### 4.1 只读属性

| 属性 | 说明 |
| --- | --- |
| `lx.version` | 自定义源 API 版本 |
| `lx.env` | 桌面版固定 `desktop` |
| `lx.currentScriptInfo` | `{ name, description, version, author, homepage, rawScript }` |

### 4.2 `EVENT_NAMES`

| 事件 | 方向 | 用途 |
| --- | --- | --- |
| `inited` | 脚本 → 应用 | 初始化完成，必须发送一次；发送前抛错会被视为初始化失败 |
| `request` | 应用 → 脚本 | 应用请求 `musicUrl`（`local` 源还可能是 `lyric` / `pic`） |
| `updateAlert` | 脚本 → 应用 | 提示用户有更新，每次运行只能调用一次 |

### 4.3 `on(event, handler)`

注册事件处理函数。`request` 的 handler **必须返回 Promise**，resolve 播放地址 / 歌词 / 封面 URL，reject 错误。

### 4.4 `send(event, data)`

主动向应用发事件。最重要的是 `inited`：

```js
send(EVENT_NAMES.inited, {
  openDevTools: false, // 仅桌面版；是否打开 DevTools
  sources: {
    kw: {
      name: '酷我音乐',
      type: 'music',                 // 目前固定 music
      actions: ['musicUrl'],         // local 可为 ['musicUrl','lyric','pic']
      qualitys: ['128k', '320k', 'flac', 'flac24bit'],
    },
  },
})
```

平台 key 只允许 `kw` / `kg` / `tx` / `wy` / `mg` / `local`；部分聚合源会自行增加 `qs`、`sd`、`joox` 等 key，LX 官方文档没有这些 key，兼容性取决于宿主。本插件会把未知 key 原样展示，但不为它们提供搜索。

### 4.5 `request(url, options, callback)`

LX 提供的 HTTP 请求方法，不受跨域限制：

```js
const cancel = request(url, {
  method: 'GET',                 // GET / POST ...
  headers: { 'User-Agent': '...' },
  body: { a: 1 },                // 对象会按 JSON 发送
  form: { a: 1 },                // application/x-www-form-urlencoded
  formData: { file: buffer },    // multipart/form-data
  timeout: 15000,                // 毫秒
}, (err, resp) => {
  // resp.statusCode
  // resp.headers
  // resp.body：能 JSON.parse 就是对象，否则是字符串
})
```

返回值是一个取消函数。**注意 `resp.body` 在 LX 里会先 JSON.parse**：如果后端返回 JSON，脚本拿到的是对象而不是字符串；健壮的脚本两种都兼容。

### 4.6 `lx.utils`

| 方法 | 说明 |
| --- | --- |
| `utils.buffer.from(...)` | 同 Node `Buffer.from` |
| `utils.buffer.bufToString(buf, format)` | `Buffer.toString(format)` |
| `utils.crypto.aesEncrypt(buffer, mode, key, iv)` | AES 加密，返回 Buffer |
| `utils.crypto.md5(str)` | MD5 hex |
| `utils.crypto.randomBytes(size)` | 随机字节（不同版本返回类型可能不同） |
| `utils.crypto.rsaEncrypt(buffer, key)` | RSA 无填充加密 |
| `utils.zlib.inflate(buffer)` | 解压，返回 `Promise<Buffer>` |
| `utils.zlib.deflate(buffer)` | 压缩，返回 `Promise<Buffer>` |

## 5. `request` 事件的数据结构

```js
on(EVENT_NAMES.request, ({ source, action, info }) => {
  // source: 'kw' | 'kg' | 'tx' | 'wy' | 'mg' | ...
  // action: 'musicUrl' | 'lyric' | 'pic'
  // info.type: '128k' | '320k' | 'flac' | 'flac24bit' | 源自定义音质
  // info.musicInfo: 歌曲信息
})
```

不同平台搜索出来、传给 `musicInfo` 的关键字段：

| 平台 | 常用字段 | 说明 |
| --- | --- | --- |
| `kw` | `songmid` | 酷我音乐 ID，通常纯数字 |
| `tx` | `songmid`、`strMediaMid`、`songId` | `songmid` 是歌曲 mid；`strMediaMid` 是媒体文件 mid，部分接口必须 |
| `wy` | `songmid` | 网易云数字歌曲 ID |
| `kg` | `hash`、`songmid` | `hash` 是文件 hash，`songmid` 是 Audioid；不同接口可能用不同字段 |
| `mg` | `songmid`、`copyrightId` | 咪咕歌曲 ID / 版权 ID |

通用字段还有 `name`、`singer`、`albumName`、`albumId`、`interval`、`img`、`types`、`_types`。聚合源经常用 `name` / `singer` 做一次校验，避免解析到翻唱或错误版本，所以搜索结果的这些字段要尽量准确。

## 6. 音质约定

官方音质值：

| 值 | 含义 |
| --- | --- |
| `128k` | 128 kbps MP3 |
| `320k` | 320 kbps MP3 |
| `flac` | 无损 FLAC |
| `flac24bit` | 24bit 无损 |

很多聚合源会扩展 `hires`、`atmos`、`master`、`24bit`、`spatial` 等值。**扩展值没有统一语义**，必须原样传回给对应音源；本插件不会把 `24bit` 改写成 `flac24bit`，否则源内部的音质判断会失效。

## 7. 本插件的实现方式

与 LX Music 的差异：

1. **搜索由插件自己完成**。自定义源协议只有 `musicUrl`（以及 `local` 的 `lyric`/`pic`），没有搜索 action。插件内置了酷我 / QQ / 网易云 / 酷狗 / 咪咕五个平台的搜索接口，得到歌曲 ID 和 `musicInfo` 后再调用音源。
2. **只调用 `musicUrl`**。歌词、封面、下载标签不在当前版本范围内。
3. **Node `vm` 沙箱**。脚本拿到的 `globalThis.lx` 与 LX 基本一致，包括 `request`、`utils.crypto`、`utils.zlib`、`currentScriptInfo.rawScript`；额外提供了 `Buffer`、`fetch` 之外的少量标准全局。**没有** `require`、`process`、`fs`，不能读写本地文件。
4. **每个音源一个常驻运行时**。切换音源时销毁旧运行时、清掉定时器和未完成请求，再初始化新音源；同一音源的多次解析请求串行执行，避免脚本内部共享状态互相干扰。
5. **下载**。拿到 URL 后由宿主进程直接流式写入下载目录，按 URL/Content-Type 判断扩展名，重名自动加序号。
6. **播放**。点歌时拿到 URL 后不落盘，而是登记一个短期 token；浏览器播放 `/lx-geteer-stream?id=<token>`，Host 代理上游请求并转发 `Range`，同时补平台 `Referer`/`User-Agent`。播放器在右侧边栏自动打开，音质默认取输入框下方按钮的值。
7. **错误可见**。音源初始化失败、解析失败、下载/播放 HTTP 错误都会出现在设置页、播放器或任务状态里，运行日志可展开查看。

## 8. 已知限制

- 自定义源的后端随时可能失效；插件不能修复音源上游。
- 部分平台链接需要特定 `Referer` / `Cookie` / 时效签名，源返回的 URL 未必能直接下载；本插件会带平台 Referer 和浏览器 UA，但仍可能 403。
- 音源协议没有统一的“搜索”，所以本插件只支持五个官方平台；汽水、JOOX 等只能看到平台徽章。
- `vm` 不是硬安全边界。音源脚本可以在本机执行并访问网络，**只导入可信来源**。
- 音源脚本可能自行发起更新检查或修改请求头；这些行为由脚本决定，插件不拦截（只隔离文件系统与宿主进程 API）。

## 9. 这批音源的结构观察

对社区常见的 LX 音源脚本做静态阅读与运行时探测后，可以归纳出几类常见结构：

### 9.1 统一的外壳

绝大多数脚本都是：

```text
头部注释
  → 平台/音质常量
  → request / md5 / aes / 签名辅助函数
  → 一个或多个“后端”（backend）实现
  → Promise.any / 顺序 fallback
  → 音质校验（返回链接是否匹配请求音质）
  → on('request') 分发到平台实现
  → send('inited', { sources })
```

聚合源通常维护一个 `backends` 数组，每个后端有 `name`、`priority`、`fetch(songId, quality, musicInfo)`。高音质后端失败后降级到低音质或下一个后端。调试日志里看到的“所有后端均失败（共 N 个）”就是这一层。

### 9.2 三种取链方式

| 方式 | 例子 | 特点 |
| --- | --- | --- |
| 官方/半官方直链 | 酷我 `kw-er.kuwo.cn`、QQ `aqqmusic.tc.qq.com`、酷狗 `fsandroid.tx.kugou.com`、咪咕 `freetyst.nf.migu.cn`、网易云 `m801.music.126.net` | URL 里通常带时效签名（vkey / ekey / Key / auth），过期就 403 |
| 自建代理 | `yy1.zddyr.top/lx/api/...`、`music.haitangw.cc/...`、`175.27.166.236/kgqq/...` | 返回 302 或直接返回音频；代理本身经常挂、限流或返回 JSON 错误页 |
| 商业 API | `source.shiqianjiang.cn/api`（聆澜） | 需要 `X-API-Key` 或卡密；按平台/音质授权，某些平台会被卡密禁用 |

### 9.3 音质声明的差异

- 官方四档：`128k`、`320k`、`flac`、`flac24bit`。
- 聚合源扩展：`hires`、`atmos`、`atmos_plus`、`master`、`24bit`、`spatial`、`jyeffect`、`sky`、`jymaster`。
- 有的源把 `24bit` 当作最高档（如“全豆要”），有的用 `flac24bit`（如“聆澜”）；**同名不同义**。本插件按音源声明的原值传回，不统一改名。
- 搜索接口返回的 `types` 只代表平台侧可用档位，最终能否取到由音源决定；UI 会同时展示“平台档位”和“当前音源可选音质”。

### 9.4 Cookie / 配置

部分源在头部注释里带自定义字段：

```js
/*!
 * @name 墨澜聚合音源
 * @tx_cookie null
 * @wy_cookie null
 */
```

脚本通过 `lx.currentScriptInfo.rawScript` 重新解析这些字段。本插件把完整源码放进 `currentScriptInfo.rawScript`，所以这些配置能正常读取；修改 cookie 时直接编辑导入的脚本头部即可。

### 9.5 更新检查

不少脚本在 `inited` 后异步请求更新接口，然后 `send('updateAlert', { log, updateUrl })`。本插件会记录这条通知，但当前版本不在 UI 弹窗；需要更新时请到作者发布页下载新脚本再导入。

### 9.6 少数脚本的特殊行为

- 部分聚合源会声明非标准的 `search` action（例如为汽水音乐自行实现搜索）。LX 官方协议不会调用它，本插件也不依赖它；搜索仍走插件内置接口。
- 部分聚合源支持 `qs` / `sd` / `joox` 等额外平台 key；这些平台本插件没有搜索入口，只会在“支持平台”徽章里出现。
- 少数脚本声明了 `local` 源，`actions` 包含 `musicUrl`/`lyric`/`pic`；本插件只处理在线平台，不会调用 `local`。
- 部分脚本代码经过混淆（数万到数十万字符的字符串表 + 解码函数），但初始化后仍遵循同一套 `inited` / `request` 协议。
- 商业 API 型音源通常逻辑最简洁：直接把 `source + songId + quality` 发给服务端；失败信息也较明确（如“当前卡密不支持该平台或音质”）。

### 9.7 为什么插件不直接复用音源的搜索

即使个别脚本注册了 `search`，各家的请求参数、返回结构和错误语义都不统一（有的返回 `{list,total}`，有的直接抛错），没有可移植的契约。插件改用五个平台稳定的公开搜索接口 + 标准 `musicInfo`，音源只负责它最擅长的 `musicUrl`，这也正是 LX Music 本体的分工。

## 10. 参考

- LX Music 自定义源官方文档：<https://lxmusic.toside.cn/desktop/custom-source>
- LX Music 桌面版源码：<https://github.com/lyswhut/lx-music-desktop>
- 本插件不附带音源脚本；导入方式与使用说明见 [README.md](../README.md)。
