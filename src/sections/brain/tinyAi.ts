/**
 * The "Tiny AI": a transparent, browser-only recommender.
 *   score = feature similarity  +  context fit  +  learned bias (from your 👍/👎)
 * plus an ε-greedy policy that sometimes explores instead of exploiting the top pick.
 */

export const FEATURES = [
  { key: 'adventure', label: 'Adventure', low: 'homebody', high: 'send it' },
  { key: 'energy', label: 'Energy', low: 'sloth mode', high: 'beast mode' },
  { key: 'brainy', label: 'Brain power', low: 'brain off', high: 'galaxy brain' },
  { key: 'social', label: 'Social battery', low: 'solo', high: 'squad' },
] as const

export type FeatureKey = (typeof FEATURES)[number]['key']
export type Prefs = Record<FeatureKey, number>
export type Weather = 'sunny' | 'rainy' | 'snowy'

export type Item = {
  id: string
  name: string
  emoji: string
  hours: number
  outdoor: boolean
  snowFriendly?: boolean
  f: Prefs
}

export const ITEMS: Item[] = [
  { id: 'summit', name: 'Sunrise summit hike', emoji: '🏔️', hours: 6, outdoor: true, f: { adventure: 0.95, energy: 0.9, brainy: 0.1, social: 0.4 } },
  { id: 'deadlift', name: 'Heavy deadlift session', emoji: '🏋️‍♀️', hours: 1.5, outdoor: false, f: { adventure: 0.3, energy: 1, brainy: 0.2, social: 0.2 } },
  { id: 'stairs', name: 'Stair climber + nerdy podcast', emoji: '🪜', hours: 1, outdoor: false, f: { adventure: 0.1, energy: 0.8, brainy: 0.6, social: 0 } },
  { id: 'side', name: 'Hack on a side project', emoji: '💻', hours: 3, outdoor: false, f: { adventure: 0.3, energy: 0.3, brainy: 1, social: 0.1 } },
  { id: 'paper', name: 'ML paper + matcha latte', emoji: '🍵', hours: 1.5, outdoor: false, f: { adventure: 0.05, energy: 0.1, brainy: 0.9, social: 0 } },
  { id: 'brunch', name: 'Brunch & big startup ideas', emoji: '🥞', hours: 2, outdoor: false, f: { adventure: 0.3, energy: 0.3, brainy: 0.5, social: 1 } },
  { id: 'hackathon', name: 'Weekend hackathon', emoji: '🚀', hours: 8, outdoor: false, f: { adventure: 0.6, energy: 0.6, brainy: 0.95, social: 0.8 } },
  { id: 'snowshoe', name: 'Snowshoe trek', emoji: '❄️', hours: 5, outdoor: true, snowFriendly: true, f: { adventure: 0.9, energy: 0.8, brainy: 0.05, social: 0.5 } },
  { id: 'cozy', name: 'Movie, face mask & snacks', emoji: '🎬', hours: 2, outdoor: false, f: { adventure: 0, energy: 0, brainy: 0.1, social: 0.3 } },
  { id: 'picnic', name: 'Park picnic & people-watching', emoji: '🧺', hours: 3, outdoor: true, f: { adventure: 0.35, energy: 0.25, brainy: 0.2, social: 0.85 } },
]

export type Context = { weather: Weather; hours: number }

export type Scored = {
  item: Item
  score: number
  similarity: number
  contextFit: number
  bias: number
  matches: { key: FeatureKey; match: number }[]
  notes: string[]
}

export function scoreItems(prefs: Prefs, ctx: Context, bias: Record<string, number>): Scored[] {
  return ITEMS.map((item) => {
    const matches = FEATURES.map(({ key }) => ({ key, match: 1 - Math.abs(prefs[key] - item.f[key]) }))
    const similarity = matches.reduce((s, m) => s + m.match, 0) / matches.length

    let contextFit = 0
    const notes: string[] = []
    if (item.outdoor) {
      if (ctx.weather === 'sunny') { contextFit += 0.08; notes.push('☀️ sunny = outdoor bonus') }
      if (ctx.weather === 'rainy') { contextFit -= 0.3; notes.push('🌧️ rain penalty') }
      if (ctx.weather === 'snowy') {
        if (item.snowFriendly) { contextFit += 0.15; notes.push('❄️ made for snow') }
        else { contextFit -= 0.22; notes.push('❄️ too snowy') }
      }
    } else if (ctx.weather !== 'sunny') {
      contextFit += 0.05
      notes.push('🏠 indoor-friendly')
    }
    if (item.snowFriendly && ctx.weather !== 'snowy') { contextFit -= 0.25; notes.push('needs snow') }
    if (item.hours > ctx.hours) { contextFit -= 0.35; notes.push(`⏱️ needs ~${item.hours}h`) }

    const b = bias[item.id] ?? 0
    if (b > 0) notes.push('👍 you liked this')
    if (b < 0) notes.push('👎 you disliked this')

    const score = Math.max(0, Math.min(1, similarity + contextFit + b))
    return { item, score, similarity, contextFit, bias: b, matches, notes }
  }).sort((a, b) => b.score - a.score)
}

export type Pick = { scored: Scored; mode: 'exploit' | 'explore'; rank: number }

export function pick(ranked: Scored[], epsilon: number, rand = Math.random): Pick {
  if (rand() < epsilon && ranked.length > 1) {
    const rank = 1 + Math.floor(rand() * (ranked.length - 1))
    return { scored: ranked[rank], mode: 'explore', rank }
  }
  return { scored: ranked[0], mode: 'exploit', rank: 0 }
}
