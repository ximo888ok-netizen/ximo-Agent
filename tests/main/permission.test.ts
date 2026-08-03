import { describe, it, expect } from 'vitest'
import {
  evaluate,
  extractSubject,
  getConfigForMode,
  YOLO_CONFIG,
  SAFE_CONFIG,
  CODING_DEFAULT_CONFIG,
  OFFICE_DEFAULT_CONFIG
} from '../../src/main/Permission'
import type { PermissionConfig } from '../../src/main/Permission'

describe('Permission', () => {
  describe('evaluate — 优先级', () => {
    it('deny 优先级最高', () => {
      const config: PermissionConfig = {
        allow: [{ tool: 'test_tool' }],
        ask: [{ tool: 'test_tool' }],
        deny: [{ tool: 'test_tool' }]
      }
      expect(evaluate(config, 'test_tool', '')).toBe('deny')
    })

    it('ask 优先于 allow', () => {
      const config: PermissionConfig = {
        allow: [{ tool: 'test_tool' }],
        ask: [{ tool: 'test_tool' }],
        deny: []
      }
      expect(evaluate(config, 'test_tool', '')).toBe('ask')
    })

    it('allow 不匹配时回退到默认', () => {
      const config: PermissionConfig = {
        allow: [{ tool: 'other_tool' }],
        ask: [],
        deny: []
      }
      expect(evaluate(config, 'test_tool', '')).toBe('ask')
    })

    it('defaultDecision 为 allow 时未匹配规则返回 allow', () => {
      const config: PermissionConfig = {
        allow: [],
        ask: [],
        deny: [],
        defaultDecision: 'allow'
      }
      expect(evaluate(config, 'any_tool', '')).toBe('allow')
    })

    it('defaultDecision 为 deny 时未匹配规则返回 deny', () => {
      const config: PermissionConfig = {
        allow: [],
        ask: [],
        deny: [],
        defaultDecision: 'deny'
      }
      expect(evaluate(config, 'any_tool', '')).toBe('deny')
    })

    it('无 defaultDecision 时默认 ask', () => {
      const config: PermissionConfig = {
        allow: [],
        ask: [],
        deny: []
      }
      expect(evaluate(config, 'any_tool', '')).toBe('ask')
    })
  })

  describe('evaluate — subject glob 匹配', () => {
    it('空 subject 模式匹配一切', () => {
      const config: PermissionConfig = {
        allow: [{ tool: 'terminal_exec', subject: '' }],
        ask: [],
        deny: []
      }
      // 空 subject 匹配所有调用
      expect(evaluate(config, 'terminal_exec', 'anything')).toBe('allow')
    })

    it('* 通配符匹配', () => {
      const config: PermissionConfig = {
        allow: [{ tool: 'terminal_exec', subject: 'ls *' }],
        ask: [],
        deny: []
      }
      expect(evaluate(config, 'terminal_exec', 'ls -la')).toBe('allow')
      expect(evaluate(config, 'terminal_exec', 'ls')).toBe('ask')
      expect(evaluate(config, 'terminal_exec', 'rm -rf /')).toBe('ask')
    })

    it('? 单字符通配符', () => {
      const config: PermissionConfig = {
        allow: [{ tool: 'terminal_exec', subject: 'test?' }],
        ask: [],
        deny: []
      }
      expect(evaluate(config, 'terminal_exec', 'test1')).toBe('allow')
      expect(evaluate(config, 'terminal_exec', 'test12')).toBe('ask')
    })

    it('大小写不敏感', () => {
      const config: PermissionConfig = {
        allow: [{ tool: 'terminal_exec', subject: 'Test' }],
        ask: [],
        deny: []
      }
      expect(evaluate(config, 'terminal_exec', 'test')).toBe('allow')
      expect(evaluate(config, 'terminal_exec', 'TEST')).toBe('allow')
    })
  })

  describe('evaluate — subject 精确匹配', () => {
    it('有 subject 的规则匹配特定命令', () => {
      const config: PermissionConfig = {
        allow: [{ tool: 'terminal_exec', subject: 'ls *' }],
        ask: [],
        deny: []
      }
      expect(evaluate(config, 'terminal_exec', 'ls -la')).toBe('allow')
      expect(evaluate(config, 'terminal_exec', 'rm -rf /')).toBe('ask')
    })

    it('literal 匹配区分精确文本', () => {
      const config: PermissionConfig = {
        allow: [{ tool: 'git_operations', subject: 'status', literal: true }],
        ask: [],
        deny: []
      }
      expect(evaluate(config, 'git_operations', 'status')).toBe('allow')
      expect(evaluate(config, 'git_operations', 'statusx')).toBe('ask')
    })

    it('无 subject 的规则匹配该工具的所有调用', () => {
      const config: PermissionConfig = {
        allow: [{ tool: 'file_read' }],
        ask: [],
        deny: []
      }
      expect(evaluate(config, 'file_read', '/any/path')).toBe('allow')
      expect(evaluate(config, 'file_read', '/other/path')).toBe('allow')
    })
  })

  describe('extractSubject', () => {
    it('terminal_exec 提取 command', () => {
      expect(extractSubject('terminal_exec', { command: 'npm test' })).toBe('npm test')
    })

    it('git_operations 提取 action', () => {
      expect(extractSubject('git_operations', { action: 'commit' })).toBe('commit')
    })

    it('file_delete 提取 filePath', () => {
      expect(extractSubject('file_delete', { filePath: '/test/file.txt' })).toBe('/test/file.txt')
    })

    it('未知工具返回空字符串', () => {
      expect(extractSubject('unknown_tool', { foo: 'bar' })).toBe('')
    })

    it('缺少字段时返回空字符串', () => {
      expect(extractSubject('terminal_exec', {})).toBe('')
    })
  })

  describe('getConfigForMode', () => {
    it('coding 模式返回 CODING_DEFAULT_CONFIG', () => {
      expect(getConfigForMode('coding')).toBe(CODING_DEFAULT_CONFIG)
    })

    it('office 模式返回 OFFICE_DEFAULT_CONFIG', () => {
      expect(getConfigForMode('office')).toBe(OFFICE_DEFAULT_CONFIG)
    })

    it('design 模式返回 OFFICE_DEFAULT_CONFIG（与 office 共用）', () => {
      expect(getConfigForMode('design')).toBe(OFFICE_DEFAULT_CONFIG)
    })

    it('未知模式回退到 CODING_DEFAULT_CONFIG', () => {
      expect(getConfigForMode('unknown')).toBe(CODING_DEFAULT_CONFIG)
    })
  })

  describe('YOLO_CONFIG', () => {
    it('所有规则为空，默认 allow', () => {
      expect(YOLO_CONFIG.allow).toEqual([])
      expect(YOLO_CONFIG.ask).toEqual([])
      expect(YOLO_CONFIG.deny).toEqual([])
      expect(YOLO_CONFIG.defaultDecision).toBe('allow')
    })

    it('YOLO 配置下任何工具都返回 allow', () => {
      expect(evaluate(YOLO_CONFIG, 'any_tool', '')).toBe('allow')
      expect(evaluate(YOLO_CONFIG, 'file_delete', '')).toBe('allow')
      expect(evaluate(YOLO_CONFIG, 'terminal_exec', 'rm -rf /')).toBe('allow')
    })
  })

  describe('SAFE_CONFIG', () => {
it('file_delete 需用户确认', () => {
expect(evaluate(SAFE_CONFIG, 'file_delete', '')).toBe('ask')
})

    it('禁止 act_ui', () => {
      expect(evaluate(SAFE_CONFIG, 'act_ui', '')).toBe('deny')
    })

    it('禁止 network_replay', () => {
      expect(evaluate(SAFE_CONFIG, 'network_replay', '')).toBe('deny')
    })

    it('禁止 browser_execute_js', () => {
      expect(evaluate(SAFE_CONFIG, 'browser_execute_js', '')).toBe('deny')
    })

    it('非禁止工具默认 allow', () => {
      expect(evaluate(SAFE_CONFIG, 'file_read', '')).toBe('allow')
      expect(evaluate(SAFE_CONFIG, 'web_search', '')).toBe('allow')
    })
  })

  describe('CODING_DEFAULT_CONFIG', () => {
    it('只读工具允许执行', () => {
      expect(evaluate(CODING_DEFAULT_CONFIG, 'file_read', '')).toBe('allow')
      expect(evaluate(CODING_DEFAULT_CONFIG, 'file_list', '')).toBe('allow')
      expect(evaluate(CODING_DEFAULT_CONFIG, 'file_search', '')).toBe('allow')
      expect(evaluate(CODING_DEFAULT_CONFIG, 'web_search', '')).toBe('allow')
    })

    it('编程基础写操作允许执行（有 checkpoint 保障）', () => {
      expect(evaluate(CODING_DEFAULT_CONFIG, 'file_write', '')).toBe('allow')
      expect(evaluate(CODING_DEFAULT_CONFIG, 'file_edit', '')).toBe('allow')
      expect(evaluate(CODING_DEFAULT_CONFIG, 'multi_edit', '')).toBe('allow')
    })

    it('终端和 git 需要确认', () => {
      expect(evaluate(CODING_DEFAULT_CONFIG, 'terminal_exec', 'ls')).toBe('ask')
      expect(evaluate(CODING_DEFAULT_CONFIG, 'git_operations', 'push')).toBe('ask')
    })

    it('file_delete 需要确认', () => {
      expect(evaluate(CODING_DEFAULT_CONFIG, 'file_delete', '/test')).toBe('ask')
    })

    it('act_ui 被禁止', () => {
      expect(evaluate(CODING_DEFAULT_CONFIG, 'act_ui', '')).toBe('deny')
    })

    it('browser_execute_js 被禁止', () => {
      expect(evaluate(CODING_DEFAULT_CONFIG, 'browser_execute_js', '')).toBe('deny')
    })
  })

  describe('OFFICE_DEFAULT_CONFIG', () => {
    it('web 工具允许执行', () => {
      expect(evaluate(OFFICE_DEFAULT_CONFIG, 'web_search', '')).toBe('allow')
      expect(evaluate(OFFICE_DEFAULT_CONFIG, 'web_fetch', '')).toBe('allow')
      expect(evaluate(OFFICE_DEFAULT_CONFIG, 'web_cache', '')).toBe('allow')
    })

    it('只读文件操作允许', () => {
      expect(evaluate(OFFICE_DEFAULT_CONFIG, 'file_read', '')).toBe('allow')
      expect(evaluate(OFFICE_DEFAULT_CONFIG, 'file_list', '')).toBe('allow')
    })

    it('写操作需要确认', () => {
      expect(evaluate(OFFICE_DEFAULT_CONFIG, 'file_write', '')).toBe('ask')
      expect(evaluate(OFFICE_DEFAULT_CONFIG, 'file_edit', '')).toBe('ask')
      expect(evaluate(OFFICE_DEFAULT_CONFIG, 'file_delete', '')).toBe('ask')
    })

    it('terminal_exec 需要确认', () => {
      expect(evaluate(OFFICE_DEFAULT_CONFIG, 'terminal_exec', 'dir')).toBe('ask')
    })

    it('deny 列表为空', () => {
      expect(OFFICE_DEFAULT_CONFIG.deny).toEqual([])
    })
  })
})
