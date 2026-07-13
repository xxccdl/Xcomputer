import { useEffect, useState } from 'react'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Features from './components/Features'
import HowItWorks from './components/HowItWorks'
import Showcase from './components/Showcase'
import MobileShowcase from './components/MobileShowcase'
import Download from './components/Download'
import Footer from './components/Footer'
import Privacy from './components/Privacy'
import Terms from './components/Terms'

function useHashRoute(): string {
  const [route, setRoute] = useState<string>(() => window.location.hash.replace(/^#/, ''))
  useEffect(() => {
    const onHashChange = (): void => {
      setRoute(window.location.hash.replace(/^#/, ''))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return route
}

export default function App() {
  const route = useHashRoute()

  if (route === '/privacy') {
    return <Privacy />
  }
  if (route === '/terms') {
    return <Terms />
  }

  return (
    <>
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <Showcase />
      <MobileShowcase />
      <Download />
      <Footer />
    </>
  )
}
