# Codex 云端开发

本项目可在 Windows 本地和 Linux 云端继续开发。网页仍是原生 HTML/CSS/经典 JavaScript，直接打开 `project/index.html` 即可使用；开发命令需要 Node.js 22+（建议 24 LTS）和 Python 3.9+，基础检查无需安装依赖。

## 接入 GitHub 与云端环境

1. 将项目完整上传到 GitHub，包括 `project/assets/`、`project/materials/`、`tests/`、`tools/` 和根目录 `AGENTS.md`。保留素材出处与既有验证报告。当前 `project/js/ai-config.js` 含比赛使用的前端密钥，因此仓库应保持私有；不要把密钥打印到日志、任务回复或截图。
2. 在 ChatGPT/Codex 中选择 **Work in → Cloud → Select environment → Create environment**（也可从 **Settings → Codex Cloud → Environments** 进入）。连接 GitHub，授权这个仓库并选中它。
3. 在环境准备对话中发送以下说明，让 Codex 配置并验证安装和启动流程：

   > 这是无需构建的静态网站。请在仓库根目录使用 Node.js 24 LTS、Python 3.9+。安装命令为 `bash tools/codex-setup.sh --browser`，基础验证为 `node tools/dev.js test`，浏览器验证为 `node tools/dev.js browser`。启动预览使用 `node tools/dev.js serve --host 0.0.0.0 --port 8765`，确认首页返回 HTTP 200。遵守 AGENTS.md，保持直接文件访问可用。常规测试使用模拟 AI 接口，不运行 tools/deepseek-smoke.js，不输出前端密钥。

4. 检查环境的安装、测试结果，保存并选择 **Publish**；出现 **Environment published** 后启动云端任务。

安装脚本需要 Node 和 Python 已可用，并会检查版本与运行现有基础测试；`--browser` 额外安装 Playwright、Chromium 及 Linux 浏览器依赖，需要安装阶段的网络访问与系统包安装权限。只做代码和内容修改时，可使用 `bash tools/codex-setup.sh`，无需安装浏览器。这些文件不会自动在账号中创建或发布环境。

若界面仍使用旧版 **Setup script / Maintenance script**，Setup 填 `bash tools/codex-setup.sh --browser`；Maintenance 可填 `node tools/dev.js check`。安装脚本会退出，不把持续运行的预览服务放进安装步骤。

## 开发与验证命令

在仓库根目录运行，Windows 和 Linux 使用相同的 Node 命令：

```sh
node tools/dev.js check
node tools/dev.js test
node tools/dev.js serve
```

`check` 检查网站、工具和测试的 JavaScript 语法；`test` 再运行内容/存储与模拟 AI 测试，以及 Python 实践案例测试。Python 不在 PATH 时可设置 `PYTHON` 为其可执行文件路径。预览默认仅监听 `127.0.0.1:8765`，云端需要端口预览时使用：

```sh
node tools/dev.js serve --host 0.0.0.0 --port 8765
```

预览只服务 `project/`。浏览器本机的 `localhost` 与云端容器相互独立，需使用环境提供的预览入口；若没有端口转发入口，云端仍可通过容器内浏览器回归生成截图。

## 浏览器回归

云端安装完成后运行：

```sh
node tools/dev.js browser
```

会顺序运行页面、AI 模拟交互、校史标题与校史动画回归，保留已有 HTTP/file 两种访问、手机/桌面布局与存储检查。Linux/macOS 默认使用 Playwright Chromium，Windows 默认保持 Microsoft Edge。可以设置 `PLAYWRIGHT_CHANNEL=chromium` 明确选择 Chromium，也可指定 `msedge`/`chrome`（需要对应浏览器已安装）。

Windows 首次安装可运行：

```powershell
npm install --prefix .codex-tools --no-save --package-lock=false playwright
node .codex-tools/node_modules/playwright/cli.js install chromium
$env:PLAYWRIGHT_CHANNEL = 'chromium'
node tools/dev.js browser
```

已有 Playwright 时仍可使用原来的 `NODE_PATH`。开发依赖存放在忽略的 `.codex-tools/`，不改变网页运行方式。截图与报告继续写入 `artifacts/`，不要重新生成历史性能的 before 基线。

### 本账号云端环境的实际验证

2026-10-04 在本账号的云端环境中，Node.js 24、Python 3.12 已可用；25 项 Node 测试、4 项 Python 测试通过，首页及 10 个脚本/样式资源返回 HTTP 200。使用系统 Chromium 对 390px/1440px 的首页、校史、校友、成长传承、我的成长完成 HTTP 页面检查。

这个托管环境禁止 Chromium 访问 `file://`（`ERR_BLOCKED_BY_ADMINISTRATOR`），Playwright 浏览器下载也受到网络策略限制。因此 `node tools/dev.js browser` 的完整回归尚未在该云端通过；直接文件及完整交互回归已在本机通过。不要绕过管理策略，或把 HTTP 页面检查等同于完整回归。

本账号已保存的环境使用安装好的 `/usr/bin/chromium`。环境安装脚本在忽略的 `.codex-tools/system-chromium.cjs` 中准备运行辅助文件，HTTP 浏览器检查可使用 `node --require ./.codex-tools/system-chromium.cjs`。该辅助文件由云端环境生成，不上传到源码仓库。后续任务遵循环境中已保存的安装脚本和启动说明；基础回归及 HTTP 预览仍使用上面的统一命令。

## 网络与数据

基础功能和模拟回归不需要 DeepSeek 或 OpenAI API Key。真实 AI 生成需要访问现有 DeepSeek 接口，普通开发不必开启模型联网或调用真实 smoke 命令。云端环境变量不会自动进入静态网页；只在环境中设置密钥不会替换 `ai-config.js`。如将来改为公开仓库，应先更换已经写入源码的密钥，并调整前端密钥交付方案。

收藏、计划等 localStorage 数据按浏览器和访问地址保存，不会随 GitHub 上传或自动同步到云端。迁移个人记录使用网页的 JSON 导出/导入。

官方说明（核对日期：2026-10-04）：[Codex Cloud](https://learn.chatgpt.com/docs/cloud)、[云端环境](https://learn.chatgpt.com/docs/environments/cloud-environments)、[旧版环境配置](https://learn.chatgpt.com/docs/environments/cloud-environment)。
