/**
 * 主进程统一路径管理
 *
 * 所有基于 userData 的持久化路径集中在此定义，
 * 各 Store 模块通过导入此文件获取路径，消除重复硬编码。
 */
import { app } from 'electron'
import { join } from 'path'

/** 应用根数据目录 */
const DATA_DIR = join(app.getPath('userData'), 'ximo-agent')

/** 设置文件 */
export const settingsFile = join(DATA_DIR, 'settings.json')

/** 会话文件 */
export const conversationsFile = join(DATA_DIR, 'conversations.json')

/** 模式记忆目录 */
export const memoryDir = join(DATA_DIR, 'memory')

/** 技能文件 */
export const skillsFile = join(DATA_DIR, 'skills.json')

/** MCP 配置文件 */
export const mcpFile = join(DATA_DIR, 'mcp-config.json')

/** 导入技能文件 */
export const importedSkillsFile = join(DATA_DIR, 'imported-skills.json')

/** 主题包目录 */
export const themesDir = join(DATA_DIR, 'themes')

/** 知识库目录 */
export const knowledgeDir = join(DATA_DIR, 'knowledge')

/** 背景图目录 */
export const bgDir = join(DATA_DIR, 'backgrounds')

/** 自定义设计资产根目录 */
export const designBaseDir = DATA_DIR

/** 自定义设计风格目录 */
export const designStylesDir = join(DATA_DIR, 'design-styles')

/** 自定义 UI 组件目录 */
export const designComponentsDir = join(DATA_DIR, 'ui-components')

/** 自定义 UI 组件目录清单文件 */
export const designComponentsCatalog = join(DATA_DIR, 'ui-components-catalog.json')

/** 自定义专家文件 */
export const expertsFile = join(DATA_DIR, 'experts.json')

/** 粘贴图片目录（userData 根下） */
export const pastedImagesDir = join(app.getPath('userData'), 'pasted-images')

/** Pi Computer Use 助手目录（userData 根下） */
export const piHelperDir = join(app.getPath('userData'), 'pi-computer-use')

export { DATA_DIR }
