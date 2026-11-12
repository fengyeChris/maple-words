# 枫叶单词

本项目用于恢复英语学习软件的本地使用流程，会员、支付、套餐和订单功能已排除。目前可运行，但页面与部分交互仍需继续对照原站细化，不能称为整站1:1完成。

![枫叶单词](public/assets/maple-icon-192.png)

## 下载即用

**[下载 Windows 完整包](https://github.com/fengyeChris/maple-words/releases/latest/download/MapleWords-v1.2.0-windows-x64.zip)** · [版本发布页](https://github.com/fengyeChris/maple-words/releases/latest)

下载 `MapleWords-v1.2.0-windows-x64.zip` 完整包。GitHub 自动生成的 Source code 仅包含开发源码，需要另装依赖。

适用于 Windows 10 / 11 的 x64 电脑。发布版包含运行环境、6本词书、空白学习记录和词库来源；不含个人账号或学习记录。

## 使用完整离线包

解压整个文件夹，双击「启动枫叶单词.cmd」，浏览器打开 http://127.0.0.1:5173/ 。保持启动窗口运行，关闭窗口即停止本地服务。完整Windows x64包含匹配的Node运行时和SQLite原生依赖，不需要临时联网安装依赖。

页面由本地服务提供。学习词条、中文释义、音标、搜索和进度均不依赖外部网络。发音使用浏览器/Windows语音；是否能断网发音取决于本机是否已安装英语语音。

## 当前词书

| 本地词书 | 词条 | 单元 |
|---|---:|---:|
| 英语六级核心词汇 | 2078 | 42 |
| 大学英语四级 · ECDICT | 3849 | 77 |
| 大学英语六级 · ECDICT | 5407 | 109 |
| 考研英语 · ECDICT | 4801 | 97 |
| 雅思英语 · ECDICT | 5040 | 101 |
| 托福英语 · ECDICT | 6974 | 140 |

本轮重点恢复英语六级核心词汇（course_id=4）：2078个不重复词条，前41单元各50词，末单元28词。原站这本书标记为2078词；2998词对应另一本“星火六级巧记速记（乱序版）”。未混入其他六级书凑数。首页新用户默认进入这本六级核心书。

原站前8单元400词保留，词条编号、单元编号、原例句及学习记录不变。后34单元1678词来自固定提交的公开kajweb/dict CET6_2词库。已逐项核对前400词的单词、顺序、释义和词性，全部一致。原站第9单元接口返回403会员限制，因此后34单元未从原站逐条核验。全书有中文释义2078条、音标2042条、双语例句2010条；缺失字段留空。

完整词书备份、源档、CSV和去重报告在resources/cet6-core（开发目录位于outputs/resources/cet6-core）。cet6-core.json可直接导入；verification.json记录来源固定提交、SHA-256、词数和核验范围。上游未见明确词库内容许可证，未认定为开放授权素材。

ECDICT五书为此前已安装内容，本轮不再扩展。它们按标签整理、忽略大小写去重、字母排序，每单元最多50词；书间会重合。它们不是特定出版社教材版次。

当前发行版包含已安装的六级核心与五本 ECDICT 词书 JSON、来源版本和许可；未打包尚未接入的备用资源与冗余上游 CSV。ECDICT 词条暂无英汉例句或预存录音。来源与许可见 THIRD_PARTY_NOTICES.md 和 resources 内各项说明。

## 主要功能

- 词书卡片、真实词数、单元列表与按已学词条计算的进度。
- 英文选义、单词快过、写出英文、左右配对四种练习。
- 学习快捷键：单词快过用 ←/→ 浏览、空格翻转、R 重读、1 模糊 / 2 不认识 / 3 星标；复习「模糊」「不认识」时 1 为认识。写出英文用空格逐个字母提示、Enter 提交 / 答题后下一词；英文选义答题后 Enter 下一词。每页显示适用键位，重点词练习同步支持。
- 快过浏览会保存已看词条，不清除原标记；前后回看同一词不会重复计分。快捷键避开输入法选字、其他输入框、组合键和长按连发，保存期间阻止重复提交，结束练习后解绑。原站对对碰未发现自定义快捷键，保留鼠标 / 触屏配对与标记。
- 重复点击防重计分、写词检查/下一词、星标/模糊/不认识标记。
- 单词对对碰中，先点击左侧单词，再点击底部标记；「当前标记」显示操作对象。配对成功后仍可标记该词，换组后重新选择。
- 我的笔记支持按全部、星标、不认识、模糊筛选重点单词，点击单词可查看音标、释义、例句并修改标记。当前筛选的词或详情中的单个词均可使用四种练习；本轮词单在刷新、切换模式后保留，跨词书进度写回各词所属单元。
- 英文或中文搜索，搜索结果可进入所属单元。
- 本地学习统计、词条标记和本地账户资料分开保存。
- 「词书管理」中选JSON文件导入、导出已安装词书。
- 同key词书重复导入按单元key、词条key匹配，原有匹配词条编号保持稳定；删除或改变key的条目不承诺继承原学习进度。
- 整本词书先验证后事务写入；失败回滚，不导入半本数据。
- 整书按Unicode NFKC、忽略大小写、合并空白检查重复英文；即使分布在不同单元或使用不同key，重复也会拒绝导入。

## 本地数据和备份

- data/content.sqlite：词书、单元、词条与来源信息。
- data/state.json：本地学习记录、重点词标记与本地账户。
- 浏览器localStorage：当前本地资料编号、设置。

备份时先停止服务，再复制完整data目录；若data目录还有SQLite的-wal/-shm文件，一并保留。复制到新电脑时也使用完整文件夹。更换浏览器需重新登录同一本地账户；匿名资料编号保存在原浏览器中。

## 词书包格式

词书管理支持UTF-8 JSON，最大40MB。例如：

~~~json
{
  "schema": "wordbook/v1",
  "book": {
    "key": "my-english",
    "title": "我的英语词书",
    "version": "1",
    "description": "自编词表",
    "source": "self",
    "source_url": "",
    "license": "自有内容"
  },
  "units": [
    {
      "key": "u1",
      "title": "第1单元",
      "words": [
        {
          "key": "apple",
          "word": "apple",
          "meaning": "n. 苹果",
          "phonetic": "",
          "pos": "n.",
          "example_en": "",
          "example_cn": ""
        }
      ]
    }
  ]
}
~~~

key是稳定标识，不用标题作为匹配依据。导入时不信任远程数字id，由本地生成编号。每本词书单元key唯一，每单元词条key唯一，整书英文词条不重复。六级核心为延续原学习编号保留内部key original-cet6-preview，已是完整2078词。保留来源与许可；新增词书包放到resources并不等于已安装，仍需导入。

## 开发运行

~~~powershell
npm ci
npm start
node scripts/import-pack.js resources/ecdict/ecdict-cet4.json
~~~

项目当前离线包使用随附Windows Node运行时和匹配的better-sqlite3。自行更换Node主版本或操作系统时，需要重新安装依赖。

可选网络导入器：

~~~powershell
node scripts/import-api.js --base-url https://你的数据服务 --course 4
~~~

接口要求服务提供/api/courses、/api/courses/:id/units和/api/courses/:id/units/:unit/words。下载完整一本词书后再事务写入；网络不是日常学习必需条件。

## 主要本地接口

- GET /api/courses
- GET /api/courses/:id/units
- GET /api/courses/:id/units/:unit/words
- GET /api/courses/:id/units/:unit/stats
- GET /api/search?q=单词
- GET /api/words/:id
- GET /api/dashboard
- POST /api/progress
- GET/POST /api/word-actions
- POST /api/library/import
- GET /api/library/export/:id
- GET/POST /api/user/books
- /api/auth/register、/api/auth/login、/api/auth/logout、/api/me

会员接口禁用。会员页旧链接仅跳转到指定学习页。

## 待继续完善

原站逐页视觉比对与交互细节、自制词书编辑、更多复习筛选、例句关联、离线录音资源和独立桌面封装。设置和笔记已有页面，其中自制词书当前只支持创建空书；实际词条导入使用「词书管理」。


## 验证与构建发行包

使用安装依赖时的同一 Node 版本运行 `npm test`，测试使用独立临时数据，不修改学习记录。Windows x64 下运行 `npm run package` 构建包含当前 Node 运行时的完整包，需要 Python 3 写入含中文路径的 ZIP。输出位于 outputs/releases，并附 SHA-256 校验文件。打包会通过 SQLite backup 生成一致词库快照，使用全新学习记录；若同名发布目录已存在则停止，避免覆盖已使用的数据。

当前标志由原创 SVG 导出，可编辑源文件为 public/assets/maple-logo.svg；PNG 与 ICO 用于页面和浏览器标签。
