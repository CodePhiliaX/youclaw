export interface ParsedMessage {
  requestedSkills: string[]  // 提取出的 skill 名称
  cleanContent: string       // 去掉 /<skill> 后的纯文本
}

/**
 * 解析消息中的 /<skill-name> 调用语法
 * - 匹配消息开头连续的 /<word> token
 * - 只有 <word> 在 knownSkillNames 中时才认定为 skill 调用
 * - 不在已知列表中的 /<word> 保留在 cleanContent 中
 */
export function parseSkillInvocations(
  content: string,
  knownSkillNames: Set<string>,
): ParsedMessage {
  const requestedSkills: string[] = []
  const remaining: string[] = []

  // 按空白分割 token
  const tokens = content.split(/\s+/)
  let parsingSkills = true

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (parsingSkills && token.startsWith('/')) {
      const skillName = token.slice(1)
      if (knownSkillNames.has(skillName)) {
        requestedSkills.push(skillName)
        continue
      }
    }
    // 遇到非 skill token 后停止解析前缀（但当前 token 也要保留）
    parsingSkills = false
    remaining.push(token)
  }

  return {
    requestedSkills,
    cleanContent: remaining.join(' '),
  }
}
