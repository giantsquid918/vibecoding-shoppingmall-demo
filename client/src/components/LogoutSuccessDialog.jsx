function LogoutSuccessDialog({ onClose, open }) {
  if (!open) return null

  return (
    <div className="logout-confirm-backdrop">
      <section
        aria-labelledby="logout-success-title"
        aria-modal="true"
        className="logout-confirm-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
        role="dialog"
      >
        <h2 id="logout-success-title">로그아웃 완료</h2>
        <p>로그아웃되었습니다.</p>
        <div className="logout-confirm-actions">
          <button autoFocus className="primary-button" onClick={onClose} type="button">
            확인
          </button>
        </div>
      </section>
    </div>
  )
}

export default LogoutSuccessDialog
