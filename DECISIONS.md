# Gongkao Decisions

## D001 — 行测 only
Decision: V1 implements only 行测.  
Reason: Keep the first product focused.  
Consequence: No 申论 schema, screens or logic are added.

## D002 — Frozen V1 is immutable
Decision: Question Bank Exchange Format V1.0 is frozen.  
Reason: It is the tested data contract.  
Consequence: Compatibility issues are reported, not silently solved by protocol edits.

## D003 — Two SQLite files
Decision: Content and personal records use separate SQLite files.  
Reason: A question-bank rebuild must not affect learning data.  
Consequence: `question-bank.db` is rebuildable and `user-data.db` is persistent.

## D004 — Stable external question identity
Decision: User data references `questionExternalId`.  
Reason: SQLite row ids are not stable through a rebuild.  
Consequence: Attempts remain linkable to the same Frozen V1 question.

## D005 — Rebuildable content, persistent user data
Decision: Only the question bank is regenerated.  
Reason: User learning history is personal data.  
Consequence: Initialization never deletes `user-data.db`.

## D006 — No Prisma or new ORM
Decision: V1 uses the existing SQL.js SQLite layer directly.  
Reason: The scope does not require an ORM.  
Consequence: Database code remains small and explicit.

## D007 — No legacy compatibility
Decision: The application does not continue any abandoned architecture or database.  
Reason: The legacy project is retained in Git history.  
Consequence: New code has no legacy migration path.

## D008 — Git retains old versions
Decision: Git/GitHub preserve prior work.  
Reason: New runtime code should not carry legacy support.  
Consequence: No compatibility shims are maintained.

## D009 — Fei98 50-question seed package
Decision: The verified Fei98 package is the initial real seed bank.  
Reason: It supplies balanced, tested data across five modules.  
Consequence: Fresh start imports exactly 50 questions.

## D010 — Minimal V1 implementation
Decision: Avoid AI, cloud, accounts and premature architecture.  
Reason: Reliable daily practice is the first goal.  
Consequence: Features are added only when a concrete milestone requires them.
