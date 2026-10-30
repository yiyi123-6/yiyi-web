import { useEffect, useState } from 'react'

export const WORLDS = ['brain', 'gym', 'mountains', 'founder'] as const
export type World = (typeof WORLDS)[number]
export type Route = 'home' | World | 'about' | 'connect'

const ROUTES: Route[] = ['home', ...WORLDS, 'about', 'connect']

function parse(hash: string): Route {
  const id = hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return (ROUTES as string[]).includes(id) ? (id as Route) : 'home'
}

/** Hash routing keeps every URL working on static GitHub Pages hosting (no 404 rewrites needed). */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function href(route: Route) {
  return route === 'home' ? '#/' : `#/${route}`
}

export function navigate(route: Route) {
  window.location.hash = href(route)
}
