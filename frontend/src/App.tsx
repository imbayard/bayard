import { useState } from 'react'
import Home, { type AppId } from './Home'
import CoachApp from './coach/CoachApp'

export default function App() {
  const [open, setOpen] = useState<AppId | null>(null)

  if (open === 'coach') {
    return <CoachApp onExitToHome={() => setOpen(null)} />
  }
  return <Home onOpen={setOpen} />
}
