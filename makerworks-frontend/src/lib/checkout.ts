import type { NavigateFunction } from 'react-router-dom'

export function handleCartCheckout(navigate: NavigateFunction) {
  navigate('/checkout')
}
