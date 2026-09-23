import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// 生产环境移除 StrictMode — 避免双重渲染开销，加速首屏
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)
root.render(
  // 开发环境保留 StrictMode 用于排查副作用
  import.meta.env?.DEV ? <React.StrictMode><App /></React.StrictMode> : <App />
)
