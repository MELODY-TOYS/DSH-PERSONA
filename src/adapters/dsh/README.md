# DSH 适配

适配器连接 DSH 的组件配置页、设置存储、模型目录和聊天消息。`host.mjs` 声明 Persona 组件的 volatile 配置并提供只读 Persona 服务；`live-document.mjs` 负责写入校验、关闭生成表单和 DSH 0.1.6 设置导入；`client.mjs` 挂载配置界面、聊天头像和品牌效果。

配置界面注册到 `plugins.row.config`。Persona 的 key 为 `dsh-persona#dsh-persona`，提示词的 key 为 `dsh-persona#dsh-persona-prompts`。包详情页由宿主列出组件。

聊天适配通过 `conversation.composer.dock` 获取 Session 生命周期，在宿主消息行上添加名称与头像，保留原生消息 renderer。过程分组中的思考部分不添加头像。

接口、构建格式和兼容限制见[宿主接入](../../../docs/INTEGRATION.md)。
