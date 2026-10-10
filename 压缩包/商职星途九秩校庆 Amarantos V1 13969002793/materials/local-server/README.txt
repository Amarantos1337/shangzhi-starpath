本地网站运行与排障 · 原创教学示例

需要 Python 3。安装与命令入口检查见本站案例；只用标准库。
解压 ZIP，进入 starter 目录，在地址栏输入 powershell 回车打开终端。

执行：python -m http.server 8777 --bind 127.0.0.1 --directory site
浏览器打开：http://127.0.0.1:8777/
若系统只提供 py，将命令里的 python 替换为 py。
若 8777 被占用，改用 8778，浏览器地址也改用 8778；不结束未知进程。

在网络面板观察首页 / 与 /missing.html 的状态。
起始页“查看说明”故意指向不存在的 info.html。
检查 site 中实际文件，将链接改为 about.html，然后验证。
填写 report-template.txt，与 reference/report.txt 比较。
reference/site 是修复后的参考成品；可在 reference 目录用同一命令运行。

本次练习只监听 127.0.0.1，不需要对外发布或购买服务器。
结束时回到自己启动服务的终端按 Ctrl+C。
访问新地址 /after-stop.html?check=1 观察连接失败，避免缓存干扰。
