"use client"

import { motion } from "framer-motion"
import type { ReactNode } from "react"

type RevealProps = {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
  as?: "div" | "section" | "li" | "span"
}

/**
 * Scroll-triggered fade + slide-in wrapper using Framer Motion.
 * Animates once when the element enters the viewport.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
}: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}
