# LX Music 歌单（.lxmc）格式与插件处理

## 1. 文件结构

`.lxmc` 不是普通 ZIP，而是 **gzip 压缩的 JSON**（文件头 `1f 8b`）。解压后是一个 UTF-8 文本文件，内容形如：

```json
{
  "type": "playListPart_v2",
  "data": {
    "name": "王杰专辑",
    "id": "kg_b3cda635c4f23f8cf35659a36a2191f3",
    "source": "kg",
    "sourceListId": "40628861",
    "locationUpdateTime": null,
    "list": [
      {
        "id": "148841_6A50619437434F9D05985A6D284668D8",
        "name": "几分伤心几分痴",
        "singer": "王杰",
        "source": "kg",
        "interval": "04:11",
        "meta": {
          "songId": "148841",
          "albumName": "故事的角色",
          "picUrl": null,
          "qualitys": [
            { "type": "128k", "size": "3.84 MiB", "hash": "6A506..." },
            { "type": "320k", "size": "9.60 MiB", "hash": "4360..." },
            { "type": "flac", "size": "24.94 MiB", "hash": "4B71..." }
          ],
          "albumId": "959180",
          "hash": "6A506..."
        }
      }
    ]
  }
}
```

关键字段：

| 字段 | 说明 |
| --- | --- |
| `type` | 固定为 `playListPart_v2`（本插件也接受没有 `type` 的旧结构） |
| `data.name` | 歌单名 |
| `data.source` | **歌单标注的音源**，`kg` / `kw` / `tx` / `wy` / `mg` |
| `data.sourceListId` | 平台歌单 ID，仅展示 |
| `data.list` | 歌曲数组 |
| `item.name` / `item.singer` / `item.interval` | 歌曲信息 |
| `item.source` | 单曲音源；缺省时用 `data.source` |
| `item.meta.songId` | 平台歌曲 ID |
| `item.meta.hash` | 默认 hash（通常是 128k） |
| `item.meta.qualitys` | 各音质的 `type` / `size` / `hash`；本插件会选与目标音质匹配的 hash |
| `item.meta.albumName` / `albumId` / `picUrl` | 专辑与封面 |

## 2. 插件如何处理

1. **解析**：gzip 解压；如果遇到 ZIP 容器，则读取第一个条目。然后校验 `data.list`。
2. **存储**：归一化后写入 `$DSH_HOME/lx-geteer/playlists/<id>.json`；`id` 由歌单标识/名称/首曲生成。
3. **播放**：按 `data.source`（或单曲 `source`）选择平台，从 `qualitys` 里选目标音质的 hash 构造 `musicInfo`，交给当前激活的 LX 音源解析。
4. **音质**：使用输入框下方的音质按钮（默认 320K）；如果歌单没有该档位，选最接近的。
5. **播放模式**：单曲循环 / 列表循环 / 随机播放 / 顺序播放，保存在设置里，播放器里可切换。
6. **切歌**：下一首/上一首调用同一个解析流程；解析失败会自动尝试歌单里的后续歌曲（最多一轮）。

## 3. 注意

- 歌单的音源是**文件写明的**，不会被输入框下方的音源按钮覆盖。若当前音源不支持该平台，请在设置页切换音源。
- `.lxmc` 里的 hash/ID 是平台标识，**不是播放 URL**；仍然需要 LX 自定义源去解析。
- 歌单可能含失效/下架歌曲，插件会跳过解析失败的曲目。
- 文件只包含元数据，不含音频；不会上传到任何服务器。
