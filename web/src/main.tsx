import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { I18nProvider } from './i18n'
import './index.css'
import 'streamdown/styles.css'

// 非 Mac 平台加 class，用于 CSS 覆盖原生滚动条
const platform = (window as any).electronAPI?.getPlatform?.()
if (platform !== 'darwin') {
  document.documentElement.classList.add('custom-scrollbar')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
