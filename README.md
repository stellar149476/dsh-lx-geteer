# dsh-lx-geteer

在 DeepSeek Harness 里 **直接说想听什么歌**，或导入 **LX Music 歌单（.lxmc）**：插件用你导入的 **自定义音源** 搜索、解析播放链接，并在右侧播放器播放。输入框下方有音质按钮（默认 **320K**）和音源按钮（默认 **网易云**）。

> 插件 id / 包名：`dsh-lx-geteer`  
> 设置入口：**设置 → LX 音源抓取**  
> **本插件不附带任何音源脚本**，首次使用需要自己导入 `.js` 音源。

## 功能

- **对话点歌**：在对话框输入「想听周杰伦的晴天」「放首告五人的歌」，模型会调用 `play_music`，自动搜索并用当前音源解析。
- **右侧播放器**：解析成功后右侧边栏自动弹出播放器并开始播放；切到别的侧边栏页签时音乐继续播放。
- **歌单播放**：设置页可导入 `.lxmc` 歌单（gzip/ZIP 内的 JSON），按歌单文件标注的音源播放，支持单曲循环 / 列表循环 / 随机播放 / 顺序播放。
- **音质 + 音源按钮**：输入框工具行有音质按钮（默认 320K）和音源按钮（默认网易云），可选 128K / 320K / FLAC / 24BIT、五个平台及当前音源支持的扩展音质。
- **五平台搜索**：酷我、QQ 音乐、网易云、酷狗、咪咕。
- **只使用自定义音源**：音源库完全由你导入的脚本组成；插件不内置、不自动下载任何音源。
- **LX 音源解析**：模拟 `globalThis.lx`（`request`、`utils.crypto`、`utils.zlib`、`currentScriptInfo.rawScript`、`inited` / `request` 事件）。
- **导入即校验**：选择 `.js` 文件或粘贴脚本；导入时实际初始化一次，失败自动撤销。首次导入会自动设为当前音源。
- **搜索下载**：设置页仍保留搜索/下载面板，可把歌曲保存到手机。
- **设置持久化**：默认音质/音源、播放模式、下载目录、每页数量、解析超时保存在 `$DSH_HOME/lx-geteer/data.json`。

## 使用

### 1. 导入音源

1. 打开 **设置 → LX 音源抓取**。
2. 在「音源与设置」里展开 **导入音源**。
3. 选择作者发布的 `.js` 文件（或粘贴脚本），点 **导入并校验**。
4. 第一个音源会自动启用；之后导入的点音源旁的「使用」切换。

### 2. 在对话框点歌

直接输入：

```text
想听周杰伦的晴天
放一首告五人的爱人错过
来首网易云的音乐
```

模型会调用 `play_music`。解析成功后：

- 右侧边栏自动打开「正在播放」页签；
- 播放器显示封面、歌名、歌手、音质和平台；
- 自动尝试播放（浏览器若拦截自动播放，会显示“点此播放”按钮）；
- 可以在播放器里暂停、拖动进度或重新获取链接。

### 3. 选音质和音源

输入框下方工具行有两个按钮：

- **音质**：默认 320K；可选 128K / 320K / FLAC / 24BIT，以及当前音源支持的 `hires` / `master` / `atmos` 等扩展音质。
- **音源**：默认网易云；可选网易云 / QQ / 酷我 / 酷狗 / 咪咕。

点歌时如果没有明确指定，就使用这两个按钮的值；如果当前音源不支持所选音质/音源，会自动选最接近或下一个可用平台。

### 4. 导入并播放歌单

1. 在 **设置 → LX 音源抓取 → 歌单库** 点 **导入 .lxmc 歌单**。
2. 选择 LX Music 导出的 `.lxmc` 文件。
3. 导入后点歌单右侧的 **播放**；右侧播放器会自动打开。
4. 播放器里的按钮可以切歌、切换播放方式：
   - 单曲循环
   - 列表循环
   - 随机播放
   - 顺序播放

歌单使用文件里标注的音源（例如 `王杰专辑.lxmc` 标注的是 `kg` 酷狗），不跟随输入框下方的音源按钮；如果当前音源不支持该平台，会提示先切换音源。

### 5. 搜索下载（可选）

设置页的「搜索下载」仍可手动搜索并下载到 `/sdcard/Music/lx-geteer`。

### 导入音源注意

- 插件只接受 LX Music 自定义源格式（脚本开头必须有 `/*! ... @name ... */` 注释）。
- 音源是第三方 JavaScript，会在本机执行并访问网络，**只导入你信任的来源**。
- 导入的原文件会复制到 `$DSH_HOME/lx-geteer/sources/`，之后删除原文件不影响插件。
- 同一个脚本重复导入会被拒绝；作者更新后请导入新版，再删除旧版。
- 音源的后端接口随时可能失效，插件无法修复其上游；失败时换一个音源或导入作者的新版本。

## 工作原理

