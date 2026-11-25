function LogoutConfirmDialog({ onCancel, onConfirm, open }) {
  if (!open) return null

  return (
    <div className="logout-confirm-backdrop">
      <section
        aria-labelledby="logout-confirm-title"
        aria-modal="true"
        className="logout-confirm-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
        role="alertdialog"
      >
        <h2 id="logout-confirm-title">로그아웃</h2>
        <p>로그아웃하시겠습니까?</p>
        <div className="logout-confirm-actions">
          <button autoFocus className="logout-cancel-button" onClick={onCancel} type="button">
            취소
          </button>
          <button className="primary-button" onClick={onConfirm} type="button">
            로그아웃
          </button>
        </div>
      </section>
    </div>
  )
}

export default LogoutConfirmDialog
