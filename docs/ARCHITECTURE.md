# 架构

用户信息与 AI Persona 集合分别保存。每套 Persona 用稳定 ID 标识，名称和头像可编辑，并可关联多个模型。

## 数据与关联

头像组件的设置文档使用 `version: 3`。`user` 保存用户的名称和头像，`library.personas` 保存 Persona 集合。集合格式为 `schemaVersion: 2`，每项包含 `id`、`revision`、`name`、`avatar` 和 `models`。

`version: 3` 不保存显示开关或头像尺寸。插件启用时用户显示信息直接生效，聊天头像使用固定尺寸。读取 `version: 2` 时保留用户、Persona 和模型关联，并丢弃旧的显示开关与尺寸字段；下一次保存写入 `version: 3`。

模型以完整的 `(provider, model)` 标识。显示名称相同的不同渠道仍是独立模型。每个模型最多关联一套 Persona；移动已有关联需要确认。删除 Persona 或取消关联后，模型回到无显示覆盖的状态。空集合和没有关联模型的 Persona 都合法。

`resolvePersona` 返回匹配项；没有关联时返回 `null`。数据校验与关联操作见 [persona.mjs](../src/core/persona.mjs)。

## 组件分工

[src/modules/avatar](../src/modules/avatar) 负责头像、表单、裁切、模型选择和消息显示适配。[ComponentSettingsController](../src/core/component-settings.mjs) 管理草稿与自动保存，[AvatarSettingsController](../src/modules/avatar/config-controller.mjs) 合并模型目录和已保存的关联。

[src/modules/prompts](../src/modules/prompts) 维护提示词规则、目标选择与系统提示词注入，通过 Persona ID 读取已保存分组。[components.mjs](../src/modules/components.mjs) 声明两个组件的元数据；它们在 DSH 中使用独立的配置入口，各自维护配置版本、保存与清理逻辑。

[src/adapters/dsh](../src/adapters/dsh) 连接插件配置页、宿主设置、模型目录和会话。聊天头像适配通过独立的模型历史 target 获取流式回复的精确路由，再由 [decorate.mjs](../src/modules/avatar/chat/decorate.mjs) 装饰宿主已经渲染的消息行，不替换原生消息 renderer。

[src/branding/brand.mjs](../src/branding/brand.mjs) 只负责项目图片、插件图标和独立预览 favicon。

## 保存与生命周期

表单在本地暂存编辑。有效草稿在最后一次编辑后等待 500ms 自动写入对应组件的 `document` 字段，并携带草稿开始时的修订号。连续编辑会合并；写入进行时的新修改在前一次确认后继续提交。保存成功需要读回内容与提交值一致。没有在途写入时，改回已保存值会结束当前草稿，后续宿主更新可直接显示；有在途写入时保留撤销后的输入，等待该写入结束后再处理。

[settings-scope.mjs](../src/adapters/dsh/settings-scope.mjs) 用 DSH 的 Host home 标识设置来源，作为 scope 的 `sourceId`。草稿同时记录来源与修订号；两者任一改变都会阻止覆盖。其他单一来源的传输可省略 `sourceId`。

无效草稿等待修正。自动保存失败保留输入并停止循环重试，界面提供显式重试。同一宿主重连会刷新目录并保留草稿，宿主设置由 DSH 的共享设置镜像重新读取。不同宿主即使使用相同修订号，也不能接收旧草稿；旧来源的写入响应不能确认或更新新来源的草稿基准。

配置页卸载不会主动丢弃控制器中的待保存草稿。组件停用或控制器销毁会取消尚未发出的定时写入；已经提交给宿主的写入可能继续完成。刷新网页会丢失内存草稿。无法解析的设置不会被默认值覆盖。

组件卸载会移除订阅与样式，关闭弹窗，释放图片资源。会话装饰器也会移除它添加的属性、样式和图片预加载器。模型目录、保存请求和图片读取使用生命周期保护，过期响应不能更新已卸载的界面。
