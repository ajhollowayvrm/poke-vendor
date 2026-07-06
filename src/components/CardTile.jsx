import { cardValue, isHit, fmtMoney, CONDITIONS, cardImg, setNameOfCard } from '../game/engine'
import HoloCard from './HoloCard'

const RARITY_COLOR = {
  'Common': '#9aa3bf', 'Uncommon': '#5ec98a', 'Rare': '#5aa0ff', 'Rare Holo': '#7c5cff',
  'Double Rare': '#ff9f43', 'ACE SPEC Rare': '#ff5470', 'Illustration Rare': '#ff79c6',
  'Ultra Rare': '#ff6b6b', 'Special Illustration Rare': '#ffd84d', 'Hyper Rare': '#ffcb05',
  'MEGA_ATTACK_RARE': '#ff7ae0', 'Mega Hyper Rare': '#ff3df0', 'Black White Rare': '#c0c8d6',
}

export function rarityColor(r) { return RARITY_COLOR[r] || '#9aa3bf' }

// Short PSA grade descriptor for the slab label (official compact abbreviations).
export function gradeLabel(g) {
  return g >= 10 ? 'GEM-MT' : g >= 9 ? 'MINT' : g >= 8 ? 'NM-MT' : g >= 7 ? 'NM'
    : g >= 6 ? 'EX-MT' : g >= 5 ? 'EX' : g >= 4 ? 'VG-EX' : g >= 3 ? 'VG' : g >= 2 ? 'GOOD' : 'PR'
}

export default function CardTile({ card, onClick, interactive = true, noBorder = false }) {
  const hit = isHit(card) || card._isHit
  const foil = card.foil
  const setName = setNameOfCard(card)

  // Graded cards render as a PSA-style SLAB: a glossy plastic case with a label
  // header (grade + descriptor) above the encased art. The grade tier tints the gloss.
  if (card.grade) {
    const g = card.grade.overall
    const gemmint = g >= 10
    return (
      <HoloCard card={card} interactive={interactive} className={hit ? 'tile-hit' : ''}>
        <div className={`cardtile slab grade-${g} ${gemmint ? 'slab-gem' : ''}`} onClick={onClick}>
          {card.locked && <span className="lockchip" title="Locked — protected from bulk sells">🔒</span>}
          <div className="slab-shine" aria-hidden="true" />
          <div className="slab-label">
            <div className="slab-brand">PSA</div>
            <div className="slab-grade">
              <b>{g}</b>
              <span>{gradeLabel(g)}</span>
            </div>
            <div className="slab-cert">{card.name}{setName ? ` · ${setName}` : ''}</div>
          </div>
          <div className="slab-window">
            <img src={cardImg(card)} alt={card.name} loading="lazy" decoding="async" />
          </div>
          <span className="price">{fmtMoney(cardValue(card))}</span>
        </div>
      </HoloCard>
    )
  }

  // The card border is tinted by rarity (foil/grail take precedence). `noBorder`
  // drops it entirely (used in the collection grid, where the user wants clean art).
  const edge = foil ? foil.color : card._grail ? '#7cf0ff' : rarityColor(card.rarity)
  return (
    <HoloCard card={card} interactive={interactive} className={hit ? 'tile-hit' : ''}>
      <div className={`cardtile ${noBorder ? 'no-edge' : 'rarity-edge'} ${hit ? 'r-hit' : ''} ${card._grail ? 'r-grail' : ''} ${foil ? 'foil-'+foil.key : ''}`}
        onClick={onClick} style={{ '--rarity': edge }}>
        <span className="tag" style={{ color: edge }}>
          {foil ? foil.badge : card._grail ? '👑 GRAIL' : `${card.reverse ? 'RH · ' : ''}${shortRarity(card.rarity)}`}
        </span>
        {card.locked && <span className="lockchip" title="Locked — protected from bulk sells">🔒</span>}
        {setName && <span className="settag" title={setName}>{setName}</span>}
        {!card.grade && card.condition && card.condition !== 'NM' && (
          <span className="condchip" style={{ color: CONDITIONS[card.condition].color }}>{card.condition}</span>
        )}
        <img src={cardImg(card)} alt={card.name} loading="lazy" decoding="async" />
        <span className="price">{fmtMoney(cardValue(card))}</span>
      </div>
    </HoloCard>
  )
}

function shortRarity(r) {
  return ({ 'Common':'C','Uncommon':'U','Rare':'R','Rare Holo':'HOLO','Double Rare':'ex',
    'ACE SPEC Rare':'ACE','Illustration Rare':'IR','Ultra Rare':'UR','Special Illustration Rare':'SIR',
    'Hyper Rare':'HR','MEGA_ATTACK_RARE':'M-ATK','Mega Hyper Rare':'MEGA','Black White Rare':'BW' }[r]) || r
}
