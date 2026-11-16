import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 预览平台把 relay 前缀放在 PREVIEW_BASE 里；某些环境不注入该变量时，
// 回落到 start-preview.sh 生成的 .preview-base。dev server 必须带前缀，
// 否则 index.html 会吐出 /@vite/client、/src/main.js 这类根绝对路径，
// 在 /preview/<id>/ 下会 404，页面直接空白。
function devBase() {
  if (process.env.PREVIEW_BASE) return process.env.PREVIEW_BASE
  try {
    const value = readFileSync(new URL('./.preview-base', import.meta.url), 'utf8').trim()
    if (/^\/[^\s"']*\/$/.test(value)) return value
  } catch {
    // 文件不存在时按根路径启动
  }
  return '/'
}

export default defineConfig(({ command }) => ({
  // 构建产物发到站点根路径，绝不把预览前缀写进发布资源 URL
  base: command === 'build' ? '/' : devBase(),
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          vue: ['vue'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
}))
