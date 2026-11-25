import { Link } from 'react-router-dom'

const fieldIcons = {
  user: 'M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  phone: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM10 18h4',
  email: 'M4 6h16v12H4z M4 7l8 6 8-6',
  address: 'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  lock: 'M5 10h14v11H5z M8 10V7a4 4 0 1 1 8 0v3',
}

function FieldIcon({ name }) {
  return (
    <svg className="field-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={fieldIcons[name]} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TextField({ id, label, name, value, onChange, placeholder, icon, autoComplete, type = 'text', optional = false, error }) {
  return (
    <div className="form-field">
      <label htmlFor={id}>
        {label} {optional
          ? <span className="optional-mark">(선택)</span>
          : <span className="required-mark">*</span>}
      </label>
      <div className="input-wrap">
        {icon && <FieldIcon name={icon} />}
        <input
          autoComplete={autoComplete}
          id={id}
          name={name}
          onChange={onChange}
          placeholder={placeholder}
          required={!optional}
          type={type}
          value={value}
        />
      </div>
      {error && <span className="field-error" role="alert">{error}</span>}
    </div>
  )
}

function PasswordField({ id, label, name, value, onChange, placeholder, showPasswords, onToggle, hint, error }) {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label} <span className="required-mark">*</span></label>
      <div className="input-wrap">
        <FieldIcon name="lock" />
        <input
          autoComplete="new-password"
          id={id}
          name={name}
          onChange={onChange}
          placeholder={placeholder}
          required
          type={showPasswords ? 'text' : 'password'}
          value={value}
        />
        {name === 'password' && (
          <button
            aria-label={showPasswords ? '비밀번호 숨기기' : '비밀번호 표시'}
            className="password-toggle"
            onClick={onToggle}
            type="button"
          >
            {showPasswords ? '숨김' : '보기'}
          </button>
        )}
      </div>
      {hint && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </div>
  )
}

function AgreementSection({ agreements, allAgreed, onAllChange, onChange }) {
  return (
    <fieldset className="agreement-section">
      <legend className="visually-hidden">약관 동의</legend>
      <label className="agreement-row agreement-all">
        <input checked={allAgreed} onChange={onAllChange} type="checkbox" />
        <span>전체 동의</span>
      </label>
      <label className="agreement-row">
        <input checked={agreements.terms} name="terms" onChange={onChange} required type="checkbox" />
        <span>이용약관 동의 <em>(필수)</em></span>
      </label>
      <label className="agreement-row">
        <input checked={agreements.privacy} name="privacy" onChange={onChange} required type="checkbox" />
        <span>개인정보 처리방침 동의 <em>(필수)</em></span>
      </label>
      <label className="agreement-row">
        <input checked={agreements.marketing} name="marketing" onChange={onChange} type="checkbox" />
        <span>마케팅 정보 수신 동의 <em>(선택)</em></span>
      </label>
    </fieldset>
  )
}

function SignupForm({
  form,
  agreements,
  allAgreed,
  usernameError,
  passwordError,
  passwordConfirmError,
  phoneError,
  showPasswords,
  submitting,
  submitDisabled,
  message,
  onChange,
  onTogglePasswords,
  onAllAgreements,
  onAgreementChange,
  onSubmit,
}) {
  return (
    <form className="signup-form" noValidate onSubmit={onSubmit}>
      <div className="field-grid">
        <TextField
          autoComplete="name"
          icon="user"
          id="username"
          label="이름"
          name="username"
          onChange={onChange}
          placeholder="이름을 입력하세요"
          error={usernameError}
          value={form.username}
        />
        <TextField
          id="nickname"
          label="닉네임"
          name="nickname"
          onChange={onChange}
          optional
          placeholder="닉네임"
          value={form.nickname}
        />
      </div>
      <TextField
        autoComplete="tel"
        icon="phone"
        id="phone"
        label="휴대폰 번호"
        name="phone"
        onChange={onChange}
        placeholder="010-1234-5678"
        type="tel"
        error={phoneError}
        value={form.phone}
      />
      <TextField
        autoComplete="email"
        icon="email"
        id="email"
        label="이메일"
        name="email"
        onChange={onChange}
        placeholder="your@email.com"
        type="email"
        value={form.email}
      />
      <TextField
        autoComplete="street-address"
        icon="address"
        id="address"
        label="주소"
        name="address"
        onChange={onChange}
        placeholder="주소를 입력하세요"
        value={form.address}
      />
      <PasswordField
        hint="8자 이상, 영문, 숫자, 특수문자를 포함해 주세요."
        id="password"
        label="비밀번호"
        name="password"
        onChange={onChange}
        onToggle={onTogglePasswords}
        placeholder="비밀번호를 입력하세요"
        showPasswords={showPasswords}
        error={passwordError}
        value={form.password}
      />
      <PasswordField
        id="passwordConfirm"
        label="비밀번호 확인"
        name="passwordConfirm"
        onChange={onChange}
        placeholder="비밀번호를 다시 입력하세요"
        showPasswords={showPasswords}
        error={passwordConfirmError}
        value={form.passwordConfirm}
      />
      <AgreementSection
        agreements={agreements}
        allAgreed={allAgreed}
        onAllChange={onAllAgreements}
        onChange={onAgreementChange}
      />
      {message && <p className="form-message" role="alert">{message}</p>}
      <button className="primary-button submit-button" disabled={submitting || submitDisabled} type="submit">
        {submitting ? '가입 처리 중...' : '회원가입'}
      </button>
      <p className="login-prompt">
        이미 계정이 있으신가요? <Link to="/login">로그인</Link>
      </p>
    </form>
  )
}

export default SignupForm
