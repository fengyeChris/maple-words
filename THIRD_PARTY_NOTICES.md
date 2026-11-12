# 来源与许可说明

枫叶单词为本地运行的英语学习软件。公开仓库提供源码与完整 Windows 包；本项目目前未另行指定统一开源许可证。第三方词库与运行依赖保留各自的许可和来源说明。

- ECDICT：来源 skywind3000/ECDICT，使用 MIT 许可；完整许可、来源固定版本与五本词书清单见 resources/ecdict。保留各词书 JSON 中的来源字段。
- 六级核心词汇：2078 个不重复词条。原项目保留前 400 词，其余来自 kajweb/dict 的 CET6_2 固定版本。该上游词库未见明确内容许可；不将其标为 MIT。核验范围、固定提交、源档与校验信息见 resources/cet6-core/来源说明.md 和 verification.json。
- Princeton WordNet 3.0：用于六级核心词汇的离线近义词，1775词有匹配结果。按词性和 WordNet 索引义项顺序提取，完整许可见 resources/cet6-core/WordNet-LICENSE.txt（网页副本 public/assets/WordNet-LICENSE.txt）。固定源档、SHA-256、提交和提取规则见 wordnet-synonyms.json；原始 wordnet-3.0.zip 一并保留。
- Node.js：完整 Windows 包包含 Node 运行时，许可与所含组件声明见 runtime/LICENSE。
- better-sqlite3 及其依赖：完整包内 node_modules 保留各自 LICENSE 和 package.json；准确依赖版本见 package-lock.json。
- 枫叶与书页标志：本项目原创 SVG 图形，PNG 和 ICO 为其导出版本。图形设计不表示已完成商标注册或检索。

仓库未包含个人学习记录、本地注册资料、上游站点登录凭据或会员功能。程序只在本机 127.0.0.1 提供服务。
