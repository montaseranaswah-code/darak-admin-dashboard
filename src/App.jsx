import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import './App.css'

const money = (n) => Number(n).toFixed(2) + ' د.أ'
const STATUS = { pending: 'قيد المراجعة', processing: 'قيد التجهيز', shipped: 'تم الشحن', delivered: 'تم التسليم', cancelled: 'ملغي' }
const TYPE = { appliance: 'أجهزة كهربائية', bedroom: 'غرف نوم' }
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const waLink = (p) => {
  let n = String(p || '').replace(/\D/g, '')
  if (n.startsWith('00')) n = n.slice(2); else if (n.startsWith('0')) n = '962' + n.slice(1)
  return 'https://wa.me/' + n
}
const fmtDate = (d) => new Date(d).toLocaleString('ar-JO', { dateStyle: 'medium', timeStyle: 'short' })
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n)

// تحديث تلقائي: بينفّذ الدالة كل فترة، وكمان لما ترجع للتبويب
function useAutoRefresh(fn, ms = 15000) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const run = () => { if (!document.hidden) ref.current() }
    const t = setInterval(run, ms)
    document.addEventListener('visibilitychange', run)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', run) }
  }, [ms])
}

function Login({ onLogin }) {
  const [f, setF] = useState({ email: '', password: '' })
  const [err, setErr] = useState('')
  const submit = async (e) => {
    e.preventDefault(); setErr('')
    try {
      const d = await api('/login', { method: 'POST', body: f })
      if (d.user.role !== 'admin') throw new Error('هذا الحساب ليس حساب مدير')
      localStorage.setItem('token', d.token); onLogin(d.user)
    } catch (er) { setErr(er.message) }
  }
  return (
    <form className="box login" onSubmit={submit}>
      <h2 style={{ marginBottom: 14 }}>لوحة تحكم المدير</h2>
      {err && <div className="err">{err}</div>}
      <div className="fld"><input type="email" placeholder="البريد الإلكتروني" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      <div className="fld"><input type="password" placeholder="كلمة المرور" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
      <button className="btn" style={{ width: '100%' }}>دخول</button>
    </form>
  )
}