```text
对话框「想听…」
   │  Agent tool: play_music
   ▼
Host 插件
   ├─ lib/search.js      五平台搜索 → 标准 musicInfo
   ├─ lib/lx-runtime.js  node:vm 中运行用户导入的 LX 源 → musicUrl
   ├─ lib/player.js      播放状态 + /lx-geteer-stream 音频代理（带 Range/Referer/类型嗅探）
   ├─ lib/playlist.js    .lxmc 解析、歌单存储与播放索引
   ├─ lib/download.js    流式下载到 /sdcard/Music/lx-geteer
   └─ lib/store.js       自定义音源库与设置持久化
   │  GET /lx-geteer-api?op=player
   ▼
Client 轮询到新的播放 revision
   ├─ sidebarRight.openTab('lx-geteer/player') → 右侧边栏自动弹出
   └─ 播放器 <audio> 加载 /lx-geteer-stream → 自动播放
```

自定义源协议本身**没有搜索**，只提供 `musicUrl`。因此搜索由插件内置接口完成，解析链接由当前音源完成——这与 LX Music 本体「内置搜索 + 自定义源解析」的分工一致。协议细节见 [docs/LX-CUSTOM-SOURCE.md](docs/LX-CUSTOM-SOURCE.md)，歌单格式见 [docs/PLAYLISTS.md](docs/PLAYLISTS.md)。

## HTTP API

Host 半在 `webServer` 注册同源路由 `/lx-geteer-api`（支持反向代理子路径，客户端会自动补前缀）：

| 方法 | 操作 | 说明 |
| --- | --- | --- |
| `GET ?op=state` | 状态 | 当前音源、音源列表、平台能力、设置、任务、播放器 |
| `GET ?op=player` | 播放器状态 | 当前歌曲、音质、token、revision、歌单上下文 |
| `GET ?op=playlists` | 歌单列表 | 已导入歌单摘要 |
| `GET ?op=jobs` | 任务列表 | 最近 30 个下载任务 |
| `GET ?op=job&id=…` | 单个任务 | 轮询进度 |
| `GET ?op=logs` | 运行日志 | 当前音源运行时日志 |
| `POST {op:'play',query,platform?,quality?}` | 点歌 | 搜索→解析→发布播放状态 |
| `POST {op:'importPlaylist',data,filename}` | 导入歌单 | `data` 是 .lxmc 的 base64 |
| `POST {op:'playPlaylist',id,index?}` | 播放歌单 | 从指定曲目开始 |
| `POST {op:'playlistNext' / 'playlistPrev',auto?}` | 切歌 | 自动切歌时 `auto:true` |
| `POST {op:'setPlayMode',mode}` | 播放模式 | single / list / shuffle / sequential |
| `POST {op:'deletePlaylist',id}` | 删除歌单 | |
| `POST {op:'search',platform,query,page,limit}` | 搜索 | 返回标准 `list` / `total` / `allPage` |
| `POST {op:'download',platform,quality,song}` | 下载 | 返回 job，异步执行 |
| `POST {op:'cancelJob',id}` | 取消 | |
| `POST {op:'activate',id}` | 切换音源 | 先加载成功再提交 |
| `POST {op:'import',script,filename}` | 导入音源 | 校验失败自动撤销；首个音源自动启用 |
| `POST {op:'delete',id}` | 删除导入音源 | 删除当前音源后回到“未导入”状态 |
| `POST {op:'settings',settings}` | 保存设置 | |
| `POST {op:'reload'}` | 重新加载当前音源 | |
| `POST {op:'testSource',id}` | 初始化测试 | 不切换当前音源 |

音频代理：`GET /lx-geteer-stream?id=<token>`（支持 `Range`，Host 侧补平台 `Referer`/`User-Agent`）。

## Agent 工具

`play_music`：

| 参数 | 说明 |
| --- | --- |
| `query` | 必填，歌名 + 歌手，例如「周杰伦 晴天」 |
| `platform` | 可选，`kw` / `tx` / `wy` / `kg` / `mg` |
| `quality` | 可选，`128k` / `320k` / `flac` / `flac24bit`；默认跟随音质按钮 |

## 开发

```bash
# 语法检查
node --check index.js
node --check client.js
for f in lib/*.js; do node --check "$f"; done

# 安装到当前 profile（本地目录会以 link 方式安装）
# 在 DSH 中调用 plugin_manager: install_bundle(target="/path/to/dsh-lx-geteer")
```

目录：

```text
index.js              Host：Web 路由、点歌/下载调度、play_music 工具
client.js             Client：设置页、音质按钮、右侧播放器
lib/lx-runtime.js     LX 自定义源沙箱
lib/search.js         五平台搜索与结果归一化
lib/player.js         播放状态与音频代理
lib/playlist.js       .lxmc 歌单解析与存储
lib/download.js       下载任务与流式写入
lib/store.js          自定义音源库/设置持久化
locale/               插件管理页的标题/描述
docs/                 协议说明
```

## 安全说明

- 音源是第三方 JavaScript，会在宿主进程中通过 `node:vm` 执行，并可通过 `lx.request` 访问网络。**只导入你信任的脚本。**
- 沙箱没有 `require`、`process`、文件系统 API；但 `vm` 不是硬安全边界，恶意脚本仍可能消耗 CPU/网络。
- 下载只写入你配置的目录；默认是 `/sdcard/Music/lx-geteer`。
- API 与音频代理只接受同源浏览器请求（校验 `Origin` 与 `Host`）。

## 许可

插件代码：MIT。你导入的音源脚本版权归各自作者所有。
