# Lab1 Phase 1：SVG CLI 编辑器

## 架构方案（初稿，2026-10-19）

按 domain（图形与文档）、application（命令及历史）、ports（文件接口）、infrastructure（XML 与磁盘）、cli（分词、展示、交互）划分。只允许外层依赖内层。Command + Composite + Memento 是本阶段的核心模式；类型工厂和命令注册表是两处按名称分发的位置，后续插件阶段再抽取注册接口。

实现过程中持续记录修订，完成后补充一致性自查、测试证据与限制。
