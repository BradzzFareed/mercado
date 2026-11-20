import { useEffect } from 'react'
import { Logo } from './Icons'

// Full-screen overlay: the logo and message fade up slowly, one after the other.
export default function ThankYou({ onClose, closeLabel = 'Back to cart' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="thanks" role="dialog" aria-modal="true" aria-label="Thank you for using Mercado">
      <div className="thanks-inner">
        <div className="thanks-logo fade-up"><Logo size={96} /></div>
        <h2 className="fade-up d1">Thank you for using Mercado</h2>
        <p className="fade-up d2">Happy cooking and happy shopping.</p>
        <button className="cart-btn fade-up d3" onClick={onClose} autoFocus>{closeLabel}</button>
      </div>
    </div>
  )
}
