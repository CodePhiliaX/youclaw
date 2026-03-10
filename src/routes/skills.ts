import { Hono } from 'hono'
import type { SkillsLoader } from '../skills/index.ts'
import type { AgentManager } from '../agent/index.ts'

export function createSkillsRoutes(skillsLoader: SkillsLoader, agentManager: AgentManager) {
  const skills = new Hono()

  // GET /api/skills — 所有可用 skills
  skills.get('/skills', (c) => {
    const allSkills = skillsLoader.loadAllSkills()
    return c.json(allSkills)
  })

  // GET /api/skills/stats — 缓存统计
  skills.get('/skills/stats', (c) => {
    const stats = skillsLoader.getCacheStats()
    const config = skillsLoader.getConfig()
    return c.json({ ...stats, config })
  })

  // POST /api/skills/reload — 强制重载
  skills.post('/skills/reload', (c) => {
    const reloaded = skillsLoader.refresh()
    return c.json({ count: reloaded.length, reloadedAt: Date.now() })
  })

  // GET /api/skills/:name — 单个 skill 详情
  skills.get('/skills/:name', (c) => {
    const name = c.req.param('name')
    const allSkills = skillsLoader.loadAllSkills()
    const skill = allSkills.find((s) => s.name === name)

    if (!skill) {
      return c.json({ error: 'Skill not found' }, 404)
    }

    return c.json(skill)
  })

  // GET /api/agents/:id/skills — agent 启用的 skills
  skills.get('/agents/:id/skills', (c) => {
    const id = c.req.param('id')
    const managed = agentManager.getAgent(id)

    if (!managed) {
      return c.json({ error: 'Agent not found' }, 404)
    }

    const agentSkills = skillsLoader.loadSkillsForAgent(managed.config)
    return c.json(agentSkills)
  })

  return skills
}
