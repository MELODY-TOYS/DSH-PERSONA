# 配置页布局与动效

Persona 与提示词使用独立的 DSH 组件配置入口。宿主负责标题、返回、组件状态和页面外边距，表单使用宿主主题变量。

## 布局

两页通过 [settings-shell.css](../src/components/settings-shell.css) 共用字段、自动保存反馈、弹窗和列表编辑布局。桌面列表列宽为 180px，容器宽度不超过 760px 时收至 150px；不超过 600px 时列表横向排列、编辑区独占一行。横向列表保留原生滚动和键盘按钮语义。

原生详情页通过 [ocean-detail.css](../src/branding/ocean-detail.css) 适配宿主内容宽度：列表列宽为 168px，详情容器不超过 720px 时收至 148px，不超过 580px 时改为单栏。编辑区使用可收缩的网格轨道，长模型名称不撑宽页面。自动保存反馈放在表单顶部；输入框使用宿主的 `bg-layer-3` 表面色，跟随浅深主题。

Persona 的消息预览位于模型关联之后，直接显示，不提供折叠入口。没有 Persona 时，用户消息预览保留在空集合下方。预览节点和图片节点在修改名称、模型搜索与自动保存过程中保持；头像读取失败沿用文字回退。实现见 [settings-view.mjs](../src/modules/avatar/settings-view.mjs) 和 [chat-preview.mjs](../src/modules/avatar/chat-preview.mjs)。

提示词已选目标始终显示两类目标的数量和名称，原生模型同时显示精确 provider/model。摘要可滚动，不可用目标保留 ID 与警告。新建规则展开目标选择；切换到已配置的规则时收起。用户的展开选择在同一条规则的输入、自动保存和排序过程中保持，仅由当前视图维护。上移、下移位于规则列表上方。

保存状态显示在表单顶部。无效字段需要修正，保存失败时提供「重试自动保存」，冲突时提示重新载入。自动保存的时机、修订号检查与草稿恢复见[保存与生命周期](ARCHITECTURE.md#保存与生命周期)。DSH `0.1.7-rc.2` 可以为 volatile 配置字段生成表单；本插件关闭生成表单，使用自己的配置页，并在 500ms 输入合并后自动保存。

## 消息预览

预览使用当前用户与选中 Persona 的名称和头像，按输入、发送、等待响应、思考、回复的顺序播放内置示例。用户输入按词组整块出现，保留空格并模拟输入法上屏；发送时清空模拟输入框，显示用户消息。思考区默认展开，可手动收起；收起后播放时摘要显示最新一行，完成后显示首行。回复固定为「收到」。没有 Persona 时只播放用户消息，空白用户文本不触发发送或回复。

预览工具条提供暂停、继续、重播、进度拖动和 0.25× 至 3× 倍速。拖动进度会暂停，继续播放从当前位置开始。输入、等待、思考、回复和循环间隔由脚本预设，不向用户暴露。

内置示例见 [preview-copy.mjs](../src/modules/avatar/preview-copy.mjs)。思考文本是创作文案，不是真实模型推理。倍速选择仅存于当前浏览器的插件专用 localStorage；存储不可用时仍可播放和调整。预览不调用模型，不发送消息，不写入用户、Persona 或提示词设置。

[preview-playback.mjs](../src/modules/avatar/preview-playback.mjs) 使用同一条虚拟时间线计算文字、发送状态和进度，暂停与拖动不会使各阶段错位。名称与头像更新不重置播放。预览离开可视区域或页面转入后台时停止计时，返回后继续；卸载清理动画帧、观察器与事件监听。减少动态效果模式默认展示完成状态，手动播放保留文字时序并关闭扫光和光标闪烁。

## 动效与键盘

原生包详情与组件页之间立即导航，新页面使用 180ms 淡入与 8px 方向位移。转场不克隆页面，不隐藏或阻塞原生控件；连续导航取消前一次动画。滚动、调整窗口和切换到后台时也会取消动画。实现见 [ocean-transition.mjs](../src/branding/ocean-transition.mjs)。

按钮背景和边框使用 120ms 过渡。选中项变化时，编辑区使用 150ms 淡入与 4px 向上入场；输入文字和自动保存通知不重复触发。目标选择的箭头使用 160ms 旋转，展开内容和弹窗进入使用 150ms 淡入。关闭弹窗直接执行原生关闭，恢复焦点。

系统启用减少动态效果时禁用上述入场和位移动效。设置在页面打开期间变化，也会取消正在执行的选择动画。卸载取消动画并移除监听。实现见 [settings-motion.mjs](../src/components/settings-motion.mjs)。

弹窗按 Tab 和 Shift+Tab 在可用控件间循环，Escape 沿用原生关闭。删除与移动确认先聚焦取消按钮。移动模型后，焦点按精确模型 key 回到当前复选框，避免列表重建丢失触发节点。键盘处理见 [settings-dialogs.mjs](../src/components/settings-dialogs.mjs)。

## 参考

界面依据来自 DSH `dsh-v0.1.6-alpha.2`：

| 来源 | 应用范围 |
| --- | --- |
| [PluginConfigForm.tsx](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.2/packages/client/ui-settings-plugins/src/client/PluginConfigForm.tsx) | namespace revision 与失败保留草稿；本组件使用自动保存，离开配置页后由控制器保留草稿。 |
| [Modal.module.css](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.2/packages/client/ui-primitives/src/Modal.module.css) | 380px 弹窗、24px 圆角、主题遮罩和表面；保留本组件原生 dialog。 |
| [Tooltip.module.css](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.2/packages/client/ui-primitives/src/Tooltip.module.css) | 150ms 淡入和减少动态效果处理；应用到编辑区、展开区域和弹窗属于本组件适配。 |
| [PluginManagerPage.module.css](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.2/packages/client/ui-plugin-manager/src/client/PluginManagerPage.module.css) | 宿主页面对齐、悬停色，以及 guideChevron 的 160ms 展开指示。 |
| [WAI-ARIA Dialog Modal Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | 弹窗焦点循环、初始焦点与关闭后的焦点归还。 |

TODO：按 DSH `0.1.7-rc.2` 复核弹窗、提示和页面样式。`0.1.7` 的 Modal 改用 `--dsw-radius-panel` 圆角并加入淡入，PluginConfigForm 已移除。

目标摘要的最大高度为 144px，提示词正文的最小高度为 280px，用于限制目标数量增加时的页面增长。本文的布局尺寸与动效参数由本组件维护，浏览器验证方法见下节。

## 验证

```sh
node --test tests/component-settings-autosave.test.mjs tests/settings-motion.test.mjs tests/ocean-motion.test.mjs tests/detail-transition.test.mjs tests/background.test.mjs tests/click-bubbles.test.mjs tests/preview-playback.test.mjs
node scripts/build-prompts-fixture.mjs
python scripts/prompts-smoke.py
node scripts/build-prompts-fixture.mjs --layout
python scripts/layout-smoke.py
```

布局场景使用真实视图和设置控制器，将宿主存储与模型目录替换为内存来源。覆盖预览节点复用、组合输入事件、模型移动确认、自动保存串行写入、保存失败、修订冲突、目标摘要、窄容器、主题和减少动态效果。组合输入场景派发浏览器事件，不代表完成系统输入法联调。

生成的 HTML、截图和检查结果位于 `preview/`，保持未跟踪。完整项目检查按[开发指南](DEVELOPMENT.md)执行；上述组件场景不验证真实 DSH 安装。详情页背景的挂载与资源说明见[视觉系统](BRANDING.md)，真实宿主的已验证范围和待验证项统一记录在[宿主接入](INTEGRATION.md#验证状态)。
