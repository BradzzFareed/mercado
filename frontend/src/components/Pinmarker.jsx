import React from 'react'

export default function PinMarker({ x, y, fill = '#10b981', size = 22 }) {
  const scale = size / 24

  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      {/* Outer black stroke ring for contrast */}
      <path
        d="M 0 0 C -4 -6 -8 -10 -8 -15 A 8 8 0 1 1 8 -15 C 8 -10 4 -6 0 0 Z"
        fill={fill}
        style={{ fill: fill }} /* Forced inline style */
        stroke="#000000"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Inner white circle */}
      <circle cx="0" cy="-15" r="3" fill="#ffffff" />
    </g>
  )
}