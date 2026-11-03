# Messages and encounters

**Status: built.** Direct messages about cards, encounters at game shop
stops, and two more surprise opportunities. The code is in
`Model/Messages.swift`, `Model/ShopEncounters.swift`, and
`Model/Opportunities.swift`.

## Notoriety

Notoriety is the reputation tier plus the follower tier. It goes from 0
to 8. The follower tier counts only when the player has a social media
account. The Messages screen shows it.

## Messages

People send the player messages about cards. At End Day, the game adds
new messages. The number of messages each day is 0.08 plus 0.12 for each
point of notoriety. At notoriety 0, a message comes about once in two
weeks. At notoriety 8, about one comes each day.

Notoriety also makes the cards bigger and the prices better. The top
market value of a card in a message is $60 plus $80 for each point of
notoriety. A buyer pays 2% more for each point.

| Kind | What they say | What the player can do |
| --- | --- | --- |
| Wants your card | They want a card that the player owns, for 100% to 125% of market. They ask more often about a card the player posted. | Sell, ask for 15% more one time, or say no. It ends in 2 to 4 days. |
| Looking for | They hunt for a card from a set, for 110% to 130% of market. | Find a raw copy and sell it before the message ends, in 5 to 10 days. |
| Offers a card | They sell a raw card or a slab for 65% to 90% of market. | Buy it, or say no. It arrives in 3 days. It ends in 1 to 3 days. |

- **A sale by message** ships the card. The player pays the shipping and
  no fee. A clean sale of $20 or more gives +1 reputation, like an online
  sale.
- **A counter** works when the price is within the buyer's hidden limit.
  If not, the buyer holds at their offer. The player can counter one
  time.
- **A card bought by message** comes from a stranger. The player cannot
  check it first, so it carries the stranger risk of a fake (see
  [14-counterfeit-risk.md](14-counterfeit-risk.md)).
- **The hub** shows a banner for unread messages, and a Messages row
  under Plans for today.

## Encounters at a game shop

At each game shop stop on a store run, someone can come up to the
player. The chance is 30%, plus 4% for each point of notoriety, up to
60%.

| Encounter | What happens |
| --- | --- |
| A kid with a hit | A kid asks what their card is worth. **Tell them the value**: +2 reputation and +3 standing at the shop. **Offer fair** (85% of market): the player buys it, +3 reputation and +2 standing. **Say it's not worth much** (30% of market): a scam that the kid can find out about later, like a naive seller at a show. |
| A buyer | A player at the shop wants one of the player's cards, for 95% to 115% of market, in cash. With follower tier 1, they say that they follow the player. |
| A seller | A regular sells a card from their binder for 60% to 85% of market. It can be a fake. |
| The owner's hold | At standing Regular, the owner holds a sealed product for the player at 85% of market. +2 standing. |
| A tip | Another player tells the player about a garage sale tomorrow. It goes on the calendar. |

## More surprise opportunities

These two join the opportunities in
[17-calendar-and-events.md](17-calendar-and-events.md).

- **A bulk buyer.** A teacher with a card club buys all the player's
  bulk for 3 to 5 cents a card, in cash. A shop pays less, and only in
  credit. It needs 100 bulk cards or more. +2 reputation. 1 hour.
- **A sealed buyer.** A collector wants one of the player's sealed
  products worth $30 or more, for 115% to 130% of market, in cash. +2
  reputation. 1 hour.
