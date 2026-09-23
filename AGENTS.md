# 开发约定

先读 [README](README.md) 和 [开发指南](docs/DEVELOPMENT.md)。DSH 接口以 [宿主接入](docs/INTEGRATION.md) 中固定的版本为准。

## 产品与代码

用户配置与 Persona 集合独立保存。Persona 包含显示名称、头像和多个精确的 provider/model 关联。初始集合为空；命名和分组由使用者决定。不要添加角色预设或默认模型偏好。

提示词由独立的 prompts 组件维护，允许用户选择 Persona 组或原生模型并填写正文。初始规则为空。组目标保存稳定 Persona ID，不复制成员列表；原生模型目标保存精确 provider/model。规则内重复命中只追加一次，多条规则按保存的列表顺序追加。正文按字面文本处理。

每个模型最多关联一套 Persona，移动已有归属需要确认。未关联模型使用宿主显示。品牌图片用于项目标识，用户头像与 Persona 头像由各自配置决定。

配置随组件维护。avatar 负责表单、校验、图片裁切、模型选择和保存；prompts 负责目标选择、提示词保存与宿主注入。包入口组合组件。保存携带草稿开始时的修订号，失败保留输入，冲突拒绝覆盖。卸载时清理订阅、样式与图片，并使过期异步响应失效。

分组只由 Persona 写入；其他 Host 组件通过只读 dshPersona 服务读取已保存的分组。提示词匹配使用 system-prompt/assemble 的下游结果，不读取上一次 request/header 或客户端模型选择器来猜测本次模型。遵守宿主 complete 提示词的最终决定权。

## 文档与文案

说明项目的现有行为、操作方法和限制。去掉对聊天、修改轮次、审阅过程和未提交草稿的引用。保留格式版本、失败条件和会影响使用的限制；待实现功能写入对应 TODO。

用简短段落说明一个问题。按钮写动作，字段写名称，错误说明原因和下一步。注释解释代码没有直接表达的约束。技术细节放在对应文档，并使用可打开的相对链接。

参考 DSH 的 [dsh-trim-cot-leakage](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/skills/dsh-trim-cot-leakage/SKILL.md)、[dsh-prose-standard](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/skills/dsh-prose-standard/SKILL.md) 和 OpenAI 的[行文指南](https://developers.openai.com/api/docs/guides/latest-model#personality-and-writing-style)。按本仓库的规模应用规范，用户的明确要求优先。

## 验证与提交

按修改范围运行检查。文档检查链接和 `git diff --check`；代码改动运行 `npm test`；界面行为改动运行对应浏览器场景。提示词组件的测试命令见 [提示词组件](docs/PROMPTS.md)。检查通过后，仅在新改动或失败需要时重跑。不要为图片替换增加固定哈希测试。

构建文件、截图、测试输出和临时传输文件保持未跟踪。报告实际执行的检查，并区分本地测试与真实 DSH 联调。提交和发布遵循用户授权。
