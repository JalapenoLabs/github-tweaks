// Copyright © 2026 Jalapeno Labs

import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger'
  isLoading?: boolean
  children: ReactNode
}

const classNameByVariant = {
  primary: 'bg-emerald-600 text-white hover:bg-emerald-700',
  secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
  danger: 'bg-red-600 text-white hover:bg-red-700'
} as const satisfies Record<NonNullable<ButtonProps['variant']>, string>

export function Button({ variant = 'primary', isLoading, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      // A loading button that stays clickable submits twice, which is the bug this prevents.
      disabled={rest.disabled || isLoading}
      className={`rounded-md px-4 py-2 disabled:opacity-60 ${classNameByVariant[variant]}`}
    >
      {isLoading ? 'Working…' : children}
    </button>
  )
}
