# 宿主接入

适配目标为 DSH `0.1.7-rc.2`。配置入口、设置保存、模型目录和聊天消息显示已有适配代码。已记录的联调范围及待验证场景见[验证状态](#验证状态)。

## 版本声明

`package.json` 的 `engines.dsh` 和可选 peer `@deepseek-ai/dsh` 使用同一范围 `>=0.1.7-rc.2 <0.1.8-0`，覆盖 `0.1.7-rc.2` 和后续的 `0.1.7` 正式版。DSH `0.1.7` 在安装和启动时检查名为 `@deepseek-ai/dsh` 或 `@deepseek-ai/dsh-*` 的 peer，不满足范围的插件会被拒绝，需要用户在插件管理页授予精确版本豁免。Profile 使用 `autoInstallPeers: false`，这个 peer 不会被安装；本地 `npm install` 也不会安装可选 peer。

插件不支持 DSH `0.1.6`：`0.1.7` 移除了本插件原先使用的设置接口，两套接口不能共存。`0.1.6` 不做 peer 检查，安装后组件会启动失败。

## 插件配置页

包通过 `dsh.bundle.patch` 声明 [cordis.patch.yml](../cordis.patch.yml)。Bundle 详情页只使用 DSH 原生的「包含的组件」列表，不注册 `plugins.bundle.config`。Persona 配置注册到 `plugins.row.config`，key 为 `dsh-persona#dsh-persona`；提示词配置使用 `dsh-persona#dsh-persona-prompts`。DSH 负责组件标题、状态、启停和返回导航，组件只提供简介与表单。

DSH `0.1.7` 优先显示包元数据中的描述，没有描述时才渲染插件的简介。`dsh-persona` 组件行显示 `package.json` 的描述；`dsh-persona/prompts` 没有导出元数据，组件行以模块名为标题，并显示插件提供的简介。

注册代码见 [register-settings.mjs](../src/adapters/dsh/register-settings.mjs) 和 [register-prompts.mjs](../src/adapters/dsh/register-prompts.mjs)。详情页不插入 banner 或全图入口；背景由插件管理页详情节点的生命周期独立挂载，不依赖某个表单是否存在。详情页顶部的返回按钮与图标行位于 `data-window-drag` 容器内，背景装饰按这个结构定位。

配置表单使用 DSH 的 `locale` 服务选择中英文文案，字典集中在 [locales.mjs](../src/locales.mjs)。切换语言时重新显示控制器中的草稿；`0.1.7` 的 `locale.subscribe` 依赖 `this`，配置页通过闭包调用它，不能直接把方法传给 `useSyncExternalStore`。独立预览默认使用中文。消息预览控件和内置示例保持中文，用户名称、模型信息与提示词正文保持原文。校验器和宿主返回的错误保留来源文字。

## 设置和模型目录

DSH `0.1.7` 把插件设置保存为 profile 条目的配置。两个 Host 组件各自声明一个 volatile 字段 `document`：Persona 组件的条目 ID 为 `dsh-persona`，提示词组件为 `dsh-persona-prompts`。值写入当前 profile 的 `cordis.patch.yml`，修改后由 Loader 直接更新运行中的值，不重启组件。实现见 [host.mjs](../src/adapters/dsh/host.mjs)、[prompts/host.mjs](../src/modules/prompts/host.mjs) 和 [live-document.mjs](../src/adapters/dsh/live-document.mjs)。

组件通过 `internal/config` 校验每次写入。无法解析的文档会被拒绝，运行中的配置保持不变。组件调用 `settings.configure({ auto: false })`，DSH 不会为 `document` 生成原始 JSON 表单。配置更新后组件发出 `system-prompt/change`。

浏览器通过 `configForms.get(entryId)` 读取和提交文档。宿主拒绝写入时，`mutate` 返回 `false`，控制器保留草稿并提示重试或重新载入。[settings-scope.mjs](../src/adapters/dsh/settings-scope.mjs) 为配置草稿附加 Host home 来源标识，避免不同宿主复用修订号时覆盖配置。数据格式、重连恢复与保存规则见[架构](ARCHITECTURE.md#保存与生命周期)。

Persona 配置包含裁切后的头像，文档最大 4,000,000 个字符，会直接写入 profile 的 `cordis.patch.yml`。头像较多时，这个文件会明显变大。

模型目录来自 `ctx.remote.session.modelCatalog()`。适配器监听模型目录变动、设置提交和连接重置。目录中消失的已保存模型仍可移除；目录读取失败不会清除已有配置。

## 从 DSH 0.1.6 升级

DSH `0.1.6` 把设置保存在 DSH home 的 `settings.yaml`。`0.1.7` 首次启动时把它改名为 `settings.yaml.imported`，并只导入名称与 profile 条目 ID 相同的段。Persona 段名为 `dsh-persona-avatar`，与条目 ID `dsh-persona` 不同，DSH 会跳过它并在日志中记录 `No configurable plugin entry "dsh-persona-avatar"`。

组件启动后会补做迁移。如果条目还没有保存过 `document`，组件依次读取 `settings.yaml` 和 `settings.yaml.imported` 中的 `dsh-persona-avatar` 或 `dsh-persona-prompts` 段，校验后写入对应条目。已保存的配置不会被覆盖；旧段无法解析时保留原文件并在日志中记录原因。DSH 已导入的提示词段会使补做的写入因修订号变化而停止，不会重复写入。

升级顺序：先升级 DSH，再安装本插件的新版本，然后重启 DSH。迁移后打开两个配置页，确认名称、头像、模型分组和提示词都已保留。

## 聊天头像

聊天适配不注册 `conversation.chat.node`，因此不会替换 DSH 的 `user`、`steering` 或 `assistant-step` renderer。它在会话级 `conversation.composer.dock` 挂载一个不可见的生命周期标记，从标记找到当前 `[data-conversation-scroll]`，然后只装饰宿主已经渲染的语义消息行。

用户消息、steering、待发送本地回显和待接收 steering 使用用户显示信息。assistant 消息按精确 `(provider, model)` 查找 Persona：优先读取消息携带的 `finalNode.requestConfig`；缺少时使用 `dsh-persona-models` Conversation target，按消息锚点查找其前面的 `request/header` 路由。没有路由证据或没有关联 Persona 的 assistant 行保持宿主原样。

DSH `0.1.7` 把带思考内容的 assistant 步骤拆成两部分：思考部分位于过程分组内的嵌套 `[data-chat-flow]`，`data-chat-group-part="reasoning"`；回复部分位于顶层，`data-chat-group-part="response"`。头像和名称只加在回复部分，过程分组保持原样。模型仍在思考、回复尚未出现时，这一轮暂不显示 AI 头像。消息节点 key 从 `data-chat-node-key` 读取；分组部分的 `data-chat-flow-key` 不是节点 key。

消息列表顺序与单条消息内容分别发布。装饰器通过 `nodes.source(key)` 订阅页面中的每条 assistant 回复，包括暂时无法确定模型的消息；路由补齐或改变后刷新身份，纯文本流式更新不触发页面重扫。消息行移除、换键或数据源替换时清理旧订阅，隐藏的过程行保留订阅，展开后使用最新身份。内容为空的消息行不绘制头像。

装饰器只增加头像与名称所需的 `data-dsp-*` 属性、局部 CSS 和可访问名称，不移动消息子节点。Markdown、附件、思考折叠、工具卡片、消息操作、流式内容和中断状态继续由 DSH 原生 renderer 管理。卸载插件或离开 Session 时会恢复这些行并清理观察器、消息订阅、样式和图片预加载器。

这套实现依赖 `0.1.7-rc.2` 的语义属性：`data-conversation-scroll`、`data-chat-flow`、`data-chat-flow-kind`、`data-chat-flow-key`、`data-chat-node-key`、`data-chat-group-part`、`data-submission-echo` 和 `data-pending-steering`。升级 DSH 时必须复查这些属性。

## 构建

`lib/client.js` 使用 `window.__ModuleLoader__.load({ id, factory })` 注册模块。React 从宿主模块表获取，本包代码、样式和品牌资源由构建脚本内联。客户端与独立预览附带代码、素材及第三方许可声明；内嵌鲸鱼娘素材继续适用 [CC BY-NC-SA 4.0](../assets/brand/LICENSE)。宿主入口位于 `lib/index.js`，运行时依赖 `@deepseek-ai/schemastery`（`.volatile()` 需要 `3.18.4`）和读取旧版 `settings.yaml` 的 `yaml`。

浏览器入口注入 `configForms`、`locale`、`slots`、`remote`、`sessions` 和 `uiConversation`。DSH `0.1.7` 的 Web 客户端在任一插件等待缺失服务时拒绝启动，升级时需要确认这些服务仍由 `dsh.client.inject` 列出的包提供。

构建过程使用 TypeScript 转译，没有完成 DSH SDK 类型检查。构建及本地验证方法见[开发指南](DEVELOPMENT.md)。

## 验证状态

`0.1.7-rc.2` 已在本机安装的 DSH Web profile 中做过一次联调：通过 `dsh plugin add` 安装打包文件，两个组件配置页正常显示；修改用户名称后自动保存成功，刷新页面后保留，值写入 profile 的 `cordis.patch.yml`，浏览器控制台没有错误。其余场景仍只经过本地检查。Node 测试在真实 Cordis 容器中运行两个 Host 组件，覆盖 volatile 配置、写入校验、生成表单开关和旧版设置迁移。另一个本地检查使用 npm 发布的 `@deepseek-ai/dsh-settings@0.1.7-rc.2`，配合模拟 Loader 提交步骤的配置编辑器替身，确认了表单投影、修订号冲突、无效文档拒绝和 `settings.yaml` 迁移。浏览器场景使用按 `0.1.7-rc.2` 源码构造的消息行和详情页结构。

以下联调记录来自 DSH `0.1.6-alpha.2`：桌面与 390px 窄屏、详情页往返、模型搜索、删除弹窗的取消焦点与 Escape、浅深主题、减少动态效果、包详情与组件页之间背景视频实例不变、Persona 与提示词持久化保存，以及最小真实请求中的字面提示词注入。配置页消息预览另检查了发送途中暂停、进度拖动、分块回复、思考区收起和减少动态效果。布局和播放机制见[界面文档](UI.md)。

本地 Node 测试与独立浏览器场景使用设置或宿主接口替身。[聊天头像检查](../scripts/chat-smoke.py) 在真实 Chromium 中验证消息数据更新与装饰器，但页面结构和消息来源仍是测试替身。这些检查不能证明真实安装、网络重连、模型流式回复和跨会话显示。

TODO：在 DSH `0.1.7-rc.2` 中验证打包文件的全新安装、从 `0.1.6` 升级后的设置迁移、配置写入 profile 后的刷新保留、插件启停、断线重连后的草稿恢复、实际模型流式回复中的过程分组与回复头像，以及多会话切换。重连后的修订冲突应保留输入并阻止覆盖。DSH `0.1.7` 正式版发布后复核本文依赖的接口。

## 上游参考

[插件管理页](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.2/packages/client/ui-plugin-manager/README.md) 说明安装与配置入口，[插件兼容性检查](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.2/packages/boot/app-boot/src/plugin-compatibility.ts) 定义 peer 范围判断。[设置服务](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.2/packages/settings/settings/src/index.ts) 定义 volatile 表单、修订号和 `settings.yaml` 导入，[浏览器配置表单](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.2/packages/client/ui-settings/src/client/config-form.ts) 定义 `configForms`。

[ChatNodeSeat](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.2/packages/client/ui-chat/src/client/chat/ChatNodeSeat.tsx) 提供消息行语义属性，[ChatGroupSeat](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.2/packages/client/ui-chat/src/client/chat/ChatGroupSeat.tsx) 和 [process-groups](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.2/packages/client/ui-chat/src/client/conversation-nodes/process-groups.ts) 定义过程分组，[MessageItem](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.2/packages/client/ui-chat/src/client/chat/MessageItem.tsx) 提供待发送与 steering 标记，[Conversation slot](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.2/packages/client/ui-conversation/src/client/contract/slots.ts) 定义会话级 dock。
