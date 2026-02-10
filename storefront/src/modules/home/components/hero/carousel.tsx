// @modules/home/components/hero/carousel.tsx
"use client"

import { useState, ReactNode } from "react"

export default function HeroCarousel({
  children,
}: {
  children: ReactNode | ReactNode[]
}) {
  const items = Array.isArray(children) ? children : [children]

  const [current, setCurrent] = useState(0)

  const next = () => setCurrent((prev) => (prev + 1) % items.length)
  const prev = () => setCurrent((prev) => (prev - 1 + items.length) % items.length)

  return (
    <div className="relative w-full h-[80vh] overflow-hidden bg-gray-50">
      {/* Slides container */}
      <div
        className="flex transition-transform duration-500 ease-in-out h-full"
        style={{
          transform: `translateX(-${current * 100}%)`,
          width: `${items.length * 100}%`,
        }}
      >
        {items.map((child, i) => (
          <div
            key={i}
            className="w-full h-full flex-shrink-0 flex justify-center items-center"
          >
            <div className="w-full h-full max-w-5xl flex justify-center items-center">
              {child}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <button
        onClick={prev}
        className="absolute left-4 top-1/2 -translate-y-1/2 bg-white p-3 rounded-full shadow-lg z-10"
      >
        ◀
      </button>
      <button
        onClick={next}
        className="absolute right-4 top-1/2 -translate-y-1/2 bg-white p-3 rounded-full shadow-lg z-10"
      >
        ▶
      </button>
    </div>
  )
}
