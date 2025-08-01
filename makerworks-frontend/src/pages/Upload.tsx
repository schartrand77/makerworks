// src/pages/Upload.tsx

import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import toast, { Toaster } from 'react-hot-toast'
import axios from '@/api/axios'
import { useAuthStore } from '@/store/useAuthStore'

const allowedExtensions = ['stl', '3mf', 'obj']

const UploadPage: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([])
  const { token } = useAuthStore()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [credit, setCredit] = useState('')

  const onDrop = useCallback((acceptedFiles: File[], fileRejections) => {
    setRejectedFiles([])
    setSelectedFile(null)
    setProgress(0)

    if (!acceptedFiles.length) {
      toast.error('❌ No valid file selected.')
      const names = fileRejections.map((rej) => rej.file.name)
      setRejectedFiles(names)
      return
    }

    const file = acceptedFiles[0]
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (!allowedExtensions.includes(ext || '')) {
      toast.error(`❌ Invalid file: ${file.name}. Allowed: ${allowedExtensions.join(', ')}`)
      setRejectedFiles([file.name])
      return
    }

    setSelectedFile(file)
  }, [])

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('❌ No file selected.')
      return
    }
    if (!name.trim()) {
      toast.error('❌ Name is required.')
      return
    }

    setLoading(true)
    try {
      await uploadModelWithProgress(selectedFile)
      toast.success('✅ Model uploaded.')
      setSelectedFile(null)
      setProgress(0)
      setName('')
      setDescription('')
      setTags('')
      setCredit('')
    } catch {
      toast.error(`❌ Upload failed.`)
    } finally {
      setLoading(false)
    }
  }

  const uploadModelWithProgress = async (file: File) => {
    if (!token) {
      toast.error('❌ Not authenticated.')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', name)
    formData.append('description', description)
    formData.append('tags', tags)
    formData.append('credit', credit)

    return axios.post(`/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${token}`
      },
      onUploadProgress: (e: ProgressEvent) => {
        if (e.total) setProgress(Math.round((e.loaded / e.total) * 100))
      }
    })
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: loading,
    accept: {
      'model/stl': ['.stl'],
      'application/octet-stream': ['.3mf', '.obj']
    }
  })

  return (
    <div className="upload-container" style={{ maxWidth: '720px', margin: '2rem auto', color: '#d1d5db' }}>
      <Toaster position="top-right" />
      <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Upload a 3D Model</h2>

      {/* Dropzone FIRST */}
      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? 'active' : ''}`}
        style={{
          border: '2px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '16px',
          padding: '32px',
          textAlign: 'center',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          background: 'rgba(255, 255, 255, 0.04)',
          backdropFilter: 'blur(18px) saturate(180%)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
          color: '#d1d5db',
          marginBottom: '1rem'
        }}
      >
        <input {...getInputProps()} />
        <p>
          {isDragActive ? 'Drop your model here…' : 'Drag and drop your model file or click to browse.'}
          <br />
          <strong>Accepted: .stl, .3mf, .obj</strong>
        </p>
      </div>

      {selectedFile && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '1rem',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.04)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            color: '#d1d5db'
          }}
        >
          <p>
            📦 <strong>{selectedFile.name}</strong> ({(selectedFile.size / 1024).toFixed(1)} KB)
          </p>
          {loading && (
            <div style={{ height: '10px', background: '#333', borderRadius: '5px', marginTop: '0.5rem' }}>
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #FF6A1F, #C0C0C0)',
                  transition: 'width 0.2s ease'
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Metadata fields AFTER dropzone */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.04)',
          backdropFilter: 'blur(18px) saturate(180%)',
          borderRadius: '16px',
          padding: '1.5rem',
          marginBottom: '1rem',
          boxShadow: '0 8px 30px rgba(0,0,0,0.25)'
        }}
      >
        <label style={{ display: 'block', marginBottom: '.5rem' }}>Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Model name"
          style={{ width: '100%', padding: '.5rem', marginBottom: '1rem', borderRadius: '8px' }}
        />

        <label style={{ display: 'block', marginBottom: '.5rem' }}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the model"
          style={{ width: '100%', padding: '.5rem', marginBottom: '1rem', borderRadius: '8px', minHeight: '80px' }}
        />

        <label style={{ display: 'block', marginBottom: '.5rem' }}>Tags (comma separated)</label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="e.g. benchy, calibration, test"
          style={{ width: '100%', padding: '.5rem', marginBottom: '1rem', borderRadius: '8px' }}
        />

        <label style={{ display: 'block', marginBottom: '.5rem' }}>Credit (Model creator)</label>
        <input
          type="text"
          value={credit}
          onChange={(e) => setCredit(e.target.value)}
          placeholder="Original creator's name"
          style={{ width: '100%', padding: '.5rem', borderRadius: '8px' }}
        />
      </div>

      <button
        onClick={handleUpload}
        disabled={loading}
        style={{
          marginTop: '1rem',
          width: '100%',
          padding: '.75rem',
          borderRadius: '12px',
          background: '#FF6A1F',
          color: '#fff',
          fontWeight: 'bold',
          cursor: loading ? 'not-allowed' : 'pointer'
        }}
      >
        {loading ? `Uploading… ${progress}%` : 'Upload Model'}
      </button>

      {rejectedFiles.length > 0 && (
        <div style={{ color: '#f87171', marginTop: '1em', textAlign: 'center' }}>
          <p>🚫 Rejected:</p>
          <ul>
            {rejectedFiles.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default UploadPage
