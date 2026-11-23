import { useEffect, useState, type CSSProperties } from 'react'
import { labelStyle, primaryBtnStyle, ghostBtnStyle } from '../lib/styles'
import {
  createCategory,
  createTag,
  deleteCategory,
  deleteTag,
  fetchTagRegistry,
  renameCategory,
  updateTag,
  type RegistryTag,
  type TagRegistry,
} from './lib/api'

const inputStyle: CSSProperties = {
  padding: '6px 8px',
  border: '1px solid #e5e7eb',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  borderRadius: 0,
  flex: 1,
  minWidth: 0,
}

const selectStyle: CSSProperties = { ...inputStyle, flex: 'none', fontSize: 12, padding: '4px 6px', background: '#fff' }
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }
const metaStyle: CSSProperties = { fontSize: 11, color: '#9ca3af' }
const sectionStyle: CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }

const plural = (n: number) => `${n} recipe${n === 1 ? '' : 's'}`

// Registry editor: tags grouped by category, plus free-form tags in use that can be adopted.
// Every write answers with the fresh registry; `onChanged` lets the Recipe Box reload recipes
// (renames/deletes rewrite recipe tags server-side).
export default function TagEditor({ onChanged }: { onChanged: () => void }) {
  const [registry, setRegistry] = useState<TagRegistry | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({}) // "add tag" inputs, keyed by section

  useEffect(() => {
    fetchTagRegistry().then(setRegistry).catch((e) => setError((e as Error).message))
  }, [])

  const run = async (write: Promise<TagRegistry>) => {
    setError(null)
    try {
      setRegistry(await write)
      setEditing(null)
      onChanged()
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  const submitAdd = async (key: string, add: (name: string) => Promise<TagRegistry>) => {
    if (await run(add(drafts[key]))) setDrafts((prev) => ({ ...prev, [key]: '' }))
  }

  if (!registry) return error ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div> : null

  const categories = registry.categories

  const renameField = (key: string, save: (name: string) => Promise<TagRegistry>) =>
    editing?.key === key && (
      <>
        <input
          style={inputStyle}
          autoFocus
          value={editing.value}
          onChange={(e) => setEditing({ key, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') run(save(editing.value))
            if (e.key === 'Escape') setEditing(null)
          }}
        />
        <button style={ghostBtnStyle} onClick={() => run(save(editing.value))}>Save</button>
        <button style={ghostBtnStyle} onClick={() => setEditing(null)}>Cancel</button>
      </>
    )

  const tagRow = (tag: RegistryTag) => (
    <div key={tag.id} style={rowStyle}>
      {renameField(`tag:${tag.id}`, (name) => updateTag(tag.id, { name })) || (
        <>
          <span style={{ flex: 1, fontSize: 14, overflowWrap: 'anywhere' }}>
            {tag.name}
            <span style={metaStyle}> · {plural(tag.recipe_count)}</span>
          </span>
          {tag.protected ? (
            <span style={metaStyle}>built-in</span>
          ) : (
            <>
              <select
                style={selectStyle}
                value={tag.category_id ?? ''}
                onChange={(e) => run(updateTag(tag.id, { category_id: e.target.value ? Number(e.target.value) : null }))}
              >
                <option value="">uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button style={ghostBtnStyle} onClick={() => setEditing({ key: `tag:${tag.id}`, value: tag.name })}>
                Rename
              </button>
              <button
                style={ghostBtnStyle}
                onClick={() => {
                  const note = tag.recipe_count ? ` It will be removed from ${plural(tag.recipe_count)}.` : ''
                  if (window.confirm(`Delete “${tag.name}”?${note}`)) run(deleteTag(tag.id))
                }}
              >
                Delete
              </button>
            </>
          )}
        </>
      )}
    </div>
  )

  const addRow = (key: string, add: (name: string) => Promise<TagRegistry>, placeholder = 'new tag') => (
    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      <input
        style={inputStyle}
        placeholder={placeholder}
        value={drafts[key] ?? ''}
        onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && drafts[key]?.trim()) submitAdd(key, add)
        }}
      />
      <button style={{ ...primaryBtnStyle, padding: '0 16px' }} disabled={!drafts[key]?.trim()} onClick={() => submitAdd(key, add)}>
        Add
      </button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      {categories.map((c) => (
        <div key={c.id} style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 28 }}>
            {renameField(`category:${c.id}`, (name) => renameCategory(c.id, name)) || (
              <>
                <span style={{ ...labelStyle, flex: 1 }}>{c.name}</span>
                {c.protected ? (
                  <span style={metaStyle}>built-in</span>
                ) : (
                  <>
                    <button style={ghostBtnStyle} onClick={() => setEditing({ key: `category:${c.id}`, value: c.name })}>
                      Rename
                    </button>
                    <button
                      style={ghostBtnStyle}
                      onClick={() => {
                        if (window.confirm(`Delete category “${c.name}”? Its tags stay, uncategorized.`)) run(deleteCategory(c.id))
                      }}
                    >
                      Delete
                    </button>
                  </>
                )}
              </>
            )}
          </div>
          {c.tags.map(tagRow)}
          {addRow(`category:${c.id}`, (name) => createTag(name, c.id))}
        </div>
      ))}

      <div style={sectionStyle}>
        <span style={labelStyle}>Uncategorized</span>
        {registry.uncategorized.map(tagRow)}
        {addRow('uncategorized', (name) => createTag(name))}
      </div>

      {registry.free_form.length > 0 && (
        <div style={sectionStyle}>
          <span style={labelStyle}>In use, not in the registry</span>
          {registry.free_form.map((t) => (
            <div key={t.name} style={rowStyle}>
              <span style={{ flex: 1, fontSize: 14, overflowWrap: 'anywhere' }}>
                {t.name}
                <span style={metaStyle}> · {plural(t.recipe_count)}</span>
              </span>
              <select
                style={selectStyle}
                value="-"
                onChange={(e) => run(createTag(t.name, e.target.value ? Number(e.target.value) : null))}
              >
                <option value="-" disabled>add to…</option>
                <option value="">uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      <div style={sectionStyle}>
        <span style={labelStyle}>New category</span>
        {addRow('new-category', createCategory, 'category name')}
      </div>
    </div>
  )
}
