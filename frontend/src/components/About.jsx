import { useLayoutEffect, useRef, useState } from 'react'
import { motion, MotionConfig } from 'framer-motion'
import { PageHead } from './Common'
import { useApp } from '../state'

const TECH_STACK = [
  { name: 'React', role: 'Frontend UI' },
  { name: 'Vite', role: 'Build & Bundler' },
  { name: 'Tailwind CSS', role: 'Utility Styling' },
  { name: 'Python & FastAPI', role: 'Forecasting API' },
  { name: 'Supabase', role: 'Auth & PostgreSQL' },
]

const TEAM_MEMBERS = [
  {
    name: 'Leo Angello P. Visto',
    role: 'Full Stack',
    description: 'Quality Assurance and Project Manager',
    image: '/Pictures/Visto.png'
  },
  {
    name: 'James Bradley G. Caligayahan',
    role: 'Full Stack',
    description: 'Backend Lead and Github Manager.',
    image: '/Pictures/Caligayahan.jpg', // Replace with '/images/member2.jpg' after uploading
  },
  {
    name: 'Ralfh Justine N. Lindog',
    role: 'Full  Stack',
    description: 'Frontend and Design Lead',
    image: '/Pictures/Lindog.jpg', // Replace with '/images/member3.jpg' after uploading
  },
]

// 3 cursors take turns (round-robin) dragging the 7 non-team elements into place
const CURSORS = [
  { name: 'Builder 1', color: '#10b981', idle: { x: 40, y: 16 } },
  { name: 'Builder 2', color: '#0ea5e9', idle: { x: 160, y: 16 } },
  { name: 'Builder 3', color: '#8b5cf6', idle: { x: 280, y: 16 } },
]

// Off-screen drag origins for each of the 7 items: [Hero, Tech0..Tech4, ContactBtn]
const ITEM_ORIGINS = [
  { x: 180, y: -90 },  // 0: Hero Card
  { x: -120, y: -80 }, // 1: React
  { x: -60, y: -95 },  // 2: Vite
  { x: 0, y: -105 },   // 3: Tailwind CSS
  { x: 70, y: -95 },   // 4: Python & FastAPI
  { x: 130, y: -80 },  // 5: Supabase
  { x: 0, y: 80 },     // 6: Contact Us button
]

const FETCH_DURATION = 0.35
const DRAG_DURATION = 0.72
const GAP_BETWEEN_ITEMS = 0.12
const STEP_INTERVAL = FETCH_DURATION + DRAG_DURATION + GAP_BETWEEN_ITEMS

