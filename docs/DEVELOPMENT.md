# 开发指南

需要 Node.js `22.19.0` 或更高版本。构建使用 `package.json` 声明的 TypeScript 5.8.3；没有本地安装时也可读取全局 TypeScript。

## 构建与预览

```sh
npm install
npm run preview
```

打开终端显示的地址，进入「插件 → 已安装 → dsh-persona」。预览默认监听 `127.0.0.1:4173`，可通过环境变量 `PORT` 更改端口。它使用演示模型，配置保存在当前浏览器中。

`npm run build` 生成宿主入口、浏览器模块和 `preview/standalone.html`。`prepare`、`prepack`、`test` 和 `preview` 会触发构建，生成文件保持未跟踪。客户端与独立预览附带代码、素材及第三方许可证，分发时应保留完整文件。

## 验证

```sh
npm test
npm pack --dry-run
```

Node 测试覆盖模型关联、配置迁移、自动保存、重连保留草稿、修订冲突、模型路由和插件生命周期。打包检查用于确认入口、源码、品牌资源和许可证进入发布包。TypeScript 转译检查语法，不能替代宿主 SDK 类型检查。

浏览器检查需要 Python 3、Playwright 和 Chromium。先在虚拟环境中安装依赖：

```sh
python -m venv .venv
# macOS / Linux
. .venv/bin/activate
# Windows PowerShell 使用 .venv\Scripts\Activate.ps1
python -m pip install playwright==1.57.0
python -m playwright install chromium
```

脚本优先使用 PATH 中的 `chromium`，否则使用 Playwright 安装的浏览器。Linux 缺少浏览器系统库时，可运行 `python -m playwright install --with-deps chromium` 安装所需依赖。

```sh
npm run build
python scripts/browser-smoke.py
python scripts/branding-smoke.py
python scripts/chat-smoke.py
```

[聊天头像检查](../scripts/chat-smoke.py) 直接加载源码与样式，不需要先构建。它在 Chromium 中使用按 DSH 接口构造的消息行和按消息订阅的数据源，检查模型信息补齐、折叠展开、消息复用、流式更新和卸载清理；CI 的 `chat-browser` 作业运行同一场景。

提示词组件的浏览器检查见[提示词组件](PROMPTS.md#验证)，布局场景见[配置页布局与动效](UI.md)。这些场景使用独立页面和存储替身，不验证真实宿主安装、持久化或实际聊天页面。联调状态见[宿主接入](INTEGRATION.md#验证状态)。

测试报告和截图保持未跟踪。只修改文档时检查相对链接，并运行 `git diff --check`。检查通过后，仅在新改动或失败需要时重跑。

## 贡献

组件维护自己的界面、校验、配置版本和清理逻辑，数据关系见[架构](ARCHITECTURE.md)。提交应包含源代码、必要测试和对应文档。异步与自动保存测试使用可控时钟或 Promise 控制执行顺序，并在断言前注册清理。

README 说明用途和使用方法；技术说明归对应文档。描述现有行为，保留失败条件和兼容限制。开发约定见 [AGENTS.md](../AGENTS.md)。贡献代码和文档沿用项目的 [MIT License](../LICENSE)；鲸鱼娘素材及其改编沿用 [CC BY-NC-SA 4.0](../assets/brand/LICENSE)，保留署名并说明修改。引入其他第三方内容时补充来源及许可。

依赖版本由提交的 `package-lock.json` 固定。TODO：完成 DSH SDK 类型检查。
