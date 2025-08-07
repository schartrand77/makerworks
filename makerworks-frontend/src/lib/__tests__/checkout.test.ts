import { describe, it, expect, vi } from 'vitest'
import { handleCartCheckout } from '../checkout'

describe('handleCartCheckout', () => {
  it('navigates to /checkout', () => {
    const navigate = vi.fn()
    handleCartCheckout(navigate)
    expect(navigate).toHaveBeenCalledWith('/checkout')
  })
})
