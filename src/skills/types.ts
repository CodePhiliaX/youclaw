export interface SkillFrontmatter {
  name: string
  description: string
  version?: string
  os?: string[]           // 支持的操作系统，如 ["darwin", "linux"]
  dependencies?: string[] // 需要的可执行文件，如 ["chrome", "node"]
  env?: string[]          // 需要的环境变量，如 ["MINIMAX_API_KEY"]
  tools?: string[]        // 提供的工具
  tags?: string[]         // 标签分类，如 ["coding", "search"]
  globs?: string[]        // 匹配的文件模式，如 ["*.py", "*.ts"]
  install?: Record<string, string> // 安装指南，如 { brew: "brew install chrome", apt: "apt install chromium" }
}

/** 单项依赖检查结果 */
export interface DependencyCheckResult {
  name: string
  found: boolean
  path?: string  // 找到时的可执行文件路径
}

/** 单项环境变量检查结果 */
export interface EnvCheckResult {
  name: string
  found: boolean
}

/** 细粒度资格检查详情 */
export interface EligibilityDetail {
  os: { passed: boolean; current: string; required?: string[] }
  dependencies: { passed: boolean; results: DependencyCheckResult[] }
  env: { passed: boolean; results: EnvCheckResult[] }
}

export interface Skill {
  name: string
  source: 'builtin' | 'workspace' | 'user' // 来源层级
  frontmatter: SkillFrontmatter
  content: string          // SKILL.md 内容（去掉 frontmatter 后的部分）
  path: string             // 文件路径
  eligible: boolean        // 资格检查结果
  eligibilityErrors: string[] // 资格检查失败原因
  eligibilityDetail: EligibilityDetail // 细粒度资格检查详情
  loadedAt: number         // 加载时间戳（ms）
}

/** Skills 配置 */
export interface SkillsConfig {
  maxSkillCount: number       // 最大 skill 数量
  maxTotalChars: number       // 所有 skill 内容总字符限制
  maxSingleSkillChars: number // 单个 skill 内容字符限制
}

/** 默认配置 */
export const DEFAULT_SKILLS_CONFIG: SkillsConfig = {
  maxSkillCount: 50,
  maxTotalChars: 30000,
  maxSingleSkillChars: 5000,
}
