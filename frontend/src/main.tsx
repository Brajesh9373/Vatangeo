import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from './context/ThemeContext'
import { ConfigProvider } from './context/ConfigContext'
import { ChatProvider } from './context/ChatContext'
import { HistoryProvider } from './context/HistoryContext'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ConfigProvider>
        <ChatProvider>
          <HistoryProvider>
            <App />
          </HistoryProvider>
        </ChatProvider>
      </ConfigProvider>
    </ThemeProvider>
  </StrictMode>,
)
