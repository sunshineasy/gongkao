# Gongkao V1 Goals

Gongkao V1 是一个本地、稳定、用于长期刷行测题的个人学习程序。当前只做常识判断、言语理解与表达、数量关系、判断推理、资料分析，不做申论。

当前正式基线是 M1：用户可完成做题、保存作答、查看结果与解析、继续下一题。题库使用 Frozen Question Bank Exchange Format V1.0；题库与用户数据使用物理独立的 SQLite 文件，用户记录只通过 `questionExternalId` 关联题目。

项目坚持最小可用实现：不做云同步、登录、AI、复杂学习模型、新 ORM 或旧 `gongkao-study` 兼容。后续功能只在明确的真实需求下进入计划。
