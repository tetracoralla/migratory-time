interface ActionFeedbackProps {
  className?: string
  kind: 'success' | 'error'
  message: string
}

export function ActionFeedback({
  className = '',
  kind,
  message,
}: ActionFeedbackProps) {
  return (
    <span
      className={`action-feedback${kind === 'error' ? ' is-error' : ''}${className ? ` ${className}` : ''}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <svg
        className="action-feedback-icon"
        aria-hidden="true"
        viewBox="0 0 20 20"
      >
        {kind === 'error' ? (
          <>
            <path d="M6.5 6.5l7 7" />
            <path d="M13.5 6.5l-7 7" />
          </>
        ) : (
          <path d="m5.5 10.3 2.8 2.8 6.2-6.2" />
        )}
      </svg>
      {message}
    </span>
  )
}
