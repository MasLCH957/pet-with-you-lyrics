# pet-with-you-lyrics

让桌宠在陪你工作时，也能把正在播放的歌曲和同步歌词安静地放在桌面上。

本仓库基于 [Refining-colors/pet-with-you](https://github.com/Refining-colors/pet-with-you) 创建，当前开发目标是在保留原有桌宠、聊天、Codex 任务联动、额度和多角色能力的基础上，加入跨音乐平台的歌词显示。

本 Fork：[MasLCH957/pet-with-you-lyrics](https://github.com/MasLCH957/pet-with-you-lyrics)

上游项目：[Refining-colors/pet-with-you](https://github.com/Refining-colors/pet-with-you)

角色与动画来源：[PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)

## 项目目标

用户播放音乐或本地音频时，桌宠应自动识别当前歌曲，并在桌宠下方显示与播放进度同步的歌词。功能需要尽量不干扰原有任务气泡、碎碎念和额度卡片，也不能把实现绑定到某一个音乐平台。

具体需求如下：

1. 通过 Windows 系统媒体会话读取当前歌曲、歌手、专辑、播放状态、播放进度和歌曲时长。
2. 兼容向 Windows 暴露媒体会话的播放器，例如 QQ 音乐、网易云音乐、Spotify、浏览器和本地播放器。
3. 歌曲变化时自动匹配在线歌词，并按照播放进度显示当前歌词与下一句。
4. 优先使用带时间轴的 `.lrc`；只有纯文本歌词时提供估算时间轴，并明确标识为普通歌词。
5. 在线歌词不可用或匹配错误时，允许用户为当前歌曲导入本地 `.lrc`，本地版本优先。
6. 在设置页提供显示开关、在线匹配开关和同步微调，不需要修改配置文件。
7. 歌词卡片显示在桌宠下方，不抢占现有工作状态、碎碎念和额度气泡的位置。
8. 在线匹配只发送歌曲元数据，不发送播放器账号、登录凭据或本地文件内容。
9. 支持通过 Windows 系统媒体会话控制上一首、下一首和播放暂停。

## 当前实现

- 使用 `powershell.exe` 和 Windows `GlobalSystemMediaTransportControlsSessionManager` 读取系统媒体会话。
- 优先通过 [LRCLIB](https://lrclib.net/) 匹配在线歌词；未收录时自动尝试 QQ 音乐歌词作为后备。
- 支持标准 LRC 时间戳、多个时间戳、小数秒、元数据标签和同步歌词。
- 没有同步歌词时，将纯文本歌词按歌曲时长生成估算时间轴。
- 本地 `.lrc` 会按当前歌曲保存到用户数据目录，并在再次播放时优先使用。
- 在线匹配结果会缓存到本机，减少重复请求。
- 歌词卡片独立于原有气泡优先级，显示当前句、下一句、歌曲信息和播放进度。
- 歌词卡片右上角提供上一首、播放暂停和下一首按钮，桌宠右键菜单也提供同样的音乐控制。
- 设置页新增歌词显示、自动匹配、同步微调、本地 LRC 导入、清除本地覆盖和重新匹配。
- Windows 媒体会话不可用、没有歌曲、纯音乐、歌词缺失或网络失败时，界面会显示明确状态，不阻塞桌宠启动。

## 数据流

```text
Windows SMTC
    │  歌曲元数据 / 播放状态 / 时间轴
    ▼
lyrics-media.ps1 ──NDJSON──► lyrics.cjs
                                │
                                ├─► 本地 LRC 覆盖
                                ├─► 本机歌词缓存
                                └─► LRCLIB 在线匹配
                                │
                                ▼
                       /lyrics/status
                                │
                                ▼
                     runtime/lyrics.js
                                │
                                ▼
                    桌宠下方的歌词卡片
```

`server.cjs` 负责歌词状态接口与设置联动；`main.cjs` 负责本地 LRC 文件选择；渲染端只读取已经清洗过的展示状态。

## 主要文件

| 文件 | 作用 |
| --- | --- |
| `lyrics-media.ps1` | 读取 Windows 系统媒体会话并输出结构化状态 |
| `lyrics.cjs` | 媒体状态归一化、LRC 解析、在线匹配、缓存和当前歌词计算 |
| `runtime/lyrics.js` | 桌宠歌词卡片和轮询逻辑 |
| `runtime/lyrics.css` | 歌词卡片样式、布局和动画 |
| `ui/lyrics.js` | 设置页歌词模块、状态预览和本地 LRC 操作 |
| `preferences.cjs` | 歌词显示开关、自动匹配和同步微调持久化 |
| `test/lyrics.test.cjs` | LRC 解析、时间轴和歌词服务回归测试 |

## 本地开发

环境要求：

- Windows 10 / 11
- Node.js 22.12 或更高
- 可选：支持 Windows 系统媒体会话的音乐播放器

安装和启动：

```powershell
npm ci --include=dev
node launch.cjs
```

也可以双击：

- `Install-Pet.cmd`：安装依赖
- `Start-Pet.cmd`：启动桌宠
- `Dev-Pet.cmd`：使用隔离的预览数据启动

运行自动测试：

```powershell
npm test
```

只运行歌词测试：

```powershell
node --test test/lyrics.test.cjs
```

## 验收标准

- [x] 播放器开始播放后，桌宠在合理时间内显示歌曲名和歌手。
- [x] 在线同步歌词会在正确时间切换，暂停后停留在当前句。
- [x] 歌曲切换后，旧歌歌词不会覆盖新歌。
- [x] 无同步歌词时能够显示普通歌词，并标明估算时间轴。
- [x] 导入当前歌曲的本地 `.lrc` 后，本地歌词优先于在线结果。
- [x] 关闭歌词显示后卡片立即隐藏，媒体读取停止。
- [x] 歌词显示不会抢占任务卡、碎碎念、额度查询和错误气泡。
- [x] 网络失败、LRCLIB 不可达或无媒体会话时，桌宠其他功能保持正常。
- [x] 设置关闭后自动保存，重启桌宠仍保留歌词开关、自动匹配和同步微调。
- [x] 可通过歌词卡片或右键菜单控制上一首、播放暂停和下一首。
- [x] Electron 源码测试与设置界面测试通过。
- [ ] Windows 安装包与全新用户环境完整回归。

## 已知边界

- 只能读取播放器主动提供给 Windows 系统媒体会话的信息。拒绝系统集成或使用独占音频通道的应用可能无法识别。
- LRCLIB 的歌词覆盖率不是 100%；未收录歌曲需要导入本地 LRC。
- 系统媒体会话偶尔只提供较粗的时间轴更新。需要更精确对齐时，可使用设置中的同步微调。
- 在线来源为 LRCLIB 与 QQ 音乐后备查询；两者都未收录时仍需导入本地 LRC。后续可继续增加可插拔歌词源，但不应把登录凭据写入源码或日志。
- 当前功能面向 Windows；macOS 的 MediaRemote、Linux 的 MPRIS 尚未实现。

## 后续工作

1. 补充多播放器、浏览器播放、暂停恢复、拖动进度条和切歌的界面自动化测试。
2. 为当前歌曲增加歌词来源标签、全文查看和管理缓存入口。
3. 评估可选翻译歌词、逐字歌词、卡拉 OK 高亮和多行滚动模式。
4. 增加歌词源适配层，并保持 LRCLIB 作为无需 API Key 的默认来源。
5. 在全新 Windows 环境中验证安装、升级、卸载和用户数据保留。
6. 构建并发布带歌词功能的 Windows 安装包。

## 来源、许可与说明

上游 `pet-with-you` 的代码采用 MIT 许可。原角色、动画和素材另受上游非商用与署名约定约束，详见 [ATTRIBUTION.md](ATTRIBUTION.md) 和 [LICENSE.upstream](LICENSE.upstream)。

本仓库保留： [上游 README 快照](README.upstream.md)、[安装说明](docs/INSTALL.md)、[使用手册](docs/USER_GUIDE.md) 和 [排错手册](docs/TROUBLESHOOTING.md)。
