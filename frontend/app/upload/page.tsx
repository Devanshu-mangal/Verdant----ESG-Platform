'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { TENANT_ID } from '@/lib/api'
import { Upload, Download, CheckCircle, AlertCircle, Loader } from 'lucide-react'

const SOURCE_INFO = [
  {
    id: 'SAP_FUEL',
    label: 'SAP Fuel & Procurement',
    scope: 'Scope 1',
    scopeColor: 'bg-orange-100 text-orange-700',
    description: 'SAP MB51/ME2M flat-file export with German column names (WERKS, MATNR, MENGE, MEINS, BUDAT)',
    expectedCols: 'WERKS, MATNR, TXZ01, MENGE, MEINS, BUDAT, LIFNR, DMBTR, WAERS',
    sampleFile: 'sap_fuel_export.csv',
  },
  {
    id: 'UTILITY_ELEC',
    label: 'Utility Electricity Portal',
    scope: 'Scope 2',
    scopeColor: 'bg-blue-100 text-blue-700',
    description: 'Utility portal CSV export. Handles non-calendar billing periods and estimated readings.',
    expectedCols: 'meter_id, site_name, billing_period_start, billing_period_end, consumption_kwh, demand_kw, tariff, is_estimated',
    sampleFile: 'utility_electricity.csv',
  },
  {
    id: 'TRAVEL_CONCUR',
    label: 'Corporate Travel (Concur)',
    scope: 'Scope 3',
    scopeColor: 'bg-purple-100 text-purple-700',
    description: 'Concur-style expense export. Flights, hotels, ground transport. Distances calculated from IATA codes.',
    expectedCols: 'expense_report_id, traveler_id, travel_type, travel_date, origin_iata, destination_iata, cabin_class, distance_km, hotel_name, city, nights',
    sampleFile: 'travel_concur_export.csv',
  },
]

const SAMPLE_DATA: Record<string, string> = {
  'sap_fuel_export.csv': `WERKS,MATNR,TXZ01,MENGE,MEINS,BUDAT,LIFNR,DMBTR,WAERS
IN01,DIES-001,Diesel B7,12500,L,20240103,VEND-0042,875000,INR
IN01,DIES-001,Diesel B7,9800,L,20240205,VEND-0042,686000,INR
IN01,DIES-002,Diesel Industrial,15200,L,20240301,VEND-0055,1064000,INR
IN02,PETR-001,Petrol 91 RON,4200,L,20240108,VEND-0031,378000,INR
IN02,PETR-001,Petrol 91 RON,3900,L,20240214,VEND-0031,351000,INR
IN01,NGAS-001,Natural Gas,8400,M3,20240112,VEND-0078,252000,INR
IN01,NGAS-001,Natural Gas,9100,M3,20240209,VEND-0078,273000,INR
IN03,HFO-001,Heavy Fuel Oil,6200,L,20240115,VEND-0091,682000,INR
IN03,DIES-001,Diesel B7,7800,L,20240318,VEND-0042,546000,INR
IN02,LPG-001,LPG Autogas,3100,KG,20240122,VEND-0064,186000,INR
IN03,DIES-002,Diesel Industrial,47800,L,20240415,VEND-0055,3346000,INR
IN01,DIES-001,Diesel B7,-200,L,20240418,VEND-0042,-14000,INR`,

  'utility_electricity.csv': `meter_id,site_name,billing_period_start,billing_period_end,consumption_kwh,demand_kw,tariff,is_estimated
MTR-BLR-001,Bangalore HQ,2024-01-04,2024-02-03,48250,320,HT-1,false
MTR-BLR-001,Bangalore HQ,2024-02-04,2024-03-04,51300,340,HT-1,false
MTR-BLR-001,Bangalore HQ,2024-03-05,2024-04-03,49800,335,HT-1,false
MTR-BLR-001,Bangalore HQ,2024-04-04,2024-05-04,52100,348,HT-1,false
MTR-BLR-001,Bangalore HQ,2024-05-05,2024-06-03,196400,390,HT-1,false
MTR-BLR-001,Bangalore HQ,2024-06-04,2024-07-04,54200,355,HT-1,true
MTR-BLR-002,Bangalore Warehouse,2024-01-04,2024-02-03,18400,140,LT-2,false
MTR-BLR-002,Bangalore Warehouse,2024-02-04,2024-03-04,17900,138,LT-2,false
MTR-MUM-001,Mumbai Office,2024-01-08,2024-02-07,31500,210,HT-2,false
MTR-MUM-001,Mumbai Office,2024-02-08,2024-03-09,29800,205,HT-2,false`,

  'travel_concur_export.csv': `expense_report_id,traveler_id,travel_type,travel_date,origin_iata,destination_iata,cabin_class,distance_km,hotel_name,city,nights
EXP-2024-0041,EMP-1021,flight,2024-01-15,BLR,DEL,economy,,,,
EXP-2024-0041,EMP-1021,hotel,2024-01-15,,,,,Taj Mahal Hotel,New Delhi,2
EXP-2024-0041,EMP-1021,flight,2024-01-17,DEL,BLR,economy,,,,
EXP-2024-0052,EMP-1034,flight,2024-01-22,BOM,LHR,business,,,,
EXP-2024-0052,EMP-1034,hotel,2024-01-22,,,,,The Savoy,London,3
EXP-2024-0052,EMP-1034,flight,2024-01-25,LHR,BOM,business,,,,
EXP-2024-0063,EMP-1008,flight,2024-02-05,BLR,SIN,economy,,,,
EXP-2024-0063,EMP-1008,hotel,2024-02-05,,,,,Marina Bay Sands,Singapore,2
EXP-2024-0063,EMP-1008,flight,2024-02-07,SIN,BLR,economy,,,,
EXP-2024-0071,EMP-1055,taxi,2024-02-10,,,,18,,,
EXP-2024-0072,EMP-1021,flight,2024-02-18,BLR,DEL,economy,,,,
EXP-2024-0072,EMP-1021,flight,2024-02-20,DEL,BLR,economy,,,,`,
}

