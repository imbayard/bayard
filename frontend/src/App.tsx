import { usePathname, navigate } from './lib/router'
import Home, { type AppId } from './Home'
import CoachApp from './coach/CoachApp'
import BenchApp from './bench/BenchApp'

export default function App() {
  const path = usePathname()
  const appId = path.split('/')[1] as AppId | ''

  if (appId === 'coach') {
    return <CoachApp onExitToHome={() => navigate('/')} />
  }
  if (appId === 'bench') {
    return <BenchApp onExitToHome={() => navigate('/')} />
  }
  return <Home onOpen={(id) => navigate(`/${id}`)} />
}
