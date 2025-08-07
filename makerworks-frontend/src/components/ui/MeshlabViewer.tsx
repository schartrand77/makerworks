import React from 'react'

interface MeshlabViewerProps {
  src: string
}

const MeshlabViewer: React.FC<MeshlabViewerProps> = ({ src }) => {
  const viewerUrl = `/meshlab-viewer.html?model=${encodeURIComponent(src)}`
  return (
    <iframe
      src={viewerUrl}
      title="Meshlab Viewer"
      className="w-full h-64 md:h-96 rounded-xl overflow-hidden bg-black/10"
    />
  )
}

export default MeshlabViewer
