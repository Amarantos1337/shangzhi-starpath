# 商职星途 · 九秩校庆

面向在校生、校友与作品浏览者的校庆专题，以“回望校史—走近校友—传承成长—行动献礼”串联内容。保留面向计算机与信息类零基础新生的完整学习指南。无需安装依赖，直接打开 `project/index.html` 即可使用。

## 内容

- 红金校庆首页与原创90周年纪念主视觉；保留原始校徽、人物照片和星途插画。
- 九秩校史：1936—2026年间的9个发展节点，覆盖中专积淀、高职建校、示范建设、“双高计划”和职业本科；首页展示4个精选节点，2026年纪念主题单独标注。
- 成长献礼：创建包含回望校史、走近校友、实践献礼三个任务的自定义计划，可编辑、记录进度和备份。
- 4 份校友档案：公开经历逐项关联来源，平台分析与资料边界单独呈现。
- 3 条成长指南：每条 4 个阶段、12 项任务，包含准备、操作、样例、验收与排障。
- 升学 AI 计划：填写个人情况后联网检索，预览4阶段、12–24项建议任务，再保存到本机；保留原始模板入口。
- 3 个实践案例：校园指南网页、Python 学习时间统计、本地 HTTP 服务排障。
- 6 张方法卡：任务拆解、错误求助、信息核实、项目说明、作品演示、每周复盘。

从“成长传承”的“零基础从这里开始”进入网页案例。实践详情可下载 ZIP，包含起始文件、参考成品及说明；解压后使用。Python 案例需要单独安装 Python 3，网站本身不需要 Python。

导航为校庆首页、九秩校史、校友风采、成长传承、我的成长。新增 `#/history`，其余原有 hash 地址继续有效。

## 本地预览

Codex 云端开发与 GitHub 接入见 [云端开发说明](docs/codex-cloud.md)。新增统一命令：`node tools/dev.js check`（语法）、`node tools/dev.js test`（基础回归）、`node tools/dev.js serve`（预览）。云端 Linux 安装执行 `bash tools/codex-setup.sh --browser`；浏览器测试在 Windows 使用 Edge，在 Linux 使用 Chromium。网页仍无需构建或安装依赖。

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory project
```

打开 `http://127.0.0.1:8765/`。直接双击 HTML 与 HTTP 预览均受支持。不同地址的浏览器存储相互独立，转移记录可使用 JSON 备份。

## 内容维护

- `project/js/data.js`：校庆文案、校史来源、献礼任务、原始人物资料与稳定路线 ID。
- `project/js/learning.js`：指南、实践、方法卡、官方资源、人物编辑分析，均挂在 `window.StarPath.data`。
- `project/js/storage.js`：继续使用 `shangzhi-starpath:v1` 和原备份格式；旧计划不会被新模板替换。`createPlan(null, details)` 可传 `initialTasks: [{ title, stage }]`，一次校验和保存；编号自动生成，日期为空、状态为未完成。预置任务仅适用于自定义计划，最多100项，计划上限仍为20份。
- `project/js/app.js`：渲染、hash 路由与交互；实践地址为 `#/practice/<id>`。
- `project/css/learning.css`：补充阅读组件，复用原有设计变量。
- `project/css/anniversary.css`：校庆首页、校史、献礼弹窗及手机布局。
- `project/materials/`：原创教学材料与可下载 ZIP。

经典脚本按 data → learning → storage → ai-config → ai → app 顺序加载；不使用模块、CDN 或后端。仅升学 AI 功能通过 fetch 访问 DeepSeek，其余本地功能不依赖网络。修改材料后执行 `python tools/package-materials.py` 重新生成 ZIP。

## 升学 AI 计划

在 `#/paths/education` 点击“使用这条路线”，填写学历、专业、年级、基础和地区，开始日期默认当天。学历只有专科、本科；专科可选择大一至大三，本科可选择大一至大四，切换学历时清除不适用年级。“目标院校与专业”选填，占位提示为“请输入心仪院校和专业”；留空时根据专业、基础、年级和地区，搜索并推荐2–3所院校，预览和保存页单独展示推荐理由及院校官网/研招网出处。推荐是候选方向，不代表用户已选定院校或保证录取。不再收集计划周数、每周时间和限制条件。提交的个人情况会发送给 DeepSeek；不收集姓名、联系方式，也不把完整表单存入计划备份。

计划在请求前按年级确定目标初试年份，AI 返回的正式日期必须与该年份一致。按9月开始的学年和四年制本科推算，大四上学期参加初试：2026年秋的大一、大二、大三、大四分别对应2029、2028、2027、2026年初试（招生入学年度再加一年），春季仍属于上一年开始的学年。如果开始日期已经晚于当学年考试季，则顺延一个考试年度。年级按所填开始日期所在学年理解。专科暂按三年专科衔接两年本科估算，明确标注路径、毕业时间和报考资格待核实，不默认具备应届本科资格。

目标年度考试日期已公布时，AI 引用实际搜索返回的教育部、教育部教育考试院或研招网通知，计划至初试前一天；尚未公布时，使用目标年份12月第三个周六作为**暂定学习规划参考**，截止前一天，预览明确显示“考试季暂定安排，初试日期未公布”。正式 `examDate`、`examSourceUrl` 留空，不将计算日期或往年通知冒充该年度官方日期；公告发布后可修改日期或重新生成。长线任务必须覆盖整个期限的前、中、后期，低年级打基础，高年级强化冲刺。旧计划不会自动改写，先前生成期限不符的计划需重新生成。

生成时表单收起，展示“AI 搜索资料”“AI 思考并生成计划”两个进度阶段，以及实时“已用时x分钟x秒”。完成后在预览显示“用时x分钟x秒”，保存和备份后仍保留总用时。取消、失败或切页会清理计时器，失败时恢复已填写表单。

