# 最高优先级 · 项目工作根目录

- 本仓库的唯一规范路径是 `D:\AI\_Workspace\Codex`；Git 根目录、工作目录和项目库根目录都必须是这一层。
- 本项目产生的所有文件必须留在此根目录内，包括源码、依赖、构建包、测试截图、日志、缓存、临时文件、下载、备份、导出和恢复资料。
- 临时与可清理产物统一放在 `.work/`：缓存放 `.work/cache/`，备份放 `.work/backups/`，临时文件放 `.work/tmp/`，归档放 `.work/archive/`。
- 安装包使用现有 `dist/`，测试与界面截图使用 `qa-output/`，录制输出使用 `media-output/`；这些目录仍位于本仓库根目录。
- 不得为了图方便把新产物写到 `C:`、`D:\AI_Workspace`、用户桌面或其它仓库。只有用户明确指定或系统/工具强制固定路径时才允许例外，并且必须在回复中说明。
- 本规则是项目级最高路径规则；设备安全红线仍高于本规则。

# Working on pet-with-you

This checkout is the canonical development source. Keep the sibling daily-use installation and media workspace independent. Use Dev-Pet.cmd / npm start for manual preview; never run the production launcher as a routine test. See docs/WORKSPACE.md.

Read README.md and docs/ARCHITECTURE.md before code changes. For installation, read docs/INSTALL.md and docs/TROUBLESHOOTING.md. Use the user's chosen scope; do not publish or export source unless requested.

See docs/PROJECT_HISTORY.md for development context and settled decisions. Update it for significant milestones; docs/VIDEO_PLAN.md owns the latest promotional-video requirements.

## Runtime and privacy

- Windows desktop application. Install with npm ci; Node.js >=22.12 is required.
- Use %APPDATA%/pet-with-you and pet-with-you.lnk. Keep lightweight one-time legacy migration; never copy runtime caches or remove the old rollback data automatically. project.cjs owns the data directory choice. settings-store.cjs owns settings.json and migration; secrets stay in credentials.local.json.
- Client-start integration uses the optional Codex withu launcher: always open both apps, preserve the saved pet mode, offer creation once on first connection, allow a custom destination. The followClientStart switch is retired; do not restore a watcher, process auditing, or client patches. Check latest preferences before client-triggered exit.
- Do not read or print live keys, auth.json, connection.json, private session contents, or the complete user config. Ask users to enter secrets through Settings.
- Use npm test and npm run test:ui. The UI runner uses temporary data and mocked providers. Do not run model calls or alter the live Codex installation for tests.
- Restart only the verified pet process, after checking no pet chat request is pending; never stop the user's Codex client.

## Behavior contracts

- Pure pet is the default. It retains own-API chat, whispers and provider quota without Codex.
- Settings save on close; profile save/load/delete/clear are explicit actions. Preserve masked secrets and unsaved drafts.
- Quota appears only for manual queries or opted-in new turn completions. No startup or periodic quota popup. Event mute blocks task reactions and automatic quota, not manual queries.
- Preserve position across recreation. Animation transitions must not introduce a second visible video or override dragging/manual actions.
- Avoid unnecessary scrollbars and keep module reorder handles using the normal pointer. Multi-task feedback shows counts and priority status on separate lines.

## Packaging and assets

- Use three-component semantic versions starting with 1.0.0. Do not publish or claim a release based only on a source version change.
- Keep source and docs synchronized; defer installer rebuilding and installation until pre-upload preparation or an explicit request. Shortcut labels use pet-with-u; the project, executable and repository remain pet-with-you.
- Launch paths must be derived from the checkout, environment or OS APIs, never a developer's username or drive.
- Root launchers are public entry points. Keep root services, runtime/, ui/, scripts/, test/, docs/ responsibilities clear.
- Generated files stay inside this repository. Use `.work/` for non-source outputs, `qa-output/` for test screenshots, and `media-output/` for recordings. Only explicitly selected safe docs images belong in source releases.
- Keep upstream copyright/license and attribution. Original character assets remain noncommercial; extracting or recording them does not make them original.
- The maintainer is Refining-colors and the repository is https://github.com/Refining-colors/pet-with-you. Project code uses MIT; keep LICENSE.upstream and do not claim character assets or fonts are unrestricted MIT.
- Update user documentation and meaningful regression tests for behavior changes. Use npm run check:docs for local file links.
