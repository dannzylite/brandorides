import { useEffect, useState } from 'react'
import { getDocumentUrl } from '@/lib/adminApi'

interface DocumentModalProps {
  title: string
  licensePath: string | null
  insurancePath: string | null
  onClose: () => void
}

export function DocumentModal({ title, licensePath, insurancePath, onClose }: DocumentModalProps) {
  const [licenseUrl, setLicenseUrl] = useState<string | null>(null)
  const [insuranceUrl, setInsuranceUrl] = useState<string | null>(null)

  useEffect(() => {
    if (licensePath) getDocumentUrl('driver-docs', licensePath).then(setLicenseUrl)
    if (insurancePath) getDocumentUrl('driver-docs', insurancePath).then(setInsuranceUrl)
  }, [licensePath, insurancePath])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{title}'s Documents</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <DocumentPreview label="Driver's License" url={licenseUrl} missing={!licensePath} />
        <DocumentPreview label="Vehicle Insurance" url={insuranceUrl} missing={!insurancePath} />
      </div>
    </div>
  )
}

function DocumentPreview({ label, url, missing }: { label: string; url: string | null; missing: boolean }) {
  const isPdf = url?.split('?')[0].toLowerCase().endsWith('.pdf')

  return (
    <div className="mb-4">
      <p className="mb-2 text-sm font-semibold text-gray-700">{label}</p>
      {missing ? (
        <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-400">Not uploaded.</p>
      ) : !url ? (
        <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-400">Loading...</p>
      ) : isPdf ? (
        <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">
          Open PDF in new tab →
        </a>
      ) : (
        <img src={url} alt={label} className="max-h-80 w-full rounded-lg border border-gray-200 object-contain" />
      )}
    </div>
  )
}
