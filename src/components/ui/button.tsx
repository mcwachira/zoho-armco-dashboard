import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const buttonVariants = cva('button', {
  variants: {
    variant: {
      primary: 'primary',
      secondary: 'secondary',
      ghost: 'button-ghost',
    },
    size: {
      default: '',
      compact: 'button-compact',
      icon: 'icon-button',
    },
  },
  defaultVariants: { variant: 'secondary', size: 'default' },
})

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
)

Button.displayName = 'Button'
