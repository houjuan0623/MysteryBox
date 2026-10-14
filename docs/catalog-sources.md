# 工具目录：来源与维护

> 恢复版（2026-10-14）：依据旧任务保留的正文与修订重建。除原始方案外不声明字节级一致；涉及实现的描述是应恢复的设计，需与恢复代码及新测试对齐。旧主机结果不证明本目录已通过验收。

核对日期与目录版本：2026-10-14。以下保留的是本任务早期已实际读取官方网页的记录；恢复不是再次账号内实测。目录适用人群和caveat属于编辑判断。无虚构评分、性能比例或第三方价格承诺。

## 官方来源

1. **Descript** — [官方来源](https://www.descript.com/)
   - 已核对：Transcribe a recording；Edit audio and video through text
   - reviewedAt：2026-10-14
2. **Cursor** — [官方来源](https://cursor.com/)
   - 已核对：Generate code changes；Explore codebase context
   - reviewedAt：2026-10-14
3. **Gemini Notebook (formerly NotebookLM)** — [官方来源](https://workspace.google.com/intl/en_sg/products/gemini-notebook/)
   - 已核对：Ask questions about uploaded sources；Compare findings with source citations
   - reviewedAt：2026-10-14
4. **Notion AI** — [官方来源](https://www.notion.com/product/ai)
   - 已核对：Draft documents in a workspace；Find answers in connected work content
   - reviewedAt：2026-10-14
5. **Canva AI** — [官方来源](https://www.canva.com/canva-ai/)
   - 已核对：Generate design elements；Draft copy with Magic Write
   - reviewedAt：2026-10-14
6. **GitHub Copilot** — [官方来源](https://github.com/features/copilot)
   - 已核对：Suggest code；Discuss code in context
   - reviewedAt：2026-10-14
7. **Perplexity** — [官方来源](https://www.perplexity.ai/help-center/en/articles/10352155-what-is-perplexity)
   - 已核对：Search the web with natural-language questions；Explore cited source links
   - reviewedAt：2026-10-14
8. **Zapier** — [官方来源](https://zapier.com/ai)
   - 已核对：Connect app workflows；Plan automations with AI
   - reviewedAt：2026-10-14
9. **ChatGPT** — [官方来源](https://chatgpt.com/overview/)
   - 已核对：Draft and revise text；Explain concepts and assist with code
   - reviewedAt：2026-10-14
10. **Adobe Firefly** — [官方来源](https://www.adobe.com/products/firefly.html)

- 已核对：Generate visual concepts；Create prompt-based image assets
- reviewedAt：2026-10-14

11. **v0** — [官方来源](https://v0.app/)

- 已核对：Generate web-app code；Iterate on a prompted interface
- reviewedAt：2026-10-14

12. **Grammarly** — [官方来源](https://www.grammarly.com/ai)

- 已核对：Proofread and improve phrasing；Adjust tone while preserving meaning
- reviewedAt：2026-10-14

13. **Runway** — [官方来源](https://runway.com/)

- 已核对：Generate video concepts；Develop AI-assisted visual assets
- reviewedAt：2026-10-14

14. **Replit** — [官方来源](https://replit.com/)

- 已核对：Build app prototypes from a brief；Iterate on application code
- reviewedAt：2026-10-14

15. **Otter** — [官方来源](https://otter.ai/)

- 已核对：Transcribe conversations；Summarize decisions and action items
- reviewedAt：2026-10-14

16. **Claude** — [官方来源](https://claude.com/product/overview)

- 已核对：Synthesize provided information；Draft content and prototype ideas
- reviewedAt：2026-10-14

## 核对边界与特殊情况

- 能力核对不等于付费试用、基准测试、地区/套餐可用性保证。
- 第三方价格统一使用 Check official pricing; third-party costs are separate. MysteryBox不含外部许可证/账号/额度。
- Google官方当时明确NotebookLM更名Gemini Notebook，故保留新旧名。
- Canva页面同时含可用与coming soon能力；只采用设计元素和Magic Write，不许诺所有2.0新功能。
- Runway入口跳转runway.com，Claude介绍页跳转claude.com/product/overview，已核对新官方地址。
- 原方案Hypeit AI只是示例，未继承为事实记录。

## 维护与发布

catalog.ts为种子；MemoryStore直接使用，MongoDB先初始化集合/索引再执行显式seed，将tools和catalog_versions写入。seed为upsert，不清用户数据，不自动删旧工具；API启动快照，更新后重启。至少10条才允许启动，四兴趣各至少4条作为编辑门槛。

新增工具只采官方，核对不到则reviewedAt=null。能力克制，不编价格、评分和收益。录音检查同意，代码检查安全/测试/许可，生成资产检查权利。每次发布复核入口；历史ID保持稳定。新增商业关系须披露。
