# Gongkao V1 Goals

Gongkao V1 is a local, reliable personal study program for the Administrative Aptitude Test (行测). V1.0 covers only 常识判断、言语理解与表达、数量关系、判断推理 and 资料分析; it does not cover 申论.

Its core learning loop is answer → save → result → explanation → continue, with later V1 milestones adding favorites, mistakes, history and basic statistics. The Frozen Question Bank Exchange Format V1.0 is the question-bank contract. Question content and personal learning records live in physically separate SQLite databases: a rebuildable `question-bank.db` and a persistent `user-data.db`. User records reference `questionExternalId`, never a database row id.

V1 favors a stable, small implementation. It does not introduce cloud sync, accounts, AI, complex learning models, a new ORM, or compatibility with the legacy `gongkao-study` program. V1.0 is complete when a fresh install initializes both databases, supports the real 50-question package and media, safely preserves personal data through question-bank rebuilds, and provides the defined V1 learning loop.
