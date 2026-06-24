import { cloneElement, useEffect, useRef, useState } from 'react'

export default function MeasuredChart({ children, height, className = '' }) {
  const containerRef = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return undefined

    const updateWidth = () => {
      const nextWidth = Math.floor(element.getBoundingClientRect().width)
      if (nextWidth > 0) setWidth(nextWidth)
    }

    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className={`measured-chart w-full min-w-0 ${className}`} style={{ height }}>
      {width > 0 ? cloneElement(children, { width, height }) : null}
    </div>
  )
}
