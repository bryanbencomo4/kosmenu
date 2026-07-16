'use client';

import { useMemo, useState } from 'react';
import { DEMO_FLOW_STEPS, type DemoStep } from './demo-data';

const INITIAL_CART: Record<string, number> = { 'bbq-bacon': 1, 'pasta-alfredo': 1 };
const FULL_FLOW_ORDER: DemoStep[] = ['menu', 'cart', 'payment', 'tracking'];
const FULL_FLOW_INTERVAL_MS = 1600;

export function useDemoFlow() {
  const [step, setStep] = useState<DemoStep>('menu');
  const [cart, setCart] = useState<Record<string, number>>(INITIAL_CART);
  const [activeCategory, setActiveCategory] = useState('recomendados');

  const stepMeta = useMemo(
    () => DEMO_FLOW_STEPS.find((item) => item.id === step) ?? DEMO_FLOW_STEPS[0],
    [step],
  );

  function ensureCartSeed() {
    setCart((current) => (Object.keys(current).length > 0 ? current : { ...INITIAL_CART }));
  }

  function addToCart(productId: string) {
    setCart((current) => ({
      ...current,
      [productId]: (current[productId] ?? 0) + 1,
    }));
    setStep('cart');
  }

  function removeFromCart(productId: string) {
    setCart((current) => {
      const nextQty = (current[productId] ?? 0) - 1;
      if (nextQty <= 0) {
        const next = { ...current };
        delete next[productId];
        return next;
      }
      return { ...current, [productId]: nextQty };
    });
  }

  function selectStep(next: DemoStep) {
    if (next === 'cart' || next === 'payment') ensureCartSeed();
    setStep(next);
  }

  function playFullFlow() {
    let index = 0;
    ensureCartSeed();
    setStep(FULL_FLOW_ORDER[0]);
    const timer = window.setInterval(() => {
      index += 1;
      if (index >= FULL_FLOW_ORDER.length) {
        window.clearInterval(timer);
        return;
      }
      setStep(FULL_FLOW_ORDER[index]);
    }, FULL_FLOW_INTERVAL_MS);
  }

  return {
    step,
    cart,
    activeCategory,
    stepMeta,
    setActiveCategory,
    addToCart,
    removeFromCart,
    selectStep,
    playFullFlow,
  };
}
