import { clsx } from 'clsx';
import { HTMLAttributes, forwardRef } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={clsx(
          'rounded-lg border p-6',
          {
            'bg-white border-gray-200': variant === 'default',
            'bg-green-50 border-green-200': variant === 'success',
            'bg-yellow-50 border-yellow-200': variant === 'warning',
            'bg-red-50 border-red-200': variant === 'danger',
          },
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export default Card;