`project/js/ai-config.js` 集中配置 API Key、接口、模型 `deepseek-flash`、思考强度 `high` 和180秒总超时。按比赛要求，Key 保存在前端源码，查看源码或网络请求即可读取；更换密钥只需修改此配置。

使用 DeepSeek Anthropic 兼容接口的 `web_search_20250305` 工具，最多3次搜索，最多2次协议续接；取得真实搜索结果后生成结构化计划。无结果时明确报错，不把模型记忆标为联网资料。格式校验失败最多修复一次。API 错误、断网、超时均保留表单，允许重试或使用原始模板。关闭弹窗或切页会取消请求；预览和取消不保存，确认保存创建独立计划。

任务和日期为 AI 学习建议，资料摘要未经人工核实；报名资格、科目与日期以对应年度官方通知为准。计划保留参考标题、链接、模型与检索生成时间，现有编辑、进度和备份功能继续使用。来源标题移除搜索结果中的 HTML 碎片，文本继续转义；AI 弹窗采用网站金色圆角滚动条，悬停为主题红色。`store.createAiPlan(details)` 接收 `{ title, goal, tasks: [{ title, stage, dueDate }], generation: { model, generatedAt, summary, sources: [{ title, url }], durationSeconds?, period?, recommendations? } }`，校验后一次保存，自动生成编号。`period` 包含开始、截止、正式初试日期及出处；新记录另含 `targetExamYear`、`dateStatus`（official/estimated）和 `planningBasis`，`recommendations` 为 `{ name, reason, sourceUrl }` 数组。v1 备份的新增字段均可选，旧备份仍兼容，新备份保留暂定日期状态与推荐出处。

新增验证命令：

```powershell
node --test --test-isolation=none tests/content.test.js tests/ai.test.js
node tests/ai-browser.test.js
```

浏览器回归使用 Playwright 与 Microsoft Edge，以模拟接口覆盖直接文件/HTTP、390px/1440px、预览保存、修改、导入、取消、重复提交和错误处理；截图与结果在 `artifacts/ai-plan/`。`node tools/deepseek-smoke.js` 检查真实搜索，`node tools/deepseek-smoke.js --plan` 检查完整 high 模式生成并保存不含密钥的结果；这些命令会实际使用 API 额度，常规回归不会联网调用模型。

`node tools/deepseek-smoke.js --browser` 在隔离的无界面 Edge 中从直接文件页面完成真实检索、high 模式生成和保存，输出预览截图、备份和验证结果；同样会使用 API 额度，不操作日常浏览器数据。

`node tools/deepseek-smoke.js --browser --freshman` 以本科大一、目标院校留空进行真实完整验证，产物另存到 `artifacts/ai-plan/freshman/`。常规 AI 测试增加按年级/跨学年推算、长期任务分布、未公布日期标记、空目标推荐及备份恢复；浏览器回归覆盖390px、1042px、1440px和两种访问方式。

人物资料保留官方标题、日期和链接。2026-09-26 更新时无法重新读取母校报道，未新增未经核实的校友事实；北京工业大学教师主页已复核博士、博士后及教学科研阶段。历史任职与职称不当作当前信息。校园问答、学习记录和方法样例均为教学模拟。

校史于2026-09-29扩充，依据学校公开资料、教育部文件、《山东年鉴1987》、鲁商集团公告与《齐鲁晚报》访谈整理。每条节点附资料日期及原文链接，来源页同步汇总；资料日期与事件年份分别展示。本专题为学生创作；90周年主视觉不是官方校庆标识，“2026·九秩同行”不是官方活动公告，献礼任务为平台建议，完成情况由用户自行记录。

## 验证

语法与内容、存储兼容检查只需要 Node；案例测试只用 Python 标准库：

```powershell
node --check project/js/data.js
node --check project/js/learning.js
node --check project/js/storage.js
node --check project/js/app.js
node --test --test-isolation=none tests/content.test.js
python tests/practice.test.py
```

可选浏览器回归使用 Playwright，Windows 默认 Microsoft Edge，Linux/macOS 默认 Chromium：`node tests/browser.test.js`；校史标题动画可单独运行 `node tests/history-title.test.js`，全部浏览器回归可运行 `node tools/dev.js browser`。若 Playwright 不在默认模块路径，可安装到 `.codex-tools/` 或通过 `NODE_PATH` 指向已有依赖目录；运行网站不依赖它。这些测试使用隔离的无界面浏览器和本机临时端口，不操作日常浏览器数据。

校史动画回归：`node tests/history-motion.test.js`，覆盖按需拆字、独立播放、键盘来源链接、快速切页和减少动画。性能对比在修改前后分别执行 `node tests/history-motion.test.js --profile before` 与 `node tests/history-motion.test.js --profile after`；使用相同的390px/1440px滚动操作、正常与4倍CPU降速，各重复3次。性能记录、浏览器时间线（gzip压缩JSON）及截图写入 `artifacts/history-motion/`，不要用优化后的代码重新生成修改前基线。

测试覆盖直接文件和 HTTP 两种访问、390px/1440px 布局、导航与历史、键盘折叠区、案例筛选、下载、原路线及献礼计划创建编辑、刷新保存、重复创建、旧备份恢复与取消、无效导入、存储不可用和减少动画设置。校庆截图、改造前备份、旧版测试数据与验证记录位于 `artifacts/anniversary/`；既有验证材料保留在 `artifacts/content-depth/`。

比赛演示建议：校庆首页 → 九秩校史 → 校友公开经历 → 成长传承与实践案例 → 创建献礼计划 → 记录完成与导出备份。所展示路线为平台教学设计，不是具体赛事的官方赛题或评分规则。