export default function About({ onContactClick }) {
  const { t } = useApp()
  const wrapperRef = useRef(null)
  const itemRefs = useRef([])
  const [targets, setTargets] = useState([])

  const aboutTitle = t('about.title') !== 'about.title' ? t('about.title') : 'About Mercado'
  const aboutSub =
    t('about.sub') !== 'about.sub'
      ? t('about.sub')
      : 'Built by Trinity Build to help consumers track local prices and compare nearby markets'

  // Measure each draggable element's exact resting position inside the wrapper
  useLayoutEffect(() => {
    const measure = () => {
      const wrap = wrapperRef.current
      if (!wrap) return
      const wRect = wrap.getBoundingClientRect()
      const measured = itemRefs.current.map((el) => {
        if (!el) return { x: 200, y: 200 }
        const r = el.getBoundingClientRect()
        return {
          x: r.left - wRect.left + r.width * 0.55,
          y: r.top - wRect.top + r.height * 0.45,
        }
      })
      setTargets(measured)
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const totalItems = ITEM_ORIGINS.length
  const totalRelayTime = 0.25 + totalItems * STEP_INTERVAL + 0.35
  const teamDelay = 0.25 + (totalItems - 1) * STEP_INTERVAL + 0.25

  const buildCursorTrack = (cursorIdx) => {
    const keyframes = [{ t: 0, x: CURSORS[cursorIdx].idle.x, y: CURSORS[cursorIdx].idle.y, opacity: 0 }]

    for (let itemIdx = 0; itemIdx < totalItems; itemIdx++) {
      if (itemIdx % 3 !== cursorIdx) continue
      const target = targets[itemIdx] || { x: 240, y: 180 + itemIdx * 40 }
      const origin = ITEM_ORIGINS[itemIdx]

      const grabTime = 0.25 + itemIdx * STEP_INTERVAL
      const fetchStart = Math.max(0.05, grabTime - FETCH_DURATION)
      const dropTime = grabTime + DRAG_DURATION
      const fadeOutTime = Math.min(totalRelayTime, dropTime + 0.2)

      const prev = keyframes[keyframes.length - 1]
      if (fetchStart > prev.t) {
        keyframes.push({ t: fetchStart, x: prev.x, y: prev.y, opacity: 0 })
      }

      // 1. Appear at the element's starting offset
      keyframes.push({
        t: grabTime,
        x: target.x + origin.x,
        y: target.y + origin.y,
        opacity: 1,
      })

      // 2. Drag the element all the way to its final drop spot
      keyframes.push({
        t: dropTime,
        x: target.x,
        y: target.y,
        opacity: 1,
      })

      // 3. Release and fade out once the element is placed
      keyframes.push({
        t: fadeOutTime,
        x: target.x + 18,
        y: target.y - 10,
        opacity: 0,
      })
    }

    const last = keyframes[keyframes.length - 1]
    if (last.t < totalRelayTime) {
      keyframes.push({ t: totalRelayTime, x: last.x, y: last.y, opacity: 0 })
    }

    return {
      x: keyframes.map((k) => k.x),
      y: keyframes.map((k) => k.y),
      opacity: keyframes.map((k) => k.opacity),
      times: keyframes.map((k) => k.t / totalRelayTime),
    }
  }

  return (
    <MotionConfig reducedMotion="never">
      <div ref={wrapperRef} className="about-page-wrapper">
        <style>{`
          .about-page-wrapper {
            position: relative;
          }

          .about-stage {
            position: relative;
            margin-bottom: 2rem;
          }

          .about-card {
            position: relative;
            background: var(--surface);
            border: 1px solid var(--line);
            border-radius: 16px;
            padding: 1.75rem;
            transition: box-shadow 0.3s ease, border-color 0.3s ease;
          }
          .about-card:hover {
            border-color: rgba(16, 185, 129, 0.45);
            box-shadow: 0 14px 28px rgba(16, 185, 129, 0.08);
          }

          .about-hero-card {
            border-style: dashed;
            border-color: rgba(16, 185, 129, 0.5);
          }
          .about-badge {
            display: inline-block;
            padding: 0.25rem 0.7rem;
            border-radius: 999px;
            font-size: 0.75rem;
            font-weight: 700;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            background: rgba(16, 185, 129, 0.14);
            color: #10b981;
            margin-bottom: 0.75rem;
          }
          .about-hero-title {
            margin: 0 0 0.5rem;
            font-size: 1.65rem;
            font-weight: 800;
          }
          .about-hero-title span {
            color: #10b981;
          }
          .about-copy {
            margin: 0;
            color: var(--ink-2, var(--ink-3));
            line-height: 1.6;
            max-width: 72ch;
          }

          .about-section-label {
            margin: 0 0 1.25rem;
            font-size: 0.82rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--ink-3);
            text-align: center;
          }

          .about-stack-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
            gap: 1rem;
          }
          .about-stack-item {
            background: var(--surface);
            border: 1px solid var(--line);
            border-radius: 12px;
            padding: 1rem;
            text-align: center;
            transition: transform 0.25s ease, border-color 0.25s ease;
          }
          .about-stack-item:hover {
            transform: translateY(-3px);
            border-color: #10b981;
          }
          .about-stack-name {
            font-weight: 700;
            font-size: 0.98rem;
            color: #10b981;
          }
          .about-stack-role {
            margin-top: 0.25rem;
            font-size: 0.8rem;
            color: var(--ink-3);
          }

          .about-team-block {
            position: relative;
            margin-top: 2.25rem;
          }
          .about-team-header {
            text-align: center;
            margin-bottom: 1.5rem;
          }
          .about-team-header h2 {
            margin: 0 0 0.35rem;
            font-size: 1.35rem;
            font-weight: 800;
          }
          .about-team-header p {
            margin: 0;
            font-size: 0.9rem;
            color: var(--ink-3);
          }

          .about-team-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 1.5rem;
            max-width: 980px;
            margin: 0 auto;
          }
          .about-member-card {
            background: var(--surface);
            border: 1px solid var(--line);
            border-radius: 16px;
            padding: 1.5rem;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            transition: border-color 0.25s ease, box-shadow 0.25s ease;
          }
          .about-member-card:hover {
            border-color: #10b981;
            box-shadow: 0 14px 28px rgba(16, 185, 129, 0.12);
          }

          .about-photo-slot {
            width: 96px;
            height: 96px;
            border-radius: 50%;
            border: 2px dashed #10b981;
            background: rgba(16, 185, 129, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            margin-bottom: 1rem;
            flex-shrink: 0;
          }
          .about-photo-slot img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
          .about-photo-placeholder {
            font-size: 0.72rem;
            font-weight: 600;
            color: #10b981;
            padding: 0 0.5rem;
          }

          .about-member-name {
            margin: 0;
            font-size: 1.05rem;
            font-weight: 700;
          }
          .about-member-role {
            margin-top: 0.2rem;
            font-size: 0.8rem;
            font-weight: 600;
            color: #10b981;
          }
          .about-member-desc {
            margin: 0.75rem 0 0;
            font-size: 0.88rem;
            color: var(--ink-3);
            line-height: 1.5;
          }

          .about-cursor {
            position: absolute;
            top: 0;
            left: 0;
            z-index: 40;
            pointer-events: none;
            display: flex;
            align-items: flex-start;
            gap: 2px;
            will-change: transform, opacity;
          }
          .about-cursor-pointer {
            filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.28));
            flex-shrink: 0;
          }
          .about-cursor-pill {
            margin-top: 12px;
            padding: 2px 9px;
            border-radius: 999px;
            color: #ffffff;
            font-size: 0.7rem;
            font-weight: 700;
            letter-spacing: 0.02em;
            white-space: nowrap;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          }

          .about-cta-wrap {
            margin-top: 2.5rem;
            display: flex;
            justify-content: center;
          }
          .about-contact-btn {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.8rem 1.75rem;
            border-radius: 999px;
            border: none;
            background: #10b981;
            color: #022c22;
            font-family: inherit;
            font-size: 0.95rem;
            font-weight: 700;
            text-decoration: none;
            cursor: pointer;
            box-shadow: 0 10px 24px rgba(16, 185, 129, 0.25);
            transition: transform 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
          }
          .about-contact-btn:hover {
            background: #34d399;
            transform: translateY(-2px);
            box-shadow: 0 14px 28px rgba(16, 185, 129, 0.35);
          }
        `}</style>

        {/* The 3 Relay Cursors: appear to drag each item, then disappear once placed */}
        {targets.length > 0 &&
          CURSORS.map((cursor, idx) => {
            const track = buildCursorTrack(idx)
            return (
              <motion.div
                key={cursor.name}
                initial={{ opacity: 0, x: track.x[0], y: track.y[0] }}
                animate={{
                  opacity: track.opacity,
                  x: track.x,
                  y: track.y,
                }}
                transition={{
                  duration: totalRelayTime,
                  times: track.times,
                  ease: 'easeInOut',
                }}
                className="about-cursor"
                aria-hidden="true"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill={cursor.color}
                  stroke="#ffffff"
                  strokeWidth="2"
                  className="about-cursor-pointer"
                >
                  <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.35Z" />
                </svg>
                <span className="about-cursor-pill" style={{ backgroundColor: cursor.color }}>
                  {cursor.name}
                </span>
              </motion.div>
            )
          })}

        <PageHead title={aboutTitle} sub={aboutSub} />

        {/* Item 0: Hero Card (dragged by Builder 1) */}
        <div className="about-stage">
          <motion.div
            ref={(el) => {
              itemRefs.current[0] = el
            }}
            initial={{ opacity: 0, x: ITEM_ORIGINS[0].x, y: ITEM_ORIGINS[0].y }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{
              duration: DRAG_DURATION,
              delay: 0.25,
              ease: 'easeInOut',
            }}
            className="about-card about-hero-card"
          >
            <span className="about-badge">Team Trinity Build</span>
            <h2 className="about-hero-title">
              About <span>Mercado</span>
            </h2>
            <p className="about-copy">
              Mercado helps everyday consumers keep track of local market prices, spot upcoming price shifts, and compare market options clearly without unnecessary clutter.
            </p>
          </motion.div>
        </div>

        {/* Items 1..5: Tech Stack Cards (dragged one by one by Builder 2, 3, 1, 2, 3) */}
        <div className="about-stage">
          <motion.section
            aria-label="Technology Stack"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, delay: 0.25 + STEP_INTERVAL - 0.15 }}
            className="about-card"
          >
            <h2 className="about-section-label">Tech Stack Used</h2>
            <div className="about-stack-grid">
              {TECH_STACK.map((item, idx) => {
                const slotIdx = idx + 1
                const origin = ITEM_ORIGINS[slotIdx]
                const grabDelay = 0.25 + slotIdx * STEP_INTERVAL

                return (
                  <motion.div
                    key={item.name}
                    ref={(el) => {
                      itemRefs.current[slotIdx] = el
                    }}
                    initial={{ opacity: 0, x: origin.x, y: origin.y }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    transition={{
                      duration: DRAG_DURATION,
                      delay: grabDelay,
                      ease: 'easeInOut',
                    }}
                    className="about-stack-item"
                  >
                    <div className="about-stack-name">{item.name}</div>
                    <div className="about-stack-role">{item.role}</div>
                  </motion.div>
                )
              })}
            </div>
          </motion.section>
        </div>

        {/* Development Team Div: No cursor dragging; fades upward cleanly */}
        <motion.div
          initial={{ opacity: 0, y: 65 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.95,
            delay: teamDelay,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="about-team-block"
        >
          <div className="about-team-header">
            <h2>Trinity Build Team</h2>
            <p>The development team behind Mercado</p>
          </div>

          <div className="about-team-grid">
            {TEAM_MEMBERS.map((member, idx) => (
              <div key={member.name} className="about-member-card">
                <motion.div
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.9,
                    delay: teamDelay + 0.12 + idx * 0.14,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="about-photo-slot"
                >
                  {member.image ? (
                    <img src={member.image} alt={member.name} />
                  ) : (
                    <span className="about-photo-placeholder">Photo Slot</span>
                  )}
                </motion.div>

                <h3 className="about-member-name">{member.name}</h3>
                <div className="about-member-role">{member.role}</div>
                <p className="about-member-desc">{member.description}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Item 6: Contact Us CTA (dragged into place by Builder 1) */}
        <div className="about-cta-wrap">
          <motion.a
            ref={(el) => {
              itemRefs.current[6] = el
            }}
            initial={{ opacity: 0, x: ITEM_ORIGINS[6].x, y: ITEM_ORIGINS[6].y }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{
              duration: DRAG_DURATION,
              delay: 0.25 + 6 * STEP_INTERVAL,
              ease: 'easeInOut',
            }}
            href="mailto:trinitybuild@example.com"
            onClick={(e) => {
              if (onContactClick) {
                e.preventDefault()
                onContactClick()
              }
            }}
            className="about-contact-btn"
          >
            Contact Us
          </motion.a>
        </div>
      </div>
    </MotionConfig>
  )
}
