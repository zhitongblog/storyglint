import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import router from './router'

function App() {
  // 加载保存的主题设置
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await window.electron.settings.get('appTheme')
        if (savedTheme) {
          document.documentElement.setAttribute('data-theme', savedTheme as string)
        } else {
          // 默认使用深蓝主题
          document.documentElement.setAttribute('data-theme', 'dark-blue')
        }
      } catch (error) {
        console.error('Failed to load theme:', error)
        document.documentElement.setAttribute('data-theme', 'dark-blue')
      }
    }
    loadTheme()
  }, [])

  return <RouterProvider router={router} />
}

export default App