export default function UploadPage() {
  const qc = useQueryClient()
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.get(`/sources/?tenant=${TENANT_ID}`).then(r => r.data),
  })

  const uploadMutation = useMutation({
    mutationFn: async ({ sourceId, file }: { sourceId: string; file: File }) => {
      const form = new FormData()
      form.append('source_id', sourceId)
      form.append('uploaded_by', 'analyst@breatheesg.com')
      form.append('file', file)
      return api.post('/batches/upload/', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      }).then(r => r.data)
    },
    onSuccess: (data) => {
      setResult(data)
      setError(null)
      qc.invalidateQueries({ queryKey: ['batches'] })
      qc.invalidateQueries({ queryKey: ['activities-summary'] })
    },
    onError: (e: any) => {
      setError(e.response?.data?.error || 'Upload failed')
    },
  })

  const handleUpload = () => {
    if (!selectedSource || !file) return
    const sourceRecord = sources?.results?.find((s: any) => s.source_type === selectedSource)
    if (!sourceRecord) return
    setResult(null)
    setError(null)
    uploadMutation.mutate({ sourceId: sourceRecord.id, file })
  }

  const downloadSample = (filename: string) => {
    const content = SAMPLE_DATA[filename]
    if (!content) return
    const blob = new Blob([content], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Upload data</h1>
        <p className="text-sm text-gray-500 mt-0.5">Ingest from SAP, utility portals, or corporate travel exports</p>
      </div>

      {/* Source selector */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {SOURCE_INFO.map(s => (
          <button key={s.id} onClick={() => { setSelectedSource(s.id); setFile(null); setResult(null); setError(null) }}
            className={`text-left p-4 rounded-lg border transition-all ${
              selectedSource === s.id
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 bg-white hover:border-gray-400'
            }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                selectedSource === s.id ? 'bg-white/20 text-white' : s.scopeColor
              }`}>{s.scope}</span>
            </div>
            <p className={`text-sm font-medium ${selectedSource === s.id ? 'text-white' : 'text-gray-900'}`}>
              {s.label}
            </p>
            <p className={`text-xs mt-1 ${selectedSource === s.id ? 'text-gray-300' : 'text-gray-500'}`}>
              {s.description.slice(0, 60)}…
            </p>
          </button>
        ))}
      </div>

      {selectedSource && (() => {
        const info = SOURCE_INFO.find(s => s.id === selectedSource)!
        return (
          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
            {/* Expected format */}
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Expected columns</p>
              <code className="text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded block">
                {info.expectedCols}
              </code>
            </div>

            {/* Download sample */}
            <div className="flex items-center gap-3">
              <button onClick={() => downloadSample(info.sampleFile)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded hover:border-gray-500 transition-colors">
                <Download size={13} />
                Download sample CSV
              </button>
              <span className="text-xs text-gray-400">Fill in your data using this format, then upload below</span>
            </div>

            {/* File upload */}
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Upload file</p>
              <label className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
              }`}>
                <input type="file" accept=".csv" className="hidden"
                  onChange={e => setFile(e.target.files?.[0] || null)} />
                {file ? (
                  <div className="text-center">
                    <CheckCircle size={20} className="text-green-500 mx-auto mb-1" />
                    <p className="text-sm text-green-700 font-medium">{file.name}</p>
                    <p className="text-xs text-green-600">{(file.size / 1024).toFixed(1)} KB · click to change</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <Upload size={20} className="text-gray-400 mx-auto mb-1" />
                    <p className="text-sm text-gray-500">Click to select CSV file</p>
                    <p className="text-xs text-gray-400 mt-0.5">or drag and drop</p>
                  </div>
                )}
              </label>
            </div>

            {/* Submit */}
            <button onClick={handleUpload}
              disabled={!file || uploadMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {uploadMutation.isPending
                ? <><Loader size={14} className="animate-spin" /> Processing…</>
                : <><Upload size={14} /> Upload and ingest</>}
            </button>

            {/* Result */}
            {result && (
              <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded text-sm">
                <CheckCircle size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-green-800 font-medium">Batch queued successfully</p>
                  <p className="text-green-600 text-xs mt-0.5">
                    Status: {result.status} · Celery worker is processing in the background.
                    Check the ingestions page to track progress.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm">
                <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-red-700">{error}</p>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
