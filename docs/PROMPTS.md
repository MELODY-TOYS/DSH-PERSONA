# 提示词组件

为 Persona 组或原生模型追加系统提示词。安装包包含两个原生组件：`dsh-persona` 管理名称、头像与模型分组，`dsh-persona-prompts` 管理提示词。提示词组件初始为空。

## 使用

在「插件 → dsh-persona → 包含的组件」中找到 `dsh-persona-prompts`，点击「配置」。新建提示词，填写名称和正文，在「应用到」选择 Persona 组或原生模型。有效修改会自动保存，两类目标可以混选。

Persona 组通过稳定 ID 引用，使用该组当前已保存的模型成员。向组内增加模型后，下一次调用该模型时即可匹配。原生模型按完整的提供方与模型 ID 匹配，可以直接选用，不需要先创建 Persona。

同一条提示词命中多个目标时只追加一次。一个模型命中多条提示词时，按列表从上到下追加；「上移」「下移」可调整顺序。后面的内容不会自动覆盖前面的内容，互相矛盾的要求需要编辑者处理。

删除的 Persona 组和目录中不可用的模型会保留在已选目标中，并标记不可用。系统不会根据同名组自动改绑。取消选择可以移除这些引用。

## 保存与生效

有效修改在最后一次编辑后等待 500ms 自动保存。连续输入合并为最新值；写入进行时仍可继续编辑，后续修改会在前一次确认后继续提交。无效草稿等待修正。保存失败保留输入并提供「重试自动保存」，修订号冲突需要重新载入。配置页重新挂载不会主动丢弃控制器中的待保存草稿。

自动保存确认后，在下一次提示词组装时使用新配置。已发送的模型请求继续使用它开始时的配置；修改不会重写过去的聊天内容。模板括号、Markdown 和代码按原文保留，不执行变量插值。

提示词单条最多 64000 个字符，总计最多 256000 个字符。

## 系统提示词注入

适配目标为 DSH `dsh-v0.1.6-alpha.2`。`system-prompt/assemble` 在每个模型步骤重新组装提示词。官方 `installModelSelection` 在这个 waterfall 中捕获该步骤的模型，并把相同选择用于后续请求。

每次组装使用开始时已保存的规则与分组快照，避免异步组装期间的编辑改变本次匹配。组件从下游组装结果的 `variables.provider`、`variables.model` 读取本次路由，将匹配正文追加为 `interpolate: false` 的系统提示词段。工具、运行时上下文和请求路由由宿主处理。实现见 [runtime.mjs](../src/modules/prompts/runtime.mjs)。

没有 Agent 的诊断组装、缺少完整路由或已经取消的请求不会追加。本组件停用后会移除监听器；已经开始但尚未完成的组装也不会继续追加。并发会话分别使用各自组装结果中的路由。

DSH 的 `complete: true` 完整提示词在 waterfall 之后具有最终决定权，因此使用这种预设的 Agent 不接受本组件的附加系统段。本组件遵循这一约定。没有经过 DSH Agent 提示词组装的独立 API 调用也不在作用范围内。

## 组件与依赖

`dsh-persona-prompts` 是同一个安装包中的 Host 组件，入口为 `dsh-persona/prompts`。它需要 `settings`、`systemPrompt` 和 `dshPersona` 服务。关闭 Persona 组件会使提示词组件等待依赖；重新启用后可恢复，已有配置继续保留。

配置保存在 DSH settings 的 `dsh-persona-prompts.document` 中，使用独立的 `version: 1` 文档。它通过 Persona ID 引用分组，不迁移或复制 `dsh-persona-avatar` 设置。

配置表单由包的浏览器入口注册到 `plugins.row.config`，key 为 `dsh-persona#dsh-persona-prompts`；提示词注入在 Host 执行。Host 组件关闭时，配置页显示不可用并禁止编辑。

分组仍由 Persona 维护。Host 的只读 `dshPersona` 服务提供 `getSnapshot()`、`getUser()`、`listPersonas()`、`resolveModel(model)`；服务版本为 1，返回已提交的不可变数据。类型声明从 `dsh-persona/persona-api` 导入。这不是浏览器 Remote API。

## 验证

```sh
node --test tests/prompts.test.mjs
node scripts/build-prompts-fixture.mjs
python scripts/prompts-smoke.py
```

构建浏览器测试页需要项目依赖或全局 TypeScript 5.8.3；浏览器检查需要 Python Playwright 和 Chromium。测试使用内存设置与 waterfall 契约替身，覆盖模型切换、并发组装、配置变更、停用、字面文本、自动保存冲突及窄屏界面。它们不替代真实 DSH 安装和模型调用联调。

## 接口依据

- [系统提示词契约](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.2/packages/core/system-prompt/src/index.ts)
- [模型选择与请求绑定](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.2/packages/core/agent/src/model-selection.ts)
- [插件配置与组件页面](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.2/packages/client/ui-plugin-manager/README.md)
