# 宿主接入

适配目标为 DSH `0.1.6-alpha.2`。配置入口、设置保存、模型目录和聊天消息显示已有适配代码。已记录的联调范围及待验证场景见[验证状态](#验证状态)。

## 插件配置页

包通过 `dsh.bundle.patch` 声明 [cordis.patch.yml](../cordis.patch.yml)。Bundle 详情页只使用 DSH 原生的「包含的组件」列表，不注册 `plugins.bundle.config`。Persona 配置注册到 `plugins.row.config`，key 为 `dsh-persona#dsh-persona`；提示词配置使用 `dsh-persona#dsh-persona-prompts`。DSH 负责组件标题、状态、启停和返回导航，组件只提供简介与表单。

注册代码见 [register-settings.mjs](../src/adapters/dsh/register-settings.mjs) 和 [register-prompts.mjs](../src/adapters/dsh/register-prompts.mjs)。详情页不插入 banner 或全图入口；背景由插件管理页详情节点的生命周期独立挂载，不依赖某个表单是否存在。

配置表单使用 DSH 的 `locale` 服务选择中英文文案，字典集中在 [locales.mjs](../src/locales.mjs)。切换语言时重新显示控制器中的草稿；独立预览默认使用中文。消息预览控件和内置示例保持中文，用户名称、模型信息与提示词正文保持原文。校验器和宿主返回的错误保留来源文字。

## 设置和模型目录

[host.mjs](../src/adapters/dsh/host.mjs) 使用 `settings.installSection` 注册 `dsh-persona-avatar`。浏览器通过 `settingsScope.bind` 读取和提交文档。[settings-scope.mjs](../src/adapters/dsh/settings-scope.mjs) 为配置草稿附加 Host home 来源标识，避免不同宿主复用修订号时覆盖配置。数据格式、重连恢复与保存规则见[架构](ARCHITECTURE.md#保存与生命周期)。

模型目录来自 `ctx.remote.session.modelCatalog()`。适配器监听模型目录变动、设置提交和连接重置。目录中消失的已保存模型仍可移除；目录读取失败不会清除已有配置。

## 聊天头像

聊天适配不注册 `conversation.chat.node`，因此不会替换 DSH 的 `user`、`steering` 或 `assistant-step` renderer。它在会话级 `conversation.composer.dock` 挂载一个不可见的生命周期标记，从标记找到当前 `[data-conversation-scroll]`，然后只装饰宿主已经渲染的语义消息行。

用户消息、steering、待发送本地回显和待接收 steering 使用用户显示信息。assistant 消息按精确 `(provider, model)` 查找 Persona：优先读取消息携带的 `finalNode.requestConfig`；缺少时使用 `dsh-persona-models` Conversation target，按消息锚点查找其前面的 `request/header` 路由。没有路由证据或没有关联 Persona 的 assistant 行保持宿主原样。

消息列表顺序与单条消息内容分别发布。装饰器通过 `nodes.source(key)` 订阅页面中的每条 assistant 消息，包括暂时无法确定模型的消息；路由补齐或改变后刷新身份，纯文本流式更新不触发页面重扫。消息行移除、换键或数据源替换时清理旧订阅，隐藏的过程行保留订阅，展开后使用最新身份。

装饰器只增加头像与名称所需的 `data-dsp-*` 属性、局部 CSS 和可访问名称，不移动消息子节点。Markdown、附件、思考折叠、工具卡片、消息操作、流式内容和中断状态继续由 DSH 原生 renderer 管理。卸载插件或离开 Session 时会恢复这些行并清理观察器、消息订阅、样式和图片预加载器。

这套实现依赖 `0.1.6-alpha.2` 的语义属性：`data-conversation-scroll`、`data-chat-flow-kind`、`data-chat-flow-key`、`data-submission-echo` 和 `data-pending-steering`。升级 DSH 时必须复查这些属性。

## 构建

`lib/client.js` 使用 `window.__ModuleLoader__.load({ id, factory })` 注册模块。React 从宿主模块表获取，本包代码、样式和品牌资源由构建脚本内联。客户端与独立预览附带代码、素材及第三方许可声明；内嵌鲸鱼娘素材继续适用 [CC BY-NC-SA 4.0](../assets/brand/LICENSE)。宿主入口位于 `lib/index.js`，运行时依赖 `@deepseek-ai/schemastery`。

构建过程使用 TypeScript 转译，没有完成 DSH SDK 类型检查。构建及本地验证方法见[开发指南](DEVELOPMENT.md)。

## 验证状态

已记录的真实 DSH 联调覆盖桌面与 390px 窄屏、详情页往返、模型搜索、删除弹窗的取消焦点与 Escape、浅深主题和减少动态效果。包详情与组件页之间的背景视频实例保持不变。Persona 与提示词持久化保存、最小真实请求中字面提示词注入也已通过联调。

配置页消息预览另检查了发送途中暂停、进度拖动、分块回复、思考区收起和减少动态效果。这些检查使用内置示例，不写入 Persona 或提示词配置。布局和播放机制见[界面文档](UI.md)。

本地 Node 测试与独立浏览器场景使用设置或宿主接口替身。[聊天头像检查](../scripts/chat-smoke.py) 在真实 Chromium 中验证消息数据更新与装饰器，但页面结构和消息来源仍是测试替身。这些检查不能证明真实安装、网络重连、模型流式回复和跨会话显示。

TODO：在 DSH `0.1.6-alpha.2` 中验证打包文件的全新安装、插件启停、断线重连后的草稿恢复、实际模型流式回复和多会话切换。新安装的配置应在自动保存成功并刷新页面后保留；重连后的修订冲突应保留输入并阻止覆盖。跨版本兼容仍需逐版本复核。

## 上游参考

[插件管理页](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.2/packages/client/ui-plugin-manager/README.md) 说明安装与配置入口。[ChatNodeSeat](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.2/packages/client/ui-chat/src/client/chat/ChatNodeSeat.tsx) 提供消息行语义属性，[MessageItem](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.2/packages/client/ui-chat/src/client/chat/MessageItem.tsx) 提供待发送与 steering 标记，[Conversation slot](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.2/packages/client/ui-conversation/src/client/contract/slots.ts) 定义会话级 dock。
