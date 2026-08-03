/**
 * 从用户输入构建最终消息文本 — 处理联网搜索提示、附加文件、组件选择、@file 引用。
 *
 * 提取自 sendMessage，使消息构建逻辑可独立测试和复用。
 */

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']

interface BuildUserMessageParams {
  text: string
  networkSearchOn: boolean
  skipNetworkHint?: boolean
  attachedFiles: string[]
  selectedComponentIds: string[]
  currentMode: string
  projectPath: string
}

/**
 * 处理用户消息文本，返回增强后的文本和需要清理的副作用标志。
 *
 * @returns `{ text, clearAttachedFiles, clearSelectedComponents }`
 */
export async function buildUserMessage(params: BuildUserMessageParams): Promise<{
  text: string
  clearAttachedFiles: boolean
  clearSelectedComponents: boolean
}> {
  let trimmed = params.text.trim()
  let clearAttachedFiles = false
  let clearSelectedComponents = false

  // 联网搜索提示注入
  if (params.networkSearchOn && !params.skipNetworkHint) {
    if (!trimmed.includes('联网搜索') && !trimmed.includes('web_search')) {
      trimmed = `[联网搜索模式] 请优先使用 web_search 工具搜索最新信息来回答以下问题：\n\n${trimmed}`
    }
  }

  // 附加文件信息注入
  if (params.attachedFiles.length > 0) {
    const imageFiles = params.attachedFiles.filter((f) => {
      const ext = f.toLowerCase().match(/\.[^.]+$/)?.[0] || ''
      return IMAGE_EXTS.includes(ext)
    })
    const otherFiles = params.attachedFiles.filter((f) => !imageFiles.includes(f))
    const parts: string[] = []
    if (imageFiles.length > 0) {
      const imgList = imageFiles.map((f) => `- ${f}`).join('\n')
      parts.push(`📎 附加图片：\n${imgList}\n请使用 vision_analyze(file_path="图片路径", prompt="分析指令") 工具来分析以上图片内容。`)
    }
    if (otherFiles.length > 0) {
      const fileList = otherFiles.map((f) => `- ${f}`).join('\n')
      parts.push(`📎 附加文件：\n${fileList}\n请先使用 file_read 工具读取以上文件内容，再根据内容回答。`)
    }
    trimmed = `${trimmed}\n\n${parts.join('\n\n')}`
    clearAttachedFiles = true
  }

  // UI 组件选择注入 — 设计模式
  if (params.selectedComponentIds.length > 0 && params.currentMode === 'design') {
    const compList = params.selectedComponentIds.map((id, i) =>
      `${i + 1}. design_component(action="get", component_id="${id}")`
    ).join('\n')
    trimmed = `${trimmed}\n\n🧩 请使用以下 ${params.selectedComponentIds.length} 个 UI 组件来生成页面，先逐个获取源码再组合到 HTML 中：\n${compList}`
    clearSelectedComponents = true
  }

  // @file 引用解析 — 直接读取文件内容注入上下文
  const mentionMatches = [...trimmed.matchAll(/@([^\s@]+\.\w+)/g)]
  if (mentionMatches.length > 0 && params.projectPath) {
    const sep = params.projectPath.includes('\\') ? '\\' : '/'
    const fileContents: string[] = []
    for (const match of mentionMatches) {
      const relativePath = match[1]
      const absPath = `${params.projectPath}${sep}${relativePath.replace(/\//g, sep)}`
      try {
        const result = await window.api.fs.readFileContent(absPath, 300)
        if (result.success && result.content) {
          const ext = relativePath.split('.').pop() || ''
          fileContents.push(`### \`${relativePath}\` (${result.totalLines} 行)\n\`\`\`${ext}\n${result.content}\n\`\`\``)
        } else {
          fileContents.push(`### \`${relativePath}\`\n⚠️ ${result.error || '读取失败'}`)
        }
      } catch {
        fileContents.push(`### \`${relativePath}\`\n⚠️ 读取异常`)
      }
    }
    if (fileContents.length > 0) {
      trimmed = trimmed.replace(/@([^\s@]+\.\w+)/g, '`$1`')
      trimmed = `${trimmed}\n\n📎 引用文件内容：\n${fileContents.join('\n\n')}`
    }
  }

  return { text: trimmed, clearAttachedFiles, clearSelectedComponents }
}
