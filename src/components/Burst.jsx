// Confetti burst — a quick shower of colored bits raining down. Used on big pulls
// (pack opener + livestream). Shared so both stay in sync.
export default function Burst() {
  const bits = Array.from({ length: 40 })
  return (
    <div className="hitburst">
      {bits.map((_, i) => {
        const left = Math.random() * 100, dur = 1 + Math.random(), delay = Math.random() * 0.2
        const colors = ['#ffcb05', '#ff3df0', '#3b6cff', '#36d399', '#fff']
        return <span key={i} style={{
          position: 'absolute', top: '-10px', left: left + '%', width: 9, height: 9,
          background: colors[i % colors.length], borderRadius: 2,
          animation: `fall ${dur}s ${delay}s ease-in forwards`,
        }} />
      })}
      <style>{`@keyframes fall{to{transform:translateY(105vh) rotate(540deg);opacity:0}}`}</style>
    </div>
  )
}
