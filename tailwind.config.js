/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          base: 'var(--bg-base)',
          surface: 'var(--bg-surface)',
          elevated: 'var(--bg-elevated)',
          hover: 'var(--bg-hover)',
          input: 'var(--bg-input)',
          /*
           * `-soft` 系列替代 `bg-bg-elevated/60` 这类**失效**写法。
           * Tailwind 3 对 `var(--x)` 形式的颜色不生成透明度修饰类（实测构建产物查不到），
           * 所以那些 `/N` 类全是空转 —— 面板底色实际是全透明。
           * 软令牌用 color-mix 从原令牌派生，主题包覆写 --bg-* 时会自动跟随。
           */
          'base-soft': 'var(--bg-base-soft)',
          'surface-soft': 'var(--bg-surface-soft)',
          'elevated-soft': 'var(--bg-elevated-soft)',
          'hover-soft': 'var(--bg-hover-soft)'
        },
        border: {
          DEFAULT: 'var(--border-DEFAULT)',
          subtle: 'var(--border-subtle)',
          hover: 'var(--border-hover)',
          soft: 'var(--border-soft)',
          'subtle-soft': 'var(--border-subtle-soft)'
        },
        /*
         * accent 走 `rgb(var(--x-rgb) / <alpha-value>)` 而不是 `var(--x)`。
         *
         * 原因：Tailwind 3 对 `var(--x)` 形式的颜色**不生成透明度修饰类** ——
         * `bg-accent/10`、`border-accent/30`、`shadow-accent/20` 会被静默丢弃
         * （实测：build 产物里查不到这些类）。改用 <alpha-value> 后 `/10` 之类的
         * 修饰符才会正常产出 `rgb(29 111 245 / 0.1)`。
         *
         * `--*-rgb` 通道三元组由 src/renderer/src/lib/accent.ts 派生并写在内联样式上，
         * 第二个参数是 CSS 兜底（首帧 / JS 未执行时用）。
         * 手写 CSS 仍然消费 `--accent-*` 颜色令牌，两套并存、同一个派生源。
         */
        accent: {
          DEFAULT: 'rgb(var(--accent-ink-rgb, 29 111 245) / <alpha-value>)',
          hover: 'rgb(var(--accent-ink-strong-rgb, 11 100 244) / <alpha-value>)',
          muted: 'rgb(var(--accent-fill-top-rgb, 59 130 246) / <alpha-value>)',
          light: 'rgb(var(--accent-ink-subtle-rgb, 29 111 245) / <alpha-value>)',
          fill: 'rgb(var(--accent-fill-rgb, 29 111 245) / <alpha-value>)',
          'fill-hover': 'rgb(var(--accent-fill-hover-rgb, 11 100 244) / <alpha-value>)',
          'on-fill': 'rgb(var(--accent-on-fill-rgb, 255 255 255) / <alpha-value>)'
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          tertiary: 'var(--text-tertiary)',
          quaternary: 'var(--text-quaternary)'
        }
      },
      /*
       * 字号阶梯：7 档，**每档自带行高**。
       *
       * 为什么要覆盖 Tailwind 内置的 xs/sm/base：
       * 原先 14 档字号散点分布（7~30px），且 443 处任意值字号里只有 25 处配了
       * leading-* —— 命名档自带行高（12→16），任意值档不带（10→继承 15），
       * 结果同样是小字、行盒比例不同，多行并排基线参差。
       * 收敛后 xs/sm/base 的含义变化：sm 14→13px、base 16→14px（按方案收敛映射）。
       * lg 以上保留 Tailwind 默认（全仓仅 ≤6 处使用）。
       */
      fontSize: {
        caption: ['var(--fs-caption)', { lineHeight: 'var(--lh-caption)' }],
        xs: ['var(--fs-xs)', { lineHeight: 'var(--lh-xs)' }],
        sm: ['var(--fs-sm)', { lineHeight: 'var(--lh-sm)' }],
        base: ['var(--fs-base)', { lineHeight: 'var(--lh-base)' }],
        body: ['var(--fs-body)', { lineHeight: 'var(--lh-body)' }],
        title: ['var(--fs-title)', { lineHeight: 'var(--lh-title)' }],
        display: ['var(--fs-display)', { lineHeight: 'var(--lh-display)' }]
      },
      fontFamily: {
        /*
         * 方案 C：纯系统字体栈。
         * 原先首选 Inter / JetBrains Mono，但全仓无 @font-face、无字体文件
         * （Google Fonts 只加载了一个 Dancing Script）→ 实际一直回退到 Segoe UI。
         * 即「排版系统建在错误字体的度量上」。
         * 桌面应用依赖网络字体（离线闪回退）+ 拉丁与中文分属两族（同行基线不齐）
         * 都不划算，因此改用 Windows 自家设计成对的 Segoe UI + 微软雅黑。
         */
        sans: [
          'Segoe UI',
          'Microsoft YaHei UI',
          'Microsoft YaHei',
          'system-ui',
          '-apple-system',
          'sans-serif'
        ],
        mono: ['Cascadia Mono', 'Consolas', 'SF Mono', 'ui-monospace', 'monospace']
      },
      borderRadius: {
        ios: '18px',
        'ios-lg': '22px',
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
        panel: 'var(--radius-panel)'
      },
      transitionDuration: {
        /*
         * DEFAULT 覆盖掉 Tailwind 的 150ms —— 原先 327 处 transition-* 里大多数
         * 不写时长，回落 150ms，与显式写的 200/300/500 混成 4 档 + 未定义。
         * 设 DEFAULT 后「不写」= 200ms（--dur-fast），档位收敛为 4 档。
         */
        DEFAULT: 'var(--dur-fast)',
        instant: 'var(--dur-instant)',
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)'
      },
      transitionTimingFunction: {
        /*
         * 设 DEFAULT 后，**所有** transition-* 工具类默认使用产品自己的缓动，
         * 而不是浏览器/ Tailwind 的 ease。这是把缓动令牌使用率从 2.8% 拉到 100%
         * 的唯一低成本做法（逐处加 ease-* 要改 327 处）。
         */
        DEFAULT: 'var(--ease-out-quart)',
        ios: 'cubic-bezier(0.32, 0.72, 0, 1)',
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)'
      },
      boxShadow: {
        glass: 'var(--glass-shadow)',
        glow: '0 0 20px -2px var(--glow-color)',
        'glow-lg': '0 8px 32px -4px var(--glow-color)',
        lifted: '0 12px 32px -8px rgba(0, 0, 0, 0.25)'
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'spin-slow': 'spin 8s linear infinite'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        }
      }
    }
  },
  plugins: []
}