function Dashboard() {
  const [s, setS] = useState(null)
  const load = () => api('/admin/stats').then(setS)
  useEffect(() => { load() }, [])
  useAutoRefresh(load)
  if (!s) return <p>جاري التحميل...</p>
  const max = Math.max(1, ...s.sales_7d.map((d) => d.total))
  return (
    <>
      <h1>الرئيسية</h1>
      <div className="stats">
        <div className="stat"><span>إجمالي المبيعات</span><b>{money(s.revenue)}</b></div>
        <div className="stat"><span>طلبات اليوم</span><b>{s.today_orders}</b></div>
        <div className="stat"><span>قيد المراجعة</span><b>{s.pending}</b></div>
        <div className="stat"><span>كل الطلبات</span><b>{s.orders}</b></div>
        <div className="stat"><span>المنتجات</span><b>{s.products}</b></div>
        <div className="stat"><span>العملاء</span><b>{s.customers}</b></div>
        <div className="stat"><span>التقييمات</span><b>{s.reviews}</b></div>
      </div>
      <div className="cols">
        <div className="box">
          <h3 style={{ marginBottom: 14 }}>مبيعات آخر 7 أيام</h3>
          <div className="chart">
            {s.sales_7d.map((d) => (
              <div className="bar" key={d.date} title={`${d.count} طلب`}>
                <span className="val">{d.total ? d.total.toFixed(0) : ''}</span>
                <div className="fill" style={{ height: Math.max(3, (d.total / max) * 100) + '%' }} />
                <small>{new Date(d.date).toLocaleDateString('ar-JO', { weekday: 'short' })}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="box">
          <h3 style={{ marginBottom: 10 }}>منتجات قاربت على النفاد</h3>
          {s.low_stock.length === 0 ? <p>لا يوجد</p> : s.low_stock.map((p) => <p key={p.id} className="lowrow"><span>{p.name}</span><b>{p.stock}</b></p>)}
        </div>
      </div>
      <div className="box"><h3 style={{ marginBottom: 10 }}>آخر الطلبات</h3>
        <table><thead><tr><th>#</th><th>العميل</th><th>المدينة</th><th>المجموع</th><th>الحالة</th></tr></thead>
          <tbody>{s.latest_orders.map((o) => <tr key={o.id}><td>{o.id}</td><td>{o.name}</td><td>{o.city}</td><td>{money(o.total)}</td><td><span className={'badge st-' + o.status}>{STATUS[o.status]}</span></td></tr>)}</tbody></table>
      </div>
    </>
  )
}

function ProductForm({ p, cats, onClose, onSaved }) {
  const [f, setF] = useState({
    name: p.name || '', category_id: p.category_id || cats[0]?.id || '', brand: p.brand || '',
    price: p.price || '', old_price: p.old_price || '', stock: p.stock ?? 0, description: p.description || '',
    is_featured: !!p.is_featured, is_active: p.is_active ?? true,
  })
  const [file, setFile] = useState(null)
  const [err, setErr] = useState('')
  const on = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault(); setErr('')
    const fd = new FormData()
    Object.entries(f).forEach(([k, v]) => fd.append(k, typeof v === 'boolean' ? (v ? 1 : 0) : v ?? ''))
    if (file) fd.append('image', file)
    try {
      if (p.id) { fd.append('_method', 'PUT'); await api('/admin/products/' + p.id, { method: 'POST', form: fd }) }
      else await api('/admin/products', { method: 'POST', form: fd })
      onSaved()
    } catch (er) { setErr(er.message) }
  }
  return (
    <div className="modal"><form onSubmit={submit}>
      <h3 style={{ marginBottom: 14 }}>{p.id ? 'تعديل منتج' : 'إضافة منتج'}</h3>
      {err && <div className="err">{err}</div>}
      <div className="fld"><label>اسم المنتج</label><input required value={f.name} onChange={on('name')} /></div>
      <div className="g2">
        <div className="fld"><label>القسم</label>
          <select value={f.category_id} onChange={on('category_id')}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name} ({TYPE[c.type]})</option>)}</select></div>
        <div className="fld"><label>الماركة</label><input value={f.brand} onChange={on('brand')} /></div>
        <div className="fld"><label>السعر</label><input type="number" step="0.01" required value={f.price} onChange={on('price')} /></div>
        <div className="fld"><label>السعر قبل الخصم (اختياري)</label><input type="number" step="0.01" value={f.old_price} onChange={on('old_price')} /></div>
        <div className="fld"><label>الكمية</label><input type="number" required value={f.stock} onChange={on('stock')} /></div>
        <div className="fld"><label>الصورة</label><input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} /></div>
      </div>
      <div className="fld"><label>الوصف</label><textarea rows="3" value={f.description} onChange={on('description')} /></div>
      <label className="fld chk"><input type="checkbox" checked={f.is_featured} onChange={(e) => setF({ ...f, is_featured: e.target.checked })} /> منتج مميز (يظهر في الرئيسية)</label>
      <label className="fld chk"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> فعّال (ظاهر للزبائن)</label>
      <div className="row"><button className="btn">حفظ</button><button type="button" className="btn gray" onClick={onClose}>إلغاء</button></div>
    </form></div>
  )
}

