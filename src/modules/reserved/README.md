# 组件扩展

组件元数据集中在 [components.mjs](../components.mjs)，Host 入口由 [cordis.patch.yml](../../../cordis.patch.yml) 加载。配置表单通过 `plugins.row.config` 注册到对应组件页面，接入方式见 [DSH 适配](../../adapters/dsh/README.md)。每个组件维护自己的配置版本、命名空间、校验、草稿、保存和清理方法。

预留项只作为代码中的占位，不会挂载。需要读取分组的组件通过 Persona ID 关联数据，使用只读 [dshPersona 服务](../../../docs/PROMPTS.md#组件与依赖)获取已保存的模型成员。
