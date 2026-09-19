import { MotionConfig } from "motion/react";

/**
 * Configuración global de Motion para KRONOS.
 *
 * - reducedMotion="user": respeta prefers-reduced-motion — cuando el
 *   usuario lo pide, las transformaciones se omiten (solo queda el
 *   desvanecimiento de opacidad). El CSS legado ya tiene sus propias
 *   media queries; esto cubre todo lo animado con Motion.
 * - Transición por defecto corta y con curva suave: las animaciones
 *   KRONOS son discretas (0.2s), nunca teatrales.
 */
export default function MotionProvider({ children }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.2, ease: [0.21, 0.6, 0.35, 1] }}
    >
      {children}
    </MotionConfig>
  );
}