function Products() {
  const [data, setData] = useState(null)
  const [cats, setCats] = useState([])
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const load = () => api(`/admin/products?page=${page}&q=${encodeURIComponent(q)}`).then(setData)
  useEffect(() => { load() }, [page])
  useEffect(() => { api('/admin/categories').then(setCats) }, [])
  const del = async (p) => { if (confirm('حذف المنتج "' + p.name + '"؟')) { await api('/admin/products/' + p.id, { method: 'DELETE' }); load() } }
  return (
    <>
      <h1>المنتجات</h1>
      <div className="row">
        <input style={{ maxWidth: 260 }} placeholder="بحث بالاسم..." value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (page === 1 ? load() : setPage(1))} />
        <button className="btn" onClick={() => setEdit({})} disabled={!cats.length}>+ إضافة منتج</button>
        {!cats.length && <span>أضف قسماً أولاً</span>}
      </div>
      {!data ? <p>جاري التحميل...</p> : (
        <>
          <table><thead><tr><th></th><th>الاسم</th><th>القسم</th><th>السعر</th><th>الكمية</th><th>الحالة</th><th></th></tr></thead>
            <tbody>{data.data.map((p) => (
              <tr key={p.id}>
                <td><img className="thumb" src={p.image_url} alt="" /></td><td>{p.name}</td><td>{p.category?.name}</td>
                <td>{money(p.price)}</td><td>{p.stock}</td>
                <td><span className={'badge ' + (p.is_active ? 'on' : 'off')}>{p.is_active ? 'فعّال' : 'مخفي'}</span></td>
                <td><button className="btn sm" onClick={() => setEdit(p)}>تعديل</button> <button className="btn sm red" onClick={() => del(p)}>حذف</button></td>
              </tr>))}</tbody></table>
          <div className="pager">
            <button className="btn sm gray" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
            <span>{data.current_page} / {data.last_page}</span>
            <button className="btn sm gray" disabled={page >= data.last_page} onClick={() => setPage(page + 1)}>التالي</button>
          </div>
        </>
      )}
      {edit && <ProductForm p={edit} cats={cats} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </>
  )
}

function Categories() {
  const [list, setList] = useState([])
  const [f, setF] = useState({ id: null, name: '', type: 'appliance' })
  const [err, setErr] = useState('')
  const load = () => api('/admin/categories').then(setList)
  useEffect(() => { load() }, [])
  const save = async (e) => {
    e.preventDefault(); setErr('')
    try {
      const body = { name: f.name, type: f.type }
      if (f.id) await api('/admin/categories/' + f.id, { method: 'PUT', body })
      else await api('/admin/categories', { method: 'POST', body })
      setF({ id: null, name: '', type: 'appliance' }); load()
    } catch (er) { setErr(er.message) }
  }
  const del = async (c) => {
    if (!confirm('حذف القسم "' + c.name + '"؟')) return
    try { await api('/admin/categories/' + c.id, { method: 'DELETE' }); load() } catch (er) { alert(er.message) }
  }
  return (
    <>
      <h1>الأقسام</h1>
      <form className="box row" onSubmit={save}>
        <input style={{ maxWidth: 240 }} placeholder="اسم القسم" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <select style={{ maxWidth: 200 }} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option value="appliance">أجهزة كهربائية</option><option value="bedroom">غرف نوم</option>
        </select>
        <button className="btn">{f.id ? 'تحديث' : 'إضافة'}</button>
        {f.id && <button type="button" className="btn gray" onClick={() => setF({ id: null, name: '', type: 'appliance' })}>إلغاء</button>}
        {err && <span style={{ color: '#991b1b' }}>{err}</span>}
      </form>
      <table><thead><tr><th>القسم</th><th>النوع</th><th>عدد المنتجات</th><th></th></tr></thead>
        <tbody>{list.map((c) => (
          <tr key={c.id}><td>{c.name}</td><td>{TYPE[c.type]}</td><td>{c.products_count}</td>
            <td><button className="btn sm" onClick={() => setF({ id: c.id, name: c.name, type: c.type })}>تعديل</button> <button className="btn sm red" onClick={() => del(c)}>حذف</button></td></tr>))}</tbody></table>
    </>
  )
}

