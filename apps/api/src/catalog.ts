import type { Tool } from "@mysterybox/shared";

/**
 * 人工策展的可信目录是推荐边界，模型只返回这些 ID，不生成任意外链。
 * reviewedAt 保留 2026-10-14 早期实际核对官方能力说明的日期；恢复动作不是新实测。
 * 第三方套餐、账号和额度不包含在 MysteryBox 购买中；不使用虚构评分。
 * 恢复说明：主机替换后由保留的完整目录定义重建，语义保持；未声称原文件逐字节恢复。
 * 目录更新应同时维护 docs/catalog-sources.md 并提高版本，保持结果可追溯。
 */
export const CATALOG_VERSION = "2026-10-14";

export const catalog: Tool[] = [
  {
    id: "descript",
    name: "Descript",
    tagline: "Edit a recording by editing its transcript.",
    description:
      "AI-assisted audio and video editing with transcription and text-based cuts.",
    category: "Video & audio",
    interests: ["creator"],
    website: "https://www.descript.com/",
    sourceUrl: "https://www.descript.com/",
    capabilities: [
      "Transcribe a recording",
      "Edit audio and video through text",
    ],
    caveat:
      "Check transcription and every cut; use recordings and voices only with permission.",
    pricingNote: "Check official pricing; third-party costs are separate.",
    reviewedAt: "2026-10-14",
  },
  {
    id: "cursor",
    name: "Cursor",
    tagline: "Work through code changes with an AI coding agent.",
    description:
      "An AI coding environment for exploring code, generating changes, and reviewing a project.",
    category: "Development",
    interests: ["developer"],
    website: "https://cursor.com/",
    sourceUrl: "https://cursor.com/",
    capabilities: ["Generate code changes", "Explore codebase context"],
    caveat:
      "Review diffs and run tests before merging; keep secrets out of prompts and repositories.",
    pricingNote: "Check official pricing; third-party costs are separate.",
    reviewedAt: "2026-10-14",
  },
  {
    id: "gemini-notebook",
    name: "Gemini Notebook (formerly NotebookLM)",
    tagline: "Study your own sources with traceable answers.",
    description:
      "A source-grounded research assistant for comparing documents, asking questions, and preparing learning notes.",
    category: "Research & learning",
    interests: ["student", "business"],
    website: "https://notebook.google/",
    sourceUrl:
      "https://workspace.google.com/intl/en_sg/products/gemini-notebook/",
    capabilities: [
      "Ask questions about uploaded sources",
      "Compare findings with source citations",
    ],
    caveat:
      "Verify each citation in the original material and follow your institution's AI-use rules.",
    pricingNote: "Check official pricing; third-party costs are separate.",
    reviewedAt: "2026-10-14",
  },
  {
    id: "notion-ai",
    name: "Notion AI",
    tagline: "Turn workspace context into useful drafts.",
    description:
      "AI assistance within Notion for document creation, workspace search, and meeting notes.",
    category: "Knowledge management",
    interests: ["business", "student"],
    website: "https://www.notion.com/product/ai",
    sourceUrl: "https://www.notion.com/product/ai",
    capabilities: [
      "Draft documents in a workspace",
      "Find answers in connected work content",
    ],
    caveat:
      "Check workspace access and plan availability before connecting company information.",
    pricingNote: "Check official pricing; third-party costs are separate.",
    reviewedAt: "2026-10-14",
  },
  {
    id: "canva-ai",
    name: "Canva AI",
    tagline: "Develop visuals and copy in one design workspace.",
    description:
      "AI-assisted design tools for generating visual elements, drafting text, and editing creative assets.",
    category: "Design",
    interests: ["creator", "student", "business"],
    website: "https://www.canva.com/canva-ai/",
    sourceUrl: "https://www.canva.com/canva-ai/",
    capabilities: ["Generate design elements", "Draft copy with Magic Write"],
    caveat:
      "Feature access varies by plan and rollout; check output rights and visual details before publishing.",
    pricingNote: "Check official pricing; third-party costs are separate.",
    reviewedAt: "2026-10-14",
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    tagline: "Get coding suggestions where you build.",
    description:
      "AI coding assistance for code suggestions, chat, and development tasks across supported environments.",
    category: "Development",
    interests: ["developer"],
    website: "https://github.com/features/copilot",
    sourceUrl: "https://github.com/features/copilot",
    capabilities: ["Suggest code", "Discuss code in context"],
    caveat:
      "Generated code can contain bugs or resemble licensed code; review, test, and check provenance.",
    pricingNote: "Check official pricing; third-party costs are separate.",
    reviewedAt: "2026-10-14",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    tagline: "Research a question and follow its sources.",
    description:
      "An AI search tool that combines web information into conversational answers with source links.",
    category: "Research",
    interests: ["creator", "developer", "student", "business"],
    website: "https://www.perplexity.ai/",
    sourceUrl:
      "https://www.perplexity.ai/help-center/en/articles/10352155-what-is-perplexity",
    capabilities: [
      "Search the web with natural-language questions",
      "Explore cited source links",
    ],
    caveat:
      "A citation is not proof of accuracy; open the original source and verify important claims.",
    pricingNote: "Check official pricing; third-party costs are separate.",
    reviewedAt: "2026-10-14",
  },
  {
    id: "zapier",
    name: "Zapier",
    tagline: "Connect routine steps across your apps.",
    description:
      "An automation platform with AI-assisted workflow planning and app-connected AI capabilities.",
    category: "Automation",
    interests: ["business", "developer"],
    website: "https://zapier.com/ai",
    sourceUrl: "https://zapier.com/ai",
    capabilities: ["Connect app workflows", "Plan automations with AI"],
    caveat:
      "Test with sample data before enabling actions; connected-app permissions and task usage can add cost.",
    pricingNote: "Check official pricing; third-party costs are separate.",
    reviewedAt: "2026-10-14",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    tagline: "Move from a rough idea to a useful first draft.",
    description:
      "A conversational AI assistant for drafting, explaining ideas, researching, and coding support.",
    category: "General assistant",
    interests: ["creator", "developer", "student", "business"],
    website: "https://chatgpt.com/",
    sourceUrl: "https://chatgpt.com/overview/",
    capabilities: [
      "Draft and revise text",
      "Explain concepts and assist with code",
    ],
    caveat:
      "Review factual claims and code; do not submit private data without appropriate permission.",
    pricingNote: "Check official pricing; third-party costs are separate.",
    reviewedAt: "2026-10-14",
  },
  {
    id: "adobe-firefly",
    name: "Adobe Firefly",
    tagline: "Explore visual concepts with generative AI.",
    description:
      "Adobe's generative creative tools for developing images and other visual assets from prompts.",
    category: "Generative design",
    interests: ["creator", "business"],
    website: "https://www.adobe.com/products/firefly.html",
    sourceUrl: "https://www.adobe.com/products/firefly.html",
    capabilities: [
      "Generate visual concepts",
      "Create prompt-based image assets",
    ],
    caveat:
      "Review the selected model's terms, usage credits, and asset suitability before commercial use.",
    pricingNote: "Check official pricing; third-party costs are separate.",
    reviewedAt: "2026-10-14",
  },
  {
    id: "v0",
    name: "v0",
    tagline: "Turn a product sketch into a web-app starting point.",
    description:
      "Vercel's AI builder for generating and iterating on web applications from prompts.",
    category: "Development",
    interests: ["developer", "business"],
    website: "https://v0.app/",
    sourceUrl: "https://v0.app/",
    capabilities: ["Generate web-app code", "Iterate on a prompted interface"],
    caveat:
      "A generated preview still needs security, accessibility, and production testing; hosting may cost extra.",
    pricingNote: "Check official pricing; third-party costs are separate.",
    reviewedAt: "2026-10-14",
  },
  {
    id: "grammarly",
    name: "Grammarly",
    tagline: "Refine a draft for the people reading it.",
    description:
      "AI writing assistance for clearer phrasing, proofreading, and adapting text to an audience.",
    category: "Writing",
    interests: ["creator", "student", "business"],
    website: "https://www.grammarly.com/ai",
    sourceUrl: "https://www.grammarly.com/ai",
    capabilities: [
      "Proofread and improve phrasing",
      "Adjust tone while preserving meaning",
    ],
    caveat:
      "Check changes for altered meaning and follow any required academic or workplace AI disclosures.",
    pricingNote: "Check official pricing; third-party costs are separate.",
    reviewedAt: "2026-10-14",
  },
  {
    id: "runway",
    name: "Runway",
    tagline: "Explore AI-generated video concepts.",
    description:
      "Creative AI tools and models for generating video and developing visual ideas.",
    category: "Generative video",
    interests: ["creator"],
    website: "https://runway.com/",
    sourceUrl: "https://runway.com/",
    capabilities: [
      "Generate video concepts",
      "Develop AI-assisted visual assets",
    ],
    caveat:
      "Expect to iterate on motion and consistency; verify rights, consent, and credit costs before use.",
    pricingNote: "Check official pricing; third-party costs are separate.",
    reviewedAt: "2026-10-14",
  },
  {
    id: "replit",
    name: "Replit",
    tagline: "Prototype an app from a plain-language brief.",
    description:
      "An AI app-building environment for creating and iterating on software projects.",
    category: "Development",
    interests: ["developer", "student"],
    website: "https://replit.com/",
    sourceUrl: "https://replit.com/",
    capabilities: [
      "Build app prototypes from a brief",
      "Iterate on application code",
    ],
    caveat:
      "Review generated code and access settings; running or deploying a project can incur additional charges.",
    pricingNote: "Check official pricing; third-party costs are separate.",
    reviewedAt: "2026-10-14",
  },
  {
    id: "otter",
    name: "Otter",
    tagline: "Turn an authorized recording into searchable notes.",
    description:
      "AI transcription and meeting-note tools that extract summaries and action items from conversations.",
    category: "Transcription",
    interests: ["creator", "student", "business"],
    website: "https://otter.ai/",
    sourceUrl: "https://otter.ai/",
    capabilities: [
      "Transcribe conversations",
      "Summarize decisions and action items",
    ],
    caveat:
      "Get all required recording consent and review speaker labels and important details before sharing.",
    pricingNote: "Check official pricing; third-party costs are separate.",
    reviewedAt: "2026-10-14",
  },
  {
    id: "claude",
    name: "Claude",
    tagline: "Shape complex material into a clearer draft.",
    description:
      "An AI assistant for synthesizing information, drafting content, and developing ideas and prototypes.",
    category: "General assistant",
    interests: ["creator", "developer", "student", "business"],
    website: "https://claude.ai/",
    sourceUrl: "https://claude.com/product/overview",
    capabilities: [
      "Synthesize provided information",
      "Draft content and prototype ideas",
    ],
    caveat:
      "Validate claims and generated work; connected sources require their own access and privacy review.",
    pricingNote: "Check official pricing; third-party costs are separate.",
    reviewedAt: "2026-10-14",
  },
];
