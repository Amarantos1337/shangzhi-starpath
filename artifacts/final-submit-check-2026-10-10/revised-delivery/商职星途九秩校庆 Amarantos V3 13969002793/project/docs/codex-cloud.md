# 提交包环境与云端继续开发边界

本文件保留原路径，作为提交包中关于环境的说明。网站为原生HTML、CSS和经典JavaScript，无前端安装或构建步骤。

## 本包可以独立执行的命令

在提交包根目录运行：

```sh
node readme/check-submission.js
python -m http.server 8765 --bind 127.0.0.1 --directory project
```

Node.js 22+仅用于可选交付检查；Python 3.9+仅用于可选预览和Python实践。Windows只有启动器时可用py -3；Linux/macOS可用python3。打开http://127.0.0.1:8765/，Ctrl+C停止服务。直接打开project/index.html不需要Python或Node。

完整说明见 [运行与部署说明](../../readme/运行与部署说明.md)、[组件与素材说明](../../readme/组件与素材说明.md)、[验收记录](../../readme/验收记录.md)。

## 开发仓库与提交包的区别

本包不含开发仓库的tools/、tests/、云端安装器或浏览器测试依赖。原开发命令依赖那些文件，已经从提交版运行说明中移除，不能在本目录执行。继续云端开发时，需另行取得完整开发仓库及其环境指南。

经典脚本顺序为data → learning → storage → ai-config → ai → app；保持相对资源路径。网站原有DeepSeek功能需要联网，未新增码道运行依赖。本次制作和测试工具安装在提交包外，不影响网站复现。

本次仅完成本地材料，不创建云端环境、不发布网页、不上传比赛。维护比赛配置时不得将密钥输出到日志、回复或截图。
