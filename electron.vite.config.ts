import { resolve, join } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { cpSync, existsSync } from 'fs'

/**
 * Vite 插件：构建后将静态资源复制到输出目录。
 * - Design 资源：design-systems / templates / ui-components / catalog
 * - DeepSeek tokenizer：tokenizer.json / tokenizer_config.json（BPE 分词器词表）
 *
 * 这些文件包含非 JS 资源，Vite 不会打包它们，需要手动复制。
 */
function copyStaticAssets() {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      const outBase = resolve(__dirname, 'out/main')

      // Design 静态资源
      const designBase = resolve(__dirname, 'src/main/tools/Design')
      for (const dir of ['design-systems', 'templates', 'ui-components', 'ui-components-catalog.json']) {
        const src = join(designBase, dir)
        const dest = join(outBase, dir)
        if (existsSync(src)) {
          cpSync(src, dest, { recursive: true })
          console.log(`[copy-static-assets] ${dir} → ${dest}`)
        }
      }

      // DeepSeek tokenizer 词表
      const tokenizerSrc = resolve(__dirname, 'src/main/deepseek/tokenizer')
      const tokenizerDest = join(outBase, 'tokenizer')
      if (existsSync(tokenizerSrc)) {
        cpSync(tokenizerSrc, tokenizerDest, { recursive: true })
        console.log(`[copy-static-assets] tokenizer → ${tokenizerDest}`)
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyStaticAssets()],
    resolve: {
      alias: {
        '@main': resolve(__dirname, 'src/main'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()],
    build: {
      target: 'esnext',
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        },
        output: {
          manualChunks(id) {
            // 重依赖独立 chunk — 配合 React.lazy / 动态 import 实现按需加载
            if (id.includes('mermaid')) return 'mermaid'
            if (id.includes('react-syntax-highlighter')) return 'syntax-highlighter'
            if (id.includes('react-markdown') || id.includes('remark-gfm')) return 'react-markdown'
            if (id.includes('agents-raw.json')) return 'agents-data'
            if (id.includes('modes/prompts')) return 'mode-prompts'
            // lucide-react 按需导入，但拆分到独立 chunk 避免主包膨胀
            if (id.includes('lucide-react')) return 'lucide-icons'
            if (id.includes('playwright')) return 'playwright'
          }
        }
      }
    }
  }
})
