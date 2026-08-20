import { cn } from '@/lib/utils';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline';

export function Badge({ className, variant = 'default', children, ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  const variants: Record<BadgeVariant, string> = {
    default: 'bg-[var(--primary)] text-[var(--primary-foreground)]',
    success: 'bg-[var(--success)] text-white',
    warning: 'bg-[var(--warning)] text-white',
    error: 'bg-[var(--destructive)] text-white',
    info: 'bg-blue-500 text-white',
    outline: 'border border-[var(--border)] text-[var(--foreground)]',
  };
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', variants[variant], className)} {...props}>{children}</span>;
}

export function statusToVariant(status: string): BadgeVariant {
  const successStatuses = ['approved', 'signed', 'active', 'resolved', 'closed', 'completed', 'converted_to_matter', 'clean', 'no_match', 'cleared_by_lawyer'];
  const warningStatuses = ['pending', 'submitted', 'triaged', 'under_review', 'pending_approval', 'pending_signature', 'changes_requested', 'waiting_for_information', 'on_hold', 'possible_match', 'requires_review', 'draft_new_version'];
  const errorStatuses = ['rejected', 'cancelled', 'blocked', 'terminated', 'infected', 'error', 'expired', 'failed'];
  const infoStatuses = ['draft', 'open', 'in_progress', 'archived', 'filed', 'exported', 'not_checked'];
  if (successStatuses.includes(status)) return 'success';
  if (warningStatuses.includes(status)) return 'warning';
  if (errorStatuses.includes(status)) return 'error';
  if (infoStatuses.includes(status)) return 'info';
  return 'default';
}
