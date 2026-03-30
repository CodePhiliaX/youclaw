export type SolidBubbleTone = 'success' | 'neutral' | 'error'

export function getSolidBubbleToneClassName(type: SolidBubbleTone) {
  if (type === 'success') {
    return 'border-green-700/80 bg-green-600 text-white shadow-[0_18px_40px_-20px_rgba(22,163,74,0.8)]'
  }

  if (type === 'neutral') {
    return 'border-zinc-900/80 bg-zinc-800 text-white shadow-[0_18px_40px_-20px_rgba(24,24,27,0.85)]'
  }

  return 'border-red-700/80 bg-red-600 text-white shadow-[0_18px_40px_-20px_rgba(220,38,38,0.75)]'
}
