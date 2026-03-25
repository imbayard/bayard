import type React from 'react'

export const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  display: 'block',
}

export const primaryBtnStyle: React.CSSProperties = {
  padding: '0 24px',
  border: 'none',
  background: '#111827',
  color: '#fff',
  fontSize: 10,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  cursor: 'pointer',
  flexShrink: 0,
  borderRadius: 0,
}

export const ghostBtnStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  color: '#9ca3af',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
}

export const textStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
}

export const markdownStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6,
}

export const cursorStyle: React.CSSProperties = {
  display: 'inline-block',
}

export const inputRowStyle: React.CSSProperties = {
  display: 'flex',
  borderTop: '2px solid #111827',
  flexShrink: 0,
}

export const textareaStyle: React.CSSProperties = {
  flex: 1,
  resize: 'none',
  padding: '12px 16px',
  border: 'none',
  borderRight: '1px solid #e5e7eb',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  borderRadius: 0,
}
