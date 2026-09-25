# 视觉系统

README 和插件图标共用 [visual.avif](../assets/brand/visual.avif)。插件详情页使用 [persona-loop.mp4](../assets/brand/persona-loop.mp4) 作为循环背景。项目视觉只用于品牌展示，不写入用户头像或 Persona 配置。鲸鱼娘素材及其内嵌副本按 [CC BY-NC-SA 4.0](../assets/brand/LICENSE) 分发；署名、作者声明链接和来源核验状态见[资源信息](../assets/brand/provenance.json)。

## 插件详情页背景

[detail-background.mjs](../src/branding/detail-background.mjs) 通过 [ocean-detail.mjs](../src/branding/ocean-detail.mjs) 安装详情页背景。包详情与组件页共用一个循环视频实例，页面往返不重新播放片头。背景按内容区域裁切，取景偏右，覆盖随 DSH 主题变化的渐变遮罩；组件页的遮罩更强，以保持表单可读性。

表单沿用宿主文字、边框与表面色。页面切换只对新内容做短暂淡入和方向位移，不创建转场遮罩；具体行为见[配置页布局与动效](UI.md)。

背景是插件视觉的一部分，不提供亮度、缩放、位置或暂停设置。系统开启“减少动态效果”时，视频自动停用并保留静态主视觉；这属于系统无障碍行为，不是插件偏好设置。

循环素材移除了原视频尾部接近静止的片段和音轨。背景资源由构建脚本内联到浏览器包，不发起远程媒体请求。

## 点击泡泡

点击反馈只作用于 persona 包详情和组件配置页，不覆盖侧边栏、其他插件或会话。画布不接收输入，按钮、文本选择与键盘激活保持原有行为；点击不产生扩散波纹。

系统未开启“减少动态效果”时，使用 Three.js 球面与动态薄膜反射。开启该偏好时，改用 Canvas 2D 低配：显示短暂淡出的静态泡泡，不上浮、缩放或持续改变高光。偏好变化立即取消当前反馈并释放旧渲染器，下一次点击使用新档位。WebGL 不可用或上下文丢失时也退回低配；此时若系统允许动态，低配保留上浮动效。

渲染器在首次有效点击时创建，没有泡泡时不运行逐帧循环。切换到后台或滚动时清空反馈，离开插件详情或停用插件时释放画布、监听和 GPU 资源。实现见 [click-bubbles.mjs](../src/branding/click-bubbles.mjs)、[bubble-low.mjs](../src/branding/bubble-low.mjs) 和 [bubble-high.mjs](../src/branding/bubble-high.mjs)。Three.js 随客户端包内联，不从 CDN 加载。

## 图片与图标

[brand.mjs](../src/branding/brand.mjs) 的 `BRAND.iconPosition` 控制插件列表和详情页小图标的取景。README 的图片宽度在 [README.md](../README.md) 中设置。独立预览从同一张图生成标签页图标。

插件详情页的配置区域不显示 banner，也不提供展开全图入口。

更换品牌图片或背景视频时，更新 `assets/brand` 中的资源和来源信息，然后执行 `npm run build`。这些实现参数不进入用户配置。

## 图标适配范围

DSH `0.1.7-rc.2` 支持 `package.json` 的 `icon` 字段，但只接受不超过 256 KiB 的 SVG、PNG、JPEG 或 WebP。项目主视觉是 AVIF，本插件继续通过局部样式覆盖 `data-plugin-package="dsh-persona"` 的卡片图标容器，以及 `data-plugin-detail="dsh-persona"` 顶部 `data-window-drag` 栏内的图标容器。

TODO：提供符合 `icon` 字段要求的图标文件，改用宿主原生图标。

图片加载成功后显示背景并隐藏默认 SVG；加载失败时保留默认图标。Cordis effect 在停用插件时清理样式和图片回调。该定位依赖 DSH 的 DOM 层次，升级宿主时需要复查。

全局 DSH 图标和浏览器 favicon 不在原生插件适配范围内；只有独立预览会安装自己的 favicon。

## 上游参考

[配置页类型](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.2/packages/client/ui-plugin-manager/src/client/slot-contract.ts) 定义可传入的属性，[插件管理页实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.2/packages/client/ui-plugin-manager/src/client/PluginManagerPage.tsx) 定义图标容器。
