'use client'

import { useEffect, useState } from 'react'

export interface UndoToastState {
  message: string
  onUndo: () => void
}

export function UndoToast({
  state,
  onClose,
}: {
  state: UndoToastState | null
  onClose: () => void
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (state) {
      setVisible(true)
      const timer = setTimeout(() => {
        setVisible(false)
        onClose()
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [state, onClose])

  if (!state || !visible) return null

  return (
    <div
      className="fixed bottom-4 left-4 right-4 bg-black/80 text-white rounded-lg p-4 flex items-center justify-between z-50 animate-in"
      role="alert"
    >
      <span>{state.message}</span>
      <button
        onClick={() => {
          state.onUndo()
          setVisible(false)
          onClose()
        }}
        className="ml-4 px-3 py-1 bg-white text-black rounded font-semibold hover:bg-gray-200"
      >
        בטל
      </button>
    </div>
  )
}
