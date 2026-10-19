export const API = 'http://127.0.0.1:8000/api'

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = { Accept: 'application/json' }
  const t = localStorage.getItem('token')
  if (t) headers.Authorization = 'Bearer ' + t
  if (body) headers['Content-Type'] = 'application/json'
  const r = await fetch(API + path, {
    method,
    headers,
    body: form ? form : body ? JSON.stringify(body) : undefined,
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.message || 'حدث خطأ، حاول مرة أخرى')
  return d
}
