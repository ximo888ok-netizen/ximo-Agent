import { useState, useEffect, useCallback } from 'react'
import type { ImportedSkill } from '@shared/types'
import { invalidateImportedSkillsCache } from '@renderer/store/buildApiMessages'

/** 技能管理 Hook — 加载/导入/切换/删除 */
export function useSkillManager() {
  const [skills, setSkills] = useState<ImportedSkill[]>([])
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)

  const loadSkills = useCallback(async () => {
    try {
      const loaded = await window.api.importedSkills.load()
      setSkills(loaded)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { void loadSkills() }, [loadSkills])

  const persist = useCallback(async (updated: ImportedSkill[]) => {
    setSkills(updated)
    await window.api.importedSkills.save(updated)
    invalidateImportedSkillsCache()
  }, [])

  const handleImportFromFile = useCallback(async (): Promise<void> => {
    try {
      setImporting(true)
      setImportError('')
      const filePaths = await window.api.dialog.openFile([
        { name: 'Markdown / Text', extensions: ['md', 'txt', 'markdown'] }
      ])
      if (filePaths.length === 0) return

      const result = await window.api.fs.readFileContent(filePaths[0], 10000)
      if (!result.success || !result.content) {
        setImportError(result.error || '读取文件失败')
        return
      }

      const parsed = await window.api.importedSkills.parseMarkdown(result.content)
      if (parsed.error) {
        setImportError(parsed.error)
        return
      }

      const newSkill: ImportedSkill = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: parsed.name,
        description: parsed.description,
        triggers: parsed.triggers,
        body: parsed.body,
        enabled: true,
        importedAt: Date.now(),
        source: 'file',
        fileName: filePaths[0].split(/[/\\]/).pop()
      }

      await persist([newSkill, ...skills])
    } catch (e) {
      setImportError((e as Error).message || '导入失败')
    } finally {
      setImporting(false)
    }
  }, [skills, persist])

  const handleImportFromText = useCallback(async (text: string): Promise<void> => {
    if (!text.trim()) {
      setImportError('请粘贴 SKILL.md 内容')
      return
    }

    try {
      setImporting(true)
      setImportError('')
      const parsed = await window.api.importedSkills.parseMarkdown(text)
      if (parsed.error) {
        setImportError(parsed.error)
        return
      }

      const newSkill: ImportedSkill = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: parsed.name,
        description: parsed.description,
        triggers: parsed.triggers,
        body: parsed.body,
        enabled: true,
        importedAt: Date.now(),
        source: 'text'
      }

      await persist([newSkill, ...skills])
    } catch (e) {
      setImportError((e as Error).message || '导入失败')
    } finally {
      setImporting(false)
    }
  }, [skills, persist])

  const handleToggle = useCallback(async (id: string): Promise<void> => {
    const updated = skills.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)
    await persist(updated)
  }, [skills, persist])

  const handleDelete = useCallback(async (id: string): Promise<void> => {
    const updated = skills.filter(s => s.id !== id)
    await persist(updated)
  }, [skills, persist])

  return {
    skills,
    importError,
    importing,
    setImportError,
    handleImportFromFile,
    handleImportFromText,
    handleToggle,
    handleDelete,
  }
}