function Orders() {
  const [data, setData] = useState(null)
  const [counts, setCounts] = useState({})
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(null)

  const prevAll = useRef(null)
  const [flash, setFlash] = useState('')

  const load = () => {
    api(`/admin/orders?page=${page}&status=${status}&q=${encodeURIComponent(query)}`).then(setData)
    api('/admin/orders-counts').then((c) => {
      if (prevAll.current !== null && c.all > prevAll.current) {
        setFlash(`🔔 وصل ${c.all - prevAll.current} طلب جديد`)
        setTimeout(() => setFlash(''), 6000)
      }
      prevAll.current = c.all
      setCounts(c)
    })
  }
  useEffect(() => { load() }, [page, status, query])
  useAutoRefresh(load)

  const change = async (o, s) => {
    try { await api('/admin/orders/' + o.id, { method: 'PATCH', body: { status: s } }); load() }
    catch (er) { alert(er.message) }
  }
  const del = async (o) => {
    if (!confirm(`حذف الطلب #${o.id} نهائياً؟\nإذا كان غير مكتمل راح ترجع كمياته للمخزون.`)) return
    try { await api('/admin/orders/' + o.id, { method: 'DELETE' }); setOpen(null); load() }
    catch (er) { alert(er.message) }
  }
  const print = (o) => {
    const w = window.open('', '_blank', 'width=800,height=900')
    if (!w) return alert('اسمح بالنوافذ المنبثقة للطباعة')
    const rows = o.items.map((i) => `<tr><td>${esc(i.product_name)}</td><td>${i.quantity}</td><td>${money(i.price)}</td><td>${money(i.price * i.quantity)}</td></tr>`).join('')
    w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>فاتورة #${o.id}</title><style>body{font-family:Tahoma,Arial;padding:30px}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{border:1px solid #ccc;padding:8px;text-align:right}</style></head><body><h2>فاتورة طلب #${o.id}</h2><p>${esc(fmtDate(o.created_at))}</p><p><b>${esc(o.name)}</b> — ${esc(o.phone)}</p><p>${esc(o.city)} — ${esc(o.address)}</p><table><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr>${rows}</table><h3>الإجمالي: ${money(o.total)}</h3><p>طريقة الدفع: عند الاستلام</p></body></html>`)
    w.document.close(); w.focus(); w.print()
  }

  const tabs = [['', 'الكل', counts.all], ...Object.entries(STATUS).map(([k, v]) => [k, v, counts[k]])]

  return (
    <>
      <h1>الطلبات</h1>
      {flash && <div className="flash">{flash}</div>}
      <div className="pills">
        {tabs.map(([k, l, c]) => (
          <button key={k} className={'pill st-' + (k || 'all') + (status === k ? ' on' : '')} onClick={() => { setPage(1); setStatus(k) }}>
            {l} <b>{c ?? 0}</b>
          </button>
        ))}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q) }}>
        <input style={{ maxWidth: 320 }} placeholder="ابحث برقم الطلب أو الاسم أو الهاتف..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn">بحث</button>
        {query && <button type="button" className="btn gray" onClick={() => { setQ(''); setQuery(''); setPage(1) }}>مسح البحث</button>}
      </form>

      {!data ? <p>جاري التحميل...</p> : data.data.length === 0 ? <div className="box empty">لا توجد طلبات</div> : (
        <>
          {data.data.map((o) => (
            <div className={'ocard st-' + o.status} key={o.id}>
              <div className="ohead">
                <div className="oid">
                  <b>#{o.id}</b>
                  <span className={'badge st-' + o.status}>{STATUS[o.status]}</span>
                  <small>{fmtDate(o.created_at)}</small>
                </div>
                <b className="otot">{money(o.total)}</b>
              </div>
              <div className="ometa">
                <span>👤 {o.name}</span>
                <a href={waLink(o.phone)} target="_blank" rel="noreferrer">📞 {o.phone}</a>
                <span>📍 {o.city}</span>
                <span>🛍 {o.items.length} منتج</span>
              </div>
              <div className="oact">
                <select value={o.status} onChange={(e) => change(o, e.target.value)}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button className="btn sm gray" onClick={() => setOpen(open === o.id ? null : o.id)}>{open === o.id ? 'إخفاء' : 'التفاصيل'}</button>
                <button className="btn sm" onClick={() => print(o)}>🖨 طباعة</button>
                <button className="btn sm red" onClick={() => del(o)}>🗑 حذف</button>
              </div>
              {open === o.id && (
                <div className="odet">
                  <p><b>العنوان:</b> {o.address}</p>
                  {o.notes && <p><b>ملاحظات الزبون:</b> {o.notes}</p>}
                  <table>
                    <thead><tr><th>المنتج</th><th>السعر</th><th>الكمية</th><th>المجموع</th></tr></thead>
                    <tbody>{o.items.map((i) => <tr key={i.id}><td>{i.product_name}</td><td>{money(i.price)}</td><td>{i.quantity}</td><td>{money(i.price * i.quantity)}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          <div className="pager">
            <button className="btn sm gray" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
            <span>{data.current_page} / {data.last_page}</span>
            <button className="btn sm gray" disabled={page >= data.last_page} onClick={() => setPage(page + 1)}>التالي</button>
          </div>
        </>
      )}
    </>
  )
}

function Reviews() {
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const load = () => api('/admin/reviews?page=' + page).then(setData)
  useEffect(() => { load() }, [page])
  useAutoRefresh(load)
  const del = async (r) => {
    if (!confirm('حذف هذا التقييم؟')) return
    await api('/admin/reviews/' + r.id, { method: 'DELETE' }); load()
  }
  return (
    <>
      <h1>التقييمات</h1>
      {!data ? <p>جاري التحميل...</p> : data.data.length === 0 ? <div className="box empty">لا توجد تقييمات بعد</div> : (
        <>
          <table>
            <thead><tr><th>المنتج</th><th>الزبون</th><th>التقييم</th><th>التعليق</th><th>التاريخ</th><th></th></tr></thead>
            <tbody>{data.data.map((r) => (
              <tr key={r.id}>
                <td>{r.product?.name}</td><td>{r.user?.name}</td>
                <td style={{ color: '#f59e0b', whiteSpace: 'nowrap' }}>{stars(r.rating)}</td>
                <td style={{ maxWidth: 320 }}>{r.comment || '—'}</td>
                <td>{fmtDate(r.created_at)}</td>
                <td><button className="btn sm red" onClick={() => del(r)}>حذف</button></td>
              </tr>))}</tbody>
          </table>
          <div className="pager">
            <button className="btn sm gray" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
            <span>{data.current_page} / {data.last_page}</span>
            <button className="btn sm gray" disabled={page >= data.last_page} onClick={() => setPage(page + 1)}>التالي</button>
          </div>
        </>
      )}
    </>
  )
}

export default function App() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState('dash')

  useEffect(() => {
    if (!localStorage.getItem('token')) return setReady(true)
    api('/me').then((u) => { if (u.role === 'admin') setUser(u); else localStorage.removeItem('token') })
      .catch(() => localStorage.removeItem('token')).finally(() => setReady(true))
  }, [])

  const logout = () => { api('/logout', { method: 'POST' }).catch(() => {}); localStorage.removeItem('token'); setUser(null) }

  if (!ready) return null
  if (!user) return <Login onLogin={setUser} />
  const tabs = [['dash', '📊 الرئيسية'], ['products', '📦 المنتجات'], ['cats', '🗂 الأقسام'], ['orders', '🧾 الطلبات'], ['reviews', '⭐ التقييمات']]
  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>لوحة التحكم</h2>
        {tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        <button onClick={logout} style={{ marginTop: 'auto' }}>🚪 تسجيل الخروج</button>
      </aside>
      <main className="main">
        {tab === 'dash' && <Dashboard />}
        {tab === 'products' && <Products />}
        {tab === 'cats' && <Categories />}
        {tab === 'orders' && <Orders />}
        {tab === 'reviews' && <Reviews />}
      </main>
    </div>
  )
}
