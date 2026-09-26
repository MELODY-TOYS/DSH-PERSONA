# DSH-PERSONA

<p align="center">
  <img src="assets/brand/visual.avif" width="320" alt="DSH Persona 主视觉">
</p>

在 DeepSeek Harness（DSH）中设置用户与 AI 的名称、头像，并为指定模型追加系统提示词。

一套 Persona 是一组共用名称与头像的模型，可以包含不同渠道的模型；每个模型最多属于一套 Persona。用户的名称与头像单独设置。初始 Persona 集合与提示词规则均为空，由使用者自行配置。

当前为候选版本（rc），适配 DSH `0.1.7-rc.2`，不支持 `0.1.6`。已完成的联调和待验证场景见[宿主接入](docs/INTEGRATION.md#验证状态)，各版本变化见[更新日志](CHANGELOG.md)。

https://github.com/user-attachments/assets/49004ddd-834e-4cf0-ad6d-6a07e77ddfc9

## 安装

按 DSH 版本选择插件版本：

| 插件版本 | 支持的 DSH |
| --- | --- |
| `0.1.0-rc.1` | `0.1.7-rc.2` 至 `0.1.7` 正式版 |
| `0.1.0-alpha.3` | `0.1.6-alpha.2` |

`0.1.8` 及更高版本的 DSH 会按版本声明拒绝安装当前插件。版本声明见[宿主接入](docs/INTEGRATION.md#版本声明)，各版本变化见[更新日志](CHANGELOG.md)。

在 DSH 侧边栏打开「插件」，点击「添加插件」，粘贴对应版本的安装包链接并安装，安装完成后点击「立即启用」：

- `0.1.0-rc.1`：`https://github.com/MELODY-TOYS/DSH-PERSONA/releases/download/v0.1.0-rc.1/dsh-persona-0.1.0-rc.1.tgz`
- `0.1.0-alpha.3`：`https://github.com/MELODY-TOYS/DSH-PERSONA/releases/download/v0.1.0-alpha.3/dsh-persona-0.1.0-alpha.3.tgz`

安装包也可以从 [Releases](https://github.com/MELODY-TOYS/DSH-PERSONA/releases) 下载，保存到运行 DSH 的电脑上，再在「添加插件」中输入文件的绝对路径。安装包是 npm 使用的 `.tgz` 压缩包，内容为已构建的 JavaScript，Windows、macOS 和 Linux 通用。

也可以在命令行安装：先运行 `dsh --version` 查看 DSH 版本，按上表选择链接，再运行 `dsh plugin add --profile <profile> <链接>`，然后重启 DSH。`<profile>` 是 DSH home（默认 `~/.dsh`）下 `profiles` 目录中的名称，例如 Web 界面使用的 `web`。请 AI Agent 代为安装时，把本仓库地址交给它，并说明使用的 DSH profile；它可以按本节选择版本并用这条命令安装，不需要克隆和构建。

### 从源码构建

需要 Node.js `22.19.0` 或更高版本。

```sh
git clone https://github.com/MELODY-TOYS/DSH-PERSONA.git
cd DSH-PERSONA
npm install
npm pack
```

`npm pack` 自动构建插件，在当前目录生成 `dsh-persona-<版本>.tgz`，按上文的本地文件方式安装。

进入「已安装 → dsh-persona → 包含的组件」，点击 `dsh-persona` 设置名称、头像和模型分组，或点击 `dsh-persona/prompts`（组件 ID `dsh-persona-prompts`）编辑提示词。

更新已安装的包后，重启 DSH 加载新代码。DSH 用 pnpm 安装插件，重新安装版本号相同的打包文件不会替换已安装的代码，更新时请使用新版本号的打包文件。首次使用时，修改一项名称，确认自动保存成功后刷新页面，检查配置是否保留；聊天头像和提示词的验证方法见[宿主接入](docs/INTEGRATION.md)。

从 DSH `0.1.6` 升级时，先升级 DSH，再安装本插件的新版本并重启 DSH。插件会把旧 `settings.yaml` 中的名称、头像、分组和提示词迁移到新的配置位置。DSH 日志中关于 `dsh-persona-avatar` 未导入的提示属于预期情况。迁移条件见[从 DSH 0.1.6 升级](docs/INTEGRATION.md#从-dsh-016-升级)。

## 名称、头像与模型分组

在 `dsh-persona` 组件的「用户」区域设置自己的名称和头像。在「AI Persona」中新建一项，填写名称、上传头像并勾选关联模型。可以创建多套 Persona，也可以暂时不关联模型。未关联的 AI 模型保留宿主显示。

模型列表支持按模型或渠道搜索。「全选结果」选择搜索结果中的可用模型；清空搜索后，「全选」选择整个可用目录。移动已有模型关联时需要确认。目录中消失的已关联模型仍可移除，目录读取失败不会清除配置。

头像支持 PNG、JPEG 和 WebP，上传文件最大 5 MB，裁切后随配置保存。聊天头像尺寸固定为 40px。

## 提示词

打开 `dsh-persona-prompts` 的配置，新建一条规则，填写名称和正文，再选择应用到哪些 Persona 组或原生模型。两类目标可以混选。选择 Persona 组会应用到组内当前保存的全部模型；选择原生模型会按提供方与模型 ID 精确匹配。

同一条规则命中多个目标时只追加一次。多条规则命中时按列表顺序追加，可用「上移」「下移」调整。正文按原文处理，模板括号、Markdown 和代码不会被插值执行。后面的规则不会自动覆盖前面的要求。

保存后的修改在下一次系统提示词组装时生效。Agent 使用完整提示词预设（`complete: true`）时，不会追加这些规则。提示词会随模型请求发送给提供方，请勿在正文中填写密钥。长度限制、失效目标和停用行为见[提示词组件](docs/PROMPTS.md)。

## 自动保存与恢复

有效修改在最后一次编辑后等待 500ms 自动保存。连续输入合并为最新值；保存过程中可以继续编辑，后续修改在前一次确认后提交。无效字段需要先修正。

配置保存在 DSH 当前 profile 的 `cordis.patch.yml` 中。保存失败或宿主拒绝写入时保留草稿并提供重试。重新连接同一个 DSH 实例时，未保存的输入会保留；如果配置已在其他页面或客户端更新，插件会阻止覆盖。连接到另一个 DSH 实例时，也不会自动提交原有草稿。遇到冲突，请先复制需要保留的内容，再重新载入配置。

草稿只保存在当前页面内存中。刷新网页或停用插件前，请确认自动保存成功。

## 消息预览

配置页内可预览当前名称和头像在消息中的效果，支持暂停、继续、重播、进度拖动和 0.25× 至 3× 倍速。倍速选择保存在当前浏览器。

预览播放内置示例，不调用模型，也不发送聊天消息。系统开启“减少动态效果”时默认展示完成状态。详情见[消息预览](docs/UI.md#消息预览)。

## 开发

构建、独立预览、测试和贡献方法见[开发指南](docs/DEVELOPMENT.md)。组件分工见[架构](docs/ARCHITECTURE.md)，宿主接口见[宿主接入](docs/INTEGRATION.md)，品牌图片与页面动效见[视觉系统](docs/BRANDING.md)。

## 许可

本项目代码和文档采用 [MIT License](LICENSE)。

`assets/brand/visual.avif` 和 `assets/brand/persona-loop.mp4` 中的鲸鱼娘素材按 [CC BY-NC-SA 4.0](assets/brand/LICENSE) 分发：须保留署名和许可链接、说明修改，仅限非商业使用，改编后按相同协议分享。嵌入源码或构建产物中的同一素材也适用该许可，不在 MIT 授权范围内。

鲸鱼娘二创设计署名 **ZipZipPipe**；其视频声明另署名 **上善无形** 为原角色作者。作者声明链接、素材来源记录和本项目的加工说明见[素材许可与署名](assets/brand/LICENSE)及[资源信息](assets/brand/provenance.json)。本项目未取得另行商用授权。

Three.js 和 DSH FishLogo 的上游版权与许可见[第三方声明](THIRD_PARTY_NOTICES.md)。分发包、客户端与独立预览附带代码、素材及第三方许可声明。
