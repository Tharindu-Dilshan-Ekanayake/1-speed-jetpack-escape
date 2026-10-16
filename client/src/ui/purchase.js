import { PRODUCT_BY_SKU } from '../../../shared/config.js'
import { formatNumber } from '../../../shared/format.js'
import { send } from '../net/connection.js'
import { getGame, useGame } from '../state/gameStore.js'

/**
 * Shop purchase: everything costs Wins. The server checks the price, takes
 * the Wins and answers with a `purchase` message (ok or not).
 */
export function buyProduct(sku) {
  const game = getGame()
  const product = PRODUCT_BY_SKU[sku]
  if (!product || !game.profile) return
  if (game.purchasePending) return
  if (!game.welcome?.devPurchases && game.profile.trophies < product.price) {
    game.toast(`Need ${formatNumber(product.price - game.profile.trophies)} more Wins for ${product.name}. Escape stages to earn Wins!`, 'error')
    return
  }
  useGame.setState({ purchasePending: sku })
  send('buyProduct', { sku })
  // Never leave the button stuck if the answer is lost.
  setTimeout(() => {
    if (getGame().purchasePending === sku) useGame.setState({ purchasePending: null })
  }, 8000)
}
