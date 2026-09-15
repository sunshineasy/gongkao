# Question Bank Exchange Format V1

## V1 冻结合同

唯一数据边界为 `Question Admin -> Question Bank Exchange Format V1 -> Study`。Admin 保存原始抓取、HTML/PDF/OCR、置信度、坐标、重复候选和审核笔记；它们不进入 V1。Study 保存 AnswerRecord、错题、掌握度、正确率、耗时、复习、推荐及 AI 学习结论；它们也绝不进入 V1。V1 只回答“这道题是什么”。

V1 冻结后，题源差异应由 Source Adapter 归一化；只有无法表达当前确实需要支持的真实行测题型时，才考虑 V1.1/V2。

## QuestionBankPackageV1

单 JSON 包的顶层必填 `schemaVersion: "1.0"`、`bankId`、`bankVersion`、`name`、`exportedAt`、`publisher`、`questions`、`materials`、`knowledgePoints`、`media`。`bankVersion` 是某次内容版本，不等同于结构版本 `schemaVersion`。`description` 可选且可为 null。

`externalId` 是稳定、包内全局唯一的后台标识；更新同一对象不得更换。V1 通过 `provider`、`originalId`、`sourceRecordId`（若 Admin 已有）、`sourceFile`、`sourcePage`、`sourceUrl` 回查 Admin，不复制 raw payload。

## Question

Question 必填 `externalId`、`questionType`、`content`、`classification`、`provenance`、`answerStatus`、`flags`；`materialExternalId` 与 `paperContext` 均可省略或为 null。目前 `questionType` 只能是 `SINGLE_CHOICE`；答案始终为数组，例如 `correctAnswer: ["B"]`，不得从答案数目反推题型。`flags` 只有客观发布状态 `isActive`；`includeInMastery` 已删除，Study 可根据来源可信度、答案状态和题源类型决定学习策略。

`content` 的 `stem`、`media`、`options`、`correctAnswer`、`explanation` 均必填；`explanation` 可为 null。Option 为 `{ key, text, media }`，`text` 可为 null，`media` 为包级媒体 ID 引用；每个选项必须有非空文本或至少一项媒体。

`classification` 明确区分 `module`、`subtype` 和多个 `knowledgePointExternalIds`，另有 `sourceTags`、可空的 `sourceDifficulty`、可空的 `referenceTimeSeconds`（存在时大于 0）。知识分类名不在 Schema 中枚举。第三方难度仅是来源信息；system/user difficulty 由 Study 计算，不能进入 V1。

`paperContext` 可为 null；对象中的 `exam`、`year`、`province`、`paperType`、`paperName`、`originalQuestionNumber`、`section` 都可省略，因此未知试卷背景不能否定已审核题目。

## Material、KnowledgePoint 与 Media

Material 独立存放，题目用 `materialExternalId` 引用，禁止复制材料正文。Material 含 `externalId`、可空的 `title`/`content`、`media` 和 `provenance`。媒体在包级 `media[]` 注册，Material、题干和 Option 的 `media[]` 均引用其 `externalId`。

`MediaRef` 必填 `externalId`、`type`、`role`、`path`、`url`。type 为 `IMAGE`、`TABLE` 或 `CHART`；role 为 `STEM`、`OPTION`、`MATERIAL` 或 `ANALYSIS`。`path` 是包内相对路径（如 `media/q076-stem.png`），不能是绝对路径或含 `..` 的穿越路径；`url` 可为 null。

KnowledgePoint 必填 `externalId`、`name`、`parentExternalId`、`level`、`type`，可形成层级树。Question 仅以 `knowledgePointExternalIds` 关联，绝不以名称作为稳定关系。

## Provenance

Question 的 `provenance` 必含 `content`、`answer`、`analysis`：content 必需，answer 可为 null（例如尚无独立答案来源），analysis 可为 null。三者均可独立使用 SourceRef，分别表达题面、答案、解析的来源和可信度。`answerStatus` 只描述客观答案确认状态（`VERIFIED`/`UNVERIFIED`/`DISPUTED`），不规定任何 Study 算法。

SourceRef 必填 `provider`、`sourceType`、`sourceName`、`sourceUrl`、`originalId`、`sourceRecordId`、`sourceFile`、`sourcePage`、`credibility`、`license`、`copyrightNote`；其中回溯/版权字段可为 null。sourceType 为 `REAL_EXAM`、`INSTITUTION`、`MANUAL`、`AI_GENERATED`，credibility 为 `S` 至 `D`。不要维护 Question 级整体可信度；如需 overallQuality，应由 Admin/Validator 根据来源和结构质量计算。

## 校验分工

JSON Schema 负责结构、字段类型、必填/可空、枚举、字符串下限、数组、`referenceTimeSeconds > 0`、`sourcePage > 0`、媒体角色/类型、媒体路径基础模式和未知字段拒绝。

Validator 负责跨对象规则：全局 externalId/媒体 ID 唯一性、所有引用存在、Option key 唯一、答案引用真实 Option、单选恰好一个答案、Option 不能同时无文本无媒体、KnowledgePoint 父项存在且无环、媒体路径二次安全检查、媒体角色与使用位置一致，以及来源关系的明显冲突。

任何校验错误都应中止导入；导入按 externalId 做 INSERT/UPDATE/UNCHANGED，更新题面不得删除既有 AnswerRecord。`isActive:false` 是软下线，不进入新训练但历史仍可查。
