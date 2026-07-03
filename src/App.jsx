import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

function App() {
  // App Mode
  const [appMode, setAppMode] = useState('loading') // loading, login, admin, user
  
  // Current User
  const [currentUser, setCurrentUser] = useState(null)
  
  // Data State
  const [data, setData] = useState([])
  const [rawUploadedData, setRawUploadedData] = useState(null)
  const [showDebug, setShowDebug] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingFromSupabase, setLoadingFromSupabase] = useState(false)
  const [selectedBrand, setSelectedBrand] = useState('')
  const [selectedMainCategory, setSelectedMainCategory] = useState('')
  const [selectedSubCategory, setSelectedSubCategory] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [barcodeSearch, setBarcodeSearch] = useState('')
  const [selectedRows, setSelectedRows] = useState(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 100
  const [scannedCart, setScannedCart] = useState([])
  const [bulkColumn, setBulkColumn] = useState('')
  const [bulkNewValue, setBulkNewValue] = useState('')
  const [showSuccessToast, setShowSuccessToast] = useState(false)
  const [bulkReplaceSuccess, setBulkReplaceSuccess] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [showCameraScanner, setShowCameraScanner] = useState(false)
  const [dataLoadedFromSupabase, setDataLoadedFromSupabase] = useState(false)

  // Login Form State
  const [loginName, setLoginName] = useState('')
  const [loginMobile, setLoginMobile] = useState('')
  const [loginError, setLoginError] = useState('')

  // Admin: User Management
  const [adminUsers, setAdminUsers] = useState([])
  const [newUserName, setNewUserName] = useState('')
  const [newUserMobile, setNewUserMobile] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(false)

  // EXACT COLUMNS
  const EXACT_COLUMNS = [
    'Item Name',
    'BARCODE',
    'HSNCODE',
    'MAIN CATEGORY',
    'SUB CATEGORY',
    'MRP',
    'SALE RATE',
    'PURC RATE',
    'GST%',
    'CESS%',
    'OPENING',
    'Brand name',
    'Unit',
    'MinQty',
    'Dis %',
    'Basic Sale Price',
    'Size',
    'Counter',
    'Colour'
  ]

  // Generate unique token
  const generateToken = () => {
    return 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
  }

  // Check URL for token on mount
  useEffect(() => {
    const checkAuth = async () => {
      // Check URL for token
      const params = new URLSearchParams(window.location.search)
      const token = params.get('token')
      const admin = params.get('admin')

      if (admin === 'true') {
        setAppMode('admin')
        loadAdminUsers()
        return
      }

      if (token) {
        await loginWithToken(token)
        return
      }

      setAppMode('login')
    }
    checkAuth()
  }, [])

  // Load user via token
  const loginWithToken = async (token) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('unique_token', token)
        .single()

      if (error || !data) {
        setLoginError('Invalid link!')
        setAppMode('login')
        return
      }

      setCurrentUser(data)
      localStorage.setItem('userToken', token)
      setAppMode('user')
      loadFromSupabase(token)
    } catch (err) {
      setLoginError('Something went wrong!')
      setAppMode('login')
    }
  }

  // Login with name and mobile
  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    if (!loginName.trim() || !loginMobile.trim()) {
      setLoginError('Please enter name and mobile number!')
      return
    }

    try {
      // Check if user exists
      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .eq('mobile', loginMobile.trim())

      if (error) throw error

      if (users.length > 0) {
        // Login existing user
        const user = users[0]
        setCurrentUser(user)
        localStorage.setItem('userToken', user.unique_token)
        window.history.replaceState({}, '', `?token=${user.unique_token}`)
        setAppMode('user')
        loadFromSupabase(user.unique_token)
      } else {
        // Create new user
        const token = generateToken()
        const { data: newUser, error: insertError } = await supabase
          .from('users')
          .insert([
            { name: loginName.trim(), mobile: loginMobile.trim(), unique_token: token }
          ])
          .select()

        if (insertError) throw insertError

        const user = newUser[0]
        setCurrentUser(user)
        localStorage.setItem('userToken', token)
        window.history.replaceState({}, '', `?token=${token}`)
        setAppMode('user')
      }
    } catch (err) {
      setLoginError('Error! ' + err.message)
    }
  }

  // Load admin users
  const loadAdminUsers = async () => {
    setLoadingUsers(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setAdminUsers(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingUsers(false)
    }
  }

  // Admin: Add new user
  const addNewUser = async (e) => {
    e.preventDefault()
    if (!newUserName.trim() || !newUserMobile.trim()) return

    try {
      const token = generateToken()
      await supabase.from('users').insert([
        { name: newUserName.trim(), mobile: newUserMobile.trim(), unique_token: token }
      ])
      setNewUserName('')
      setNewUserMobile('')
      loadAdminUsers()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  // Admin: Copy user link
  const copyUserLink = (token) => {
    const link = `${window.location.origin}${window.location.pathname}?token=${token}`
    navigator.clipboard.writeText(link)
    alert('Link copied!')
  }

  // Load inventory for user
  const loadFromSupabase = async (token) => {
    setLoadingFromSupabase(true)
    try {
      const { data: savedData, error } = await supabase
        .from('nm_mart_inventory')
        .select('*')
        .eq('user_token', token)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      if (savedData && savedData.inventory_data) {
        const cleanedData = savedData.inventory_data.map((row, index) => {
          const cleanRow = { _id: index }
          EXACT_COLUMNS.forEach(col => {
            cleanRow[col] = row[col] ?? ''
          })
          return cleanRow
        })
        setData(cleanedData)
        setDataLoadedFromSupabase(true)
        setTimeout(() => setDataLoadedFromSupabase(false), 4000)
      }
    } catch (error) {
      console.error('Error loading from Supabase:', error)
    } finally {
      setLoadingFromSupabase(false)
    }
  }

  // Save to Supabase
  const saveToSupabase = async () => {
    if (!currentUser) return
    if (data.length === 0) {
      alert('No data to save!')
      return
    }
    setSaving(true)
    try {
      const dataToSave = data.map(row => {
        const cleanRow = {}
        EXACT_COLUMNS.forEach(col => {
          cleanRow[col] = row[col] ?? ''
        })
        return cleanRow
      })

      const { data: existingData, error: fetchError } = await supabase
        .from('nm_mart_inventory')
        .select('*')
        .eq('user_token', currentUser.unique_token)
        .single()

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError

      let result
      if (existingData) {
        result = await supabase
          .from('nm_mart_inventory')
          .update({
            inventory_data: dataToSave,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingData.id)
      } else {
        result = await supabase
          .from('nm_mart_inventory')
          .insert([{
            user_token: currentUser.unique_token,
            inventory_data: dataToSave,
            updated_at: new Date().toISOString()
          }])
      }

      if (result?.error) throw result.error
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      console.error('Error saving:', error)
      alert('Error saving: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  // File upload handler
  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) {
      alert('Please select a file first!')
      return
    }

    setLoading(true)
    setSelectedBrand('')
    setSelectedMainCategory('')
    setSelectedSubCategory('')
    setSearchTerm('')
    setSelectedRows(new Set())
    setBulkColumn('')
    setBulkNewValue('')

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const dataArray = new Uint8Array(event.target.result)
        const workbook = XLSX.read(dataArray, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' })

        setRawUploadedData(jsonData)

        // Clean data
        const cleanedData = jsonData.map((row, index) => {
          const cleanRow = { _id: index }
          EXACT_COLUMNS.forEach(targetCol => {
            cleanRow[targetCol] = row[targetCol] ?? ''
          })
          return cleanRow
        })

        setData(cleanedData)
      } catch (error) {
        console.error('Error parsing file:', error)
        alert('Error parsing file!')
      } finally {
        setLoading(false)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // Unique values
  const uniqueBrands = useMemo(() => {
    const brands = new Set()
    data.forEach(row => {
      const val = String(row['Brand name'] || '').trim()
      if (val) brands.add(val)
    })
    return Array.from(brands).sort()
  }, [data])

  const uniqueMainCategories = useMemo(() => {
    const cats = new Set()
    data.forEach(row => {
      const val = String(row['MAIN CATEGORY'] || '').trim()
      if (val) cats.add(val)
    })
    return Array.from(cats).sort()
  }, [data])

  const uniqueSubCategories = useMemo(() => {
    const cats = new Set()
    data.forEach(row => {
      const val = String(row['SUB CATEGORY'] || '').trim()
      if (val) cats.add(val)
    })
    return Array.from(cats).sort()
  }, [data])

  // Filtered data
  const filteredData = useMemo(() => {
    return data.filter(row => {
      const matchesBrand = selectedBrand 
        ? String(row['Brand name'] || '').trim() === selectedBrand 
        : true
      const matchesMainCat = selectedMainCategory 
        ? String(row['MAIN CATEGORY'] || '').trim() === selectedMainCategory 
        : true
      const matchesSubCat = selectedSubCategory 
        ? String(row['SUB CATEGORY'] || '').trim() === selectedSubCategory 
        : true
      const matchesSearch = searchTerm 
        ? (row['Item Name'] || '').toLowerCase().includes(searchTerm.toLowerCase()) 
        : true
      const matchesBarcode = barcodeSearch 
        ? String(row['BARCODE'] || '').trim().toLowerCase() === String(barcodeSearch).trim().toLowerCase() 
        : true
      return matchesBrand && matchesMainCat && matchesSubCat && matchesSearch && matchesBarcode
    })
  }, [data, selectedBrand, selectedMainCategory, selectedSubCategory, searchTerm, barcodeSearch])

  // Pagination
  const totalPages = useMemo(() => Math.ceil(filteredData.length / itemsPerPage), [filteredData])
  const currentData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredData.slice(start, start + itemsPerPage)
  }, [filteredData, currentPage])

  // Handlers
  const toggleSelectAll = useCallback(() => {
    if (selectedRows.size === filteredData.length) {
      setSelectedRows(new Set())
    } else {
      const newSet = new Set()
      filteredData.forEach(row => newSet.add(row._id))
      setSelectedRows(newSet)
    }
  }, [filteredData, selectedRows])

  const toggleSelectRow = useCallback((id) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) newSet.delete(id)
      else newSet.add(id)
      return newSet
    })
  }, [])

  const handleCellEdit = useCallback((id, col, val) => {
    setData(prev => prev.map(row => 
      row._id === id ? { ...row, [col]: val } : row
    ))
  }, [])

  const handleBulkReplace = useCallback(() => {
    if (!bulkColumn || !bulkNewValue || selectedRows.size === 0) {
      alert('Select column, value, and at least one row!')
      return
    }
    if (!confirm('Update ' + selectedRows.size + ' rows?')) return

    setData(prev => prev.map(row => 
      selectedRows.has(row._id) ? { ...row, [bulkColumn]: bulkNewValue } : row
    ))
    setBulkReplaceSuccess(true)
    setTimeout(() => setBulkReplaceSuccess(false), 4000)
  }, [bulkColumn, bulkNewValue, selectedRows])

  const handleExportToExcel = useCallback(() => {
    const exportData = data.map(row => {
      const rowData = {}
      EXACT_COLUMNS.forEach(col => rowData[col] = row[col])
      return rowData
    })
    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory')
    XLSX.writeFile(wb, 'NM_MART_Complete_Inventory.xlsx')
    setShowSuccessToast(true)
    setTimeout(() => setShowSuccessToast(false), 3000)
  }, [data])

  const handleDeleteRow = useCallback((id) => {
    if (!confirm('Delete this product?')) return
    setData(prev => prev.filter(row => row._id !== id))
    setSelectedRows(prev => {
      const newSet = new Set(prev)
      newSet.delete(id)
      return newSet
    })
  }, [])

  const handleDeleteSelected = useCallback(() => {
    if (!confirm('Delete ' + selectedRows.size + ' products?')) return
    setData(prev => prev.filter(row => !selectedRows.has(row._id)))
    setSelectedRows(new Set())
  }, [selectedRows])

  const handleBarcodeScan = useCallback((e) => {
    if (e.key === 'Enter' && barcodeSearch.trim()) {
      e.preventDefault()
      const trimmed = barcodeSearch.trim().toLowerCase()
      const product = data.find(row => 
        String(row['BARCODE'] || '').trim().toLowerCase() === trimmed
      )
      if (product) {
        setScannedCart(prev => [...prev, { id: Date.now() + Math.random(), product }])
      }
      setBarcodeSearch('')
    }
  }, [barcodeSearch, data])

  const clearScannedCart = useCallback(() => {
    if (confirm('Clear all scanned items?')) setScannedCart([])
  }, [])

  const removeFromCart = useCallback((id) => {
    setScannedCart(prev => prev.filter(item => item.id !== id))
  }, [])

  const handleScannedItemEdit = useCallback((id, col, val) => {
    setScannedCart(prev => prev.map(item => 
      item.id === id ? { ...item, product: { ...item.product, [col]: val } } : item
    ))
  }, [])

  const videoRef = useRef(null)

  useEffect(() => {
    let stream = null
    let animationId = null

    const startScanning = async () => {
      if (!showCameraScanner) return

      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }

        // Check if BarcodeDetector is supported
        if ('BarcodeDetector' in window) {
          const detector = new BarcodeDetector({ 
            formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'data_matrix'] 
          })

          const detectFrame = async () => {
            if (!showCameraScanner || !videoRef.current) return
            try {
              const barcodes = await detector.detect(videoRef.current)
              if (barcodes.length > 0) {
                const barcodeText = barcodes[0].rawValue.trim().toLowerCase()
                const product = data.find(row => 
                  String(row['BARCODE'] || '').trim().toLowerCase() === barcodeText
                )
                if (product) {
                  setScannedCart(prev => [...prev, { id: Date.now() + Math.random(), product }])
                }
                setShowCameraScanner(false)
                return
              }
            } catch (e) {
              // Ignore detection errors
            }
            animationId = requestAnimationFrame(detectFrame)
          }
          detectFrame()
        }
      } catch (err) {
        console.error('Camera error:', err)
      }
    }

    startScanning()

    return () => {
      if (animationId) cancelAnimationFrame(animationId)
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [showCameraScanner, data])

  // Logout
  const handleLogout = () => {
    setCurrentUser(null)
    localStorage.removeItem('userToken')
    window.history.replaceState({}, '', window.location.pathname)
    setAppMode('login')
    setData([])
    setScannedCart([])
  }

  // --- RENDER ---
  if (appMode === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  // --- LOGIN SCREEN ---
  if (appMode === 'login') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">NM MART</h1>
            <p className="text-gray-600">Bulk Inventory Manager</p>
          </div>

          {loginError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
              <input
                type="text"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Enter your name"
                required
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
              <input
                type="text"
                value={loginMobile}
                onChange={(e) => setLoginMobile(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Enter your mobile number"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-all"
            >
              Login / Sign Up
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-gray-500">
            <p>Admin? Add ?admin=true to the URL</p>
          </div>
        </div>
      </div>
    )
  }

  // --- ADMIN SCREEN ---
  if (appMode === 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
              <p className="text-gray-600">Manage Users & Generate Links</p>
            </div>
            <button
              onClick={() => {
                window.history.replaceState({}, '', window.location.pathname)
                setAppMode('login')
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Back to Login
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-xl p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Add New User</h2>
            <form onSubmit={addNewUser} className="flex gap-4 flex-wrap">
              <input
                type="text"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="User Name"
                className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
              <input
                type="text"
                value={newUserMobile}
                onChange={(e) => setNewUserMobile(e.target.value)}
                placeholder="Mobile Number"
                className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
              <button
                type="submit"
                className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-lg"
              >
                Add User & Generate Link
              </button>
            </form>
          </div>

          <div className="bg-white rounded-xl shadow-xl p-6">
            <h2 className="text-xl font-bold mb-4">Users List</h2>
            {loadingUsers ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Mobile</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Unique Link</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {adminUsers.map(user => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">{user.name}</td>
                        <td className="px-4 py-3">{user.mobile}</td>
                        <td className="px-4 py-3 text-xs text-indigo-600 break-all">
                          {window.location.origin}?token={user.unique_token}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => copyUserLink(user.unique_token)}
                            className="px-4 py-1 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
                          >
                            Copy Link
                          </button>
                        </td>
                      </tr>
                    ))}
                    {adminUsers.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                          No users yet! Add your first user.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // --- USER SCREEN ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-1">
      {showDebug && (data.length > 0 || rawUploadedData) && (
        <div className="bg-white rounded-xl shadow-xl p-4 mb-4 mx-1">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-gray-800">📊 Debug Info</h3>
            <button onClick={() => setShowDebug(false)} className="text-gray-500 hover:text-gray-700 text-sm">✕</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <p className="font-semibold mb-1">Cleaned Data</p>
              <p>Total Rows: {data.length}</p>
              {data[0] && <pre className="bg-gray-100 p-2 rounded overflow-x-auto">{JSON.stringify(data[0], null, 2)}</pre>}
            </div>
            <div>
              <p className="font-semibold mb-1">Filtered Data</p>
              <p>Showing: {filteredData.length}</p>
              {filteredData[0] && <pre className="bg-green-100 p-2 rounded overflow-x-auto">{JSON.stringify(filteredData[0], null, 2)}</pre>}
            </div>
            {rawUploadedData && (
              <div>
                <p className="font-semibold mb-1">Raw Data</p>
                <p>Total Rows: {rawUploadedData.length}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mx-1 mb-4">
        <button onClick={() => setShowDebug(!showDebug)} className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-medium rounded hover:bg-gray-300">
          {showDebug ? 'Hide Debug' : 'Show Debug'}
        </button>
      </div>

      {showSuccessToast && (
        <div className="fixed top-6 right-6 z-50 bg-green-500 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-semibold">Export successful! ({data.length} items)</span>
        </div>
      )}

      {bulkReplaceSuccess && (
        <div className="fixed top-20 right-6 z-50 bg-green-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-semibold">✅ Updated {selectedRows.size} rows!</span>
        </div>
      )}

      {saveSuccess && (
        <div className="fixed top-36 right-6 z-50 bg-blue-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-semibold">✅ Saved to Cloud!</span>
        </div>
      )}

      {dataLoadedFromSupabase && (
        <div className="fixed top-52 right-6 z-50 bg-purple-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="font-semibold">✅ Inventory Loaded!</span>
        </div>
      )}

      <div className="max-w-full mx-auto px-1">
        <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
          <div className="text-center md:text-left">
            <h1 className="text-3xl font-bold text-gray-900 mb-1">NM MART</h1>
            <p className="text-gray-600">Welcome, {currentUser?.name}! ({currentUser?.mobile})</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {data.length > 0 && (
              <button onClick={saveToSupabase} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Save to Cloud
                  </>
                )}
              </button>
            )}
            {data.length > 0 && (
              <button onClick={handleExportToExcel}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg shadow hover:shadow-md"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export Excel
              </button>
            )}
            <button onClick={handleLogout}
              className="flex items-center gap-2 px-5 py-2 bg-red-500 text-white font-semibold rounded-lg shadow hover:bg-red-600"
            >
              Logout
            </button>
          </div>
        </div>

        {loadingFromSupabase && (
          <div className="bg-white rounded-lg shadow p-3 mb-4 flex items-center justify-center gap-2 text-blue-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span>Loading saved data...</span>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-xl p-6 mb-4">
          <label className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-lg cursor-pointer transition-all ${loading ? 'border-gray-200 bg-gray-100' : 'border-indigo-300 bg-indigo-50 hover:border-indigo-400 hover:bg-indigo-100'}`}>
            <div className="flex flex-col items-center justify-center pt-3 pb-4">
              <svg className="w-10 h-10 mb-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="mb-1 text-base text-gray-700"><span className="font-bold">📂 Click to upload Excel</span></p>
              <p className="text-xs text-gray-500">.xlsx, .xls, .csv</p>
            </div>
            <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} disabled={loading} />
          </label>
          {loading && (
            <div className="flex items-center justify-center mt-4">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
              <span className="ml-3 text-gray-700 font-medium">⏳ Loading...</span>
            </div>
          )}
        </div>

        {data.length > 0 && (
          <>
            <div className="bg-white rounded-xl shadow-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800">🔍 Filter Products</h3>
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 text-blue-800 px-4 py-1 rounded-full text-sm font-medium">
                    Showing {filteredData.length} of {data.length}
                  </div>
                  <button onClick={() => {
                    setSelectedBrand('')
                    setSelectedMainCategory('')
                    setSelectedSubCategory('')
                    setSearchTerm('')
                    setBarcodeSearch('')
                    setSelectedRows(new Set())
                    setCurrentPage(1)
                    setScannedCart([])
                  }} className="px-3 py-1 bg-gray-200 text-gray-700 text-sm font-medium rounded hover:bg-gray-300">
                    Clear Filters
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Filter by Brand</label>
                  <select
                    value={selectedBrand}
                    onChange={(e) => { setSelectedBrand(e.target.value); setSelectedRows(new Set()); setCurrentPage(1); }}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">All Brands</option>
                    {uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Filter by Category</label>
                  <select
                    value={selectedMainCategory}
                    onChange={(e) => { setSelectedMainCategory(e.target.value); setSelectedRows(new Set()); setCurrentPage(1); }}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">All Categories</option>
                    {uniqueMainCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Filter by Sub-Category</label>
                  <select
                    value={selectedSubCategory}
                    onChange={(e) => { setSelectedSubCategory(e.target.value); setSelectedRows(new Set()); setCurrentPage(1); }}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">All Sub-Categories</option>
                    {uniqueSubCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Search Item</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => { setSearchTerm(e.target.value); setSelectedRows(new Set()); setCurrentPage(1); }}
                      placeholder="Search..."
                      className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                      <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">🔍 Scan Barcode</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={barcodeSearch}
                        onChange={(e) => { setBarcodeSearch(e.target.value); setSelectedRows(new Set()); setCurrentPage(1); }}
                        onKeyDown={handleBarcodeScan}
                        placeholder="Scan barcode..."
                        autoFocus
                        className="w-full pl-8 pr-3 py-1.5 border-2 border-indigo-400 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-indigo-50"
                      />
                      <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                        <svg className="h-4 w-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h4M4 20h4m0-8V4m0 4H4" />
                        </svg>
                      </div>
                    </div>
                    <button onClick={() => setShowCameraScanner(true)} className="px-4 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md hover:shadow-lg" title="Camera">
                      📷
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {scannedCart.length > 0 && (
              <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl shadow-xl p-4 mb-4 text-white">
                <div className="flex flex-wrap justify-between items-center mb-3 gap-3">
                  <h3 className="text-lg font-bold">🛒 Scanned Items ({scannedCart.length})</h3>
                  <button onClick={clearScannedCart} className="px-3 py-1.5 bg-red-500 text-white rounded-md hover:bg-red-600 text-sm">
                    Clear All
                  </button>
                </div>
                <div className="bg-white rounded-lg overflow-x-auto">
                  <table className="w-full text-gray-900">
                    <thead className="bg-gray-100">
                      <tr>
                        {EXACT_COLUMNS.map(col => <th key={col} className="px-2 py-2 text-xs font-semibold text-gray-700 uppercase text-left">{col}</th>)}
                        <th className="px-2 py-2 text-xs font-semibold text-gray-700 uppercase text-center">Del</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {scannedCart.map(item => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          {EXACT_COLUMNS.map(col => (
                            <td key={col} className="px-2 py-2">
                              <input type="text" value={item.product[col] || ''} onChange={(e) => handleScannedItemEdit(item.id, col, e.target.value)} className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none" />
                            </td>
                          ))}
                          <td className="px-2 py-2 text-center">
                            <button onClick={() => removeFromCart(item.id)} className="px-3 py-1 bg-red-500 text-white text-xs font-medium rounded hover:bg-red-600">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedRows.size > 0 && (
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl shadow-xl p-4 mb-4 text-white">
                <div className="flex flex-wrap justify-between items-center mb-3 gap-3">
                  <h3 className="text-lg font-bold">✅ Bulk Actions: {selectedRows.size} selected</h3>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedRows(new Set())} className="px-3 py-1.5 bg-gray-500 text-white rounded-md hover:bg-gray-600 text-sm">❌ Clear</button>
                    <button onClick={handleDeleteSelected} className="px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium">🗑️ Delete</button>
                  </div>
                </div>
                <p className="text-indigo-100 mb-3 text-sm">1) Select column 2) Type value 3) Click Replace</p>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs font-medium mb-1">📌 Column</label>
                    <select
                      value={bulkColumn}
                      onChange={(e) => setBulkColumn(e.target.value)}
                      className="w-full px-3 py-2 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-white outline-none text-sm"
                    >
                      <option value="">-- Choose --</option>
                      {EXACT_COLUMNS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs font-medium mb-1">✏️ New Value</label>
                    <input type="text" value={bulkNewValue} onChange={(e) => setBulkNewValue(e.target.value)} placeholder="Type..." className="w-full px-3 py-2 rounded-md text-gray-900 focus:ring-2 focus:ring-white outline-none text-sm" />
                  </div>
                  <div className="self-end">
                    <button onClick={handleBulkReplace} className="px-6 py-2 bg-green-500 text-white font-bold rounded-md hover:bg-green-600 text-sm">✅ Replace Selected</button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-base font-semibold text-gray-900">Inventory Data</h2>
                <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-full">{filteredData.length} / {data.length}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-1 py-1 w-10 text-center">
                        <input type="checkbox" checked={filteredData.length > 0 && selectedRows.size === filteredData.length} onChange={toggleSelectAll} className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500 mx-auto" />
                      </th>
                      {EXACT_COLUMNS.map(col => <th key={col} className={`px-2 py-2 text-xs font-semibold text-gray-600 uppercase text-left ${col === 'Item Name' ? 'min-w-[250px]' : ''}`} title={col}>{col}</th>)}
                      <th className="px-2 py-2 text-xs font-semibold text-gray-600 uppercase text-center">Del</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {currentData.length > 0 ? (
                      currentData.map((row, index) => (
                        <tr key={row._id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-2 py-2 text-center">
                            <input type="checkbox" checked={selectedRows.has(row._id)} onChange={() => toggleSelectRow(row._id)} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 mx-auto" />
                          </td>
                          {EXACT_COLUMNS.map(col => (
                            <td key={col} className={`px-2 py-2 ${col === 'Item Name' ? 'min-w-[250px]' : ''}`}>
                              <input type="text" value={row[col] || ''} onChange={(e) => handleCellEdit(row._id, col, e.target.value)} className="w-full px-2 py-1 text-sm border border-transparent rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none hover:border-gray-300 bg-transparent" />
                            </td>
                          ))}
                          <td className="px-2 py-2 text-center">
                            <button onClick={() => handleDeleteRow(row._id)} className="px-3 py-1 bg-red-500 text-white text-xs font-medium rounded hover:bg-red-600">✕</button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={EXACT_COLUMNS.length + 2} className="px-6 py-10 text-center text-gray-500">
                          <svg className="mx-auto h-10 w-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-base font-medium">No products found</p>
                          <p className="text-xs">Try adjusting filters</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="bg-white rounded-xl shadow-xl p-4 mt-4 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-indigo-700 text-sm font-medium">Previous</button>
                    <div className="text-sm text-gray-700 font-medium">Page {currentPage} of {totalPages}</div>
                    <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-indigo-700 text-sm font-medium">Next</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showCameraScanner && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-bold text-gray-800">📷 Scan Barcode</h3>
              <button onClick={() => setShowCameraScanner(false)} className="text-gray-500 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="p-4">
              <video ref={videoRef} className="w-full rounded-lg" playsInline />
              <p className="text-center text-sm text-gray-500 mt-2">Point camera at barcode</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
