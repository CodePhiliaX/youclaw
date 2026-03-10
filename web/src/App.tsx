import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Shell } from './components/layout/Shell'
import { Chat } from './pages/Chat'
import { Agents } from './pages/Agents'
import { Skills } from './pages/Skills'
import { Memory } from './pages/Memory'
import { Tasks } from './pages/Tasks'
import { System } from './pages/System'

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/cron" element={<Tasks />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/system" element={<System />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  )
}
