import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

function App() {
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

  // Load data from Supabase on mount
  useEffect(() => {
    loadFromSupabase()
  }, [])

  // Load from Supabase (optional - gracefully handles missing table)
  const [dataLoadedFromSupabase, setDataLoadedFromSupabase] = useState(false)
  
  const loadFromSupabase = async () => {
    setLoadingFromSupabase(true)
    try {
      const { data: savedData, error } = await supabase
        .from('nm_mart_inventory')
        .select('*')
        .order('id', { ascending: true })
        .limit(1)
        .single()

      if (error) {
        console.log('No data in Supabase yet (table may not exist):', error)
      } else if (savedData && savedData.inventory_data) {
        // Clean data to only include exact columns and add _id
        const cleanedData = savedData.inventory_data.map((row, index) => {
          const cleanRow = { _id: index }
          EXACT_COLUMNS.forEach(col => {
            cleanRow[col] = row[col] ?? ''
          })
          return cleanRow
        })
        setData(cleanedData)
        setDataLoadedFromSupabase(true)
        console.log('Data loaded from Supabase successfully!')
        // Show a toast that data was loaded
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
    if (data.length === 0) {
      alert('No data to save!')
      return
    }
    setSaving(true)
    try {
      // Prepare data without _id for saving
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
        .limit(1)
        .single()

      let result
      // If table exists
      if (!fetchError || fetchError.code === 'PGRST116') {
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
              inventory_data: dataToSave,
              updated_at: new Date().toISOString()
            }])
        }

        if (result?.error) throw result.error
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
        console.log('Data saved successfully!')
      } else {
        // Table doesn't exist - give instructions
        alert(
          'Supabase table not found!\n\nPlease create a table named "nm_mart_inventory" in Supabase with these columns:\n\n1. id (int8, primary key, auto-increment)\n2. inventory_data (jsonb)\n3. updated_at (timestamp)\n\nAfter creating the table, try saving again!'
        )
      }
    } catch (error) {
      console.error('Error saving to Supabase:', error)
      alert('Error saving to Supabase: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  // Define your EXACT columns
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

  // Helper function to normalize column name (trim, lowercase, remove extra spaces)
  const normalizeColumnName = (name) => {
    if (!name) return ''
    return name.trim().toLowerCase().replace(/\s+/g, ' ')
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) {
      alert('Please select a file first!')
      return
    }

    console.log('File selected:', file.name, file.type)
    
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
        console.log('File loaded, parsing...')
        const dataArray = new Uint8Array(event.target.result)
        const workbook = XLSX.read(dataArray, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        console.log('Sheet name:', sheetName)
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
        
        // Save raw data for debugging
        setRawUploadedData(jsonData)
        
        // Create a map of normalized column names from the uploaded file
        if (jsonData.length > 0) {
          const firstRow = jsonData[0]
          const columnMap = {}
          
          Object.keys(firstRow).forEach(colName => {
            const normalized = normalizeColumnName(colName)
            columnMap[normalized] = colName
          })
          
          console.log('Uploaded column map:', columnMap)
          console.log('First raw row:', firstRow)

          // Clean data to only include exact columns, matched via normalization
          const cleanedData = jsonData.map(row => {
            const cleanRow = {}
            EXACT_COLUMNS.forEach(targetCol => {
              const normalizedTarget = normalizeColumnName(targetCol)
              // Find matching column from uploaded file
              const matchingCol = columnMap[normalizedTarget]
              cleanRow[targetCol] = matchingCol ? (row[matchingCol] ?? '') : ''
            })
            return cleanRow
          })
          
          console.log('Cleaned data:', cleanedData.length, 'rows')
          const dataWithIds = cleanedData.map((row, index) => ({ ...row, _id: index }))
          setData(dataWithIds)
        } else {
          setData([])
        }
      } catch (error) {
        console.error('Error parsing file:', error)
        alert('Error parsing file! Please make sure it is a valid Excel (.xlsx) or CSV file.')
      } finally {
        setLoading(false)
      }
    }
    
    reader.onerror = (error) => {
      console.error('File read error:', error)
      alert('Error reading file! Please try again.')
      setLoading(false)
    }
    
    reader.readAsArrayBuffer(file)
  }

  const uniqueBrands = useMemo(() => {
    const brands = new Set()
    data.forEach(row => {
      if (row['Brand name']) brands.add(row['Brand name'])
    })
    return Array.from(brands).sort()
  }, [data])

  const uniqueMainCategories = useMemo(() => {
    const categories = new Set()
    data.forEach(row => {
      if (row['MAIN CATEGORY']) categories.add(row['MAIN CATEGORY'])
    })
    return Array.from(categories).sort()
  }, [data])

  const uniqueSubCategories = useMemo(() => {
    const categories = new Set()
    data.forEach(row => {
      if (row['SUB CATEGORY']) categories.add(row['SUB CATEGORY'])
    })
    return Array.from(categories).sort()
  }, [data])

  const filteredData = useMemo(() => {
    return data.filter(row => {
      const matchesBrand = selectedBrand ? row['Brand name'] === selectedBrand : true
      const matchesMainCategory = selectedMainCategory ? row['MAIN CATEGORY'] === selectedMainCategory : true
      const matchesSubCategory = selectedSubCategory ? row['SUB CATEGORY'] === selectedSubCategory : true
      const matchesSearch = searchTerm 
        ? (row['Item Name'] || '').toLowerCase().includes(searchTerm.toLowerCase()) 
        : true
      const matchesBarcode = barcodeSearch 
        ? String(row['BARCODE'] || '').trim().toLowerCase() === String(barcodeSearch).trim().toLowerCase() 
        : true
      
      return matchesBrand && matchesMainCategory && matchesSubCategory && matchesSearch && matchesBarcode
    })
  }, [data, selectedBrand, selectedMainCategory, selectedSubCategory, searchTerm, barcodeSearch])

  // Pagination calculations
  const totalPages = useMemo(() => Math.ceil(filteredData.length / itemsPerPage), [filteredData, itemsPerPage])
  const currentData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return filteredData.slice(startIndex, endIndex)
  }, [filteredData, currentPage, itemsPerPage])

  // Use EXACT_COLUMNS for columns
  const columns = EXACT_COLUMNS

  const toggleSelectAll = useCallback(() => {
    if (selectedRows.size === filteredData.length) {
      const newSelected = new Set(selectedRows)
      filteredData.forEach(row => newSelected.delete(row._id))
      setSelectedRows(newSelected)
    } else {
      const newSelected = new Set(selectedRows)
      filteredData.forEach(row => newSelected.add(row._id))
      setSelectedRows(newSelected)
    }
  }, [filteredData, selectedRows])

  const toggleSelectRow = useCallback((rowId) => {
    setSelectedRows(prev => {
      const newSelected = new Set(prev)
      if (newSelected.has(rowId)) {
        newSelected.delete(rowId)
      } else {
        newSelected.add(rowId)
      }
      return newSelected
    })
  }, [])

  const handleCellEdit = useCallback((rowId, columnName, newValue) => {
    setData(prevData => 
      prevData.map(row => 
        row._id === rowId ? { ...row, [columnName]: newValue } : row
      )
    )
  }, [])

  const handleBulkReplace = useCallback(() => {
    if (!bulkColumn || !bulkNewValue) {
      alert('Please select a column and enter a new value.')
      return
    }

    if (selectedRows.size === 0) {
      alert('Please select at least one row to replace!')
      return
    }

    // Confirm the action
    const confirmed = window.confirm(
      `Are you sure you want to update ${selectedRows.size} selected row(s)?\n\nColumn: ${bulkColumn}\nNew Value: "${bulkNewValue}"`
    )

    if (!confirmed) {
      return
    }

    setData(prevData =>
      prevData.map(row =>
        selectedRows.has(row._id) ? { ...row, [bulkColumn]: bulkNewValue } : row
      )
    )
    
    setBulkReplaceSuccess(true)
    setTimeout(() => setBulkReplaceSuccess(false), 4000)
    
    setBulkColumn('')
    setBulkNewValue('')
  }, [bulkColumn, bulkNewValue, selectedRows])

  const handleExportToExcel = useCallback(() => {
    // Create export data in fixed column order
    const exportData = data.map(row => {
      const rowData = {}
      // Add columns in our fixed order
      columns.forEach(col => {
        rowData[col] = row[col]
      })
      return rowData
    })

    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory')
    XLSX.writeFile(workbook, 'NM_MART_Complete_Inventory.xlsx')

    setShowSuccessToast(true)
    setTimeout(() => setShowSuccessToast(false), 3000)
  }, [data, columns])

  // Delete a single row
  const handleDeleteRow = useCallback((rowId) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this product?");
    if (confirmDelete) {
      setData(prevData => prevData.filter(row => row._id !== rowId));
      // Also remove from selected rows
      setSelectedRows(prevSelected => {
        const newSelected = new Set(prevSelected);
        newSelected.delete(rowId);
        return newSelected;
      });
    }
  }, []);
  
  // Delete all selected rows
  const handleDeleteSelected = useCallback(() => {
    const confirmDelete = window.confirm(`Are you sure you want to delete ${selectedRows.size} selected product(s)?`);
    if (confirmDelete) {
      setData(prevData => prevData.filter(row => !selectedRows.has(row._id)));
      setSelectedRows(new Set());
    }
  }, [selectedRows]);

  // Handle barcode scan (Enter key)
  const handleBarcodeScan = useCallback((e) => {
    if (e.key === 'Enter' && barcodeSearch.trim()) {
      e.preventDefault();
      const trimmedBarcode = barcodeSearch.trim().toLowerCase();
      const product = data.find(row => 
        String(row['BARCODE'] || '').trim().toLowerCase() === trimmedBarcode
      );
      if (product) {
        setScannedCart(prev => [
          ...prev,
          { id: Date.now() + Math.random(), product }
        ]);
      }
      // Clear input for next scan
      setBarcodeSearch('');
    }
  }, [barcodeSearch, data]);

  // Clear scanned cart
  const clearScannedCart = useCallback(() => {
    if (window.confirm('Are you sure you want to clear all scanned items?')) {
      setScannedCart([]);
    }
  }, []);

  // Remove item from cart
  const removeFromCart = useCallback((id) => {
    setScannedCart(prev => prev.filter(item => item.id !== id));
  }, []);

  // Edit scanned item
  const handleScannedItemEdit = useCallback((id, columnName, newValue) => {
    setScannedCart(prev =>
      prev.map(item =>
        item.id === id
          ? { ...item, product: { ...item.product, [columnName]: newValue } }
          : item
      )
    );
  }, []);



  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-1">
      {/* DEBUG PANEL */}
      {showDebug && (data.length > 0 || rawUploadedData) && (
        <div className="bg-white rounded-xl shadow-xl p-4 mb-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-gray-800">📊 Debug Info</h3>
            <button
              onClick={() => setShowDebug(false)}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-xs text-gray-600">
              <p className="font-semibold mb-1">Cleaned Data (what we're using):</p>
              <p>Total Rows: {data.length}</p>
              {data.length > 0 && (
                <div className="bg-gray-100 p-2 rounded mt-1">
                  {JSON.stringify(data[0], null, 2)}
                </div>
              )}
            </div>
            <div className="text-xs text-gray-600">
              <p className="font-semibold mb-1">Filtered Data (what's showing in table):</p>
              <p>Total Rows: {filteredData.length}</p>
              {filteredData.length > 0 && (
                <div className="bg-green-100 p-2 rounded mt-1">
                  {JSON.stringify(filteredData[0], null, 2)}
                </div>
              )}
            </div>
            {rawUploadedData && (
                <div className="text-xs text-gray-600">
                  <p className="font-semibold mb-1">Raw Uploaded Data (from Excel):</p>
                  <p>Total Rows: {rawUploadedData.length}</p>
                  <p>Columns in Excel:</p>
                  {rawUploadedData.length > 0 && (
                    <div className="bg-blue-50 p-2 rounded mt-1">
                      {JSON.stringify(rawUploadedData[0], null, 2)}
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>
      )}
      
      {/* Debug Toggle Button */}
      <div className="mb-4">
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-medium rounded hover:bg-gray-300 transition-colors"
        >
          {showDebug ? 'Hide Debug' : 'Show Debug'}
        </button>
      </div>

      {showSuccessToast && (
        <div className="fixed top-6 right-6 z-50 bg-green-500 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-semibold">Export successful! Complete inventory ({data.length} items) downloaded!</span>
        </div>
      )}

      {bulkReplaceSuccess && (
        <div className="fixed top-20 right-6 z-50 bg-green-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-semibold">✅ Successfully updated {selectedRows.size} filtered/selected rows!</span>
        </div>
      )}

      {saveSuccess && (
        <div className="fixed top-36 right-6 z-50 bg-blue-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-semibold">✅ Data saved to Supabase successfully!</span>
        </div>
      )}

      {dataLoadedFromSupabase && (
        <div className="fixed top-52 right-6 z-50 bg-purple-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="font-semibold">✅ Complete inventory loaded from Supabase!</span>
        </div>
      )}

      <div className="max-w-full mx-auto px-1">
        <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
          <div className="text-center md:text-left">
            <h1 className="text-3xl font-bold text-gray-900 mb-1">NM MART - Bulk Inventory Manager</h1>
            <p className="text-gray-600">Upload your Excel or CSV file to view inventory data</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {data.length > 0 && (
              <button
                onClick={saveToSupabase}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow hover:bg-blue-700 transition-all disabled:opacity-50"
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
              <button
                onClick={handleExportToExcel}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg shadow hover:shadow-md transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export Complete Inventory ({data.length} items)
              </button>
            )}
          </div>
        </div>

        {loadingFromSupabase && (
          <div className="bg-white rounded-lg shadow p-3 mb-4 flex items-center justify-center gap-2 text-blue-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span>Loading saved data...</span>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-xl p-6 mb-4">
          <label 
            className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-lg cursor-pointer transition-all ${loading ? 'border-gray-200 bg-gray-100 cursor-not-allowed' : 'border-indigo-300 bg-indigo-50 hover:border-indigo-400 hover:bg-indigo-100'}`}
          >
            <div className="flex flex-col items-center justify-center pt-3 pb-4">
              <svg className="w-10 h-10 mb-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="mb-1 text-base text-gray-700"><span className="font-bold">📂 Click to upload Excel</span></p>
              <p className="text-xs text-gray-500">.xlsx, .xls, .csv</p>
            </div>
            <input
              type="file"
              className="hidden"
              id="file-upload"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              disabled={loading}
            />
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
                    Showing {filteredData.length} of {data.length} products
                  </div>
                  <button
                    onClick={() => {
                      setSelectedBrand('');
                      setSelectedMainCategory('');
                      setSelectedSubCategory('');
                      setSearchTerm('');
                      setBarcodeSearch('');
                      setSelectedRows(new Set());
                      setCurrentPage(1);
                      setScannedCart([]);
                    }}
                    className="px-3 py-1 bg-gray-200 text-gray-700 text-sm font-medium rounded hover:bg-gray-300 transition-colors"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Filter by Brand</label>
                  <select
                    value={selectedBrand}
                    onChange={(e) => {
                      setSelectedBrand(e.target.value);
                      setSelectedRows(new Set());
                      setCurrentPage(1);
                    }}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">All Brands</option>
                    {uniqueBrands.map((brand) => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Filter by Main Category</label>
                  <select
                    value={selectedMainCategory}
                    onChange={(e) => {
                      setSelectedMainCategory(e.target.value);
                      setSelectedRows(new Set());
                      setCurrentPage(1);
                    }}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">All Main Categories</option>
                    {uniqueMainCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Filter by Sub Category</label>
                  <select
                    value={selectedSubCategory}
                    onChange={(e) => {
                      setSelectedSubCategory(e.target.value);
                      setSelectedRows(new Set());
                      setCurrentPage(1);
                    }}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">All Sub Categories</option>
                    {uniqueSubCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Search Item Name</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setSelectedRows(new Set());
                        setCurrentPage(1);
                      }}
                      placeholder="Search items..."
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
                  <div className="relative">
                    <input
                      type="text"
                      value={barcodeSearch}
                      onChange={(e) => {
                        setBarcodeSearch(e.target.value);
                        setSelectedRows(new Set());
                        setCurrentPage(1);
                      }}
                      onKeyDown={handleBarcodeScan}
                      placeholder="Scan or type barcode..."
                      autoFocus
                      className="w-full pl-8 pr-3 py-1.5 border-2 border-indigo-400 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-indigo-50"
                    />
                    <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                      <svg className="h-4 w-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h4M4 20h4m0-8V4m0 4H4" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Scanned Cart */}
            {scannedCart.length > 0 && (
              <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl shadow-xl p-4 mb-4 text-white">
                <div className="flex flex-wrap justify-between items-center mb-3 gap-3">
                  <h3 className="text-lg font-bold">
                    🛒 Scanned Items ({scannedCart.length})
                  </h3>
                  <button
                    onClick={clearScannedCart}
                    className="px-3 py-1.5 bg-red-500 text-white rounded-md hover:bg-red-600 transition-all text-sm"
                  >
                    Clear All
                  </button>
                </div>
                <div className="bg-white rounded-lg overflow-x-auto">
                  <table className="w-full text-gray-900">
                    <thead className="bg-gray-100">
                      <tr>
                        {columns.map((col) => (
                          <th key={col} className="px-2 py-2 text-xs font-semibold text-gray-700 uppercase tracking-wider text-left">
                            {col}
                          </th>
                        ))}
                        <th className="px-2 py-2 text-xs font-semibold text-gray-700 uppercase tracking-wider text-center">
                          Del
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {scannedCart.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          {columns.map((col) => (
                            <td key={col} className="px-2 py-2">
                              <input
                                type="text"
                                value={item.product[col] || ''}
                                onChange={(e) => handleScannedItemEdit(item.id, col, e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                              />
                            </td>
                          ))}
                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() => removeFromCart(item.id)}
                              className="px-3 py-1 bg-red-500 text-white text-xs font-medium rounded hover:bg-red-600 transition-colors"
                            >
                              ✕
                            </button>
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
                  <h3 className="text-lg font-bold">✅ Bulk Actions: {selectedRows.size} items selected</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedRows(new Set())}
                      className="px-3 py-1.5 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-all text-sm"
                    >
                      ❌ Clear Selection
                    </button>
                    <button
                      onClick={handleDeleteSelected}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-all text-sm font-medium"
                    >
                      🗑️ Delete Selected
                    </button>
                  </div>
                </div>
                <p className="text-indigo-100 mb-3 text-sm">
                  1) Select column &nbsp; 2) Type new value &nbsp; 3) Click Replace
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs font-medium mb-1">📌 Column</label>
                    <select
                      value={bulkColumn}
                      onChange={(e) => setBulkColumn(e.target.value)}
                      className="w-full px-3 py-2 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-white outline-none text-sm"
                    >
                      <option value="">-- Choose Column --</option>
                      {columns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs font-medium mb-1">✏️ New Value</label>
                    <input
                      type="text"
                      value={bulkNewValue}
                      onChange={(e) => setBulkNewValue(e.target.value)}
                      placeholder="Type new value..."
                      className="w-full px-3 py-2 rounded-md text-gray-900 focus:ring-2 focus:ring-white outline-none text-sm"
                    />
                  </div>
                  <div className="self-end">
                    <button
                      onClick={handleBulkReplace}
                      className="px-6 py-2 bg-green-500 text-white font-bold rounded-md hover:bg-green-600 transition-all text-sm"
                    >
                      ✅ Replace Selected
                    </button>
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
                {/* Real HTML Table */}
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-1 py-1 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={filteredData.length > 0 && selectedRows.size === filteredData.length}
                          onChange={toggleSelectAll}
                          className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500 mx-auto"
                        />
                      </th>
                      {columns.map((key) => (
                        <th
                          key={key}
                          className={`px-2 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider text-left ${
                            key === 'Item Name' ? 'min-w-[250px]' : ''
                          }`}
                          title={key}
                        >
                          {key}
                        </th>
                      ))}
                      <th className="px-2 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">
                        Del
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {currentData.length > 0 ? (
                      currentData.map((row, index) => (
                        <tr key={row._id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={selectedRows.has(row._id)}
                              onChange={() => toggleSelectRow(row._id)}
                              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 mx-auto"
                            />
                          </td>
                          {columns.map((col) => (
                            <td key={col} className={`px-2 py-2 ${
                              col === 'Item Name' ? 'min-w-[250px]' : ''
                            }`}>
                              <input
                                type="text"
                                value={row[col] || ''}
                                onChange={(e) => handleCellEdit(row._id, col, e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-transparent rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none hover:border-gray-300 bg-transparent"
                              />
                            </td>
                          ))}
                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() => handleDeleteRow(row._id)}
                              className="px-3 py-1 bg-red-500 text-white text-xs font-medium rounded hover:bg-red-600 transition-colors"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={columns.length + 2} className="px-6 py-10 text-center text-gray-500">
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

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="bg-white rounded-xl shadow-xl p-4 mt-4 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length} products
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-indigo-700 transition-all text-sm font-medium"
                    >
                      Previous
                    </button>
                    <div className="text-sm text-gray-700 font-medium">
                      Page {currentPage} of {totalPages}
                    </div>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-indigo-700 transition-all text-sm font-medium"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default App
