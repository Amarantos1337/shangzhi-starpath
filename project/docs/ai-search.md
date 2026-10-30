# AI 搜索与迁移实测

升学规划直接调用 DeepSeek Search API，再把实际返回的官方资料交给模型整理；模型生成请求不启用内置搜索工具。正文缺失时，国家政策和逐校核验任务可调用 Fetch API 补充。

## 请求与限制

- Search：`POST https://api.deepseek.com/v1/tools/search`，Bearer 鉴权，`count: 5`、`need_content: true`，查询不超过 128 个 Unicode 字符。
- Fetch：`POST https://api.deepseek.com/v1/tools/fetch`，Bearer 鉴权。每流程最多抓取六个不同网址，同一网址不重复抓取；最多两次 HTTP 瞬时错误重试。
- 模型：保留原有 Anthropic 兼容接口、模型与思考强度配置；搜索、学习行动和最终生成共享最多八个并发任务槽位。
- 指定院校至少完成六次搜索，院校推荐至少十五次；包括 HTTP 重试在内，搜索请求最多十八次，总超时 300 秒。超时和取消会中断全部任务及重试等待。
- 408、429、5xx 最多重试两次，等待一秒、两秒。401、402 立即失败。可选抓取失败保留搜索摘要；缺少实际证据不能声称要求已经核实。
- 仅接受现有官方域名白名单，并继续排除论坛、凭据网址及伪装域名。来源匹配及结构验证不等于人工事实核查。

## 测试

常规测试无需凭据，使用模拟接口：

```text
node tools/dev.js test
node tests/ai-browser.test.js
```

真实测试需要显式设置进程环境变量 `DEEPSEEK_API_KEY`，会产生 API 费用。不要把密钥写入脚本、报告或命令输出。

```text
node tools/ai-search-migration.js baseline artifacts/ai-search-migration/<新目录>
# 保存旧方案结果后才迁移实现
node tools/ai-search-migration.js direct artifacts/ai-search-migration/<同目录>
node tools/ai-search-migration.js compare artifacts/ai-search-migration/<同目录>
node tools/ai-search-browser.js artifacts/ai-search-migration/<同目录>
```

baseline/direct 分别运行三种场景各两次；失败计入六次尝试，不补跑。鉴权、余额和持续网络阻塞会停止无效尝试。结果文件存在时拒绝覆盖。基线必须在修改 AI 实现前运行；代码快照仅用于追溯，不作为运行时后备路径。

每次保存完整输入、计划或错误、UTC 与 Asia/Taipei 时间、毫秒耗时、首条来源时间、阶段时间和逐请求记录。并发时间按实际区间记录或取并集，不能相加得到完整流程耗时。API 请求记录不保存请求头，输出另做密钥脱敏；用量缺失记为空值，搜索/抓取次数与模型 token 分开统计。

`ai-search-browser.js` 的真实 Search/Fetch 请求只验证浏览器跨域可用性，其余界面操作回放已成功的真实生成结果，不计为额外完整 AI 流程。历史 `ai-performance` 等工具的旧报告不作为本次迁移结论，使用新目录中的 JSON 和中文报告。

实际请求和返回字段以 [DeepSeek 官方文档](https://api-docs.deepseek.com/zh-cn/guides/search/) 为准。
